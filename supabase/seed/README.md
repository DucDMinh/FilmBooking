# FilmBooking MVP — Dữ liệu Seed Môi trường Local / Dev

> [!CAUTION]
> **CẢNH BÁO AN TOÀN QUAN TRỌNG:**
> Dữ liệu seed trong thư mục này, bao gồm danh sách tài khoản mẫu, mật khẩu phát triển và các khoá bí mật API POS giả lập, **CHỈ ĐƯỢC PHÉP SỬ DỤNG CHO MÔI TRƯỜNG PHÁT TRIỂN NỘI BỘ (LOCAL / DEV)**.
> **TUYỆT ĐỐI KHÔNG SỬ DỤNG HOẶC ĐỂ LỘ TRÊN MÔI TRƯỜNG STAGING VÀ PRODUCTION.** Mọi môi trường ngoài local phải sử dụng tài khoản thực tế và khoá API sinh ngẫu nhiên an toàn.

---

## 1. Danh sách tài khoản phát triển (Local Test Accounts)

Tất cả các tài khoản mẫu dưới đây đều được kích hoạt sẵn (`email_confirmed_at = now()`) với mật khẩu chuẩn dành riêng cho local development.

- **Mật khẩu chung cho toàn bộ tài khoản mẫu:** `LocalDev@123!`

| STT | Địa chỉ Email | Vai trò (`Role`) | Phạm vi / Rạp được gán | Mục đích kiểm thử |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `admin@filmbooking.local` | `ADMIN` (Hệ thống) | Toàn chuỗi | Quản trị toàn chuỗi: phim, rạp, bảng giá, voucher, người dùng, báo cáo |
| 2 | `manager.hn01@filmbooking.local` | `MANAGER` (Rạp) | `HN01` (Cầu Giấy) | Quản lý phòng chiếu, suất chiếu, giá ghi đè, nhân sự tại rạp Cầu Giấy |
| 3 | `manager.hn02@filmbooking.local` | `MANAGER` (Rạp) | `HN02` (Ba Đình) | Quản lý phòng chiếu, suất chiếu, giá ghi đè (AC-15) tại rạp Ba Đình |
| 4 | `staff.hn01@filmbooking.local` | `STAFF` (Nhân viên) | `HN01` (Cầu Giấy) | Soát vé QR, tra cứu đơn hàng tại rạp Cầu Giấy (chặn soát vé rạp khác) |
| 5 | `staff.hn02@filmbooking.local` | `STAFF` (Nhân viên) | `HN02` (Ba Đình) | Soát vé QR, tra cứu đơn hàng tại rạp Ba Đình (chứng minh AC-13) |
| 6 | `customer@filmbooking.local` | `CUSTOMER` (Khách hàng) | Toàn chuỗi (Cá nhân) | Đặt vé, giữ ghế realtime, áp voucher, xem vé điện tử, lịch sử đơn hàng |

---

## 2. Danh sách khoá API POS giả lập (POS API Keys)

Cơ sở dữ liệu chỉ lưu trữ `key_hash` (chuỗi băm SHA-256) và `prefix`. Giá trị Plaintext dưới đây chỉ dùng để cấu hình header `x-pos-api-key` khi gọi API POS giả lập trên máy phát triển:

| Mã rạp | Tên rạp | Prefix | Plaintext API Key (Dùng gọi API) | SHA-256 Key Hash (Lưu trong DB) |
| :---: | :--- | :---: | :--- | :--- |
| **`HN01`** | FilmBooking Cầu Giấy | `pos_hn01_` | `pos_hn01_secret_dev_key_2026` | `7a2efaf93c1ca7a3ec5524a86af0311d3e3a72d6362e7fd9db99a594e4de4463` |
| **`HN02`** | FilmBooking Ba Đình | `pos_hn02_` | `pos_hn02_secret_dev_key_2026` | `dc7a8e66525aa93e83d4c1500444855409036f275fb9b19664a599d481e1cc26` |
| **`HN03`** | FilmBooking Hà Đông | `pos_hn03_` | `pos_hn03_secret_dev_key_2026` | `1862fb8cd01ca05eb8d0da7fb4ca00fe04e6480531a195b4fc43c378502a2c7c` |
| **`HCM01`** | FilmBooking Quận 1 | `pos_hcm01_` | `pos_hcm01_secret_dev_key_2026` | `6d50f2ca01d134c0b2871f052af85c9480ddafea8b691eede15c3cc590bbca99` |
| **`DN01`** | FilmBooking Hải Châu | `pos_dn01_` | `pos_dn01_secret_dev_key_2026` | `9b2c5d93b58848d1dadf255cc42023002be7ebb64ce024965409497adc956a7b` |

---

## 3. Mã giảm giá mẫu (Vouchers)

| Mã voucher | Loại giảm | Giá trị giảm | Điều kiện áp dụng | Hạn dùng |
| :---: | :---: | :---: | :--- | :---: |
| `WELCOME10` | Phần trăm (10%) | Tối đa 50.000đ | Mọi đơn hàng, 1 lần / khách | 365 ngày |
| `CINEMA30K` | Tiền mặt | 30.000đ | Đơn từ 150.000đ trở lên, tối đa 2 lần / khách | 180 ngày |
| `VIP50K` | Tiền mặt | 50.000đ | Đơn từ 200.000đ trở lên | 180 ngày |

---

## 4. Hướng dẫn áp dụng Seed trên máy phát triển (Local DB)

### Cách 1: Nạp trực tiếp qua Docker psql
```bash
docker exec -i supabase_db_filmbooking psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
```

### Cách 2: Khởi động lại cơ sở dữ liệu Supabase local
```bash
pnpm db:stop
pnpm db:start
```
*Lưu ý: Lệnh `pnpm db:start` của Supabase CLI sẽ tự động nạp `supabase/seed.sql` sau khi hoàn tất các migration.*

### Tính năng Idempotent:
Tệp `supabase/seed.sql` được thiết kế chuẩn **Idempotent 100%** bằng các UUID cố định và mệnh đề `ON CONFLICT (...) DO UPDATE` hoặc `DO NOTHING`. Bạn có thể chạy lại tệp này nhiều lần liên tiếp mà không gặp lỗi trùng lặp dữ liệu hay vi phạm ràng buộc unique/exclusion.
