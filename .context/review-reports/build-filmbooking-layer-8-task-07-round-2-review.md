# Review: build-filmbooking layer-8 task-07 (round 2)

Agent: reviewer
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-07` (branch `wt/layer-8__task-07`, chưa commit)
Round trước: `.context/review-reports/build-filmbooking-layer-8-task-07-round-1-review.md` (FAIL, 3 MAJOR + 4 MINOR)

## Review level

**NORMAL**. Task chỉ sửa tài liệu. Round này kiểm hai việc: các finding của round 1 đã đóng chưa, và phần sửa có đưa thêm thông tin sai không. Tôi soi kỹ nhất các khẳng định mới về client (JWT hay service_role) của từng RPC.

## Reason

Tài liệu as-built ghi sai luồng hoặc contract là defect thật. Builder đã viết lại nhiều câu về cơ chế RPC/cron, nên mỗi câu mới tôi đều đối chiếu với code và thân SQL ở migration mới nhất của hàm đó.

## Blast radius

- Chỉ ảnh hưởng tài liệu (`docs/DESIGN.md`, `docs/API_SPEC.md`, `docs/ERD.md`), không ảnh hưởng runtime.
- Phạm vi file theo `git status --short`: không đổi so với round 1. Không đụng intent docs (`SPECIFICATIONS.md`, `docs/BRD.md`, `docs/PRD.md`, `docs/USER_FLOW.md`, `spec/**`, `docs/specs/**`) và không đụng gap register.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `git status --short` | Phạm vi đúng: README, 3 doc, task file, script mới |
| `node scripts/check-api-routes.mjs` | Vẫn **BLOCKED**: lệnh chưa có trong allowlist verify, nên chưa chạy. Round này không đổi bảng route; đối chiếu tĩnh 145/145 ở round 1 vẫn còn hiệu lực |
| lint/typecheck/build/test, aislop/oxlint/ocr | skip: chưa có `node_modules`, diff chỉ có tài liệu |

## Trạng thái finding round 1

| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| MAJOR-1 (cron hết hạn giữ ghế) | **Đóng một phần**. Cơ chế cron và danh sách cron đã đúng, nhưng câu mới mô tả phạm vi của job lại sai (xem MAJOR-R2-1) | `docs/DESIGN.md:62`, `docs/ERD.md:67`, `docs/ERD.md:113` có `expire-overdue-holds` (mỗi phút), khớp `20261111040000_rpc_hold.sql:764-773`. Câu "ghế quá hạn coi là trống khi đọc/giữ" khớp `20261112140000_hold_seats_hardening.sql:318` |
| MAJOR-2 (`hold_seats` client) | **Đóng** | `docs/DESIGN.md:31` ghi JWT khách, khớp `booking.service.ts:44`. Câu "Admin/nhân sự bị chặn, chỉ CUSTOMER đã xác nhận email" khớp `booking.service.ts:34-42` |
| MAJOR-3 (`GET /bookings/:id`) | **Đóng** | `docs/API_SPEC.md:144`: trả 200 với `expiresInSeconds: 0`, Admin/nhân sự rạp đọc được, người khác nhận 403. Khớp `booking.controller.ts:58-61`, `booking.service.ts:96-134`, `booking.helper.ts:110-111,196-197`. Danh sách route trả 410 khớp `booking.service.ts:70,141,164,209,263`, `payment.service.ts:137` |
| MINOR-1 (`confirm_paid`) | **Đóng**, còn một chỗ diễn đạt chưa chuẩn (xem MINOR-R2-1) | `docs/DESIGN.md:39` |
| MINOR-2 (`SHOWTIME_OVERLAP`) | **Đóng** | `docs/API_SPEC.md:113` ghi `CONFLICT` với `details.reason`/`details.conflicts`, khớp `showtimes.service.ts:521-524` |
| MINOR-3 (bulk body) | **Đóng** | `docs/API_SPEC.md:110` khớp `packages/shared/src/schemas/cinema-ops.ts:128-144` |
| MINOR-4 (giới hạn script) | Không chặn, giữ nguyên | |

## Đối chiếu các khẳng định MỚI về client của RPC (`docs/DESIGN.md:31,34,39,48`)

Tất cả đều khớp code:

**Gọi bằng JWT của user (`forUser(jwt)`):**
- `hold_seats`: `booking.service.ts:44`
- `release_seats`: `:72`
- `apply_voucher`: `:211`
- `remove_voucher`: `:265`
- `checkin_ticket`: `checkin.service.ts:92`
- `resolve_manual_review`: `orders.service.ts:249`

**Gọi bằng service_role (`admin()`):**
- `confirm_zero_amount`: `payment.service.ts:142-144`
- `mark_payment_cancelled`: `:184`, `:411`
- `record_payment_event`: `:462`
- `confirm_paid`: `:482-484`
- `cancel_stale_payment`: `reconcile.service.ts:159`
- `set_cinema_status`: `cancellation.service.ts:156-158`

**Phụ thuộc người gọi:** `preview_cancel_showtimes` và `cancel_showtimes` dùng `isAdmin ? admin() : forUser(jwt)` (`cancellation.service.ts:61,120`).

**Mô tả `hold_seats` chuyển `pending_payment` quá hạn sang `expired`:** đúng theo thân SQL, không chỉ header. Xem `20261112140000_hold_seats_hardening.sql:282-301`: update `holding`/`pending_payment` quá hạn của suất này thành `expired`, và payment `PENDING` thành `EXPIRED`. Đây là migration cuối cùng redefine `hold_seats`.

**Nhánh `confirm_paid`** (`20261113160000_confirm_paid_order_code_lookup.sql`):
- Trả `SUCCESS` ở `:330-333`.
- Nhánh lệch tiền ở `:112-192`.
- Nhánh không đủ điều kiện: payment `PAID` (`:338-356`), nhả ghế HELD (`:358`), đơn sang `needs_manual_review` (`:360-363`), email `LATE_PAYMENT_MANUAL_REVIEW` (`:369`).
- `SEATS_UNAVAILABLE`/`SEATS_TAKEN` (`:262`) và `ONLINE_CUTOFF_PASSED` (`:228`) là các `v_reason`.

## Findings

### MAJOR-R2-1: phạm vi của job `expire_overdue_holds` mô tả sai; câu mới bỏ sót `pending_payment` và việc expire payment

**Doc ghi** (`docs/DESIGN.md:34`):

> "job pg_cron `expire-overdue-holds` ... gọi `expire_overdue_holds()`: đơn `holding` quá `hold_expires_at` -> `expired`, xoá `showtime_seat_states` quá hạn, thả voucher `HELD`. `hold_seats` cũng chuyển `pending_payment` quá hạn -> `expired` khi chạy."

**Code thực tế:** định nghĩa có hiệu lực là bản cuối ở `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql:594-639`. Không migration nào sau đó redefine hàm này; grep `function public.expire_overdue_holds` chỉ có `20261111040000:725` và `20261112100000:594`. Hàm này:
- Chuyển **cả `holding` lẫn `pending_payment`** quá hạn sang `expired`, trên **toàn hệ thống** chứ không riêng một suất (`:605-619`).
- Chuyển `payments` `PENDING` của các đơn đó sang `EXPIRED` (`:621-627`).
- Xoá ghế HELD quá hạn và ghế của các đơn vừa expire (`:630-635`).

Voucher được thả gián tiếp qua trigger `orders_voucher_status_sync`, không phải do thân hàm.

**Vì sao là MAJOR:**
- Câu hiện tại khiến người đọc hiểu rằng đơn `pending_payment` chỉ hết hạn khi có ai đó gọi `hold_seats` trên cùng suất, và rằng job không chạm vào payment. Cả hai đều sai.
- Đây là máy trạng thái đơn/thanh toán. Job reconcile dựa trên chính các payment `EXPIRED` (≤1h) mà job này sinh ra.
- Thông tin sai này mới xuất hiện trong lần sửa MAJOR-1.

**Cách sửa:** viết lại thành "job chuyển đơn `holding`/`pending_payment` quá `hold_expires_at` sang `expired` (toàn hệ thống), payment `PENDING` của các đơn đó sang `EXPIRED`, xoá ghế HELD quá hạn; voucher `HELD` được thả qua trigger `orders_voucher_status_sync`. `hold_seats` làm việc tương tự cho riêng suất đang giữ (`20261112140000:282-309`)".

### MINOR-R2-1: `confirm_paid` có mô tả `SEATS_UNAVAILABLE`/`SEATS_TAKEN` như thể là giá trị `status` trả về

- `docs/DESIGN.md:39` liệt kê "`confirm_paid` trả jsonb `status`: `SUCCESS` ...; `AMOUNT_MISMATCH` ...; và nhánh tiền về muộn ... (`SEATS_UNAVAILABLE`/`SEATS_TAKEN` ...)".
- Thực tế nhánh này trả `{success:false, status:'NEEDS_MANUAL_REVIEW'}` (`20261113160000:385-393`). `SEATS_*` chỉ là `v_reason`, nằm trong payload email.
- Ngoài ra, ở nhánh lệch tiền, `payments` không đổi status: chỉ cập nhật `amount`, hoặc tạo bản ghi `PENDING` (`:115-133`). Chỉ `payment_events.event_status` mang giá trị `AMOUNT_MISMATCH`, nên cụm "với trạng thái lệch" chỉ đúng với `payment_events`.
- Không chặn PASS. Nên sửa luôn cùng MAJOR-R2-1.

### MINOR-4 (từ round 1)

Giữ nguyên: script không kiểm cột guard. Không chặn PASS.

## Luật cứng

Intent docs và gap register không bị sửa. Các dòng `<!-- TODO(dispatcher) -->` là cố ý. Đạt.

## Verdict

**FAIL**

3 MAJOR của round 1 về cơ bản đã sửa đúng, và toàn bộ khẳng định mới về client của RPC đều khớp code. Tuy vậy, lần sửa MAJOR-1 đã đưa vào một mô tả sai về phạm vi của job `expire_overdue_holds` (MAJOR-R2-1). Phần cần sửa chỉ là viết lại một câu ở `docs/DESIGN.md:34`, nên sửa kèm MINOR-R2-1 ở `docs/DESIGN.md:39`.
