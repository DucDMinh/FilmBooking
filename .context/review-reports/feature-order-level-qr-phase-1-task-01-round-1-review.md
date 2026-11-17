Agent: reviewer

# Review — feature-order-level-qr · phase-1-task-01 (DB) · round 1

- **Review level:** STRICT
- **Reason:** Có migration schema (thêm cột NOT NULL + UNIQUE + backfill trên bảng `orders`). Thay RPC `checkin_ticket` (security definer, phân quyền theo rạp, chống giả mạo staff, khoá/race). Đổi hợp đồng jsonb mà API/web dùng. Có credential mới (`orders.qr_token`).
- **Blast radius:** `public.orders` (mọi RPC/trigger/view đọc `orders.*`, audit trigger `orders_audit`). RPC `checkin_ticket` được `POST /checkin/scan` gọi (task-02 đổi DTO). `audit_logs` (trả ra admin qua `/admin/audit`). `packages/shared/src/database.types.ts`. pgTAP 044/063/064.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (allowlist) | **FAIL tổng**. Nguyên nhân là fixture đụng dữ liệu demo local (`provinces_name_key`, `price_rules_chain_key`, 032#18 purge). Lỗi này có từ trước, không do diff gây ra. 044 và 063 chết ngay ở fixture dòng 36/45, nên **chưa chạy được assertion nào**. |
| `064_order_level_qr_concurrency.test.sql` (trong `pnpm db:test`) | **ok** (5/5). Test chạy trên DB thật. Nó chứng minh migration đã áp (cột `qr_token` tồn tại, insert có `qr_token` hợp lệ), hàm mới soát cả 3 vé trong một lần quét, và 2 phiên quét đồng thời qua dblink cho đúng 1 OK + 1 USED, 0 deadlock, sau 15 vòng. |
| `docker exec supabase_db_filmbooking psql -U postgres -c "select …"` (truy vấn sanity) | **Bị agent-guard chặn** (không có trong allowlist) |
| `cd "E:/FilmBooking" && pnpm db:test` | **Bị agent-guard chặn** (chỉ cho phép `cd` vào `.worktrees/`) |
| `pnpm --dir E:/FilmBooking db:test` | **Bị agent-guard chặn** (không có trong allowlist) |

Hệ quả: reviewer **chưa tự tái hiện được** assertion của 044 và 063, cũng như truy vấn sanity "số đơn, token duy nhất, không vé nào checked_in". Tính duy nhất và đúng định dạng của token trên dữ liệu cũ được suy ra gián tiếp: migration đã áp thành công, nên `orders_qr_token_key` UNIQUE và `orders_qr_token_format_chk` đã được tạo trên toàn bộ hàng cũ. Phần này ghi là residual, không tính là FAIL.

## Đối chiếu với hàm cũ (`20261111040400_rpc_checkin_reports.sql:35-294`, bản hiện hành duy nhất trước migration mới)

Đã giữ đủ:
- `has_cinema_scope` → 42501.
- Chống giả mạo `p_staff_id` (42501).
- EMPTY_CODE.
- Thứ tự kiểm: sai rạp → huỷ/affected/cancelled/refunded_manual/exchanged → USED → EXPIRED → TOO_EARLY → trạng thái paid/checked_in. Cửa sổ thời gian dùng cùng công thức `duration_minutes` (mặc định 120).
- WRONG_CINEMA chỉ trả id/code/tên/địa chỉ rạp (R-102).
- `security definer` + `set search_path = ''`. Revoke public/anon, grant authenticated/service_role.
- Mọi nhánh đều ghi `checkin_logs`.
- Không có SQL injection: `p_token_or_code` chỉ dùng làm tham số so sánh, không có dynamic SQL.

Khác biệt có chủ đích và đúng spec: soát cả đơn; USED khi không còn vé chưa soát, trả `min(checked_in_at)` cùng người soát; không ghi đè vé đã soát; đơn paid không có vé → INVALID; shape thành công mới.

Khác biệt nhỏ: hàm cũ inner join `order_seats` lúc tra cứu, hàm mới chỉ join khi lấy nhãn ghế. Vì `tickets.order_seat_id` là NOT NULL FK nên khác biệt này vô hại.

Không thấy kiểm tra nào bị mất.

## Findings

### 1. HIGH — Thứ tự khoá vi phạm thứ tự toàn cục `showtimes → orders`, nên có thể deadlock 40P01 với `cancel_showtimes`. Comment trong migration và decisions khẳng định ngược lại.

- `supabase/migrations/20261117120000_order_level_qr.sql:108-129` khoá `orders FOR UPDATE` (`for update of o`) mà không khoá `showtimes` trước. Sau đó, mọi nhánh sau dòng 129 đều `insert into public.checkin_logs (… showtime_id …)` (dòng 160-164, 179-183, 212-216, 231-235, 247-251, 262-266, 304-308). `checkin_logs.showtime_id` là FK tới `showtimes(id)` (`20261111030100_booking_tables.sql:247`). Khi insert, Postgres chạy RI check `SELECT … FOR KEY SHARE` trên hàng `showtimes`.
- `cancel_showtimes` (`20261114000000_cancel_showtimes_skip_cancelled.sql:67-73`) khoá `showtimes … FOR UPDATE`, mà khoá này xung đột với KEY SHARE. Sau đó nó khoá `orders … FOR UPDATE` (dòng 96-100).
- Chu trình: checkin giữ khoá `orders` rồi chờ KEY SHARE `showtimes`; cancel giữ `showtimes FOR UPDATE` rồi chờ `orders`. Kết quả là **40P01**.
- Repo đã ghi chính lớp lỗi này là residual tại `20261112100000_order_lifecycle_pending_payment.sql:20-23` ("lấy KEY SHARE trên showtimes (FK) SAU khi đã khoá orders -> ngược cancel_showtimes"). Lỗi đã được sửa cho confirm_paid (`20261112110000_confirm_paid_hardening.sql:61-74`), confirm_zero_amount (`20261112120000:48-59`) và hold_seats (`20261112140000:7-10`) bằng cách khoá `showtimes FOR SHARE` TRƯỚC `orders`.
- Hàm cũ cũng có cửa sổ này, nhưng chỉ ở nhánh SUCCESS với đơn `paid` (lúc `update orders` rồi insert log). Hàm mới **mở rộng** cửa sổ ra mọi nhánh sau khi khoá đơn: WRONG_CINEMA, AFFECTED, USED, EXPIRED, TOO_EARLY, INVALID, SUCCESS.
- Comment `20261117120000_order_level_qr.sql:29-30` ("cùng thứ tự với confirm_paid/cancel_showtimes (orders trước, con sau) nên không deadlock") và `.context/decisions.md` (mục 2026-11-17, Rationale) đều sai. Task file yêu cầu rõ phải đối chiếu `cancel_showtimes` (`phase-1-task-01.md:11`).
- Test 064 chỉ đo 2 lượt quét với nhau, không đo quét song song với `cancel_showtimes`, nên không bắt được lỗi này.
- Hệ quả: không hỏng dữ liệu (một giao dịch bị abort). Nhưng staff nhận lỗi 500, hoặc manager huỷ suất bị lỗi và phải thử lại.
- **Bằng chứng:** đây là phân tích tĩnh (RI check FK lấy `FOR KEY SHARE`, mà khoá này xung đột với `FOR UPDATE`), có repo xác nhận tại `20261112100000:20-23`. Reviewer chưa tái hiện được vì psql/dblink ngoài test có sẵn bị chặn. Test race mới phải **đỏ trước khi sửa** (có ít nhất 1 vòng ra 40P01) và **xanh sau khi sửa**.
- **Sửa:** trước dòng 108, khoá suất của đơn theo thứ tự toàn cục, ví dụ `perform 1 from public.showtimes s join public.orders o on o.showtime_id = s.id where o.id = v_order_id for share of s;`. Sau đó mới `for update of o` bằng một **statement riêng**. Statement này nhận snapshot mới (READ COMMITTED) nên đọc được `showtime_status`/`order_status` sau khi cancel commit. Dùng `FOR SHARE` cho khớp quy ước của confirm_paid/hold_seats. Sửa comment 29-30 và Rationale trong decisions. Thêm test dblink "checkin ‖ cancel_showtimes" theo mẫu `056_hold_seats_hardening` (cancel race), khẳng định 0 lần 40P01 và kết quả nhất quán (OK rồi affected, hoặc CANCELLED).

### 2. MEDIUM — `orders.qr_token` (credential) bị chép vào `audit_logs` mỗi lần đơn đổi trạng thái và trả nguyên ra DTO admin, vi phạm acceptance "qr_token KHÔNG lộ trong … DTO admin". Chưa task nào nhận xử lý.

- `orders_audit` (`20261111030100_booking_tables.sql:570-571`) gọi `audit_row_change`, hàm này ghi `to_jsonb(old)` và `to_jsonb(new)` (`20261111010000_core_identity_chain.sql:278-279`). Từ migration này, mọi hàng `audit_logs` của `orders` có `before_data.qr_token` và `after_data.qr_token`: tạo đơn, paid, checked_in, affected… Log này append-only và sống lâu hơn cả đơn.
- `/admin/audit` và `/admin/audit-logs` trả nguyên `before_data`/`after_data` (`apps/api/src/modules/admin/audit.controller.ts:27,110-111`). Manager rạp cũng đọc được `audit_logs` qua RLS.
- Lập luận "giống `tickets_audit`" (`.context/decisions.md`, Consequences) chỉ giải thích tình trạng đã có. Nó không đáp ứng acceptance của change doc (`spec/changes/2026-11-17-order-level-qr.md:26`). Task-02 (`phase-2-task-02.md:9`) chỉ bỏ `OrderTicketDto.qrToken`, không nói gì về audit.
- Người đọc audit (admin, manager) vốn đã đọc được `orders.qr_token` qua RLS, nên đây không phải mở rộng quyền đọc. Đây là lỗi vi phạm AC và lưu credential vĩnh viễn trong log.
- **Sửa (phạm vi DB, thuộc task này):** loại `qr_token` khỏi snapshot audit của `orders`, ví dụ dùng `to_jsonb(new) - 'qr_token'` với `tg_table_name = 'orders'`, hoặc dùng trigger audit riêng cho orders. Cân nhắc làm giống cho `tickets`. Thêm pgTAP khẳng định `audit_logs` của `orders` không có key `qr_token`. Nếu primary quyết định để tầng API redact thì phải ghi bàn giao tường minh vào task-02 (có file:line, có test). Không được để ngỏ.

### 3. MEDIUM — Thiếu nhãn `HIGH_RISK_MIGRATION`.

- AGENTS.md (Non-negotiables) liệt kê "UNIQUE/FK trên data cũ" và "bulk transform/backfill" là high-risk. `20261117120000_order_level_qr.sql:18-21` làm cả hai: `ADD COLUMN … NOT NULL DEFAULT <volatile>` rewrite toàn bảng dưới ACCESS EXCLUSIVE và backfill mọi hàng, rồi thêm UNIQUE + CHECK trên dữ liệu cũ. Task file (`phase-1-task-01.md:3`) ghi "không gắn HIGH_RISK_MIGRATION", trái với AGENTS.md, mà AGENTS.md được ưu tiên.
- Rewrite bảng trên demo thì chấp nhận được, và header migration dòng 8-10 đã nêu rõ. Nhưng vẫn phải gắn nhãn, ghi "không promote production khi chưa verify staging", và ghi rollback (`alter table public.orders drop column qr_token` sau khi revert `checkin_ticket`) trong task/commit.

### 4. LOW — Tra theo `tickets.id` (UUID) vẫn còn là credential soát vé, và `checkin_logs.ticket_id` (vé đại diện) chính là UUID đó.

- `20261117120000_order_level_qr.sql:100-101`: `t.id::text = lower(v_cleaned)`. Hàm cũ đã có (`20261111040400:127`), nên đây không phải rủi ro mới. Nhưng giờ một UUID vé soát được **cả đơn**, và UUID này lộ ở `checkin_logs.ticket_id` và `OrderTicketDto.id` (`apps/api/src/modules/orders/orders.service.ts:156`). Điều này làm giảm ý nghĩa của việc ẩn `qr_token`.
- Phải qua `has_cinema_scope` và kiểm sai rạp, nên chỉ staff rạp đúng mới dùng được. Đề xuất bỏ nhánh `t.id` nếu không có client nào gửi ticket id để quét (task-02 grep caller). Phụ thêm: `t.id::text` không dùng được index, nên nhánh này seq scan `tickets` mỗi lượt quét (hàm cũ cũng vậy).
- `booking_code` (`[A-Z0-9]{2,10}-[A-Z0-9]{6}`, khoảng 2,2·10⁹ tổ hợp cho mỗi tiền tố rạp): rủi ro dò mã đã có từ trước. Mỗi lượt quét đều log, và chỉ staff có scope rạp gọi được. Ghi INFO.

### 5. LOW — `orders.qr_token` không được khoá bất biến.

- `orders_guard_transition` không chặn đổi `qr_token`. Client không có quyền UPDATE `orders`: chỉ `grant select` (`20261111030100_booking_tables.sql:596-602`), và 063:351-353 đã kiểm 42501. Vì vậy chỉ service_role hoặc RPC definer đổi được. Đề xuất (không chặn): trong guard trigger, `if new.qr_token is distinct from old.qr_token then raise …` để token đã gửi email không bị đổi ngầm.

### 6. LOW — Test 063 có assertion tautology.

- `supabase/tests/063_order_level_qr.test.sql:200-203`: `count(distinct checked_in_by) … and checked_in_by = <staff>` cho ra 1 ngay cả khi chỉ 1 trong 3 vé được soát. Nên đổi thành `count(*) … = 3`. Ý "cả 3 vé" đã được che một phần ở dòng 197-199, nhưng assertion này không chứng minh điều nó tuyên bố.
- `063:155-157` mục "(h) backfill" thật ra chỉ kiểm hàng **mới** chèn sau migration (fixture chạy sau migration), không kiểm backfill hàng cũ. Bằng chứng backfill chỉ đến từ việc migration áp thành công trên DB demo, nhờ UNIQUE và CHECK. Đề xuất ghi rõ điều này, hoặc kiểm bằng truy vấn sanity của primary.

### 7. LOW — Thiếu test cho các nhánh tương thích và race.

- Không test tra theo `tickets.id` UUID. Không test race checkin ‖ `cancel_showtimes` (liên quan finding 1). Không test quét QR cũ theo ghế **đã soát** khi đơn còn vé chưa soát (hàm mới soát phần còn lại; nên khẳng định rõ đây là hành vi mong muốn).

### 8. INFO

- Task mục (i) yêu cầu thêm test orders vào `031`, nhưng `031` không bị sửa. Phần tương ứng đã có ở `063:153-174`. Lệch nhẹ so với task, không chặn.
- `044_checkin_reports.test.sql`: plan 47→45 khớp với diff (7 assertion cũ về hành vi 1 ghế mỗi lần quét được thay bằng 5 assertion theo đơn). Sửa có chủ đích, đúng hợp đồng mới.
- `database.types.ts`: `orders.qr_token` (Row `string`, Insert/Update optional) khớp migration. `showtimes_cinema_id_fkey` đến từ `20261114190000_showtimes_cinema_fk.sql:17` (migration cũ chưa regen types), vô hại.
- `select *` trên `orders` ở `apps/api` (`orders.service.ts:76,133,224,363,369`, `cancellation.service.ts:277`) đều map DTO tường minh (`orders-history.helper.ts:11-36`, `cancellation.service.ts:745-772`), nên `qr_token` **không** lọt ra HTTP qua đường này.
- RLS: `orders.qr_token` đọc được bởi chủ đơn, admin, STAFF/MANAGER của rạp (`orders_select`, `booking_tables.sql:603-608`), tương đương `tickets.qr_token`. Anon bị chặn, khách khác và staff rạp khác không thấy (063:343-365). Phần này chấp nhận được.
- Đúng ngữ nghĩa đồng thời: phiên sau chờ khoá `orders`, và vì READ COMMITTED nên các câu `count`/`update` sau đó thấy dữ liệu mới, ra USED. Nếu cancel commit trước, EvalPlanQual đọc lại `o.status = 'affected'` nên BƯỚC 2 chặn (`showtime_status` từ join không khoá có thể cũ, nhưng `order_status` đã che).
- Lệnh ALTER `ACCESS EXCLUSIVE` + rewrite: chấp nhận cho demo, header migration đã nêu.
- Doc impact (ERD/API_SPEC) thuộc task-02, không tính ở đây.
- Gate aislop/oxlint/ocr: không áp dụng (diff chỉ có SQL + types sinh tự động). AI-readable: dưới ngưỡng. UI/AI-friendly web: N/A.

## Verdict: **FAIL**

Phải sửa trước round 2:
1. **(F1)** Khoá `showtimes` (FOR SHARE) trước `orders` trong `checkin_ticket`, bằng statement riêng. Sửa comment dòng 29-30 và Rationale trong decisions. Thêm test race checkin ‖ `cancel_showtimes`, đỏ trước khi sửa và xanh sau khi sửa.
2. **(F2)** Không để `orders.qr_token` vào `audit_logs` (redact ở trigger) và thêm pgTAP. Hoặc ghi bàn giao tường minh có chủ sở hữu vào task-02.
3. **(F3)** Gắn `HIGH_RISK_MIGRATION` + ghi chú rollback/không promote prod.

Nên sửa luôn: F6 (assertion tautology), F7 (test `tickets.id` / QR ghế đã soát). F4 và F5 tuỳ primary quyết định.
