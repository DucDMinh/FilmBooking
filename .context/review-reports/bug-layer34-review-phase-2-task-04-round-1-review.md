# Review: bug-layer34-review — phase-2-task-04 (Round 1)

## Review level: STRICT

## Reason
Thay đổi trực tiếp RPC nghiệp vụ lõi đặt vé `hold_seats` (bảo mật, locking, trạng thái ghế, RLS/search_path, mã lỗi DB và giao dịch đồng thời đa phiên). Cần kiểm tra kỹ nguy cơ race condition, deadlock (40P01), tính toàn vẹn dữ liệu ghế/suất/đơn hàng, và đối chiếu chéo giữa DB migration và TypeScript contracts.

## Blast radius
- Database: RPC `public.hold_seats` (`supabase/migrations/20261112140000_hold_seats_hardening.sql`), pgTAP test suite `supabase/tests/056_hold_seats_hardening.test.sql`, allowlist quyền hàm `048_function_privileges.test.sql`.
- Shared: `packages/shared/src/errors.ts` (mã lỗi và HTTP status mapping).
- Web: `apps/web/src/lib/api/error-messages.ts` (thông điệp lỗi tiếng Việt).
- Booking flow & concurrency: Trực tiếp ảnh hưởng tới tính đúng đắn khi khách chọn/giữ ghế và khi quản lý huỷ suất chiếu (`cancel_showtimes`).

## Verify commands + result
1. `pnpm db:test`: PASS (25 test files, 747 assertions; `056_hold_seats_hardening.test.sql` 8/8 PASS; `048_function_privileges.test.sql` 39/39 PASS).
2. `pnpm typecheck`: PASS (packages/shared, apps/api, apps/web 0 lỗi).
3. `pnpm test`: PASS (packages/shared 14/14, apps/api 210/210, apps/web 93/93, scripts 16/16).
4. `pnpm lint`: PASS (eslint không cảnh báo/lỗi).

## Verdict: ✅ STRICT PASS

## Summary
Bản sửa đổi rất gọn gàng và chuẩn xác (surgical change). Đã bổ sung khoá `showtimes FOR SHARE OF st` ở bước đầu truy cập dữ liệu, kiểm tra trạng thái rạp `OPEN` và phim `PUBLISHED` (R-33) với errcode 23514 chuẩn, đồng bộ mã lỗi sang `@filmbooking/shared` và `apps/web`. Bộ test đa phiên dblink xác nhận không có deadlock (40P01) và loại trừ hoàn toàn tình trạng đơn/ghế mồ côi khi có huỷ suất.

## Findings

### ✅ Good
1. **Khóa đúng mức hạt nhân (Surgical & Non-blocking):**
   - Câu truy vấn `where st.id = p_showtime_id for share of st;` sử dụng tường minh `of st`, chỉ khoá dòng suất chiếu tương ứng mà KHÔNG khoá lan sang bảng `cinemas` hay `movies`, tránh mọi nguy cơ tranh chấp tài nguyên catalog không cần thiết.
   - `FOR SHARE` trên `showtimes` tương thích lẫn nhau giữa các phiên `hold_seats` đồng thời, không làm giảm thông lượng giữ ghế trên cùng suất.
2. **Thứ tự khoá toàn cục (Global Locking Hierarchy):**
   - Thứ tự tuân thủ chuẩn xác: `showtimes` (FOR SHARE / FOR UPDATE) -> `orders` (FOR UPDATE theo ID tăng dần) -> `seats` (FOR UPDATE theo ID tăng dần) -> `showtime_seat_states`.
   - Khớp thứ tự với `confirm_paid`, `confirm_zero_amount` và `cancel_showtimes`, ngăn chặn triệt để deadlock (40P01).
3. **Bảo mật & Phân quyền Fail-Closed:**
   - Giữ nguyên `SECURITY DEFINER` và `SET search_path TO ''`.
   - Thu hồi quyền `EXECUTE` từ `public`, `anon`; chỉ cấp cho `authenticated`, `service_role`. Khớp 100% với allowlist bảo mật trong `048_function_privileges.test.sql`.
4. **Xử lý ràng buộc nghiệp vụ R-33:**
   - Kiểm tra `cinema_status is distinct from 'OPEN'` (`CINEMA_NOT_OPEN`) và `movie_status is distinct from 'PUBLISHED'` (`MOVIE_NOT_PUBLISHED`), xử lý an toàn cả trường hợp trạng thái null.
   - Bổ sung mã lỗi và thông điệp người dùng vào cả `packages/shared/src/errors.ts` và `apps/web/src/lib/api/error-messages.ts` với HTTP status 409.
5. **Chất lượng kiểm thử cao (High-Confidence Concurrency Tests):**
   - Test `056_hold_seats_hardening.test.sql` chạy 12 vòng thử nghiệm đồng thời thực sự bằng `dblink` với độ trễ jitter giữa:
     - 2 phiên `hold_seats` cùng suất cùng ghế -> đúng 1 phiên thành công, 1 phiên `SEAT_TAKEN`, không lỗi 23505 thô.
     - 1 phiên `hold_seats` x 1 phiên `cancel_showtimes` -> kết quả cuối cùng suất luôn CANCELLED, không bao giờ còn đơn holding hay dòng ghế sống.
   - Fixture dblink được dọn dẹp sạch sẽ ở cả kịch bản thành công lẫn khi ném exception.

### ❌ Issues (FAIL only)
*Không có issue nào chặn PASS.*

### 💡 Suggestions (optional)
1. **Mapping chi tiết trong NestJS Exception Filter (Layer 5):** Khi triển khai booking controller ở Layer 5 (`layer-5-task-01`), chú ý catch mã lỗi Postgres `23514` có prefix `CINEMA_NOT_OPEN`, `MOVIE_NOT_PUBLISHED`, `SHOWTIME_NOT_OPEN` để map sang `AppException(ERROR_CODES.*, 409)` đồng bộ với `packages/shared`.

## Verdict Reasoning
Thay đổi hoàn toàn đáp ứng các tiêu chí nghiệm thu của task:
- Không sửa code thừa, giữ surgical diff.
- Tuân thủ thứ tự khoá chuẩn của hệ thống, không có nguy cơ deadlock.
- Bảo mật search_path và ACL được đảm bảo.
- 100% verify commands chạy thành công.
- Verdict: **STRICT PASS**.
