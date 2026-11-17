# Feature order-level-qr · phase-1-task-01 — DB: `orders.qr_token` + `checkin_ticket` soát cả đơn

- Classification / Risk: MODIFY (đổi hành vi R-85/R-99). **Risk đỏ: DB migration + RPC check-in (quyền/race/dữ liệu)** → reviewer **STRICT**. Migration additive (thêm cột + `create or replace function`), KHÔNG destructive dữ liệu, KHÔNG sửa migration đã apply, NHƯNG rewrite/backfill toàn bảng `orders` + UNIQUE/CHECK trên dữ liệu cũ ⇒ **gắn `HIGH_RISK_MIGRATION`** (AGENTS.md): không promote production khi chưa verify staging; rollback: khôi phục `checkin_ticket` bản `20261111040400`, revert `audit_row_change`/`orders_guard_transition`, drop 2 constraint + cột `orders.qr_token`. Review round 1 sửa bằng migration bổ sung `20261117130000_order_level_qr_fixes.sql`. Scope: `supabase/migrations/*`, `supabase/tests/*`, `packages/shared/src/database.types.ts`. Doc impact: `docs/ERD.md` và `docs/API_SPEC.md` ở task-02. Decision impact: append `.context/decisions.md`.
- Hợp đồng + acceptance: `spec/changes/2026-11-17-order-level-qr.md` (đọc kỹ mục "Hợp đồng").

## Thiết kế
1. Migration MỚI `supabase/migrations/20261117120000_order_level_qr.sql` (timestamp sau `20261114190000`):
   - `alter table public.orders add column qr_token text not null default encode(extensions.gen_random_bytes(16), 'hex')` — default volatile ⇒ mỗi đơn cũ nhận token riêng (backfill). Thêm `unique` + `check (qr_token ~ '^[0-9a-f]{32}$')` (đặt tên constraint rõ). Xác minh trên DB local: không trùng, mọi hàng khớp regex.
   - Quyền cột/RLS: `orders` đã có RLS (`orders_select`); `qr_token` là credential như `tickets.qr_token`. Đối chiếu cách `tickets.qr_token` đang được bảo vệ/đọc (migration `20261111030100_booking_tables.sql`, test `031`, `090`) và giữ mức bảo vệ tương đương (chủ đơn đọc được token của mình; không lộ thêm cho vai trò khác so với hiện tại). Báo rõ nếu staff/manager đọc được `orders.qr_token` qua RLS và đánh giá (hiện họ cũng đọc được `tickets.qr_token`).
2. `create or replace function public.checkin_ticket(p_input text, p_cinema_id uuid, p_staff_id uuid)` — GIỮ nguyên chữ ký, quyền (`has_cinema_scope`, revoke/grant) và toàn bộ phần xác thực/đầu hàm hiện có (đọc `20261111040400_rpc_checkin_reports.sql:35-90` và mọi migration sau đó có thay đổi hàm này — grep `checkin_ticket` trong `supabase/migrations`; hàm hiện hành là bản mới nhất). Đổi lõi:
   - Tra đơn theo `o.qr_token = lower(cleaned)` OR `o.booking_code = upper(cleaned)` OR (tương thích QR cũ theo ghế) tồn tại `t.qr_token = lower(cleaned)` của đơn đó. Khoá hàng `orders` (`for update`) trước, rồi khoá `tickets` của đơn — thứ tự khoá nhất quán để không deadlock với các RPC khác (đối chiếu `confirm_paid_order`, `cancel_showtimes`).
   - Giữ nguyên thứ tự kiểm: sai rạp → suất huỷ/đơn affected-cancelled-refunded-exchanged → đã dùng → cửa sổ thời gian (cùng công thức `duration_minutes`) → trạng thái đơn paid/checked_in. "Đã dùng" = đơn KHÔNG còn vé nào chưa check-in; trả `checked_in_at` + `staff_name` của lần soát đầu (min `checked_in_at` của đơn).
   - Thành công: `update tickets set checked_in_at, checked_in_by where order_id = ... and checked_in_at is null` (tất cả ghế còn lại, một lệnh), đơn `paid` → `checked_in`.
   - `checkin_logs`: giữ nguyên cấu trúc; `ticket_id` = vé đại diện của đơn (vé đầu theo `created_at, id`); một dòng log cho mỗi lượt quét như cũ (R-101).
   - Kết quả jsonb thành công theo hợp đồng (keys `order_id, booking_code, movie_title, cinema_name, room_name, seats[], seat_count, starts_at, checked_in_at`; `seats` xếp tự nhiên theo nhãn ghế — A2 trước A10; vẫn trả `message`, `status`, `result`). Bỏ `ticket_id/seat_label/seat_type`.
   - WRONG_CINEMA vẫn chỉ trả tên + địa chỉ rạp đúng, KHÔNG ghế/tên khách (R-102).
3. pgTAP (`supabase/tests/044_checkin_reports.test.sql` và mọi test khác phụ thuộc hành vi cũ — grep `checkin_ticket`, `qr_token`): cập nhật cho khớp + thêm test MỚI (đỏ trước):
   - (a) đơn 3 ghế quét `orders.qr_token` → OK, `seats` đủ 3 nhãn, cả 3 vé có `checked_in_at`, đơn `checked_in`;
   - (b) quét lại → USED kèm thời điểm + người đầu;
   - (c) nhập `booking_code` → soát cả đơn;
   - (d) QR cũ theo ghế (`tickets.qr_token`) → soát cả đơn;
   - (e) đơn đã soát 1 ghế từ trước (1/3 vé có `checked_in_at`) → quét: soát 2 ghế còn lại, không ghi đè `checked_in_at` cũ;
   - (f) sai rạp không lộ ghế;
   - (g) token không tồn tại → INVALID;
   - (h) backfill: mọi `orders.qr_token` duy nhất + đúng regex, đơn mới có token mặc định;
   - (i) test "qr_token 128-bit" ở 031 giữ cho tickets và thêm cho orders;
   - race 2 phiên quét đồng thời nếu repo đã có mẫu (`051_*concurrency*`): đúng 1 SUCCESS, 1 USED.
4. `packages/shared/src/database.types.ts`: sinh lại bằng `pnpm db:types` (stack local đang chạy) hoặc sửa tay đúng định dạng nếu lệnh không chạy được — báo rõ.
5. Áp migration lên DB local: `pnpm db:migrate`; chạy `pnpm db:test` (pgTAP) — báo kết quả thật. KHÔNG `db reset`, KHÔNG đụng staging/prod.

## KHÔNG làm
Không sửa migration đã tồn tại; không xoá/đổi `tickets` (giữ từng ghế + `tickets.qr_token`); không đụng `apps/**` (task-02/03), `supabase/config.toml`, `.env*`, `docs/` (task-02). Không `git add/commit/checkout/reset/stash/clean`.

## Files to Modify
`supabase/migrations/20261117120000_order_level_qr.sql` (mới), `supabase/tests/*.test.sql` liên quan, `packages/shared/src/database.types.ts`, `.context/decisions.md`.

## Repro Verification
- Original: đơn 8 ghế → `checkin_ticket` soát 1 ghế/lần quét (kể cả nhập mã đặt vé).
- Expected: một lần quét soát cả đơn.
- Actual after: một lần quét `orders.qr_token` (hoặc `booking_code`, hoặc QR cũ theo ghế) soát TẤT CẢ ghế của đơn; quét lại → USED.
- Evidence (2026-11-17/18): RPC thật trên đơn seed 8 vé (transaction + ROLLBACK): OK, 8 ghế `D7,D8,D9,D10,F7,F8,F9,F10`, đơn `checked_in`, 8/8 vé có `checked_in_at`, quét lại USED. pgTAP: 044 45/45 và 063 64/64 (primary chạy độc lập trong transaction + rollback), race 064 (15 vòng, đúng 1 OK + 1 USED) và 065 (checkin ‖ cancel_showtimes: bản cũ 3/3 vòng 40P01, bản mới 0 deadlock). Backfill: 310 đơn, 310 token duy nhất. Reviewer STRICT: round 1 FAIL (deadlock, audit lộ token, HIGH_RISK_MIGRATION) → sửa → round 2 PASS.
- Status: PASS
