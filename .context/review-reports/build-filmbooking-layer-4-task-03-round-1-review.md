# Adversarial Cross-Boundary Review Report: layer-4/task-03

**Reviewer:** Adversarial Reviewer (`Model: pro`)  
**Work Item:** `build/build-filmbooking`  
**Layer / Task:** `layer-4/task-03`  
**Review Level:** `STRICT` (Database RPC, Voucher redemptions, Concurrency locking, Financial calculation)  
**Round:** 1  
**Date:** 2026-11-11  

---

## 1. Executive Summary

- **Verdict:** `STRICT PASS`
- **Scope:** Triển khai migration `supabase/migrations/20261111040200_rpc_voucher.sql` và bộ kiểm thử pgTAP `supabase/tests/042_voucher.test.sql` phục vụ RPC voucher lõi: `apply_voucher`, `remove_voucher`, và trigger `orders_voucher_status_sync` đồng bộ trạng thái đơn và lượt dùng.
- **Tuân thủ Surgical Changes:** Chỉ tạo đúng 2 files được cấp phép trong task definition. Không xâm lấn các migration khác hoặc code nguồn backend/frontend.
- **Cross-Boundary Verification:** Đối chiếu 100% tên bảng, kiểu dữ liệu, các ràng buộc và trigger giữa `20261111030100_booking_tables.sql`, `20261111020100_security_ops.sql`, và migration mới `20261111040200_rpc_voucher.sql`.
- **Automated Verification:** 
  - `pnpm db:test`: 9/9 files, 371/371 tests PASS trên Supabase local stack thật (bao gồm 38 assertions trong `042_voucher.test.sql`).
  - `pnpm test`: PASS (157 API unit/e2e tests, 54 Web tests, 14 Shared tests).
  - `pnpm lint`: PASS (0 errors, 0 warnings).
  - `pnpm typecheck`: PASS.
  - `pnpm build`: PASS (Turbopack + Nest build sạch).

---

## 2. Requirements & Acceptance Criteria Traceability

| Requirement / AC | Yêu cầu kiểm tra | Kết quả đối soát thực tế | Trạng thái |
|---|---|---|:---:|
| **R-90, R-92** | Tối đa 1 voucher/đơn; tính giảm giá theo % (có trần `max_discount`) hoặc fixed VND; không vượt quá `subtotal_amount`. | Đã kiểm tra `v_discount` tính toán chính xác, chặn áp voucher thứ 2 bằng mã `VOUCHER_ALREADY_APPLIED`. | **PASS** |
| **R-93 (Concurrency)** | Khóa dòng chống race condition khi tranh lượt dùng cuối (`FOR UPDATE` trên `public.vouchers`); giữ lượt qua `voucher_redemptions` (`status = 'HELD'`). | `apply_voucher` gọi `select * from public.vouchers ... for update`, tuần tự hoá mọi đơn tranh lượt. Đã test trong pgTAP case 10. | **PASS** |
| **R-93 (Life-cycle)** | Đơn `expired` / `cancelled` tự động hoàn lượt; đơn `paid` / `checked_in` chốt lượt `CONSUMED`. | Trigger `orders_voucher_status_sync` trên `orders` bắt `after update of status`: `expired`/`cancelled` chuyển `voucher_redemptions` thành `RELEASED`; `paid`/`checked_in` chuyển thành `CONSUMED`. | **PASS** |
| **R-94** | Phân biệt rõ các mã lỗi: `VOUCHER_ALREADY_APPLIED`, `VOUCHER_INVALID`, `VOUCHER_EXPIRED`, `VOUCHER_MIN_NOT_MET`, `VOUCHER_EXHAUSTED`, `VOUCHER_USER_LIMIT_REACHED`, `VOUCHER_NOT_APPLICABLE`, `RATE_LIMITED`. | Tất cả 8 mã lỗi được ném chuẩn xác qua `errcode = 'P0001'`. | **PASS** |
| **R-95** | Rate limit nhập mã qua `hit_rate_limit` (tối đa 5 lần / 10 phút mỗi khách). | Khóa rate limit `voucher_apply:<user_id|order_id>`, gọi đúng hàm `public.hit_rate_limit(key, interval '10 minutes', 5)`. Lần thứ 6 ném `RATE_LIMITED`. | **PASS** |

---

## 3. Adversarial Cross-Boundary Deep-Dive

### 3.1. Đối chiếu Schema thật & Ràng buộc Unique trên `voucher_redemptions`
- **Nguy cơ tiềm ẩn:** Trong `20261111030100_booking_tables.sql`, bảng `public.voucher_redemptions` khai báo:
  ```sql
  order_id uuid not null unique references public.orders (id) on delete cascade
  ```
  Nếu một đơn đã áp voucher, sau đó khách gọi `remove_voucher` (bản ghi redemption chuyển sang `RELEASED`), rồi khách áp lại voucher khác: nếu dùng `INSERT` thuần sẽ bị nổ lỗi Postgres `23505 (unique_violation)`.
- **Kiểm chứng Code (`20261111040200_rpc_voucher.sql` L176-187):**
  Builder đã xử lý chuẩn xác bằng cú pháp upsert:
  ```sql
  insert into public.voucher_redemptions (
    voucher_id, order_id, user_id, discount_amount, status
  ) values (
    v_voucher.id, p_order_id, v_order.user_id, v_discount, 'HELD'
  )
  on conflict (order_id) do update set
    voucher_id = excluded.voucher_id,
    user_id = excluded.user_id,
    discount_amount = excluded.discount_amount,
    status = 'HELD',
    updated_at = now();
  ```
  Đồng thời test case 4-5 trong `042_voucher.test.sql` đã kiểm tra trọn vẹn kịch bản: `apply` -> `remove` -> `apply` lại voucher khác và assertion kiểm tra thành công, không văng lỗi duplicate key.

### 3.2. Chữ ký hàm Rate Limit (`hit_rate_limit`)
- Schema `20261111020100_security_ops.sql` (L87):
  ```sql
  create function public.hit_rate_limit(p_key text, p_window interval, p_max integer) returns boolean
  ```
- Lời gọi tại `20261111040200_rpc_voucher.sql` (L86):
  ```sql
  if not public.hit_rate_limit(v_rate_key, interval '10 minutes', 5) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  ```
  -> Khớp 100% kiểu tham số và thứ tự.

### 3.3. Bảo mật phân quyền & BOLA/IDOR
- Cả 2 RPCs `apply_voucher` và `remove_voucher` được gán:
  - `security definer` + `set search_path = ''` (chống search_path hijacking).
  - Thu hồi quyền từ `public`, `anon`, chỉ cấp cho `authenticated`, `service_role` (khách chưa đăng nhập không thể brute-force mã qua RPC).
  - Kiểm tra IDOR nghiêm ngặt: nếu `v_order.user_id <> v_uid` và caller không phải `ADMIN` hoặc `STAFF`/`MANAGER` của rạp đó, ném ngay `FORBIDDEN` (`42501`).
  - Đã được kiểm thử trong `042_voucher.test.sql` L399-412.

### 3.4. Kiểm tra State Machine Trạng thái Đơn
- Chỉ cho phép áp/gỡ voucher khi đơn ở trạng thái `holding` hoặc `pending_payment` và `hold_expires_at > now()`.
- Nếu đơn đã sang `paid`, ném `ORDER_NOT_HOLDING`.
- Nếu đơn quá hạn giữ ghế (`hold_expires_at < now()`), ném `ORDER_EXPIRED`.
- Đảm bảo tính toàn vẹn tài chính, không cho phép áp voucher vào đơn đã thanh toán hoặc đã hết hạn giữ ghế.

---

## 4. Verification Commands & Evidence

1. **pgTAP Database Test:**
   ```powershell
   cd "E:\FilmBooking\.worktrees\layer-4__task-03"; pnpm db:test
   ```
   *Output:*
   ```text
   /FilmBooking/.worktrees/layer-4__task-03/supabase/tests/042_voucher.test.sql ................. ok
   All tests successful.
   Files=9, Tests=371, 3 wallclock secs
   Result: PASS
   ```
2. **TypeScript & Unit / E2E Tests:**
   ```powershell
   cd "E:\FilmBooking\.worktrees\layer-4__task-03"; pnpm test
   ```
   *Output:* 11 test files passed (157 tests apps/api), 4 test files passed (54 tests apps/web), 1 test file passed (14 tests packages/shared).
3. **Linter & Typecheck:**
   - `pnpm lint`: Exit 0.
   - `pnpm typecheck`: Exit 0.
4. **Build:**
   - `pnpm build`: Next.js 16.4.6 static page generation (6/6 pages) + NestJS build (48 files) -> Done (Exit 0).

---

## 5. Review Conclusion

Builder đã hoàn thành xuất sắc task-03 theo chuẩn mực kỹ thuật cao:
- Triển khai đầy đủ và chính xác tất cả các yêu cầu nghiệp vụ và AC.
- Xử lý triệt để race condition và conflict trên bảng `voucher_redemptions`.
- Không phát hiện bất kỳ defect, vulnerability, hay false-confidence test nào.

**Đánh giá:** **STRICT PASS** (Đủ điều kiện đóng task và tích hợp).
