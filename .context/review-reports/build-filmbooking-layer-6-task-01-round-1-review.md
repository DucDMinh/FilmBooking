# Review — build-filmbooking layer-6 task-01 — round 1

Agent: reviewer
Ngày: 2026-11-14
Worktree: E:/FilmBooking/.worktrees/layer-6__task-01 (branch wt/layer-6__task-01, chưa commit)

## Review level
STRICT. Lý do: đụng payment (PayOS createPayment, thứ tự huỷ link), shared schema (`createPaymentBodySchema`), wiring global (APP_GUARD áp lên 9 module mới), `database.types.ts`.

## Blast radius
- `apps/api/src/app.module.ts`: mount toàn bộ route booking/payment/jobs/checkin/admin/orders/report/cancellation.
- `payment.service.ts`: luồng tạo link thanh toán của mọi đơn có tiền.
- `packages/shared/src/schemas/payment.ts`: body `POST /bookings/:id/payment` (web xác nhận dùng).
- `database.types.ts`: type RPC dùng chung api/web.
- `docs/API_SPEC.md`: tài liệu as-built.

## Verify commands + kết quả
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/api && pnpm test` | PASS, 23 file / 457 test |
| `cd apps/web && pnpm build` | PASS (lưu ý: chưa có route `/dat-ve/don/[id]/ket-qua`, thuộc layer-6-task-05) |
| aislop / oxlint / ocr | skip: không chạy trong lượt này (không có trong allowlist verify của dispatcher) |

## Đã kiểm, đạt
- Global guard: Auth -> Roles -> CinemaScope -> Throttler giữ nguyên. `@Public()` chỉ ở health, auth-ext, catalog public, pricing public, `GET showtimes/:id/seatmap`, `POST payos/webhook`, jobs (kèm `JobSecretGuard`), `auth/oauth/missing-email`. Controller mới (checkin, admin, orders, report, cancellation) đều có `@Roles`, phần theo rạp có `@CinemaScope`. Smoke e2e xác nhận 16 route trả 401 khi không có token, CUSTOMER bị 403 ở admin/reports/orders, jobs không secret bị 401.
- Provider và module: `PaymentModule` export `PaymentService` + `PayosClient`, được AppModule và JobsModule import. Nest dùng module singleton nên chỉ có 1 instance PayosClient. Không có import vòng (Payment không import Jobs).
- Route: không thấy route nào trùng giữa các controller mới và cũ (đã soát cinemas/:cinemaId/showtimes/*, orders/:id vs orders/:orderId/affected, admin/orders vs admin/affected-orders).
- `resolveRedirectUrl` (payment.service.ts:278-294): không lách được.
  - Path tương đối được ghép sau `WEB_ORIGIN[0]`, nên host luôn là origin web. Kể cả `//x` hay `\` (vốn đã bị chặn) thì vẫn an toàn.
  - URL tuyệt đối so sánh theo `new URL().origin` chuẩn WHATWG: userinfo (`https://web@evil`), backslash (`https://evil\@web`), tab/newline, chữ hoa scheme/host, cổng khác, `javascript:` (origin `"null"`), suffix (`localhost:3000.evil.com`) đều ra origin khác hoặc bị từ chối. Nhiều giá trị `WEB_ORIGIN` được hỗ trợ qua `includes`.
  - Web gửi `${window.location.origin}/dat-ve/don/{id}/ket-qua|xac-nhan`, vẫn tương thích nếu origin đó có trong `WEB_ORIGIN`.
- Guard trạng thái đơn: `.in("status", ["holding","pending_payment"])` (payment.service.ts:242-247) đúng yêu cầu và có test. Không ghi đè đơn đã paid/cancelled.
- Thứ tự huỷ (payment.service.ts:261-275) được đối chiếu với `confirm_paid` (migration 20261113160000). RPC này không xét `payments.status`: chọn payment theo `p_order_code`, rồi chốt bán hoặc chuyển manual review và set payment `PAID`. Nghĩa là khi khách trả bằng link cũ đã CANCELLED, tiền vẫn được ghi nhận, không mất. Thứ tự mới không tạo trạng thái treo mới so với code cũ (code cũ cũng set CANCELLED bất kể huỷ PayOS lỗi). Ngoài ra `link_cancelled_at` giờ chỉ ghi khi huỷ thành công, chính xác hơn trước.
- `database.types.ts` khớp migration: thêm `call_nest_job`, `cancel_stale_payment`, `has_role`. `resolve_manual_review` sắp lại đúng thứ tự abc, kiểu tham số theo output của generator. Typecheck vẫn PASS dù orders.service truyền `null`. `payments.link_cancelled_at` có mặt.
- Test mới không bịa hành vi DB: các test kiểm thứ tự CANCELLED trước cancel, mặc định URL, 400 khi sai origin và không gọi PayOS, race paid.

## Findings

### MAJOR-1: `docs/API_SPEC.md` as-built lệch code
File `docs/API_SPEC.md`, các dòng mới thêm (khoảng dòng 53-60):
- Dòng **CancellationModule** liệt kê `GET cancelled-showtimes`, nhưng `CancellationController` không có route này. Route đó thuộc `ReportController` (`/reports/cancelled-showtimes`, `/admin/reports/cancelled-showtimes`).
- Cùng dòng đó bỏ sót toàn bộ nhóm route chính của R-110 trong `cancellation.controller.ts:153-244`:
  - `GET (admin/)affected-orders`, `GET cinemas/:cinemaId/affected-orders`
  - `GET .../affected-orders/export` (CSV)
  - `GET (admin/)affected-orders/:orderId`, `GET orders/:orderId/affected`
  - `POST .../:orderId/refund` (422 khi thiếu số tiền hoặc mã GD)
  - `POST .../:orderId/resend-email`
  - `POST cinemas/:cinemaId/status`

  Quyền đúng là `@Roles("STAFF")` cho nhóm affected-orders, khác với "Manager" mà doc đang ghi chung.
- Dòng **AdminModule** ghi `GET/PATCH /admin/users[/:userId]`. Thực tế (`users.controller.ts:119,150`) là `PATCH /admin/users/:userId/lock` và `PATCH /admin/users/:userId/admin-role`; không có `PATCH /admin/users/:userId`. Doc cũng thiếu alias `GET /admin/audit-logs` (`audit.controller.ts:37`) và `PATCH /admin/cinemas/:cinemaId/staff/:userId` (Admin only).

Theo Doc Impact rule, doc as-built phải khớp code. Hiện doc vừa ghi route không tồn tại vừa bỏ sót route nghiệp vụ, nên client/test-scope dựa vào doc sẽ sai. Sửa: viết lại 2 dòng trên đúng theo decorator thật.

### MINOR-1: response trả `AWAITING_PAYMENT` kèm `checkoutUrl` dù update đơn bị guard chặn
payment.service.ts:242-254. Khi đơn đổi sang paid/cancelled/expired trong lúc gọi PayOS, update bị `.in()` chặn đúng. Nhưng code không kiểm số dòng bị ảnh hưởng, vẫn trả `AWAITING_PAYMENT` + checkoutUrl và để lại một payment PENDING mồ côi. Với đơn vừa cancelled/expired, khách bị chuyển sang trả tiền. Hậu quả: tiền về muộn, `confirm_paid` đưa sang manual review, không mất tiền. Test race chỉ kiểm đơn không bị ghi đè, không kiểm response. Đề xuất: dùng `.select()` để kiểm, nếu 0 dòng thì huỷ link vừa tạo và trả 409 hoặc trạng thái thật.

### MINOR-2: payment CANCELLED huỷ link lỗi của chính đơn hiện tại không bao giờ được thử huỷ lại
payment.service.ts:192-201 và 261-269. Khi `cancelPaymentLink` trả false, payment ở trạng thái `CANCELLED` + `link_cancelled_at = null`. Truy vấn retry chỉ quét đơn khác (`neq order.id`, dòng 160-177). Còn `currentPendingPayments` lọc `status = PENDING`, nên link cũ của chính đơn còn sống tới khi PayOS hết hạn. Hệ quả là khách có thể trả 2 link (một cũ, một mới):
- lần 2 ra `ALREADY_PAID`, phải hoàn tay;
- reconcile (`PENDING`/`EXPIRED`) không quét `CANCELLED`, nên nếu mất webhook thì giao dịch trên link cũ không được đối soát tự động.

Lỗi này có sẵn từ trước, thứ tự mới không làm tệ hơn; demo nên không chặn. Đề xuất: truy vấn hiện tại thêm điều kiện `status in (PENDING, CANCELLED) and link_cancelled_at is null and payment_link_id not null`.

### NIT-1: JSDoc mô tả sai hành vi webhook
payment.service.ts:257-260 ghi "webhook ... thấy payment đã huỷ thay vì một PENDING". Thực tế `handleWebhook` (dòng 439-443) chỉ log cảnh báo rồi vẫn gọi `confirm_paid`, và chốt bán là đúng nghiệp vụ. Nên sửa comment cho khỏi gây hiểu nhầm.

### NIT-2: so sánh origin không chuẩn hoá `WEB_ORIGIN`
env.ts:10-18 chỉ trim và bỏ `/` cuối. Nếu cấu hình `https://Web.com` hoặc `https://web.com:443`, mọi URL tuyệt đối hợp lệ đều bị 400. Đề xuất: chuẩn hoá `WEB_ORIGIN` bằng `new URL(o).origin`. Không phải lỗ hổng.

### Ghi chú / residual
- Mặc định returnUrl `/dat-ve/don/{id}/ket-qua` chưa có trang (web build không có route). Trang này thuộc layer-6-task-05; web hiện cũng gửi đúng URL đó, nên cần merge task-05 trước khi demo luồng thanh toán.
- Smoke webhook chỉ assert `status != 401/404` + `success=false`, khá yếu nhưng đủ cho AC wiring.
- Builder sửa file ngoài danh sách task (`payment.service.ts`, `payment.ts`, `webhook.e2e-spec.ts`, `API_SPEC.md`), khớp phạm vi bổ sung do dispatcher giao.

## Verdict
**FAIL**: có 1 MAJOR (MAJOR-1, API_SPEC as-built lệch code). Code payment/wiring đạt. Sau khi sửa MAJOR-1 (khuyến nghị sửa kèm MINOR-1, MINOR-2) có thể review lại nhanh ở round 2.
