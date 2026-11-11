# Review Report: Layer 4 / Task 09 (Round 1)

- **Agent:** reviewer (`Model: pro`)
- **Task:** `build-filmbooking/layer-4-task-09` (Seed demo: 5 rạp, phòng, sơ đồ ghế, phim, bảng giá, ngày lễ, suất 7 ngày, tài khoản mẫu)
- **Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-09`
- **Review Level:** `NORMAL`
- **Verdict:** `NORMAL PASS`

---

## 1. Executive Summary

Builder đã hoàn thành xuất sắc việc triển khai dữ liệu seed (`supabase/seed.sql`) và tài liệu hướng dẫn kiểm thử nội bộ (`supabase/seed/README.md`) cho môi trường Local / Dev.
Toàn bộ dữ liệu seed được thiết kế chuẩn **Idempotent 100%**, có thể nạp lại nhiều lần liên tiếp mà không gặp bất kỳ lỗi xung đột dữ liệu hay vi phạm ràng buộc cơ sở dữ liệu nào.

Đặc biệt, qua kiểm tra đối chiếu chéo thực tế trên PostgreSQL container (`supabase_db_filmbooking`):
1. **Trigger `20261111040500_identity_hooks.sql` (Task 06)**: Tương thích hoàn toàn 100%, không bị chặn hay xung đột khi nạp `auth.users` và `auth.identities`.
2. **AC-15 (Quy tắc giá ghi đè rạp HN02)**: Đã được kiểm chứng bằng việc gọi trực tiếp hàm SQL `public.price_quote`: Suất 2D tối thứ Bảy tại `HN01` chốt giá 120.000đ (giá chuỗi), trong khi tại `HN02` chốt giá 100.000đ (giá ghi đè rạp).
3. **Exclusion Constraint & Demo Showtimes**: Không xảy ra chồng lấn suất chiếu trong 16 phòng suốt 7 ngày tới; đồng thời có sẵn 2 suất chiếu đang mở bán (`ON_SALE`) trong vòng 45 phút và 75 phút tới phục vụ demo kiểm thử ngay lập tức.

---

## 2. Adversarial Cross-Boundary Audit

### 2.1 Tương thích với Trigger `20261111040500_identity_hooks.sql` (Task 06)
- **Kiểm tra Trigger:** Trên DB container, trigger `trg_guard_identity_insert` và `trg_on_identity_change` đã được kích hoạt trên bảng `auth.identities`.
- **Hành vi Guard:** `guard_identity_insert()` có kiểm tra `if NEW.provider in ('email', 'phone') then return NEW; end if;`. Vì toàn bộ tài khoản mẫu được seed với `provider = 'email'`, trigger cho phép chèn hợp lệ mà không chặn lầm.
- **Hành vi Audit & Outbox:** `on_identity_change()` ghi log vào `public.audit_logs` với `actor_id = v_user_id` (đã tồn tại trong `auth.users`), không nổ lỗi FK.
- **Thực nghiệm:** Chạy nạp `seed.sql` lần 1 và lần 2 liên tiếp qua `psql -v ON_ERROR_STOP=1`: cả 2 lần đều hoàn thành với exit code 0 (`INSERT 0 0` ở lần 2 nhờ `ON CONFLICT DO NOTHING / UPDATE`).

### 2.2 Kiểm tra chi tiết Acceptance Criteria (R-38, NFR-09, AC-15)

| Tiêu chí kiểm tra | Kết quả thực tế trên Database | Đánh giá |
| :--- | :--- | :---: |
| **5 rạp chuỗi** | Đủ 5 rạp: `HN01` (Cầu Giấy), `HN02` (Ba Đình), `HN03` (Hà Đông), `HCM01` (Quận 1), `DN01` (Hải Châu). | **PASS** |
| **Phòng chiếu (3–5 phòng/rạp)** | HN01: 4 phòng; HN02: 3 phòng; HN03: 3 phòng; HCM01: 3 phòng; DN01: 3 phòng. Tổng cộng 16 phòng hoạt động (`ACTIVE`). | **PASS** |
| **Sơ đồ ghế (R-48)** | Lưới 7 hàng (A–G) x 10 cột mỗi phòng. Tổng cộng 1056 ghế:<br>- `NORMAL`: 384 ghế (hàng A, B, C)<br>- `VIP`: 384 ghế (hàng D, E, F)<br>- `SWEETBOX`: 64 ghế (hàng G: 4 cặp G1-G2, G3-G4, G7-G8, G9-G10 mỗi phòng)<br>- `AISLE`: 224 lối đi (cột 5, 6 ở cả 7 hàng). | **PASS** |
| **12 Phim đủ 5 nhãn tuổi (R-41, R-42, R-45)** | Đủ 12 phim với 5 nhãn tuổi chuẩn:<br>- `P`: Doraemon, Mufasa (2 phim)<br>- `K`: Conan, Đất Rừng Phương Nam (2 phim)<br>- `T13`: Spider-Man, Avengers, Avatar (3 phim)<br>- `T16`: Dune 2, Oppenheimer (2 phim)<br>- `T18`: Mai, Exhuma, Joker (3 phim)<br>Có 2 phim sắp chiếu chưa có suất: `Avatar: Lửa Và Tro` và `Đất Rừng Phương Nam: Phần 2`. | **PASS** |
| **Bảng giá chuỗi & Override (AC-15)** | Đầy đủ 36 tổ hợp giá chuỗi (`scope = 'CHAIN'`).<br>Ghi đè tại HN02: VIP 2D cuối tuần tối = 100.000đ (chuỗi = 120.000đ).<br>Kiểm chứng hàm `public.price_quote()`:<br>- HN01: 120.000đ<br>- HN02: 100.000đ. Khớp 100% AC-15. | **PASS** |
| **12 Ngày lễ (`holidays`)** | Nạp đủ 12 ngày lễ lớn năm 2026–2027 (Tết Dương lịch, Tết Nguyên Đán, Giỗ Tổ Hùng Vương, 30/4, 1/5, 2/9...). | **PASS** |
| **Suất chiếu 7 ngày tới & Demo live** | 298 suất chiếu hợp lệ với exclusion constraint `showtimes_no_overlap_excl`.<br>Đặc biệt có 2 suất đang mở bán (`ON_SALE`) trong vòng 2 giờ tới phục vụ demo:<br>1. HN01 - Phòng 4: Spider-Man (sau 45 phút)<br>2. HCM01 - Phòng 3: Doraemon (sau 75 phút). | **PASS** |
| **Tài khoản mẫu** | 6 tài khoản mẫu đã kích hoạt (`email_confirmed_at` đầy đủ):<br>- `admin@filmbooking.local` (`ADMIN` toàn chuỗi)<br>- `manager.hn01@filmbooking.local` (`MANAGER` tại HN01)<br>- `manager.hn02@filmbooking.local` (`MANAGER` tại HN02)<br>- `staff.hn01@filmbooking.local` (`STAFF` tại HN01)<br>- `staff.hn02@filmbooking.local` (`STAFF` tại HN02)<br>- `customer@filmbooking.local` (`CUSTOMER` cá nhân, có consents). | **PASS** |
| **5 POS API Keys** | Đủ 5 rạp (`pos_hn01_` .. `pos_dn01_`). Khóa được băm SHA-256 an toàn trong DB. | **PASS** |
| **Bảo mật & Phân cách môi trường** | Mật khẩu mẫu `LocalDev@123!`. Không chứa secret thật. `README.md` có cảnh báo đỏ cấm mang lên Staging/Production. | **PASS** |

---

## 3. Verification Commands Summary

Tất cả các lệnh kiểm tra cấu hình trong `.context/project-config.md` đã chạy trực tiếp trên worktree `layer-4__task-09` và đạt kết quả xanh tuyệt đối:

1. **`pnpm lint`**: PASS (packages/shared, apps/api, apps/web đều sạch lỗi).
2. **`pnpm typecheck`**: PASS (Không có lỗi kiểu TypeScript).
3. **`pnpm test`**: PASS (225 tests: 157 api + 54 web + 14 shared).
4. **`pnpm build`**: PASS (Build thành công cả backend NestJS và frontend Next.js App Router).

---

## 4. Minor Finding / Documentation Discrepancy (Non-blocking)

- **Vị trí:** `supabase/seed/README.md`, Bảng tại Mục 2: "Danh sách khoá API POS giả lập (POS API Keys)", cột `SHA-256 Key Hash (Lưu trong DB)`.
- **Hiện tượng:** Giá trị chuỗi hash SHA-256 in trong bảng tài liệu `README.md` bị lệch so với chuỗi hash thực tế được sinh ra bởi câu lệnh `encode(extensions.digest(plaintext, 'sha256'), 'hex')` trong `supabase/seed.sql`.
- **Tác động:** Không ảnh hưởng đến runtime code. Khi client POS gọi API giả lập với header `x-pos-api-key: pos_hn01_secret_dev_key_2026`, backend tự băm chuỗi plaintext này bằng SHA-256 và khớp chính xác 100% với giá trị hash lưu trong DB. Tuy nhiên, nếu lập trình viên tra cứu DB bằng hash ghi trong `README.md` sẽ không tìm thấy record.
- **Bảng đối chiếu giá trị hash chuẩn để Builder đồng bộ vào `README.md`:**
  - `HN01` (`pos_hn01_secret_dev_key_2026`): `7a2efaf93c1ca7a3ec5524a86af0311d3e3a72d6362e7fd9db99a594e4de4463`
  - `HN02` (`pos_hn02_secret_dev_key_2026`): `dc7a8e66525aa93e83d4c1500444855409036f275fb9b19664a599d481e1cc26`
  - `HN03` (`pos_hn03_secret_dev_key_2026`): `1862fb8cd01ca05eb8d0da7fb4ca00fe04e6480531a195b4fc43c378502a2c7c`
  - `HCM01` (`pos_hcm01_secret_dev_key_2026`): `6d50f2ca01d134c0b2871f052af85c9480ddafea8b691eede15c3cc590bbca99`
  - `DN01` (`pos_dn01_secret_dev_key_2026`): `9b2c5d93b58848d1dadf255cc42023002be7ebb64ce024965409497adc956a7b`

---

## 5. Conclusion

Dữ liệu seed và cấu hình dev của Task 09 đạt chất lượng cao, chuẩn xác về mặt schema, tương thích hoàn toàn với các trigger bảo mật OAuth/Identity của Task 06, và đáp ứng trọn vẹn toàn bộ các tiêu chí nghiệm thu của Spec.

**Verdict:** `NORMAL PASS`
