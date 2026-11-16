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

## 2. Mã giảm giá mẫu (Vouchers)

| Mã voucher | Loại giảm | Giá trị giảm | Điều kiện áp dụng | Hạn dùng |
| :---: | :---: | :---: | :--- | :---: |
| `WELCOME10` | Phần trăm (10%) | Tối đa 50.000đ | Mọi đơn hàng, 1 lần / khách | 365 ngày |
| `CINEMA30K` | Tiền mặt | 30.000đ | Đơn từ 150.000đ trở lên, tối đa 2 lần / khách | 180 ngày |
| `VIP50K` | Tiền mặt | 50.000đ | Đơn từ 200.000đ trở lên | 180 ngày |

---

## 3. Hướng dẫn áp dụng Seed trên máy phát triển (Local DB)

`pnpm db:start` KHÔNG tự nạp seed (`[db.seed] enabled = false` trong `supabase/config.toml`, để pgTAP chạy trên DB sạch). Nạp seed chủ động:

```bash
pnpm db:start
pnpm db:seed:demo
```

`pnpm db:seed:demo` (`scripts/seed-demo.mjs`) chỉ chạy với DB loopback (mặc định `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, đổi bằng `SEED_DB_URL`; URL có query string, fragment (`#`) hoặc host khác bị từ chối, biến `PG*` bị bỏ qua). `seed.sql` cũng tự chặn nếu thiếu cờ `app.allow_demo_seed = on`, nên chạy psql tay phải thêm `-c "set app.allow_demo_seed = on"` trước `-f supabase/seed.sql`.

### Giới hạn Idempotent
Chạy lại nhiều lần trên cùng một DB local là an toàn trong trường hợp thông thường (UUID cố định, `ON CONFLICT ... DO UPDATE/DO NOTHING`), nhưng KHÔNG đảm bảo tuyệt đối:
- Suất chiếu "live" (mục 8.1) dùng `DO NOTHING`: chạy lại không dời giờ. Muốn có suất ON_SALE trong 2 giờ tới thì reset DB local rồi seed lại.
- Nếu bạn tạo suất qua UI trong phòng của seed ở đúng khung 09:30/14:00/19:30, chạy lại có thể vướng ràng buộc exclusion chống chồng giờ (`23P01`).
- DB local đã seed bằng bản cũ (trước khi công thức id suất 8.2 đổi sang giờ VN): reset DB local một lần bằng `supabase db reset --local` (`db:stop` + `db:start` KHÔNG xoá dữ liệu) rồi seed lại, nếu không id suất mới lệch id cũ và seed dừng vì `23P01`.

---

## 4. Seed đơn hàng demo (đơn `paid` + vé, rải ~30 ngày)

Dùng để báo cáo doanh thu / "Vé của tôi" có số liệu. Cần DB + API local đang chạy và đã nạp seed demo (suất chiếu, phim, rạp, voucher).

```bash
pnpm db:seed:orders                       # tới ~300 đơn (mặc định), rải 30 ngày gần đây
pnpm db:seed:orders --count 50 --days 14  # tuỳ chỉnh; --users N (số khách demo, tối đa 20), --seed N
pnpm db:seed:orders --reset-orders-demo   # xoá đúng các đơn do script này tạo
pnpm db:seed:orders --dry-run             # chỉ SELECT: mô phỏng chọn suất/ghế trong bộ nhớ, in số đơn xếp được, không ghi gì
```

Script dừng khi có >15 lỗi **liên tiếp** (lỗi lẻ được bỏ qua và thống kê cuối lần chạy). Đơn đã tạo luôn được lùi ngày (kể cả khi dừng vì lỗi/Ctrl+C); nếu tiến trình bị kill cứng, lần chạy sau tự lùi ngày các đơn demo còn mang mốc trong ~15 phút gần đây.

- `scripts/seed-orders-demo.mjs` chỉ chạy với DB loopback (cùng guard với seed demo; thêm kiểm `API_URL` phải là loopback). Không có `psql` thì tự dùng `docker exec` vào container `supabase_db_filmbooking` (đổi bằng `SEED_DB_CONTAINER`). Khoá local lấy từ `pnpm exec supabase status -o env` (hoặc `SEED_API_URL`/`SEED_ANON_KEY`/`SEED_SERVICE_ROLE_KEY`).
- Tạo `khach01..khach20@filmbooking.local` (mật khẩu `LocalDev@123!`, qua GoTrue Admin API, có ngày sinh người lớn); `customer@filmbooking.local` cũng có đơn (không dùng voucher để vẫn thử tay luồng voucher).
- Mỗi đơn đi qua RPC thật: `hold_seats` (JWT khách) -> (tuỳ chọn `apply_voucher`) -> `confirm_paid` (service role, mô phỏng webhook PayOS). Sau đó mới lùi `created_at/paid_at` (orders, order_seats, showtime_seat_states, tickets, payments, voucher_redemptions, email_outbox) bằng UPDATE với `session_replication_role = replica`. **Chỉ DB local.** `audit_logs` (append-only) giữ mốc thời gian thật.
- Đánh dấu đơn demo: `payments.transaction_ref LIKE 'DEMOSEED-%'`. `--count N` là **tổng** số đơn demo mong muốn: chạy lại chỉ bù phần thiếu (idempotent). `--reset-orders-demo` xoá đơn, vé, ghế, thanh toán, lượt voucher và dòng `email_outbox` của chúng; tài khoản khách demo được giữ.
- Giới hạn: suất chiếu chỉ ở tương lai (RPC cấm giữ ghế suất đã qua), nên đơn "quá khứ" đặt cho suất sắp chiếu; không có vé `checked_in` (check-in có cửa sổ thời gian theo suất). Mỗi suất lấp tối đa ~40% ghế. Dòng `email_outbox` `TICKET_ISSUED` giữ nguyên trạng thái `PENDING` như RPC sinh ra.
