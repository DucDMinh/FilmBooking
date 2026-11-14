Agent: reviewer

# Review — build-filmbooking layer-7 task-06 — Round 1

Task: Web admin đơn bị ảnh hưởng (danh sách, chi tiết, ghi kết quả hoàn tiền, gửi lại email, CSV; POS đã bỏ)
Worktree: `E:/FilmBooking/.worktrees/layer-7__task-06` (branch `wt/layer-7__task-06`, chưa commit)

## Review level
**STRICT**

## Reason
Màn ghi kết quả hoàn tiền thủ công (tiền thật, ghi một lần, không sửa lại được sau khi server chuyển trạng thái), export CSV có PII khách, RBAC theo rạp (Staff/Manager/Admin), UI gọi một API contract có sẵn (`CancellationModule`).

## Blast radius
- File mới: `apps/web/src/app/admin/don-bi-anh-huong/page.tsx`, `.../[id]/page.tsx`, `components/admin/affected-resolution-form.tsx`, `affected-orders-list.tsx`, `affected-order-detail.tsx`, `affected-orders-api.ts`, `__tests__/affected-resolution-form.test.tsx`.
- Không sửa file đã có. 3 file nằm ngoài danh sách Files (`affected-orders-api.ts`, `affected-orders-list.tsx`, `affected-order-detail.tsx`) đều là file mới, dispatcher đã biết. Không có rủi ro xung đột merge, không chặn.
- Phụ thuộc vào: `/api/proxy/[...path]` (đã có sẵn, tracked), `form-utils.tsx`, shared `schemas/cancellation.ts`, API `cancellation.controller.ts`/`cancellation.service.ts`.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 25 files, 355 tests. `pricing-voucher.test.tsx` không timeout ở lần chạy này. Không chạy thêm `pnpm exec vitest run` lần 2 vì lần 1 đã xanh. |
| `pnpm build` | PASS. Có route `/admin/don-bi-anh-huong`, `/admin/don-bi-anh-huong/[id]`, `/api/proxy/[...path]`. |
| aislop | skip: không có trong allowlist `.context/project-config.md` |
| oxlint | skip: oxlint chưa được cấu hình (repo không có `.oxlintrc`) |
| ocr | skip: chưa cài ocr / không có trong allowlist |
| AI-friendly web | N/A: màn admin nội bộ |

Typecheck, lint, test và build xanh không đủ để PASS. Các finding dưới đây là chỗ lệch giữa UI và contract/spec mà bộ test (do builder viết, mock `apiFetch`) không bắt được, có test còn khẳng định đúng hành vi sai.

## Xác minh CSV proxy (theo yêu cầu dispatcher): không phải defect
- Route `apps/web/src/app/api/proxy/[...path]/route.ts` tồn tại, được git track, có từ trước task này.
- Không phải open proxy: host upstream cố định lấy từ env `API_URL` (`route.ts:29-31`). Từng segment phải khớp `SAFE_SEGMENT` (`route.ts:21,35`), nên chặn được `..`, `/`, `%`. Có `redirect: "manual"`.
- Không lộ token: Bearer chỉ gắn vào request gửi upstream (`route.ts:66`). Response chỉ forward `content-type` và `retry-after` (`route.ts:20,80-84`). Cookie không được chuyển sang Nest.
- Proxy không forward `Content-Disposition`. Việc này vô hại vì client tự đặt `link.download`.
- `downloadAffectedCsv` (`affected-orders-api.ts:33-53`) ném `ApiError` khi `!res.ok`, nên 403/500 không tạo file lỗi.

## Findings

### F1 — MAJOR (tiền): ô số tiền hoàn hiểu sai số kiểu VN "200.000" thành 200 VND rồi ghi nhận không đảo được
- `affected-resolution-form.tsx:43`: `refundedAmount: amount.trim() === "" ? undefined : Number(amount)`.
- Người dùng VN thường gõ dấu chấm phân cách hàng nghìn. Khi đó `Number("200.000") === 200` là số nguyên ≥ 1, nên `recordRefundSchema` (`packages/shared/src/schemas/cancellation.ts:62`) cho qua. Server cũng chấp nhận vì 200 ≤ `total_amount` (`cancellation.service.ts:438-449`). Kết quả: đơn chuyển sang `refunded_manual` với số tiền ghi sai 1000 lần.
- Server không cho ghi lại: lần sau trả 409 (`cancellation.service.ts:405-435`), UI cũng ẩn form khi status ≠ `affected` (`affected-order-detail.tsx:119`). Dữ liệu sai vĩnh viễn trong `affected_order_actions` và CSV đối soát.
- Các dạng như `"1e5"` hay `"0x10"` cũng được `Number` chấp nhận.
- Yêu cầu sửa:
  - Chỉ nhận chữ số. Hoặc bỏ dấu `.`/`,`/khoảng trắng rồi validate `/^\d+$/`.
  - Hiện preview `formatVnd(...)` của số đã parse trước khi xác nhận.
  - Chặn ngay ở client khi `amount > totalAmount` (prop đã có sẵn).
  - Thêm test cho `"200.000"` và `"1e5"`.

### F2 — MAJOR (contract/state): nút "Gửi lại email" hiện trên mọi dòng, server chắc chắn từ chối dòng SENT/PENDING; test khẳng định đúng hành vi sai
- UI:
  - `affected-orders-list.tsx:222-232`: mọi dòng đều render nút gửi lại.
  - `affected-order-detail.tsx:113-115`: nút luôn hiện.
- API:
  - `cancellation.service.ts:545-552`: outbox mới nhất ở trạng thái `PENDING` hoặc `SENT` thì trả 409 CONFLICT. Client dịch lỗi này thành "Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại." (`lib/api/error-messages.ts:13`), dễ hiểu nhầm vì dữ liệu không hề đổi.
  - `cancellation.service.ts:522-528`: đơn không có `contact_email` thì trả VALIDATION_ERROR với thông điệp chung.
- Spec: `.context/design-spec.md:471` ghi "**Gửi lại** khi email lỗi", và `:472` ghi "nút 'Gửi lại email' (khi lỗi)".
- Test sai: `affected-resolution-form.test.tsx:147` mong đợi 2 nút gửi lại, trong đó 1 dòng có `emailStatus: "SENT"`. Đây là false-confidence test.
- Yêu cầu sửa:
  - Chỉ hiện/bật nút khi `emailStatus === "FAILED"`, hoặc `emailStatus === null` và có `contactEmail` (server sẽ insert outbox mới).
  - Sửa test cho khớp.
  - Map 409 của resend sang thông điệp đúng nghĩa, ví dụ "Email đang chờ gửi hoặc đã gửi".

### F3 — MAJOR (requirement coverage): không phân trang; đơn thứ 51 trở đi không vào được; lọc email báo rỗng sai
- API mặc định `limit=50` (`cancellation.ts:48`). UI không gửi `limit`/`offset` (`affected-orders-api.ts:21-27`, `affected-orders-list.tsx:67`) và không có điều khiển phân trang. Design §9 (`design-spec.md:40`, `:421`) yêu cầu DataTable có phân trang.
- Huỷ "tất cả suất tương lai của rạp" dễ sinh hơn 50 đơn. Khi đó đơn ngoài 50 dòng đầu không mở được từ danh sách (trừ khi dán UUID suất), nên không ghi được hoàn tiền (AC-25) cho các đơn đó.
- Lọc trạng thái email chạy client-side trên trang đã tải (`affected-orders-list.tsx:107`):
  - Nếu 50 dòng đầu không có FAILED nhưng các dòng sau có, UI hiện EmptyState "Không có đơn bị ảnh hưởng" (`:172-173`). Đây là báo rỗng sai, nguy hiểm cho AC-24 (theo dõi email lỗi để gửi lại).
  - Dòng "Hiển thị X / total" (`:176-178`) trộn số lượng trong trang với tổng toàn cục.
- CSV "xuất theo bộ lọc hiện tại" (`design-spec.md:471`) nhưng bỏ qua bộ lọc email, vì export schema không có `emailStatus` (`cancellation.ts:53-57`). Nội dung CSV lệch với bảng đang lọc mà UI không cảnh báo.
- Yêu cầu sửa:
  - Thêm phân trang `limit`/`offset`, tối thiểu là "Tải thêm".
  - Với lọc email: hoặc thêm filter server-side (cần đổi API, báo dispatcher), hoặc ghi rõ "lọc trong N đơn đã tải" và không hiện EmptyState khi `total > items.length`.
  - Ghi chú ở nút CSV rằng file không áp dụng bộ lọc email.

### F4 — MAJOR (R-39 / D4): bỏ qua phạm vi rạp `?cinema=` của topbar
- Shell giữ `?cinema=` khi chuyển trang (`components/admin/__tests__/shell.test.tsx:364-373`, link `/admin/don-bi-anh-huong?cinema=...`). Trang lịch chiếu cũng link sang với `?cinema=` (`app/admin/lich-chieu/page.tsx:93,135`). Các trang anh em đều dùng giá trị này qua `resolveScope` (`use-showtime-cinema.ts:29,42`, `price-matrix.tsx:204`).
- Trang này chỉ đọc `?showtime=` (`app/admin/don-bi-anh-huong/page.tsx:10`). `filtersToQuery` không bao giờ gửi `cinemaId`, dù API có hỗ trợ (`cancellation.ts:45`, `cancellation.service.ts:224`).
- Hậu quả: Admin chọn HN01 vẫn thấy và xuất CSV toàn chuỗi. Staff/Manager gán nhiều rạp thì thấy lẫn các rạp. RBAC vẫn đúng vì server lọc, nên không rò dữ liệu. Nhưng bộ lọc "Suất/Rạp" của §24 (`design-spec.md:471`) và D4/R-39 (`:50`, `:191`) không được đáp ứng, và CSV không đúng phạm vi đang chọn.
- Yêu cầu sửa: đọc `?cinema=` qua `resolveScope` (bỏ qua giá trị `all`), truyền `cinemaId` cho cả list lẫn export.

### F5 — MINOR: lỗi 422 "số tiền vượt giá trị đơn" chỉ hiện thông điệp chung
- Server trả 422 không kèm `details.issues` (`cancellation.service.ts:439-449`). Vì vậy `writeErrorToFields` rơi về `_form` với "Dữ liệu chưa hợp lệ…", không chỉ ra field nào. Sửa F1 bằng cách validate `amount <= totalAmount` ở client sẽ xử lý luôn lỗi này.

### F6 — MINOR: `URL.revokeObjectURL` gọi đồng bộ ngay sau `link.click()`
- `affected-orders-api.ts:47-51`. Một số trình duyệt có thể huỷ tải file. Nên dời revoke sang `setTimeout`.

### F7 — MINOR / gap (không tính cho task-06)
- Design §34 (`design-spec.md:473`) yêu cầu thêm field **Ngày\*** và **Phương thức\*** (Chuyển khoản/Tiền mặt), nhưng `recordRefundSchema` không có. Đây là gap giữa design và API, nên ghi vào gap register. AC của task chỉ yêu cầu số tiền và mã giao dịch.
- Dashboard (`design-spec.md:425`) link tới `?status=pending` và "lọc failed", nhưng trang này không đọc `?status`/`?email` từ URL. Thuộc task dashboard, chỉ ghi nhận.
- Design `:564` muốn sau khi huỷ suất thì điều hướng tới `?showtime=…`, còn lich-chieu đang link `?cinema=`. Thuộc task lich-chieu.
- Màn < 1024px theo spec phải hiển thị bảng dạng card. Hiện dùng `overflow-x-auto`: vẫn dùng được nhưng lệch spec.
- Mã suất chiếu nhập dạng UUID thô (`affected-orders-list.tsx:151-165`): UX kém, chấp nhận được ở MVP demo.

### Điểm đạt
- AC-25 phía client: thiếu số tiền/mã GD thì không gọi API và báo lỗi theo field (test `:72-80`). 422 có `issues` được map đúng field (`:96-110`).
- Chống double-submit: có `useRef` in-flight cộng nút disabled (`affected-resolution-form.tsx:37,41,52`), test `:123-134`.
- 403/422/409 không bao giờ toast thành công. Lỗi tải danh sách/chi tiết hiện `ErrorState` có retry.
- Chi tiết đơn chỉ hiện form khi status `affected`. Đã hoàn thì hiện số tiền và mã GD.
- Không còn badge/cột POS, không còn phương án đổi suất (khớp CR remove-pos và remove-showtime-exchange).

### AI-readable gate
Indicator: hàm component dài hơn 50 dòng (`AffectedOrdersList` khoảng 200 dòng, `AffectedOrderDetail` khoảng 95, `AffectedResolutionForm` khoảng 90). Chỉ 1 indicator, dưới ngưỡng 3, nên không FAIL vì gate này.

## Verdict
**FAIL**

Có 4 finding MAJOR:
- F1: số tiền hoàn bị hiểu sai và ghi nhận không đảo được.
- F2: nút gửi lại email lệch contract 409 và lệch spec, test khẳng định hành vi sai.
- F3: không phân trang, lọc email báo rỗng sai.
- F4: bỏ qua phạm vi rạp của topbar.

Builder sửa F1–F4 (và F5/F6 nếu tiện), bổ sung test cho từng điểm, rồi review round 2.
