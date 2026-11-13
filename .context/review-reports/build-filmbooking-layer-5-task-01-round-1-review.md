# Báo cáo Review Độc lập: build-filmbooking / Layer 5 / Task 01 (Round 1)

**Agent: reviewer**  
**Review Level: STRICT**  
**Verdict: FAIL**

---

## 1. Tổng quan Đánh giá
Task 01 của Layer 5 triển khai Booking API bao gồm: Sơ đồ ghế công khai (`SeatmapService`), Giữ/nhả ghế nguyên tử (`BookingService.hold`, `releaseHold`), Tóm tắt đơn hàng (`getBooking`), Xác nhận độ tuổi (`ageConfirm`), Đồng ý chính sách không huỷ/không hoàn (`saveConsent`), Áp dụng/gỡ voucher (`applyVoucher`, `removeVoucher`).

Mặc dù `pnpm -w typecheck`, `pnpm -w lint` và toàn bộ 259 tests (bao gồm 29 tests trong `booking.e2e-spec.ts`) đều PASS, việc **đối chiếu chéo (Cross-Boundary Check) với Postgres Schema & RLS thật trong `supabase/migrations/*.sql`** đã phát hiện ra các defect nghiêm trọng (**CRITICAL / HIGH**) sẽ khiến API ném lỗi `42501 Permission Denied` hoặc trả dữ liệu rỗng trên môi trường Supabase thật.

---

## 2. Danh sách Defect chi tiết

### Defect 1: [CRITICAL] Lỗi phân quyền Postgres (42501) khi cập nhật `orders` và insert `consents`
- **Vị trí**:
  + [booking.service.ts](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/src/modules/booking/booking.service.ts#L224): `userDb.from("orders").update({ age_confirmed: true }).eq("id", orderId)`
  + [booking.service.ts](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/src/modules/booking/booking.service.ts#L270): `userDb.from("orders").update({ consent_at: consentAt }).eq("id", orderId)`
  + [booking.service.ts](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/src/modules/booking/booking.service.ts#L271-L277): `userDb.from("consents").insert({ ... accepted_at: consentAt ... })`
- **Đối chiếu DB Schema thật**:
  + Trong migration [20261111030100_booking_tables.sql](file:///E:/FilmBooking/supabase/migrations/20261111030100_booking_tables.sql#L601-L602):
    ```sql
    -- orders / order_seats / tickets / payments: đọc theo can_view_order; ghi qua RPC/service role.
    grant select on public.orders, public.order_seats, public.tickets, public.payments to authenticated;
    ```
    Bảng `orders` **HOÀN TOÀN KHÔNG ĐƯỢC GRANT UPDATE** cho role `authenticated`. Role `authenticated` chỉ có quyền `SELECT`.
    Khi `userDb` (dùng role `authenticated` từ JWT của user) gọi `.from("orders").update(...)`, Supabase PostgREST trên DB thật sẽ nổ lỗi mã `42501` (`permission denied for table orders`).
  + Trong migration [20261111010000_core_identity_chain.sql](file:///E:/FilmBooking/supabase/migrations/20261111010000_core_identity_chain.sql#L471):
    ```sql
    grant insert (user_id, consent_type, version, metadata) on public.consents to authenticated;
    ```
    Quyền INSERT trên bảng `consents` bị giới hạn theo cột (Column-level privileges), chỉ gồm 4 cột: `user_id, consent_type, version, metadata`. Cột `accepted_at` (có `default now()`) **KHÔNG ĐƯỢC GRANT INSERT** cho role `authenticated`.
    Khi `userDb.from("consents").insert({ ... accepted_at: consentAt ... })` chạy dưới role `authenticated`, Postgres sẽ nổ lỗi `42501` (`permission denied for column "accepted_at" of relation "consents"`).
- **Khắc phục**:
  + Với `orders`: Sau khi service đã xác thực `order.user_id === user.id`, việc cập nhật `consent_at` và `age_confirmed` trên `orders` phải được thực hiện bằng `this.supabase.admin().from("orders").update(...)` (service role).
  + Với `consents`: Bỏ trường `accepted_at` trong payload insert (để Postgres tự sinh bằng `default now()`), HOẶC thực hiện insert qua `this.supabase.admin()`.

---

### Defect 2: [HIGH] Khách hàng bị RLS chặn xem mã Voucher trong tóm tắt đơn hàng
- **Vị trí**: [booking.service.ts](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/src/modules/booking/booking.service.ts#L130-L135)
  ```ts
  const { data: v } = await userDb
    .from("vouchers")
    .select("code")
    .eq("id", redemption.voucher_id)
    .maybeSingle();
  ```
- **Đối chiếu DB Schema thật**:
  Trong migration [20261111030100_booking_tables.sql](file:///E:/FilmBooking/supabase/migrations/20261111030100_booking_tables.sql#L637-L643):
  ```sql
  -- vouchers: Admin CRUD; Manager chỉ xem (R-90). Khách kiểm mã qua RPC (chống dò mã, R-95).
  grant select, insert, update, delete on public.vouchers to authenticated;
  create policy vouchers_select on public.vouchers for select to authenticated
    using (
      (select public.is_admin())
      or exists (select 1 from public.staff_assignments sa
                 where sa.user_id = (select auth.uid()) and sa.role = 'MANAGER')
    );
  ```
  RLS policy của bảng `vouchers` chỉ cho phép **Admin** hoặc **Cinema Manager** được `SELECT`. Khách hàng thông thường (CUSTOMER) bị chặn hoàn toàn để chống dò mã.
  Do đó, khi khách hàng gọi `getBooking`, câu truy vấn `userDb.from("vouchers").select("code")` sẽ luôn trả về `null`. Mã voucher khách đã áp dụng sẽ bị rỗng (`voucher.code: ""`).
- **Khắc phục**:
  Sau khi đã kiểm tra quyền sở hữu đơn hàng của user, dùng `this.supabase.admin().from("vouchers").select("code").eq("id", redemption.voucher_id).maybeSingle()` để lấy mã voucher hiển thị cho khách.

---

### Defect 3: [HIGH] False-Confidence Mock trong `booking.e2e-spec.ts`
- **Vị trí**: [booking.e2e-spec.ts](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/test/booking.e2e-spec.ts#L509-L513) và [L570-L587](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/test/booking.e2e-spec.ts#L570-L587)
- **Vấn đề**:
  Bộ mock `FakeDb` trong test e2e do chính Builder viết đã không mô phỏng các ràng buộc phân quyền cột (Column Privileges) và Row Level Security (RLS) của Postgres thật:
  1. Cho phép `userDb` update bảng `orders` tự do dù DB thật không có `grant update`.
  2. Cho phép insert cột `accepted_at` vào bảng `consents` dù DB thật không có quyền insert cột này cho `authenticated`.
  3. Cho phép `userDb` (Customer) select bảng `vouchers` tự do dù policy `vouchers_select` chỉ dành cho Admin/Manager.
- **Khắc phục**:
  Cập nhật service để tôn trọng đúng schema DB thật (dùng `admin()` ở những chỗ cần bypass RLS sau khi đã check auth tại API), và cập nhật mock để phản ánh sát hơn các hành vi quyền hạn này.

---

### Defect 4: [MEDIUM] Regex bóc tách danh sách ghế lỗi `SEAT_TAKEN` chưa bao quát trường hợp ghế bị khoá
- **Vị trí**: [booking.service.ts](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/src/modules/booking/booking.service.ts#L410-L411)
  ```ts
  const match = msg.match(/Ghế\s+([^đ]+?)\s+đã/i);
  ```
- **Vấn đề**:
  Trong RPC `hold_seats` ([20261111040000_rpc_hold.sql](file:///E:/FilmBooking/supabase/migrations/20261111040000_rpc_hold.sql#L296)), nếu ghế nằm trong danh sách khoá của Manager, Postgres sẽ ném lỗi:
  `'SEAT_TAKEN: Ghế E5 đang bị khoá'` (dùng từ `"đang bị"` chứ không phải `"đã có"`).
  Regex `/Ghế\s+([^đ]+?)\s+đã/i` sẽ không khớp chuỗi này, dẫn tới `details.seats` bị trả về rỗng `[]` thay vì `['E5']`.
- **Khắc phục**:
  Đổi regex sang dạng linh hoạt: `/Ghế\s+(.+?)\s+(?:đã|đang)/i`.

---

### Defect 5: [LOW / Code Quality] Vi phạm giới hạn dòng file và hàm (Project Config Rules)
- **Vị trí**:
  + [booking.service.ts](file:///E:/FilmBooking/.worktrees/layer-5__task-01/apps/api/src/modules/booking/booking.service.ts): dài **454 dòng** (vượt giới hạn `max_file_lines: 300` trong `project-config.md`).
  + `BookingService.getBooking`: dài **103 dòng** (vượt giới hạn `max_function_lines: 50`).
  + `SeatmapService.getSeatMap`: dài **124 dòng** (vượt giới hạn `max_function_lines: 50`).
- **Khắc phục**:
  Tách các hàm phụ trợ (helper private functions / formatters / mappers) để các hàm nghiệp vụ chính ≤ 50 dòng và file ≤ 300 dòng (hoặc tách riêng `voucher-booking.service.ts` / `booking-summary.service.ts`).

---

## 3. Tổng hợp Bảng Tiêu chí Yêu cầu (Checklist Audit)

| Tiêu chí | Trạng thái | Ghi chú |
|---|:---:|---|
| **AC-01**: Khách chưa xác nhận email gọi hold -> 403 `EMAIL_NOT_CONFIRMED` | **PASS** | Kiểm tra cả ở Guard lẫn service `isEmailConfirmed` |
| **AC-06**: Hai request cùng ghế E5 -> 1 thành công, 1 lỗi 409 `SEAT_TAKEN` | **PASS / Cần chỉnh Regex** | Logic concurrency DB chuẩn, regex cần chỉnh theo Defect 4 |
| **AC-08**: `POST /bookings/:id/consent` lưu `consent_at` + version | **FAIL (Defect 1)** | Nổ lỗi Postgres `42501` trên DB thật do thiếu grant update/insert |
| **GET /showtimes/:id/seatmap**: Không trả `user_id`/`order_id`, HELD hết hạn -> FREE | **PASS** | `SeatMapItem` lọc sạch nhạy cảm, tính toán state chính xác |
| **R-95**: Rate limit nhập voucher quá 10 lần/phút -> 429 | **PASS** | Ánh xạ mã `RATE_LIMITED` ra HTTP 429 chuẩn xác |
| **R-131**: Không có endpoint huỷ đơn đã thanh toán cho khách | **PASS** | Chỉ có `DELETE /bookings/:id/hold` cho đơn holding |
| **Phân quyền đặt vé**: Staff/Manager/Admin bị chặn 403 khi đặt vé online | **PASS** | `access.isAdmin || access.cinemaRoles.size > 0` -> 403 `FORBIDDEN` |
| **TypeScript / Lint / Vitest** | **PASS** | Typecheck 0 error, Lint 0 error, 259/259 tests passed |

---

## 4. Kết luận
Đánh giá: **FAIL** (Round 1).  
Builder cần giải quyết Defect 1 (CRITICAL), Defect 2 (HIGH), Defect 3 (HIGH), Defect 4 (MEDIUM) và refactor độ dài hàm/file theo Defect 5 trước khi đưa vào vòng review tiếp theo.
