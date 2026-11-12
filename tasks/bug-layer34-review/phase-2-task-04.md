# Bug layer34-review · phase-2-task-04 — hold_seats: FOR SHARE suất, kiểm rạp OPEN/phim PUBLISHED, idempotency POS sau kiểm quyền

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M4 (phần hold), M6, M8a)
- Yêu cầu: hold_seats khoá showtimes FOR SHARE; kiểm cinemas.status='OPEN' và movies.status='PUBLISHED' (R-33); tra pos_requests theo request_id CHỈ sau khi đã kiểm quyền POS và theo cặp (cinema_id, request_id), không trả booking_code đơn khác; extend_pos_hold FOR UPDATE (giới hạn số lần gia hạn nếu spec có — đọc spec, không tự đặt).
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: done (reviewer PASS round 1, report: .context/review-reports/bug-layer34-review-phase-2-task-04-round-1-review.md)

## Scope change (CR remove-pos, 2026-11-12)
Bỏ POS khỏi dự án (spec 2.0.0, `spec/changes/2026-11-12-remove-pos.md`).
- **Bỏ:** idempotency theo `request_id` của POS (M8a: tra `pos_requests` theo cặp `(cinema_id, request_id)` sau kiểm quyền POS), mọi kiểm quyền POS trong `hold_seats`, và phần `extend_pos_hold` (FOR UPDATE / giới hạn số lần gia hạn). Không viết lại nhánh POS nội bộ của `hold_seats` (thứ tự khoá đã chốt) — đường vào POS bị chặn ở CR remove-pos phase-2, ghi residual.
- **Giữ (web):** `hold_seats` khoá showtimes FOR SHARE; kiểm `cinemas.status='OPEN'` và `movies.status='PUBLISHED'` (R-33); test đồng thời 2 phiên thật (dblink) cùng ghế cùng suất — đúng 1 thành công, 1 SEAT_TAKEN (phần "Bổ sung").
- Tiêu đề / dòng "Yêu cầu" phía trên giữ chữ gốc để truy vết; phần POS trong đó không còn hiệu lực.
- Bổ sung (user ok 2026-11-12T04:25:22Z): test đồng thời 2 phiên thật (dblink, theo mẫu 047) cho hold_seats cùng ghế cùng suất — đúng 1 thành công, 1 SEAT_TAKEN; ghi nhận khoá đang nằm trên seats (vật lý) thay vì (suất, ghế) — đo ở layer-8-task-01, chỉ đổi nếu cần.

## Kết quả (builder, 2026-11-12) — phần "Giữ (web)"
- **Root cause:** `hold_seats` (130000 §3.5) đọc `showtimes` không khoá và không kiểm `cinemas.status` / `movies.status`: (a) không loại trừ `cancel_showtimes` (FOR UPDATE showtimes) ở mức hàng suất, trái thứ tự khoá toàn cục showtimes FOR SHARE -> orders; (b) cho giữ ghế khi rạp TEMP_CLOSED/CLOSED hay phim ARCHIVED/DRAFT (vi phạm R-33).
- **Fix:** migration `supabase/migrations/20261112140000_hold_seats_hardening.sql` (CREATE OR REPLACE, giữ chữ ký/SECURITY DEFINER/search_path/ACL; diff thân hàm chỉ ở §3.5: `for share of st` + lấy `cinema_status`, `movie_status`, thêm §3.5b raise `CINEMA_NOT_OPEN` / `MOVIE_NOT_PUBLISHED` errcode 23514). Thêm mã `SHOWTIME_NOT_OPEN`, `CINEMA_NOT_OPEN`, `MOVIE_NOT_PUBLISHED` (HTTP 409) vào `packages/shared/src/errors.ts` + `apps/web/src/lib/api/error-messages.ts`.
- **Test:** `supabase/tests/056_hold_seats_hardening.test.sql` (8 assert): A1/A2 rạp/phim không hợp lệ, A3 sanity; B 12 vòng dblink hold x hold cùng ghế cùng suất (đúng 1 ok + 1 SEAT_TAKEN, không 40P01/23505, 1 đơn holding, 1 dòng ghế) và 12 vòng hold x cancel_showtimes (suất CANCELLED, không đơn sống, không dòng ghế).
- **Evidence đỏ -> xanh:** trước migration 056 = 2/8 FAIL (A1, A2: "no exception thrown"); sau migration 8/8 PASS. `pnpm db:test`: 25 file, 747 assert PASS (allowlist 048 xanh). `pnpm typecheck`, `pnpm lint`, `pnpm test` (shared 14, api 210, web 93) PASS.
- **Residual:** (1) B1/B2 PASS cả trên code cũ (race cancel x hold bị che bởi cancel_showtimes tự dọn đơn + seats FOR UPDATE; đây là regression guard, FOR SHARE là phòng thủ thứ tự khoá). (2) Khoá seat vẫn là seats (vật lý) thay vì (suất, ghế) — giữ nguyên, chưa đo thấy cần đổi. (3) Nhánh POS trong thân hàm là dead code (đã ghi ở 130000). (4) API web chưa map riêng 3 mã mới nếu API chưa parse tiền tố exception — mặc định theo cơ chế map mã hiện có.
- **Doc impact:** no doc impact (không đổi API contract/schema; R-33 là hành vi spec sẵn). Bổ sung mã lỗi mới ở shared/web error-messages (code, không phải docs). Không sửa intent docs.
