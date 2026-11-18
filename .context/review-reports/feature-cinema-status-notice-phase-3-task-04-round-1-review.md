# Review — feature-cinema-status-notice · phase-3-task-04 · round 1

Agent: reviewer

- **Review level:** STRICT (nâng từ NORMAL)
- **Reason:** Task chỉ là UI web, không đụng auth/DB/schema/API contract mới; endpoint, RBAC và email đều nằm ở API (task-03, đã PASS). Tôi vẫn nâng lên STRICT vì phân tích đột biến cho thấy **logic quan trọng thiếu test**, một trigger bắt buộc: lỗi `onChanged` gán `status = scheduledStatus` ở `/admin/rap` không làm test nào đỏ, mà đó đúng là hành vi "Original" trong Repro Verification (đổi trạng thái tức thì). Ngoài ra thao tác này gửi email hàng loạt và chạm điều hướng công khai.
- **Blast radius:** trang công khai `/rap/[code]` (mọi rạp), màn admin `/admin/rap` + `CinemaStatusDialog`, ghi chú trong `CinemaForm`. Thêm 2 file mới: `components/catalog/cinema-closed-notice.tsx`, `lib/cinema-schedule.ts`. `rap-room-links.test.tsx` mock dialog thành `() => null`, nên không bị ảnh hưởng.
- **Nguồn đối chiếu:** `spec/changes/2026-11-18-cinema-status-notice.md` (Hợp đồng §Web + Acceptance), `SPECIFICATIONS.md` R-33/R-136/R-137 (đọc đủ dòng 125-127), AC-26..AC-30, `apps/api/src/modules/mail/templates.ts:631-754`, `packages/shared/src/schemas/{catalog,cancellation}.ts`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS: shared 31/31, api 658/658, web 48 file / 610 test, scripts 31/31 |
| oxlint | skip, oxlint chưa cấu hình |
| aislop / ocr | skip, không có trong allowlist / chưa cài |
| `pnpm test:int` | không chạy (theo brief) |

## Đối chiếu yêu cầu

| Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|
| R-137/AC-28: rạp CLOSED/TEMP_CLOSED/COMING_SOON trả 200, có thông báo, tên rạp và link về `/rap` | OK | `page.tsx:138-146`, `cinema-closed-notice.tsx:48-108`; test `page.test.tsx:83-101` |
| Không có lịch chiếu, bản đồ, yêu thích, JSON-LD | OK | return sớm trước `buildCinemaJsonLd`/`getServerAccessToken` (`page.tsx:138`); test kiểm cả 4 |
| `robots noindex` cho rạp không hoạt động; rạp OPEN giữ nguyên | OK | `page.tsx:107-115`; test `:116-125` |
| Mã rạp sai vẫn `notFound()` | OK về hành vi (test yếu, xem F-03c) | `page.tsx:133-135` |
| Rạp OPEN có lịch: banner đúng loại, ngày giờ VN, hướng dẫn hoàn tiền | OK | `cinema-closed-notice.tsx:110-142`. `refundNoticeText` (`cinema-schedule.ts:39-41`) trùng từng chữ với `refundNoticeContent` (`templates.ts:693-695`) khi bỏ phần in đậm |
| R-136/AC-30: dialog nêu ngày hiệu lực +7 ngày và việc email toàn bộ khách TRƯỚC khi xác nhận | OK | `cinema-status-dialog.tsx:133-148` |
| Có lịch: panel "Đang chờ…"; chọn đúng trạng thái hiện tại thì thành "Huỷ lịch" + cảnh báo email đính chính | OK | `:107-112`, `:150-155`, `resolveMode` `:36-39` |
| Không có lịch + trạng thái hiện tại: nút khoá | OK | `:169`; test `catalog-admin.test.tsx:235` |
| Endpoint/method/body `PATCH /admin/cinemas/:id/status` `{status}` | OK | `:83-86`; test `:245-248`, `:272-275` |
| Toast theo `scheduleCancelled` / `emailsEnqueuedCount`, dùng ngày do server trả | OK | `successMessage` `:41-46` |
| Lỗi 400/403/500 hiện trong dialog, không gọi `onChanged`; đã bỏ nhánh 409 / `showtimeIds` / link "Huỷ hàng loạt" | OK | `:90-92`; grep `apps/web/src` không còn chỗ dùng trong dialog |
| Chặn bấm đúp trên nút xác nhận | OK, nhưng còn đường vòng qua đóng/mở lại dialog (F-01b) | `disabled={saving \|\| …}` `:169` |
| `/admin/rap`: badge lịch chờ; sau khi đổi chỉ cập nhật `scheduled*`, giữ `status` theo server | OK về code (thiếu test, F-03a) | `admin/rap/page.tsx:98-106`, `:143-150`; test badge `catalog-admin.test.tsx:339-346` |
| `CinemaForm` không gửi `status` khi sửa rạp | OK | `cinema-form.tsx:159-171` (chỉ gửi khi tạo rạp mới, hợp lệ) |
| Token màu / kích thước nút | OK | `warning-*`, `info-*` có trong `globals.css:30,33`; Button `default` = `h-11` (44px), CTA `lg` + `min-h-11` |
| Hiển thị ở 375px | OK (đọc code) | `flex-wrap` cho breadcrumb và badge, section `p-6`, CTA `w-full sm:w-auto`. Chưa kiểm trên trình duyệt thật |
| Spec/contract có đòi thêm bước xác nhận riêng hoặc câu chữ cố định không | Không | Contract §Web chỉ yêu cầu "giải thích quy tắc 7 ngày (ngày hiệu lực) + xác nhận". R-136 yêu cầu "giải thích ngày hiệu lực trước khi xác nhận … thao tác huỷ lịch". Dialog đáp ứng cả hai |

## Phân tích đột biến

| Đột biến | Test đỏ? |
|---|---|
| Rạp không OPEN quay lại gọi `notFound()` | Đỏ: `page.test.tsx` it.each |
| Bỏ `<CinemaScheduleBanner>` | Đỏ: `page.test.tsx:129-153` |
| Bỏ nhánh huỷ lịch | Đỏ: `catalog-admin.test.tsx:260-277` |
| Ngày +6 thay vì +7 | Đỏ: dialog `:238` |
| Định dạng ngày theo UTC thay vì giờ VN | Đỏ ở page/badge (fixture `17:30Z`). Dialog không bắt được vì fixture `03:00Z` cho cùng ngày ở UTC và VN |
| `onChanged` ở `/admin/rap` gán `status = scheduledStatus` | **Không đỏ** (F-03a) |
| Bỏ `saving \|\|` khỏi `disabled` | **Không đỏ** (F-03b) |
| `fetchCinemaDetail` trả `null` cho mọi lỗi (đúng hiện trạng) hoặc chỉ cho 404 | Test 404 không phân biệt được hai cách này (F-03c) |

## Findings

**F-01 · MINOR (UX, rủi ro gửi email hàng loạt) · `apps/web/src/components/admin/cinema-status-dialog.tsx`**

(a) `:63,74,164-173`: Với rạp đã có lịch, dialog mở ra đã chọn sẵn trạng thái hiện tại, nên `mode = "cancel"` và nút đỏ **"Huỷ lịch"** bật ngay. Mở dialog rồi bấm 1 lần là gửi email đính chính tới toàn bộ khách. Trong UI tiếng Việt, "Huỷ" ở chân dialog dễ bị hiểu là đóng hộp thoại, lại nằm cạnh nút "Đóng". Cảnh báo có hiện (`:150-155`) và nút là `destructive`, nên AC-30 vẫn đạt.
Đề xuất: đổi nhãn thành "Huỷ lịch & gửi email đính chính", hoặc thêm checkbox/bước xác nhận cho các hành động gửi email.

(b) `:98,164`: **Đường vòng gửi trùng.** Khi `saving`, nút "Đóng", phím Esc và click overlay vẫn hoạt động; `onOpenChange` không bị chặn. Đóng dialog giữa chừng làm `admin/rap/page.tsx:141` gọi `setStatusTarget(null)` và dialog bị unmount, mất trạng thái `saving`. Mở lại cùng rạp thì dialog mới có `saving=false` và vẫn hiện lịch cũ, vì `onChanged` chưa chạy. Admin có thể gửi request thứ hai, tức là email hàng loạt lần hai. Khi request đầu xong, `onOpenChange(false)` (`:89`) còn đóng luôn dialog vừa mở lại. Cần thao tác cố ý trong lúc request đang chạy nên rủi ro thấp.
Đề xuất: khi `saving` thì chặn đóng, ví dụ `onOpenChange={(o) => !saving && onOpenChange(o)}` và `disabled={saving}` cho nút "Đóng".

**F-02 · MINOR (copy) · `apps/web/src/components/catalog/cinema-closed-notice.tsx:77-84`**
Câu "Rạp dự kiến **mở cửa trở lại** từ ngày …" hiện cho cả rạp `COMING_SOON` (lần đầu khai trương), nên "trở lại" sai nghĩa. Rạp TEMP_CLOSED/COMING_SOON có lịch sang trạng thái không OPEN thì trang không nêu gì; chấp nhận được ở bản demo.
Đề xuất: đổi câu theo `cinema.status` (COMING_SOON: "dự kiến khai trương từ ngày …").

**F-03 · MINOR (thiếu test, không chặn) · `apps/web/src/components/admin/__tests__/catalog-admin.test.tsx`, `apps/web/src/app/(public)/rap/[code]/__tests__/page.test.tsx:110-114`**

(a) Chưa có test nào kiểm rằng sau khi dialog trả kết quả, `/admin/rap` hiện badge lịch mới và **giữ nguyên** badge trạng thái hiện tại. Đột biến `status = scheduledStatus` không bị bắt.

(b) Chưa có test cho việc nút bị khoá khi đang gửi (bấm 2 lần chỉ gọi API 1 lần), cũng như đường vòng F-01b.

(c) Test "mã sai → notFound" reject bằng `Object.assign(new Error, {status: 404})`, không phải instance của `ApiError` đã mock. Test xanh chỉ vì `fetchCinemaDetail` nuốt mọi lỗi thành `null`; nhánh 404 thật không được chạy và lỗi 500 cũng sẽ xanh. Nên reject bằng `new ApiError(...)` có `status = 404`.

**Lý do không chặn:** code hiện tại đúng ở cả 3 điểm (`admin/rap/page.tsx:143-150` dùng `status` do server trả; nút đã có `disabled={saving}`). Giả sử lỗi (a) xảy ra trong tương lai thì nguồn sự thật là server/DB: trạng thái rạp không đổi, chỉ badge hiển thị sai đến khi tải lại trang, và không có dữ liệu hay email nào sai. Mức MINOR là đúng. Tôi đề nghị bổ sung các test này cùng lúc sửa F-01b.

**F-04 · INFO (lệch ngày) · `apps/web/src/lib/cinema-schedule.ts:21-23`, `cinema-status-dialog.tsx:75`**
Dialog tính ngày bằng đồng hồ trình duyệt + 7 ngày; server lưu `now() + 7 days`. Hai bên chỉ lệch khi đồng hồ máy admin sai hoặc khi bấm vắt qua 0h giờ VN, tối đa 1 ngày. Toast, badge và email đều dùng giá trị server, nên khách không nhận thông tin sai. Không cần sửa.

**F-05 · INFO · `cinema-closed-notice.tsx:121-124`**
Nếu job áp lịch chạy trễ sau `scheduledEffectiveAt`, banner sẽ ghi "sẽ đóng cửa từ ngày <ngày đã qua>". Chỉ xảy ra trong khoảng job trễ cộng tối đa 60 giây cache (`PUBLIC_CACHE`). Không chặn.

**F-06 · INFO (giữ hành vi cũ) · `page.tsx:83-92`**
`fetchCinemaDetail` vẫn biến lỗi 5xx/mạng thành `null`, tức là trả 404 giả. Task đã chủ động giữ nguyên (thiết kế §1). Đây là nợ có từ trước, không phải hồi quy.

## Kiểm tra khác
- Surgical diff: mọi thay đổi đều phục vụ task. 3 file test `cinemas`/`home`/`shell` chỉ thêm 2 field fixture cho khớp DTO mới.
- AI-readable: tên rõ, có hằng `CINEMA_STATUS_DELAY_DAYS`/`DAY_MS`, hàm ngắn. File dialog 178 dòng, notice 142 dòng. 0/3 chỉ báo AI-chaos.
- Bảo mật: không render HTML thô từ input; JSON-LD chỉ cho rạp OPEN và dùng serializer có sẵn; không có PII.
- A11y: banner dùng `role="status"`, chấp nhận được (`role="note"` đúng ngữ nghĩa hơn). Trang có `h1`, breadcrumb có `aria-label`/`aria-current`, Select có label, icon có `aria-hidden`. Tiếng Việt đủ dấu.
- AI-friendly web: không áp dụng (không đổi `robots.txt`/`sitemap`). Trang rạp không hoạt động gắn `noindex, follow` đúng R-137.

## Verdict

**STRICT PASS**

Không có finding CRITICAL hay MAJOR, và không có finding nào chặn. Nên xử lý F-01b (chặn đóng dialog khi đang gửi) và F-03 (3 test còn thiếu/yếu) trong lần chạm tới kế tiếp hoặc một CR nhỏ. F-01a và F-02 là cải thiện câu chữ/UX.
