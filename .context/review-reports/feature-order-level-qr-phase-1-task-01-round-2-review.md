Agent: reviewer

# Review — feature-order-level-qr · phase-1-task-01 (DB) · round 2

- **Review level:** STRICT
- **Reason:** Migration bổ sung thay 3 hàm dùng chung: `checkin_ticket` (security definer, khoá/race), `audit_row_change` (trigger audit của mọi bảng) và `orders_guard_transition` (máy trạng thái đơn). Ngoài ra có credential `orders.qr_token`.
- **Blast radius:**
  - Mọi bảng gắn `audit_row_change`: core, catalog, pricing, booking.
  - Mọi lệnh UPDATE trên `orders`, vì guard trigger chạy với tất cả.
  - `POST /checkin/scan`.
  - Race giữa `checkin_ticket` và `cancel_showtimes`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (allowlist) | FAIL tổng, giống round 1. Lỗi do fixture đụng dữ liệu demo local (`provinces_name_key`, `price_rules_chain_key`, 032#18), có từ trước. 044/063 chết ở fixture nên reviewer **không tái hiện được** 63/64 và 45/45 builder báo. **064 ok** và **065 ok** chạy thật trên DB local. 021 (audit/security ops), 047/051/054/056 (concurrency), 061/062 đều ok. |
| `docker exec … psql` | Không chạy, vì round 1 đã bị agent-guard chặn (không có trong allowlist). Dùng bằng chứng primary đã có: 310 đơn / 310 token, 0 checked_in, không còn trigger `tap6*`. |

## Đối chiếu từng finding round 1

### F1 (HIGH) — ĐÃ SỬA

- `20261117130000_order_level_qr_fixes.sql:155-159` lấy `showtimes FOR SHARE` (join orders) trước. Sau đó `:163-184` lấy `orders FOR UPDATE of o` bằng statement riêng, nên nhận snapshot mới theo READ COMMITTED. Cuối cùng `:202` khoá `tickets` theo id.
- Đối chiếu thứ tự khoá:
  - `cancel_showtimes` (`20261114000000:67-73` FOR UPDATE showtimes, rồi `:96-100` orders). Nếu cancel giữ suất trước, checkin chờ ở bước FOR SHARE khi chưa giữ khoá nào. Nếu checkin giữ FOR SHARE trước, cancel chờ ở bước FOR UPDATE showtimes khi chưa đụng orders. Không có vòng chờ.
  - confirm_paid, confirm_zero_amount, hold_seats đều khoá showtimes FOR SHARE rồi orders. Hai khoá FOR SHARE tương thích, sau đó tuần tự hoá ở orders. Không có vòng chờ.
- Các khoá phụ trong checkin:
  - Insert `checkin_logs` lấy KEY SHARE trên showtimes (đã giữ FOR SHARE, mạnh hơn), trên tickets (đã giữ FOR UPDATE), trên cinemas và auth.users.
  - Grep không thấy RPC nào khoá `cinemas`/`auth.users` FOR UPDATE rồi mới khoá orders.
  - `update public.showtimes` chỉ xuất hiện trong các bản `cancel_showtimes`, tức luôn khoá suất trước.
  - Trigger guard/audit trên orders không lấy khoá FK mới.
- Khi cancel commit trước: statement khoá orders đọc được `status = 'affected'` / `showtime CANCELLED`, nên rơi vào BƯỚC 2 (`:232-246`).
- Test 065: trigger tạm `tap65_pause` (BEFORE INSERT `checkin_logs`, ngủ 0.6s, chỉ áp cho rạp test) giữ phiên quét đúng ở khoảng "đã khoá orders, chưa RI check". RI check FK chạy sau trigger BEFORE nên kịch bản chuẩn xác. Với bản 120000, test đỏ một cách tất định đúng như builder báo (3/3 `cancel=40P01`). Bản mới xanh, reviewer đã chạy lại: ok.
- Dọn dẹp của 065: trigger và function tạm được drop ở đầu, ở cuối, và cả nhánh `exception` (`065:20-21, 151, 158`). Assertion `065:175-177` kiểm `pg_trigger`. Nếu tiến trình bị kill giữa chừng thì trigger còn lại, nhưng có mệnh đề `when` giới hạn ở rạp test nên vô hại.
- Assertion có giá trị thật: OK thì phải soát đủ 2 vé, CANCELLED thì 0 vé, suất CANCELLED, đơn affected (`065:143-145`).

### F2 (MEDIUM) — ĐÃ SỬA

- `20261117130000:22-23`: `to_jsonb(old/new) - 'qr_token'`. Phép `-` không làm gì nếu bảng không có cột này. Chỉ `orders` và `tickets` có `qr_token` (đã grep migrations). `v_row`, `id` và `tg_argv[0]` (cinema_id) không đổi, nên audit các bảng khác giữ nguyên hành vi.
- Không test nào đòi `qr_token` có trong audit (đã grep `supabase/tests`). 021 vẫn ok.
- `orders-history.helper` chỉ đọc `status` từ audit. `audit.controller` trả `before_data`/`after_data` vẫn đúng shape.
- 063 có test `:395-405`: đổi trạng thái đơn, rồi khẳng định 0 hàng audit `orders`/`tickets` có khoá `qr_token`.

### F3 (MEDIUM) — ĐÃ SỬA

- Nhãn `HIGH_RISK_MIGRATION` có đủ lý do, có "KHÔNG promote production khi chưa verify staging" và rollback theo thứ tự (`20261117120000:6-14`). Migration bổ sung kế thừa nhãn (`20261117130000:4-5`).
- `.context/decisions.md` có mục round 1 với rollback và "KHÔNG promote production".
- Task file dòng 3 đã gắn nhãn.

### F4 (LOW) — ĐÃ SỬA

- Đã bỏ nhánh tra theo `tickets.id` (`20261117130000:139-149`).
- Không client nào dựa vào nhánh này: `checkin.service.ts:91-93` chỉ gửi `token ?? bookingCode`; test integration dùng `qrToken` (`rls-scope.int-spec.ts:525`, `cancel-showtime.int-spec.ts:152`).
- Có test `063:335-337`: UUID vé trả TICKET_NOT_FOUND.

### F5 (LOW) — ĐÃ SỬA

- Bản trong `20261117130000:46-75` giống hệt bản hiện hành `20261112150000:15-41`. Đây là bản cuối cùng trước đó; grep xác nhận không migration nào khác định nghĩa lại hàm này. Chỉ thêm `:60-62`.
- Trigger chỉ là `before update` (`booking_tables.sql:377`), nên lúc INSERT không có `old.qr_token` null để làm hỏng.
- Có test `063:178-183`: đổi token thì 23514, update giữ nguyên token thì không lỗi.

### F6 / F7 (LOW) — ĐÃ SỬA

- `063:213-216` đổi thành `count(*) … = 3`.
- Thêm (e2) `063:294-302`: quét QR ghế đã soát thì soát nốt ghế còn lại, giữ nguyên lần soát cũ.
- Thêm F4 `063:335-337` và race 065.

### Giữ nguyên kiểm tra của bản 120000

`checkin_ticket` trong 130000 vẫn giữ:
- `has_cinema_scope` (`:105-107`) và chống giả mạo staff (`:114-121`).
- EMPTY_CODE.
- Thứ tự kiểm: sai rạp (R-102, chỉ trả thông tin rạp, `:214-229`) → huỷ/affected → USED (thời điểm và người soát đầu, `:250-280`) → EXPIRED/TOO_EARLY (cùng công thức) → paid/checked_in → đơn 0 vé thì INVALID.
- `security definer` + `set search_path = ''` (`:86-87`). Chữ ký và revoke/grant không đổi (`:79-83, 393-394`).
- Không có dynamic SQL.

## Findings round 2

1. **LOW: sửa comment trong migration đã áp `20261117120000`.** Cụ thể là header `:6-14` và comment `:38-42`. Thân hàm và DDL không đổi: offset +11 dòng nhất quán, `t.id::text` / `for update of o` / grant vẫn nằm đúng chỗ. File chưa commit và chưa áp ở môi trường chung nào, CLI cũng không checksum, nên vô hại. Ghi lại vì quy tắc "không sửa migration đã apply"; nếu đã commit thì không được làm lại kiểu này.
2. **LOW: mục decisions thứ nhất ngày 2026-11-17 đã lỗi thời.** Decision/Consequences của mục đó vẫn ghi "tra `tickets.id`", "audit chép token vào `audit_logs`", "guard chưa khoá bất biến `qr_token`". Mục thứ hai đã thay thế các ý này. Đề xuất thêm dòng "Superseded một phần bởi mục kế tiếp" để người đọc không hiểu sai.
3. **INFO:** hàng audit `tickets` cũ (trước migration 130000) vẫn chứa `tickets.qr_token`, và token này vẫn quét được (QR cũ theo ghế soát cả đơn). Đây là residual đã ghi rõ trong decisions. Hướng xử lý: không sửa lịch sử append-only, chỉ admin/manager đọc được (họ vốn đã đọc được `tickets.qr_token`).
4. **INFO:** trong lúc quét, `checkin_ticket` giữ `showtimes FOR SHARE` một thời gian ngắn, nên chặn UPDATE trên hàng suất đó (cancel, sửa suất) tới khi commit. Đây là hành vi mong muốn, nhất quán với confirm_paid/hold_seats.
5. **INFO:** reviewer không tái hiện được assertion 044/063 vì dữ liệu demo. Phần này được đánh giá bằng đọc code + file test (đúng hợp đồng, không có tautology) cộng với kết quả builder báo. 064/065 thì reviewer đã chạy lại PASS.
6. **INFO:** gate aislop/oxlint/ocr không áp dụng vì diff chỉ có SQL. UI/AI-friendly: N/A. Doc impact thuộc task-02.

Không có CRITICAL/HIGH/MEDIUM.

## Verdict: **STRICT PASS**

Hai finding LOW (1, 2) không chặn. Đề xuất primary đánh dấu supersede cho mục decisions thứ nhất khi close-out.
