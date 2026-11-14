Agent: reviewer

# Review — build-filmbooking layer-7 task-05 — Round 1

- Task: Web admin Việc cần làm + đơn hàng + chi tiết đơn + đơn cần xử lý thủ công (R-103, R-104, R-134, AC-11)
- Worktree: `E:/FilmBooking/.worktrees/layer-7__task-05` (branch `wt/layer-7__task-05`, chưa commit)
- Review level: **STRICT**
- Reason: RBAC theo rạp (Staff / Manager rạp khác read-only), ghi xử lý tiền / hoàn tiền thủ công (R-104), hook dùng chung mới (`useApiResource`), đối chiếu contract API + RPC DB.
- Blast radius: các route admin mới `/admin`, `/admin/don-hang`, `/admin/don-hang/[code]`, `/admin/don-can-xu-ly`. Hook `useApiResource` và `order-utils` mới (sẽ được tái dùng). Không đổi API, shared hay migration.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 25 file, 361 test. Không có timeout ở `pricing-voucher.test.tsx` lần này |
| `cd apps/web && pnpm exec vitest run` (lần 2) | PASS: 25 file, 361 test (không flaky, không treo) |
| `pnpm build` | PASS: 4 route mới đều dynamic (ƒ), không có lỗi Suspense hay `useSearchParams` |
| `npx aislop scan --changes --json` | score 100 (Healthy), 0 error |
| oxlint | skip: oxlint không được cấu hình (repo không có `.oxlintrc`) |
| ocr | skip: ocr chưa cài |
| AI-friendly web | N/A (trang admin nội bộ) |

Các lệnh trên đều xanh, nhưng theo luật adversarial review thì như vậy chưa đủ để PASS. Xem các finding dưới đây.

## Cross-boundary check (API, shared, DB thật)

- `AdminOrdersController` (`apps/api/src/modules/orders/orders.controller.ts:71-114`):
  - `GET /admin/todo` không nhận query.
  - `GET /admin/orders` dùng `searchOrdersQuerySchema`.
  - `GET /admin/orders/needs-manual-review`: `@Roles("MANAGER")`, service chỉ cho Manager của đúng rạp hoặc Admin.
  - `POST /admin/orders/:id/resolve-manual-review`.
  - Path, query và body phía web khớp.
- `canResolveOrder` (`order-utils.ts:47-50`), gồm Admin hoặc MANAGER của đúng `order.cinemaId`, khớp với các chỗ sau:
  - `validateManualReviewAccess` (`orders.service.ts:280-284`)
  - RPC `has_cinema_manager_scope(v_order.cinema_id) or has_role('ADMIN')` (`20261113170000_resolve_manual_review_rpc.sql:78`)
- Body resolve được parse bằng chính `resolveManualReviewSchema` của shared:
  - Refund bắt buộc có `refundReference` và `refundedAmount` dạng int >= 0.
  - CONFIRM_SALE gửi `{action}`.
  - Phần này khớp.
- **RPC thật KHÔNG đổi status.** Migration `20261113170000_resolve_manual_review_rpc.sql:82-85` chỉ set `manual_review_resolved_at` và giữ nguyên `needs_manual_review`. `SPECIFICATIONS.md:311` ghi `needs_manual_review` là trạng thái kết thúc. Finding F1 và F2 bắt nguồn từ đây.
- `listNeedsManualReview` (`orders.service.ts:224`) KHÔNG lọc `manual_review_resolved_at is null`, trong khi todo (`orders.service.ts:363`) có lọc.

## Findings

### F1. [MAJOR, FAIL] Test resolve dùng mock trái hành vi DB thật (false-confidence), và UI không thể hiện được trạng thái "đã giải quyết"

- `apps/web/src/components/admin/__tests__/orders-admin.test.tsx:240-253`: sau khi POST resolve, mock detail trả `status: "paid"` và test assert thấy chữ "Đã thanh toán". RPC thật không bao giờ đổi sang `paid` (migration :82). Test đang chứng minh một hành vi không tồn tại.
- Trên DB thật, sau khi resolve thành công, `order-detail.tsx:156` có `pendingReview = false` nên form ẩn, điểm này đúng. Tuy nhiên:
  - Badge header `order-detail.tsx:162` vẫn hiện "Cần xử lý thủ công" với tone `danger`, vì `ORDER_STATUS_LABEL` và `ORDER_STATUS_TONE` (`order-utils.ts:11-37`) chỉ map theo `status` mà không xét `manualReviewResolvedAt`.
  - Trên phần thông tin đơn không có chỉ báo "Đã giải quyết lúc …". Chỉ timeline có thêm một mốc với nhãn "Cần xử lý thủ công", nên càng dễ hiểu nhầm.
  - Với Staff hoặc Manager rạp khác, trên phần thông tin đơn cũng không có dòng nào cho biết đơn đã được giải quyết.
- R-104 yêu cầu "đánh dấu đã giải quyết". UI hiện chưa phản ánh được việc đó.
- Cần sửa:
  1. Hiển thị trạng thái đã giải quyết khi `status === "needs_manual_review" && manualReviewResolvedAt`, cả ở badge và phần thông tin đơn. Ví dụ dùng nhãn "Đã xử lý thủ công", tone neutral/info, kèm thời điểm.
  2. Sửa mock test cho đúng RPC: giữ `status: "needs_manual_review"`, set `manualReviewResolvedAt`, rồi assert form biến mất và chỉ báo "đã giải quyết" xuất hiện.

### F2. [MAJOR, FAIL] Hàng đợi `/admin/don-can-xu-ly` lẫn đơn đã giải quyết mà không phân biệt được

- `orders-list.tsx:236-257` (`ManualReviewQueue`) và `OrdersTable` (`orders-list.tsx:85-87`) render badge theo `status`. Các đơn đã resolve (vẫn mang `needs_manual_review` và có `manualReviewResolvedAt`) hiện y hệt đơn chưa xử lý, đều là badge danger "Cần xử lý thủ công".
- Kết hợp với việc API không lọc resolved (`orders.service.ts:224`), queue này lớn dần mãi và empty state "Mọi đơn đã được xử lý" gần như không bao giờ xuất hiện.
- Số đếm trên todo (có lọc resolved) cũng lệch với queue.
- Phía UI (task-05) cần ít nhất:
  - phân biệt được đơn đã giải quyết trong bảng (dùng chung fix nhãn với F1), hoặc
  - đẩy đơn đã giải quyết xuống, hoặc ghi chú rõ ràng.
- Phía API: ghi **cross-boundary gap** cho owner layer-5 task-07: `listNeedsManualReview` thiếu `.is("manual_review_resolved_at", null)` hoặc thiếu filter `resolved`. Lỗi API không tính cho task-05, nhưng UI không được giả định là API đã lọc.

### F3. [MAJOR, FAIL] Lỗi 409 chỉ hiện chớp nhoáng rồi mất

- `order-detail.tsx:85-89`: khi gặp `CONFLICT`, code gọi `setErrors({form})` rồi gọi `onResolved()`, tức là `detail.reload`.
- Từ đó, `useApiResource` (`use-api-resource.ts:29`) set `loading`, và `OrderDetail` (`order-detail.tsx:254`) render `LoadingState`. `ResolveForm` bị unmount nên mất state `errors`.
- Khi tải lại xong:
  - Nếu đơn đã được người khác resolve, form ẩn mà không có thông báo nào.
  - Nếu chưa resolve, form mount lại với errors rỗng.
- Kết quả là người dùng không bao giờ thấy lý do lỗi.
- Test `orders-admin.test.tsx:256-265` PASS chỉ vì `findByText` bắt được frame trước khi reload chạy xong. Test không kiểm thông báo còn tồn tại sau khi tải lại.
- Cần sửa: giữ thông báo 409 ở cấp `OrderDetail`/`OrderBody` (hoặc dùng toast.error), hoặc reload theo kiểu không unmount form. Thêm assertion kiểm tra thông báo vẫn còn sau khi detail tải lại xong.

### F4. [MAJOR, FAIL] Bộ chọn rạp của Admin bị bỏ qua trên trang Đơn hàng và Đơn cần xử lý

- `order-utils.ts:59-65` (`useOrdersScope`) dựng pool rạp từ `me.me.cinemas`, tức là role gán theo rạp (`packages/shared/src/schemas/me.ts:13`). Admin thường không có gán rạp nào, nên `resolveScope("<id>", [], true)` (`use-admin-scope.ts:23-26`) luôn trả `"all"`.
- Hậu quả: Admin chọn "Rạp X" trên shell (`?cinema=X`) nhưng tra cứu và queue vẫn trả dữ liệu toàn chuỗi. Dữ liệu hiển thị không khớp với phạm vi đang chọn (R-39).
- Các màn khác đã xử lý đúng cho Admin:
  - `use-showtime-cinema.ts:41` lấy pool từ `/cinemas`.
  - `admin-shell.tsx:23-29` chấp nhận `cinemaParam` cho Admin.
- Test "Admin xem toàn chuỗi" (`orders-admin.test.tsx:156`) không truyền `?cinema=` nên không bắt được lỗi này.
- Cần sửa:
  - Với Admin, chấp nhận `?cinema=` khi đó là UUID hợp lệ, vì API vẫn kiểm quyền. Hoặc lấy pool từ `/cinemas`.
  - Thêm test Admin có `?cinema=HN01`, kỳ vọng request kèm `cinemaId=HN01`.

### F5. [MINOR] Builder tạo 5 file ngoài danh sách Files to Create/Modify

- Gồm `use-api-resource.ts`, `order-utils.ts`, `orders-list.tsx`, `order-detail.tsx`, `__tests__/orders-admin.test.tsx`.
- Task file ghi rõ: cần file ngoài danh sách thì phải báo Blocked hoặc báo dispatcher.
- Đã đối chiếu Files của layer-7 task-06 (`don-bi-anh-huong/*`, `affected-resolution-form.tsx` + test): không trùng tên. Rủi ro merge thấp, nhưng dispatcher cần ghi nhận khi merge.

### F6. [GAP, không chặn] `/admin/todo` không nhận `cinemaId`

- Contract server (`orders.controller.ts:76-79`, `orders.service.ts:310-387`) gộp mọi rạp mà người xem có quyền, nên dashboard bỏ qua bộ chọn scope của shell.
- Đây không phải lỗi task-05. Đề xuất ghi vào gap register (GAP mới) cho API.

### F7. [MINOR] Một số điểm nhỏ

1. Enum thô chưa dịch sang tiếng Việt: `payment.status` (`order-detail.tsx:221`), `affectedAction.action` (`:182`), `mail.kind` (`todo-widgets.tsx:99`).
2. Link "Suất sắp bắt đầu" trỏ `/admin/lich-chieu/:id` (`todo-widgets.tsx:108`), trong khi Staff không có quyền vào route này (nav `ADMIN_MANAGER`). Staff bấm vào sẽ bị chặn.
3. `useApiResource`: khi `path` chuyển từ non-null về `null`, state không được reset, nên comment dòng 14 nói quá thực tế. Hiện chưa gây lỗi trong luồng nào.
4. Không cảnh báo khi số tiền hoàn lớn hơn `totalAmount`. Server cũng không chặn.
5. `app/admin/don-hang/[code]/page.tsx:13`: `decodeURIComponent` ném `URIError` khi URL có `%` lỗi, gây trang 500 thay vì "Không tìm thấy".
6. Có component dài hơn 50 dòng: `ResolveForm` (~90), `OrderBody` (~85), `OrderSearch` (~90), `TodoDashboard` (~65). Đây là AI-readable indicator (1 loại). Chưa đến ngưỡng ≥3 indicators.

## Điểm đạt (đã kiểm)

- AC-11 phía todo: Admin và Manager thấy thẻ "Đơn cần xử lý thủ công" kèm link `/admin/don-can-xu-ly`. Staff không thấy thẻ này, khớp với việc server trả rỗng.
- Staff mở chi tiết đơn: không có form hay nút ghi xử lý, chỉ thấy note read-only. Manager rạp khác (kể cả khi đồng thời là Staff ở rạp của đơn) cũng read-only. Có test cho cả hai trường hợp.
- Tìm mã chính xác: client so khớp chính xác, không phân biệt hoa/thường, trên kết quả `ilike %code%` của server, và chỉ điều hướng khi có đúng 1 đơn khớp. Nếu chỉ khớp một phần thì hiện danh sách. Ký tự `%`/`_` trong ilike không gây mở sai đơn.
- Refund: phía client bắt buộc mã GD và số tiền theo schema shared, không gửi POST khi thiếu.
- Double-submit: `busy` được set đồng bộ trước `await` và nút bị disable. Server có thêm hai lớp chặn: `FOR UPDATE` và lỗi `ALREADY_RESOLVED`/`CONFLICT`.
- `useApiResource`:
  - deps chỉ gồm `[path, attempt]`, router giữ trong ref nên không bị effect loop. Chạy 2 lần full suite đều không treo.
  - Cờ `active` chặn response cũ ghi đè.
  - 403 thì `replace("/khong-co-quyen")`.
  - Các lỗi khác hiện ErrorState kèm nút thử lại.
- Có ErrorState, LoadingState, EmptyState ở mọi màn.

## Verdict

**FAIL**

Builder cần sửa:
- F1: hiển thị trạng thái đã giải quyết và sửa mock test cho đúng RPC.
- F2: phân biệt đơn đã giải quyết trong queue.
- F3: giữ thông báo 409 sau khi reload, kèm assertion kiểm tra.
- F4: tôn trọng `?cinema=` của Admin, kèm test.

F5 ghi nhận cho dispatcher. F6 ghi vào gap register. F7 tùy chọn, có thể sửa luôn nếu tiện.
