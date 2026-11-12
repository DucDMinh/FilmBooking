# Review — bug-layer34-review · phase-2-task-03 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** migration DB (FK mới trên bảng có dữ liệu), đổi thứ tự khoá của đường bán vé (payment/POS), hành vi chốt bán, máy trạng thái đơn/ghế.
- **Blast radius:** `public.confirm_zero_amount(uuid)` (authenticated + service_role), `public.confirm_pos_sale(uuid,text)` (service_role, quầy POS), `public.tickets` (FK mới → `seats`), tương tác `cancel_showtimes`, `set_cinema_status`, `hold_seats`, `release_seats`, `expire_overdue_holds`, `sell_order_seats`. Chưa có caller TS trong `apps/` (POS module chưa build); `packages/shared/src/database.types.ts` chỉ có type.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (toàn bộ) | PASS — 22 file, 737 test (048 allowlist xanh, 053 xanh) |
| `pnpm db:test .context/review-reports/repro-p2t03-pos-closed-cinema.test.sql` (repro reviewer, BEGIN…ROLLBACK) | PASS 4/4 — **chứng minh defect F1** |
| lint / typecheck / aislop / oxlint | skip — diff chỉ có SQL + markdown, không đụng TS/JS |
| ocr | skip, ocr not installed / không áp dụng cho SQL |
| AI-friendly web gate | N/A (không public-facing) |

## Đã kiểm, đạt

- Chữ ký, `security definer`, `search_path = ''`, ACL của cả hai hàm giữ nguyên (zero: authenticated + service_role; POS: chỉ service_role), 048 xanh.
- Thứ tự khoá: showtimes FOR SHARE → orders FOR UPDATE → seat_states (trong `sell_order_seats`) → voucher_redemptions / tickets. Khớp `confirm_paid` (20261112110000) và `cancel_showtimes` (showtimes FOR UPDATE → orders → seat_states). Không thấy chu trình mới. Residual (a) của 20261112100000 với `confirm_pos_sale` đã đóng.
- `sell_order_seats` xử lý ghế bị khoá vận hành: trigger BEFORE INSERT `showtime_seat_states_fill` (`20261111030100_booking_tables.sql:405-408`) chạy cả khi rơi vào nhánh ON CONFLICT DO UPDATE, ném 23514 → `sell_order_seats` trả false → hai hàm raise SEAT_TAKEN. Không ghi đè SOLD / HELD còn hạn của đơn khác.
- FK `tickets.seat_id → seats(id) ON DELETE RESTRICT`: an toàn. `order_seats.seat_id` đã RESTRICT (`20261111030100_booking_tables.sql:109`) và mọi vé có `order_seat_id`, `seat_id` được trigger điền từ `order_seats`, nên FK mới không thêm điểm chặn nào cho `seat-layout.service.ts:292` (xoá ghế phòng). Precheck mồ côi + `lock_timeout 5s` hợp lý. `tickets.seat_id` NOT NULL.
- Test 053 không dính bẫy snapshot: lời gọi tách câu lệnh qua `t53_call`, `t53_state` là SQL STABLE gọi ở câu lệnh sau. `throws_ok` chạy trong subtransaction, các assert trạng thái sau đó phản ánh đúng rollback. Đối chiếu code cũ: 7 assert đỏ (Z2×3, Z3×2, Z4, FK) là hợp lý.
- Dọn nhánh `elsif` dead code ở confirm_zero_amount: đúng (anon bị chặn EXECUTE, chỉ còn authenticated / service_role / owner).

## Findings

### F1 — MAJOR (blocking, cần user quyết): `confirm_pos_sale` bán vé cho rạp TEMP_CLOSED/CLOSED, phá bất biến R-33 / AC-26; test 053 P2 khoá cứng hành vi sai
- **Vị trí:** `supabase/migrations/20261112120000_zero_amount_pos_sell_hardening.sql:226-267` (không đọc/kiểm `cinemas.status`), comment lập luận `:28-29`. Test `supabase/tests/053_zero_amount_pos_sell.test.sql:68, 113-115` (P2 khẳng định bán thành công trên rạp TEMP_CLOSED).
- **Lý do sai spec:** builder dẫn SPECIFICATIONS.md dòng 563. Ghi chú đó chỉ nói **mốc đóng bán online R-67** không chặn POS, và "ngừng bán" ở R-127 gồm suất cancelled / suất bị đóng bán. Nó **không** nói gì về trạng thái rạp. Trạng thái rạp do R-33 / AC-26 quy định: rạp Tạm đóng / Ngừng hoạt động **không được còn suất tương lai đã bán vé**. `set_cinema_status` thi hành đúng điều này (`20261111040300_rpc_cancel.sql:362-387`, raise `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES`). `confirm_paid` (task-02) cũng chặn `CINEMA_NOT_OPEN`, và chính task này thêm CINEMA_NOT_OPEN cho confirm_zero_amount. POS là kênh duy nhất còn hở.
- **Failure scenario (đã repro, `.context/review-reports/repro-p2t03-pos-closed-cinema.test.sql`, 4/4 PASS):** rạp có suất ON_SALE chưa bán vé, có đơn POS đang giữ ghế → Admin `set_cinema_status(TEMP_CLOSED)` thành công (chưa có vé bán) → quầy gọi `confirm_pos_sale` → `SUCCESS`, ghế SOLD, vé phát hành → hệ thống đang ở đúng trạng thái R-33 cấm: rạp không OPEN, có suất tương lai đã bán, suất không bị huỷ, khách không nhận email huỷ/đổi (R-108). Lời gọi `set_cinema_status(...,'CLOSED')` sau đó bị từ chối với `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES`, xác nhận trạng thái không hợp lệ.
- **Fix đề xuất:** ở bước 0 của `confirm_pos_sale`, đọc `c.status` (join cinemas như confirm_zero_amount, `for share of s`), raise `CINEMA_NOT_OPEN` (23514) khi khác `OPEN`. Đổi P2 thành `throws_ok … 'CINEMA_NOT_OPEN…'` và assert đơn giữ nguyên holding, không vé. Nếu user thực sự muốn POS bán khi rạp đóng, phải đi Change Request sửa R-33 / AC-26 và `set_cinema_status`. Không được để như "giả định" trong code.

### F2 — MAJOR (blocking): thiếu test tranh chấp ghế cho `confirm_pos_sale`, task file yêu cầu rõ
- **Vị trí:** `tasks/bug-layer34-review/phase-2-task-03.md:4` ("Test tranh chấp ghế cho cả hai hàm"). 053 chỉ có Z2 cho confirm_zero_amount. P1/P2/P3 không có ca ghế bị đơn khác chiếm hoặc bị khoá.
- **Failure scenario:** sau này có ai đổi precheck POS hoặc bỏ `sell_order_seats` ở POS, không test nào đỏ. Hai lý do "không test được" trong Residual risk không đúng hoàn toàn:
  1. Ca precheck (ghế của đơn POS không có HELD hợp lệ, ghế SOLD/HELD còn hạn của đơn khác, hoặc ghế bị khoá) test được trong một phiên.
  2. Repo đã có harness đa phiên thật bằng dblink (`supabase/tests/051_order_lifecycle_concurrency.test.sql:4-16`), nên race `sell_order_seats = false` của POS và race M4 (`cancel_showtimes` ↔ `confirm_zero_amount`) cũng test được.
- **Fix đề xuất:** thêm tối thiểu
  - P4: đơn POS mà ghế đang SOLD / HELD còn hạn của đơn khác → `SEAT_TAKEN`, ghế của đơn khác không bị đổi, đơn POS vẫn holding, không vé.
  - P5: ghế của đơn POS bị khoá vận hành / HELD hết hạn → lỗi định danh tương ứng.
  - Khuyến nghị: một ca dblink cho M4 (cancel_showtimes và confirm_zero_amount đồng thời, không 40P01, không có vé trên suất CANCELLED).

### F3 — INFO (cần user xác nhận độ lệch so với task file): tranh chấp ghế raise SEAT_TAKEN thay vì needs_manual_review
Reviewer đánh giá quyết định này **đúng về kỹ thuật**, nhưng nó lệch chữ của task file nên phải ghi nhận / được user xác nhận.
- **confirm_zero_amount:** rollback để đơn ở holding, redemption HELD, ghế HELD của chính đơn. Không có tiền để đối soát. Khi hết hạn, `expire_overdue_holds` chuyển đơn expired và trigger `orders_voucher_status_sync` trả lượt voucher, nên không có state bị bỏ lỏng vĩnh viễn. Với hold còn hạn, nhánh false gần như chỉ xảy ra khi có race hoặc dữ liệu bất thường (`showtime_seat_locks_guard_taken` không cho khoá ghế HELD còn hạn). needs_manual_review cho đơn 0đ chỉ đẩy việc cho nhân viên mà không có gì để hoàn.
- **confirm_pos_sale:** theo R-125, quầy gọi confirm **sau khi đã thu tiền mặt**. Race thật: hold của đơn hết hạn theo `now()` của phiên khác, `hold_seats` chiếm ghế, `sell_order_seats` trả false. Khi đó nhân viên nhận lỗi đồng bộ và đang cầm tiền, nên hoàn ngay tại quầy hợp lý hơn tạo đơn needs_manual_review. Hợp đồng lỗi cũ (HOLD_EXPIRED / SEAT_TAKEN) được giữ.
- Chưa có POS API trong `apps/api` để đối chiếu luồng thực tế. Khi build POS module, API phải map SEAT_TAKEN → 409 (`packages/shared/src/errors.ts:66` đã có) và UI quầy phải hướng dẫn hoàn tiền mặt.

### F4 — MINOR (residual, follow-up liên task): đọc trạng thái rạp không khoá, TOCTOU với `set_cinema_status`
- **Vị trí:** `20261112120000…:77-82` chỉ `for share of s` (cinemas không bị khoá). `set_cinema_status` khoá `cinemas FOR UPDATE` và đọc seat_states không khoá (`20261111040300_rpc_cancel.sql:339-377`).
- **Scenario:** confirm_zero_amount thấy rạp OPEN. Đồng thời `set_cinema_status(TEMP_CLOSED)` không thấy ghế SOLD (chưa commit) và commit. Sau đó confirm commit SOLD → lại ra trạng thái R-33 cấm. Cùng pattern có ở `confirm_paid` (task-02) và sẽ có ở POS sau khi sửa F1.
- **Đề xuất:** task follow-up dùng `for share of s, c` (hoặc `set_cinema_status` khoá showtimes của rạp FOR UPDATE), có kiểm deadlock với `cancel_showtimes`. Không chặn task này.

### F5 — MINOR: lỗ hổng phủ test trong 053
- Z4 (`053:106-107`) không assert trạng thái đơn sau lỗi.
- Không có ca suất `CLOSED` cho confirm_zero_amount, không có ca ghế bị khoá vận hành, không có ca đơn `pending_payment`.
- Không test lại BOLA sau khi đổi thứ tự khoá (041 vẫn phủ, chấp nhận được).

### F6 — MINOR: thông điệp SEAT_TAKEN sai nguyên nhân khi ghế bị khoá vận hành / đổi loại ghế
- **Vị trí:** `20261112120000…:124-126, 307-309`. `sell_order_seats` trả false cả khi trigger fill ném 23514 (ghế bị khoá, ghế thành BROKEN/AISLE), nhưng message ghi "Ghế đã bị đơn khác chiếm". Không sai dữ liệu, chỉ gây nhầm cho quầy / log.

### F7 — INFO: residual (b) của 20261112100000 vẫn còn
`hold_seats` (`seats FOR UPDATE`) đối đầu `sell_order_seats` (KEY SHARE trên seats qua FK) với đơn nhiều ghế. Lỗi này có từ trước; confirm_zero_amount trước đây cũng insert seat_states. Không phải hồi quy của task này.

## Doc impact
- `docs/ERD.md` dòng `tickets`: cập nhật đúng (FK + migration 20261112120000).
- `docs/API_SPEC.md` không đổi: chấp nhận được (chưa có endpoint).

## Verdict

**FAIL**

- **F1 (MAJOR):** POS bán vé cho rạp không OPEN, phá R-33 / AC-26 (đã repro), và test P2 khoá cứng hành vi sai. Cần user quyết: chặn CINEMA_NOT_OPEN ở POS (khuyến nghị) hay mở Change Request sửa R-33.
- **F2 (MAJOR):** thiếu test tranh chấp ghế cho confirm_pos_sale mà task file yêu cầu.
- **F3:** cần user xác nhận độ lệch "SEAT_TAKEN thay vì needs_manual_review" (reviewer đồng ý về kỹ thuật).
- **F4–F7:** ghi residual / follow-up.
