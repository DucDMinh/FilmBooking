# Feature remove-pos · phase-2-task-01 — Gỡ POS khỏi DB/code + hoàn tất confirm_zero_amount (thu hẹp từ bug-layer34-review P1-03)

- Classification / Risk: REMOVE · risk=high · review level expected=STRICT (DB/migration destructive, locking, payment) · nguồn: `spec/changes/2026-11-12-remove-pos.md`, `spec/updates/2026-11-12-remove-pos.md` (spec 2.0.0), `tasks/bug-layer34-review/phase-2-task-03.md` (mục Scope change), reviewer reports task-03 round 1–3.
- Quyết định user (2026-11-12): "BỎ TOÀN BỘ POS RA KHỎI DỰ ÁN ... chỉ làm thuần web ... thực hiện ngay lập tức không hỏi lại". Trước đó cùng ngày: F3 task-03 chấp nhận `SEAT_TAKEN` (rollback) cho `confirm_zero_amount`.

## Yêu cầu

### A. Thu hẹp task-03 (file CHƯA commit, sửa tại chỗ)
- `supabase/migrations/20261112120000_zero_amount_pos_sell_hardening.sql`: chỉ còn `confirm_zero_amount` (showtimes FOR SHARE → orders; kiểm ON_SALE + rạp OPEN; `sell_order_seats`; SEAT_TAKEN 2 thông điệp; bỏ elsif dead code). **Bỏ** phần `confirm_pos_sale`, **bỏ FK `tickets.seat_id`** và **bỏ khoá `seats FOR KEY SHARE`** (chỉ cần vì FK; F11 deadlock với `confirm_paid` — FK chuyển backlog CR-002). Nên đổi tên file cho đúng nội dung (vd `..._zero_amount_sell_hardening.sql`, giữ timestamp 20261112120000).
- DB local đã áp bản cũ của migration này: gỡ FK `tickets_seat_id_fkey` trên DB local và áp lại định nghĩa hàm cho khớp file (qua `docker exec -i supabase_db_filmbooking psql`; nếu đổi tên file thì đồng bộ `supabase_migrations.schema_migrations` cho khớp — chỉ bản ghi của version này). CẤM db reset / db push.
- `supabase/tests/053_*.test.sql`: giữ các ca Z (zero-amount), bỏ ca P (POS) và ca FK. `054_*`: giữ phần 1 (M4 `cancel_showtimes` × `confirm_zero_amount`), bỏ phần 2 (POS). Đổi tên file bỏ chữ `pos`.
- `docs/ERD.md`: hoàn dòng `tickets` (không còn FK seat_id).

### B. Gỡ POS khỏi DB (migration MỚI additive, `20261112130000_remove_pos.sql`, gắn `HIGH_RISK_MIGRATION`)
- DROP hàm `confirm_pos_sale`, `extend_pos_hold` và mọi hàm/RPC chỉ phục vụ POS (rà toàn bộ migration + `pg_proc` local).
- DROP bảng `pos_api_keys`, `pos_api_logs`, `pos_requests` (+ policy/index/trigger/cron purge liên quan). **Precheck trong migration: bảng phải rỗng** (và không có `orders.channel = 'POS'`) — có dữ liệu → raise, không tự xoá.
- `hold_seats` (và `release_seats` / gia hạn hold nếu có nhánh POS): kênh `POS` bị từ chối ngay đầu hàm; gỡ nhánh idempotency `pos_requests` vì bảng bị drop. **Giữ nguyên chữ ký** (API web đang gọi) và **giữ nguyên thứ tự khoá toàn cục + mọi invariant của 20261112100000** (orders → payments → seats → seat_states; §3.9 FOR UPDATE; unique_violation → SEAT_TAKEN). Thay đổi thân hàm ở mức tối thiểu, diff được.
- `cancel_showtimes`, expire job, check-in, báo cáo: nhánh xử lý đơn kênh POS trở thành dead code vô hại → **không viết lại**, ghi residual. Chỉ sửa nếu tham chiếu đối tượng bị drop.
- **Không** tạo lại enum kênh đơn để bỏ giá trị `POS` (nợ kỹ thuật, ghi residual). Có thể thêm CHECK `orders.channel = 'WEB'` nếu an toàn (NOT VALID + VALIDATE sau precheck) — tuỳ đánh giá, ghi rõ.
- Giữ ACL/SECURITY DEFINER/search_path của hàm còn lại; cập nhật allowlist test 048.

### C. Code TS + test + seed
- `packages/shared`: `ORDER_CHANNELS` chỉ còn `WEB` (nếu type DB cho phép; nếu không thì ghi residual), bỏ `POS_KEY_INVALID`; regen `database.types.ts` theo lệnh trong project-config.
- `apps/web`: bỏ `/pos` khỏi `proxy.ts` PROTECTED_PREFIXES và `robots.ts`; bỏ thông điệp `POS_KEY_INVALID`.
- `apps/api`: rà tham chiếu POS (`movies.service.ts`, `showtimes.service.ts`, `seat-layout.service.ts`, test e2e) — bỏ nếu là POS thật (không phải "position/post").
- `supabase/seed.sql` + pgTAP 021/031/032/040/041/043/044/048: bỏ/sửa ca POS; không làm yếu ca web.
- Thêm test: `hold_seats` kênh POS bị từ chối; hàm/bảng POS không còn tồn tại.

## Quy tắc
- Test-first ở chỗ có hành vi mới (đỏ trước, xanh sau). Không sửa migration đã commit. Verify bằng lệnh trong `.context/project-config.md`: `pnpm db:test` toàn bộ + test/lint/typecheck (có đụng TS).
- Doc reconcile as-built: `docs/ERD.md`, `docs/API_SPEC.md`, `docs/DESIGN.md`, `docs/PERMISSION.md`, `docs/generated/*` nếu có nhắc POS.
- Không làm: FK tickets.seat_id (CR-002), task-04/05/06/07 của bug-layer34-review, bất kỳ tính năng mới.

- Status: done — reviewer STRICT PASS round 1 (MINOR-1/2 đã sửa: comment thứ tự khoá, ERD seed)

## Fix (builder, attempt 0)
- A: `20261112120000_zero_amount_sell_hardening.sql` (đổi tên, chưa commit): chỉ `confirm_zero_amount`; bỏ confirm_pos_sale, FK tickets.seat_id, khoá seats KEY SHARE. Test 053 (18 assert, ca Z) và 054 (4 assert, race zero x cancel_showtimes) đổi tên bỏ `pos`. DB local: drop FK, áp lại hàm, `schema_migrations.name` = `zero_amount_sell_hardening` (version 20261112120000).
- B: `20261112130000_remove_pos.sql` (HIGH_RISK_MIGRATION): precheck rỗng (3 bảng, orders.channel='POS', seat_states.source='POS'); `hold_seats` chỉ WEB (diff 4 chỗ, giữ chữ ký/ACL/thứ tự khoá); `purge_expired_ops_data` drop+create bỏ cột pos_api_logs (+ ACL service_role); DROP `confirm_pos_sale`, `extend_pos_hold`, bảng `pos_api_logs`, `pos_api_keys`, `pos_requests` (không CASCADE).
- C: shared `ORDER_CHANNELS=["WEB"]`, bỏ `POS_KEY_INVALID` (shared/web/test), regen `database.types.ts` (`npx supabase gen types typescript --local`), web `proxy.ts` + `robots.ts` + test cinemas bỏ `/pos`, comment api; seed.sql + seed/README bỏ pos_api_keys; pgTAP 021/032/040/041/048 bỏ/sửa ca POS (ca web giữ nguyên); thêm `055_remove_pos.test.sql` (14 assert).

## Evidence (đỏ -> xanh)
- 055 trước migration 130000: 6/14 FAIL (hold_seats POS trả 42501 thay vì 22023; bảng/hàm POS còn; purge còn 3 cột). Sau `pnpm db:migrate`: 14/14 PASS.
- `pnpm db:test` toàn bộ: 24 file, 739 assert, PASS (051 race: không 40P01; 054: affected=6 cancelled=6).
- `pnpm typecheck` (shared/api/web) OK; `pnpm lint` OK; `pnpm test`: shared 14, web 93, api 210, root 16 PASS.
- DB local: `schema_migrations` có 20261112120000 `zero_amount_sell_hardening` và 20261112130000 `remove_pos`.

## Residual risk / quyết định
- Enum `order_channel` và `showtime_seat_states.source` còn giá trị `POS` (không tạo lại enum); không thêm CHECK channel='WEB' (đơn chỉ sinh qua hold_seats). Nhánh POS dead code còn trong hold_seats (§3.6/3.7/3.18...), cancel_showtimes, preview_cancel_showtimes (`pos_paid_orders_count`), expire/release, báo cáo; fixture POS trong pgTAP 031/043/044 còn dùng giá trị enum để kiểm nhánh dead code đó (dự án demo nên không dọn thêm).
- `p_request_id` của hold_seats còn trong chữ ký nhưng bị bỏ qua.
- FK tickets.seat_id: backlog CR-002.
- Rủi ro quy trình: một lệnh Bash của builder bị agent-guard chặn (git checkout -- do gõ nhầm); không chạy, không lách.

## Doc impact
- `docs/ERD.md` reconcile (bảng POS bỏ, orders/payments/affected_order_cases/report/hàm RPC/ACL, ghi chú CR remove-pos, tickets không FK). API_SPEC/DESIGN/PERMISSION/generated: không nhắc POS => no doc impact.
