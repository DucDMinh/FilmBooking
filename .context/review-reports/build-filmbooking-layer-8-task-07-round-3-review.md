# Review: build-filmbooking layer-8 task-07 (round 3)

Agent: reviewer
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-07` (branch `wt/layer-8__task-07`, chưa commit)
Round trước: `.context/review-reports/build-filmbooking-layer-8-task-07-round-2-review.md` (FAIL: 1 MAJOR-R2-1 + 1 MINOR-R2-1)

## Review level

**NORMAL**. Task chỉ sửa tài liệu as-built (`README.md`, `docs/API_SPEC.md`, `docs/DESIGN.md`, `docs/ERD.md`). Round 3 tập trung kiểm tra việc xử lý 2 finding của round 2 tại `docs/DESIGN.md:34` và `docs/DESIGN.md:39`.

## Reason

Tài liệu as-built của hệ thống phải phản ánh chính xác 100% logic máy trạng thái, cron job và contract RPC ở tầng database. Mọi mô tả về phạm vi dọn dẹp đơn/ghế quá hạn và các nhánh kết quả thanh toán cần khớp tuyệt đối với code migration đang có hiệu lực.

## Blast radius

- Chỉ ảnh hưởng tài liệu (`docs/DESIGN.md`, `docs/API_SPEC.md`, `docs/ERD.md`, `README.md`, task file, script phụ trợ `scripts/check-api-routes.mjs`), không ảnh hưởng runtime.
- Tuyệt đối không đụng intent docs (`SPECIFICATIONS.md`, `docs/BRD.md`, `docs/PRD.md`, `docs/USER_FLOW.md`, `spec/**`, `docs/specs/**`) và không đụng gap register (`docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`).

## Verify commands + result

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `git status --short` | Đạt | `README.md`, `docs/API_SPEC.md`, `docs/DESIGN.md`, `docs/ERD.md`, `tasks/build-filmbooking/layer-8-task-07.md`, untracked `scripts/check-api-routes.mjs` |
| `git diff docs/DESIGN.md` | Đạt | Đã cập nhật đúng `docs/DESIGN.md:34` và `docs/DESIGN.md:39` |
| `pnpm test` / `lint` / `typecheck` / `build` | skip | Task thuần tài liệu (doc-only), không sửa mã nguồn TypeScript/SQL |

## Kiểm tra xử lý finding round 2

### 1. MAJOR-R2-1: Mô tả phạm vi job `expire_overdue_holds` (`docs/DESIGN.md:34`)

- **Nội dung cũ bị bắt lỗi**: Chỉ nói job chuyển đơn `holding` quá hạn sang `expired`, bỏ sót `pending_payment` và bỏ sót việc chuyển payment `PENDING` sang `EXPIRED`.
- **Nội dung mới tại `docs/DESIGN.md:34`**:
  > "Việc dọn dữ liệu do job pg_cron `expire-overdue-holds` chạy **mỗi phút** gọi `expire_overdue_holds()` (chỉ `service_role`; API không gọi hàm này): chuyển đơn `holding`/`pending_payment` quá `hold_expires_at` sang `expired` (toàn hệ thống), payment `PENDING` của các đơn đó sang `EXPIRED`, xoá ghế HELD quá hạn; voucher `HELD` được thả qua trigger `orders_voucher_status_sync`. `hold_seats` làm việc tương tự cho riêng suất đang giữ (`20261112140000:282-309`). Khách nhả chủ động bằng `DELETE /bookings/:id/hold` (RPC `release_seats` bằng JWT khách). `apply_voucher`/`remove_voucher` cũng gọi bằng JWT khách."
- **Đối chiếu SQL migration thật**:
  - `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql:605-627`:
    - `update public.orders set status = 'expired' where o.status in ('holding', 'pending_payment') and o.hold_expires_at <= now()` -> cập nhật cả `holding` và `pending_payment` trên toàn hệ thống.
    - `update public.payments set status = 'EXPIRED' where order_id = any(v_expired_order_ids) and status = 'PENDING'` -> chuyển payment PENDING sang EXPIRED.
    - Xoá ghế HELD quá hạn và ghế của các đơn vừa expired (:630-635).
    - Thả voucher qua trigger `orders_voucher_status_sync`.
  - `supabase/migrations/20261112140000_hold_seats_hardening.sql:282-309`:
    - `hold_seats` thực hiện việc dọn tương tự nhưng giới hạn trong phạm vi `p_showtime_id`.
- **Đánh giá**: **ĐÃ GIẢI QUYẾT TRIỆT ĐỂ (CLOSED)**.

---

### 2. MINOR-R2-1: Mô tả kết quả trả về của `confirm_paid` (`docs/DESIGN.md:39`)

- **Nội dung cũ bị bắt lỗi**: Diễn đạt `SEATS_UNAVAILABLE`/`SEATS_TAKEN` như thể là giá trị jsonb `status`, và mô tả chưa chính xác về bảng ghi nhận trạng thái lệch tiền.
- **Nội dung mới tại `docs/DESIGN.md:39`**:
  > "`confirm_paid` trả jsonb `status`: `SUCCESS` (chiếm ghế `SOLD` qua `sell_order_seats`, sinh `tickets` QR 128-bit, đơn `paid`, xếp email xác nhận); `AMOUNT_MISMATCH` khi lệch tiền (KHÔNG ném lỗi: cập nhật `amount` của payment hoặc ghi payment PENDING, ghi `payment_events` với trạng thái `AMOUNT_MISMATCH`, đơn -> `needs_manual_review`, enqueue email `AMOUNT_MISMATCH_MANUAL_REVIEW`); và nhánh tiền về muộn / ghế đã bị đơn khác chiếm (đơn đã `expired`/`cancelled` hoặc quá cutoff, trả status `NEEDS_MANUAL_REVIEW` với lý do `SEATS_UNAVAILABLE`/`SEATS_TAKEN` trong payload email): payment ghi `PAID`, không sinh vé, nhả ghế `HELD` của đơn, đơn -> `needs_manual_review`, email `LATE_PAYMENT_MANUAL_REVIEW`. `PAYMENT_AMOUNT_MISMATCH` chỉ là mã lỗi trong catalog, không phải kết quả của nhánh này. `tickets` UNIQUE(showtime_id, seat_id) là lớp chặn cuối chống bán trùng."
- **Đối chiếu SQL migration thật**:
  - `supabase/migrations/20261113160000_confirm_paid_order_code_lookup.sql:112-197`:
    - Nhánh lệch tiền: cập nhật payment `amount` nếu đã có, hoặc tạo mới với status `PENDING` (:122-132); ghi `payment_events` với `event_status = 'AMOUNT_MISMATCH'` (:147-155); đơn chuyển sang `needs_manual_review` (:143); trả `{ success: false, status: 'AMOUNT_MISMATCH', order_status: 'needs_manual_review', ... }`.
  - `supabase/migrations/20261113160000_confirm_paid_order_code_lookup:338-393`:
    - Nhánh không đủ điều kiện (muộn/ghế bị chiếm): payment ghi `PAID` (:340, :352); đơn chuyển sang `needs_manual_review` (:363); `email_outbox` ghi nhận payload chứa `reason: v_reason` (`SEATS_TAKEN` / `ONLINE_CUTOFF_PASSED` / `SEATS_UNAVAILABLE`); trả jsonb `{ success: false, status: 'NEEDS_MANUAL_REVIEW', ... }`.
- **Đánh giá**: **ĐÃ GIẢI QUYẾT TRIỆT ĐỂ (CLOSED)**.

---

## Rà soát các tài liệu as-built khác

1. **`README.md`**: Hướng dẫn 8 bước chạy local rõ ràng, đầy đủ bảng biến môi trường bắt buộc/tuỳ chọn và bảng lệnh thường dùng. Đạt yêu cầu <= 10 bước.
2. **`docs/API_SPEC.md`**: Liệt kê 145/145 route trong controllers, đầy đủ guard (`@Public`, `@Roles`, `@CinemaScope`, `JobSecretGuard`), mã lỗi theo enum chuẩn, các alias route và ghi chú POS đã gỡ.
3. **`docs/ERD.md`**: Khớp bảng, quan hệ, views, storage buckets, các enum cốt lõi, cron jobs, auth triggers và các migration muộn.
4. **Intent docs & Gap register**: Không có bất kỳ thay đổi nào vi phạm nguyên tắc bảo toàn intent.

## Residual risk

Không có rủi ro còn lại. Các tài liệu as-built đã được đồng bộ chuẩn xác với code và migrations ở Layer 8.

## Verdict

**NORMAL PASS**
