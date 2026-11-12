Agent: reviewer

# Review — bug-layer34-review · phase-1-task-08 · round 1 (gộp K7: quyền EXECUTE hàm schema public)

- **Review level:** STRICT
- **Reason:** auth/RBAC, DB migration, default privileges toàn cục, hàm SECURITY DEFINER thanh toán/bán vé (payment), test bảo mật diện rộng.
- **Blast radius:** mọi hàm schema `public` (ACL), default privileges của role `postgres` (mọi schema, mọi hàm postgres tạo sau này), 3 thân hàm sửa bằng CREATE OR REPLACE (`apply_voucher_core`, `remove_voucher`, `cancel_showtimes`), sequence `internal_payment_order_code_seq`, 12 file pgTAP.
- **Phạm vi đã đọc:** `supabase/migrations/20261112080000_function_privileges_hardening.sql`, `supabase/tests/048_function_privileges.test.sql`, `git diff` 11 file test cũ + `docs/ERD.md`, task file; đối chiếu migration gốc `20261111010000` (is_admin/has_cinema_role), `20261111030100` (can_view_order, grant bảng orders), `20261111040000` (hold/release/extend), `20261111040100` (payment, confirm_zero_amount, confirm_pos_sale, sequence), `20261111040200` (remove_voucher gốc), `20261111040300` (cancel/preview/set_cinema_status gốc), `20261111040400` (has_cinema_scope, checkin, report_*), `20261112070000` (apply_voucher_core gốc), policy `to anon` ở catalog/catalog_fixes; grep `.rpc(` trong `apps/`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — 17 file, 669 test, `All tests successful` (048: ok) |
| `pnpm test` | PASS — shared 14, api 211, web 93, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| oxlint | N/A: diff chỉ có SQL và MD, không có TS/JS |
| aislop / ocr | bỏ qua: không có trong allowlist verify / chưa cài |
| AI-friendly web | N/A, không phải task public-facing |

Không tạo file probe nào (mọi kiểm tra là đọc file + chạy suite có sẵn).

## 1. Bảng quyền: hàm giữ cho authenticated (đọc thân hàm bản mới nhất)

| Hàm | Định nghĩa mới nhất | Fail-closed? |
|---|---|---|
| hold_seats | 040000:125-147, 202-221 | Có: chặn spoof p_user_id khi uid có; WEB cần uid + email confirmed; POS cần Admin/Staff-Manager **đúng rạp**. Riêng nhánh `auth.uid() null + role authenticated` tin `p_user_id` (chỉ xảy ra khi JWT ký hợp lệ nhưng không có `sub`; Supabase không phát hành) — residual đã ghi trong task. |
| release_seats | 040000:593-625 | Có: chống giả mạo actor; chủ đơn / Admin / Staff-Manager `sa.cinema_id = v_order.cinema_id`. Cùng residual uid-null như trên. |
| extend_pos_hold | 040000:676-690 | Có: Admin hoặc staff **đúng rạp đơn** (`sa.cinema_id = v_order.cinema_id`). |
| confirm_zero_amount | 040100:801-821 | Có cho authenticated: chủ đơn hoặc Admin; đơn `user_id null` → 42501. **Số tiền lấy từ DB** (`v_order.total_amount <> 0` → 23514); client không có quyền ghi bảng `orders` (030100:596-602 chỉ grant SELECT), discount chỉ tính trong `apply_voucher_core` từ dữ liệu voucher thật → khách KHÔNG tự chốt 0đ được cho đơn có giá > 0. |
| apply_voucher → apply_voucher_core, remove_voucher | 080000:85-94, 239-248 | Có (đã sửa): không phải chủ đơn (kể cả đơn user_id null) → chỉ Admin / Staff-Manager đúng rạp; role `authenticated` mà uid null → 42501. |
| preview_cancel_showtimes, cancel_showtimes | 040300:67-82; 080000:313-333 | Có: Manager đúng rạp mọi suất trong mảng / Admin; actor spoof đã chặn. |
| set_cinema_status | 040300:348-359 | Có (Manager đúng rạp/Admin). Spec chỉ cho Admin → lỗi nghiệp vụ có từ trước (P1), không thuộc K7. |
| checkin_ticket | 040400:54-70 | Có: `has_cinema_scope(p_cinema_id)` + chống spoof p_staff_id. |
| report_* (4 hàm) | 040400:369, 391, 480, 508, 580, 603, 682, 707 | Có: scope theo rạp, lọc từng dòng `has_cinema_scope`. Staff xem được doanh thu → P1 có từ trước. |
| is_admin, has_cinema_role, has_cinema_scope | 010000:183-211; 040400:11-24 | Chỉ dựa trên `auth.uid()`, không có tham số user → chỉ lộ vai trò của chính người gọi. |
| can_view_order | 030100:549-565 | Trả `false` cho cả "không tồn tại" lẫn "không được xem" → **không phải oracle tồn tại**; `true` chỉ cho đơn mà người gọi đã SELECT được qua RLS. Không rò rỉ. |

Policy `to anon` (catalog 285/304/313/329/345, catalog_fixes 119, pricing, seat_status_public) không gọi helper nào → anon không gãy khi không có EXECUTE helper. Policy storage cho authenticated gọi `is_admin` → vẫn được grant.

## 2. Hàm bị revoke

- `record_payment_event`, `mark_payment_cancelled`, `confirm_pos_sale`, `generate_booking_code`: revoke public/anon/authenticated, giữ service_role. Thân `mark_payment_cancelled` (040100:714-774) và `record_payment_event` không kiểm người gọi → revoke là bản sửa đúng.
- `generate_booking_code` và `nextval(internal_payment_order_code_seq)` chỉ được gọi trong hàm SECURITY DEFINER do postgres sở hữu (040000:480; 040100:228-1046; 060000:214-612) → chạy dưới quyền owner, không gãy.
- Trigger function: EXECUTE chỉ kiểm lúc CREATE TRIGGER → revoke không ảnh hưởng lúc trigger chạy.
- API: mọi `.rpc(` trong `apps/` đều qua `admin()` (identity, auth-ext, profile, pricing); không có lời gọi nào bằng user-JWT tới hàm vừa bị revoke. Web không gọi `.rpc`.

## 3. Thân hàm CREATE OR REPLACE

So từng dòng với bản gốc:
- `apply_voucher_core` (so 070000:22-187): chỉ đổi khối điều kiện FORBIDDEN (080000:89-94). Logic còn lại, chữ ký, `SECURITY DEFINER`, `search_path ''` giữ nguyên. ACL không đổi (048 allowlist xác nhận core không lộ cho client).
- `remove_voucher` (so 040200:213-278): chỉ đổi khối FORBIDDEN (080000:243-248).
- `cancel_showtimes` (so 040300:142-317): thêm chặn spoof (080000:314-316), đổi `coalesce(p_actor_id, auth.uid())` thành `coalesce(auth.uid(), p_actor_id)`. Phần còn lại giống hệt. Lưu ý hành vi: Admin gọi qua forUser cũng không còn ghi `cancelled_by` thành người khác được (hợp lý; service_role vẫn truyền được).

## 4. Default privileges

- Owner của migration local/hosted là `postgres` (048 probe `zz_probe_new_function` tạo trong suite chạy bằng postgres xác nhận: anon/authenticated mất EXECUTE, service_role giữ).
- Nhận định của builder là đúng: PUBLIC EXECUTE là mặc định có sẵn của Postgres. Default ACL theo từng schema chỉ cộng thêm quyền, nên muốn bỏ PUBLIC phải revoke ở mức toàn cục.
- Tác động phụ: mọi hàm postgres tạo sau này ở **mọi schema** (không chỉ public) sẽ không có PUBLIC EXECUTE. Trên Supabase, `create extension` thường do supautils nâng quyền thành supabase_admin nên extension ít bị ảnh hưởng, nhưng helper RLS ở schema khác hoặc hàm do postgres tạo thì phải GRANT tường minh. Task file đã ghi residual risk này. ERD chưa nói rõ phạm vi là "mọi schema" (xem m3).

## 5. Test

- 048 dùng `set_eq` trên **mọi** hàm public không thuộc extension cho anon và authenticated. Hàm mới có EXECUTE ngoài allowlist sẽ làm test fail, nên đây là allowlist cứng thật, không phải tautology. Phần kiểm PUBLIC (count = 0) bao cả trigger function. Probe kiểm đúng default privileges.
- Các case A→B có tác dụng phân biệt: đơn 4851 có giá 300000, nên nếu kiểm sở hữu thiếu thì lỗi trả ra là 23514 hoặc P0001, không phải 42501. Các case voucher mồ côi, spoof actor, và `cancelled_by` ghi đúng manager (`is`) đều kiểm tra hành vi thật.
- 11 file test cũ: khối DO chỉ grant cho `pg_proc` có `proname like 'tap_%'` trong public. Cả 17 file đều có `rollback;`, nên grant không lọt ra production và không che quyền của hàm thật.

## 6. Bằng chứng red-before

- Theo task file, 048 có 15/41 test đỏ trước khi áp migration (test 1-5, 7, 11, 13-15, 17, 22, 24, 26, 37). Tôi suy luận độc lập từng test và ra đúng tập 15 test này: allowlist, PUBLIC, probe default ACL, danh sách service-only, sequence, 3 hàm thanh toán chạy không lỗi, generate_booking_code, trigger fn (anon nhận lỗi trigger-context thay vì 42501), voucher mồ côi ×2, spoof actor. Test 16 (confirm_paid) và 9/10/18 xanh từ trước vì P0-05/P0-02 đã revoke. Kết quả này nhất quán.
- Hạn chế: journal builder (`.context/runs/bug-layer34-review-phase-1-task-08.builder.md`) chỉ có 1 dòng, không lưu output đỏ thô. Migration đã áp lên DB local, và không được reset nên tôi không chạy lại được trạng thái đỏ. Tôi cũng không chứng minh được DB local khớp byte-by-byte với file migration. Bù lại, 048 kiểm hành vi của từng thay đổi trong thân hàm và ACL, nên rủi ro thấp. Cần verify lại khi áp trên staging (m5).

## Findings

### CRITICAL
Không có.

### MAJOR
Không có.

### MINOR (không chặn)
- **m1 — Một số case trong 048 không phân biệt được lớp GRANT** (`supabase/tests/048_function_privileges.test.sql:213-218`): anon gọi `hold_seats` đi vào nhánh `AUTH_REQUIRED` 42501 của thân hàm (040000:140-141), nên test vẫn xanh kể cả khi anon có EXECUTE. Lớp bảo vệ thật là `set_eq` (dòng 19-27). Nên dùng `throws_ok(..., '42501', 'permission denied for function hold_seats', ...)` (hoặc so khớp theo message) cho các case kiểm lớp GRANT. Case `confirm_zero_amount` (đơn 300000 sẽ ra 23514) và `report_revenue(null...)` (không raise) thì đang phân biệt được.
- **m2 — Thiếu test regression đường hợp lệ** sau khi sửa thân hàm voucher: chưa có case Staff/Manager đúng rạp áp/gỡ voucher trên đơn POS `user_id null`. Đọc code thì logic đúng (080000:89-94), nhưng nhánh này chưa có test.
- **m3 — Doc** (`docs/ERD.md:76`): nên nói rõ default revoke PUBLIC là **toàn cục cho role postgres (mọi schema)**. Hàm mới, kể cả helper RLS ở schema khác, phải GRANT tường minh và thêm vào allowlist 048 nếu thuộc public.
- **m4 — Pattern LIKE** ở khối DO trong 11 file test: `'tap_%'` coi `_` là wildcard. Hiện chưa có hàm production nào khớp; chặt hơn thì dùng `'tap\_%'`.
- **m5 — Residual (đã ghi trong task):** chưa chứng minh được DB local khớp file migration. Ngoài ra global default privileges chưa xử lý bảng/sequence: bảng mới vẫn được Supabase tự cấp quyền cho anon/authenticated, nằm ngoài phạm vi K7.

### Ghi nhận ngoài phạm vi (có từ trước, không FAIL)
- `set_cinema_status` cho Manager (spec chỉ Admin) — P1.
- `report_*` cho Staff xem doanh thu — P1.
- `confirm_zero_amount` 040100:805-811: nhánh `elsif` là dead code. Trong SECURITY DEFINER, `current_user` luôn là postgres, nên role không phải authenticated (vd anon nếu được grant) sẽ bỏ qua kiểm sở hữu. Hiện chỉ lớp GRANT chặn → cần thêm defense-in-depth (P1).
- `confirm_zero_amount` vẫn upsert ghế SOLD (060000:21 đã ghi là ngoài phạm vi).
- `hold_seats` idempotent theo `p_request_id` (040000:150-167) trả booking_code của đơn khác trước khi kiểm quyền — P1 nhỏ.
- `confirm_pos_sale` chỉ còn service_role: Layer 5 POS phải đi qua `admin()` sau guard Nest (đã ghi trong task).
- Hàm giữ authenticated gọi thẳng được qua PostgREST nên bỏ qua guard/rate limit của Nest (đã ghi trong task).

## Verdict

**STRICT PASS** — không có CRITICAL/MAJOR. Bảng quyền khớp với thân hàm thật, các hàm còn mở cho client đều fail-closed theo chủ đơn/scope rạp, các hàm bị revoke không làm gãy đường gọi hợp lệ, CREATE OR REPLACE giữ nguyên logic/chữ ký/ACL/search_path/SECURITY DEFINER, allowlist 048 là cổng chặn thật. Nên xử lý các MINOR m1–m4 trong lần sửa sau hoặc gộp vào follow-up.
