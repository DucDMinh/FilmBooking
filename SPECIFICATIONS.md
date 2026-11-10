---
spec_version: 1.1.0
updated_at: 2026-11-10
source: docs/BRD.md v0.3 + brainstorm 2026-11-10 (.context/brainstorm-log.md)
---

# SPECIFICATIONS.md — Hệ thống Đặt vé Xem phim Online (Chuỗi rạp)

<!--
  File này được generate bởi /spec-init từ docs/BRD.md v0.3 (dự án greenfield — chưa có code).
  KHÔNG chỉnh sửa thủ công — thay đổi đi qua `/change` (agent change-request) và bump spec_version.
  BRD là tài liệu intent: spec này KHÔNG được đổi business rule cho khớp code.
-->

> **Nhãn nguồn:** `[derived from BRD]` — toàn bộ requirement dưới đây được dẫn xuất từ `docs/BRD.md` v0.3 (ngày 2026-11-10). Repo **chưa có app code**, nên traceability dùng **mã BRD** (`BR-<MODULE>-NN`, `AC-NN`, `NFR-NN`, `§mục`) thay cho `file:line`.
> Không bổ sung hành vi ngoài BRD. Chỗ BRD mơ hồ/mâu thuẫn → ghi ở § Điểm cần xác nhận, đánh dấu `[cần xác nhận]` tại requirement liên quan.

## Overview
<!-- Derived from BRD §0, §1, §2, §3, §5 -->

- **Sản phẩm:** website cho phép khách **chọn rạp trong chuỗi, xem lịch chiếu, chọn ghế, mua vé và thanh toán online** (BRD §1).
- **Quy mô:** một chuỗi rạp duy nhất (một thương hiệu), dự án **thử nghiệm / học tập**, deploy demo với **~5 rạp** dữ liệu mẫu; KPI/NFR tải là **tham chiếu thiết kế**, không phải cam kết vận hành (BRD §0, §1, §11.1).
- **Dữ liệu dùng chung toàn chuỗi:** danh mục phim, chính sách vé, điều khoản, ngày lễ, bảng giá mặc định, danh mục combo. **Dữ liệu theo rạp:** phòng, sơ đồ ghế, suất chiếu, ghi đè giá, bật/tắt + giá combo (BRD §11.1).
- **Đặt vé bắt buộc đăng nhập** (email đã xác nhận hoặc Google/Facebook); không có guest checkout (BRD §11.1, Q2).
- **Thanh toán:** PayOS (VietQR), **một tài khoản PayOS chung** toàn chuỗi, tách doanh thu theo `cinema_id` (BRD Q7, BR-PAY-12).
- **Chính sách:** không huỷ – không hoàn tiền; ngoại lệ duy nhất là rạp huỷ suất / đóng cửa (BRD §7).
- **POS tại quầy** là hệ thống riêng, đồng bộ khoá ghế với web qua API; web là **nguồn sự thật duy nhất** về trạng thái ghế; dự án cung cấp **POS giả lập** để demo (BRD §6.14, Q1).
- **Ngôn ngữ giao diện:** chỉ tiếng Việt (BRD §4.2). **Múi giờ:** Asia/Ho_Chi_Minh; **tiền tệ:** VND không phần thập phân (NFR-15).

### Vai trò người dùng (BRD §5.2)

| Vai trò | Phạm vi dữ liệu | Mô tả |
|---|---|---|
| Guest | Công khai | Xem phim, rạp, lịch chiếu, sơ đồ ghế (chỉ xem) |
| Customer (chưa xác nhận email) | Của chính mình | Như Guest + hồ sơ; **không được giữ ghế / đặt vé** |
| Customer | Của chính mình | Đã xác nhận email (hoặc OAuth có email đã xác minh); đặt vé ở mọi rạp |
| Staff | 1 hoặc nhiều rạp được gán | Soát vé, tra cứu vé — chỉ trong rạp được gán |
| Cinema Manager | 1 hoặc nhiều rạp được gán | Phòng, sơ đồ ghế, suất, giá, khoá ghế, nhân viên, báo cáo của rạp mình |
| Admin | Toàn chuỗi | Toàn quyền: phim, rạp, voucher, người dùng & vai trò, cấu hình, báo cáo toàn chuỗi |
| POS (hệ thống ngoài) | 1 rạp (theo khoá API) | Gọi API giữ / nhả / bán ghế các suất của rạp mình |

### Lộ trình & phase tag (BRD §15)

- `MVP` — các hạng mục BRD §15 dòng MVP và mọi BR không được §15 xếp vào Giai đoạn 2.
- `GĐ2` — combo bắp nước theo rạp; voucher theo phạm vi rạp; báo cáo đầy đủ + so sánh giữa các rạp + xuất CSV; dashboard; gợi ý rạp gần nhất; email nhắc lịch; file `.ics`.
- Giai đoạn 3 → § Ngoài phạm vi (không thành R-xx).
- Phase tag có hậu tố `[cần xác nhận]` = §15 không nêu tường minh, đã gán theo cách đọc hợp lý nhất (xem § Điểm cần xác nhận).

## Tech Stack
<!-- Derived from BRD §10 -->

| Hạng mục | Lựa chọn | Nguồn |
|---|---|---|
| Frontend | **Next.js** (App Router), **React**, **TypeScript** — chỉ UI; dữ liệu qua REST của Nest; Supabase Auth + Realtime trực tiếp ở client | §10 + brainstorm (đổi kiến trúc) |
| Backend | **NestJS** (TypeScript) — API nghiệp vụ, webhook PayOS, API POS, job endpoints, email; supabase-js mang JWT user (giữ RLS); service role chỉ cho webhook/job/POS | brainstorm 2026-11-10 (BRD v0.4 §10) |
| Repo | **pnpm monorepo**: `apps/web`, `apps/api`, `packages/shared`, `supabase/` | brainstorm |
| Auth | **Supabase Auth** — email/password + xác nhận email, OAuth Google, OAuth Facebook, identity linking | §10 |
| Database | **Supabase Postgres** + RLS (theo user và theo rạp được gán) + function/transaction cho giữ ghế | §10, NFR-04, NFR-05 |
| Realtime | **Supabase Realtime** cho trạng thái ghế, kênh theo suất chiếu | §10, NFR-03 |
| Lưu trữ file | **Supabase Storage** (poster, banner, ảnh rạp, avatar) | §10 |
| Tác vụ nền | **pg_cron** cho job thuần SQL (nhả ghế hết hạn, xoá tài khoản chưa xác nhận); **pg_cron + pg_net → Nest `/jobs/*`** cho job HTTP (email outbox, đối soát PayOS) | §10 + brainstorm |
| Thanh toán | **PayOS** — payment link, webhook có checksum, API truy vấn trạng thái | §10 |
| Email | SMTP riêng (vd **Resend**) cấu hình vào Supabase Auth + gửi email giao dịch; SPF/DKIM/DMARC | §10, NFR-10 |
| CAPTCHA | **Cloudflare Turnstile** (Supabase Auth hỗ trợ sẵn) | §10, BR-AUTH-07 |
| Bản đồ | **OpenStreetMap** (Leaflet) | §10 + brainstorm |
| Hosting | Web: **Vercel** · API Nest: **Render (free)** · CI: **GitHub Actions** | §10 + brainstorm |
| Giám sát | **Sentry** (free) gắn `cinema_id` — bật ở layer cuối | NFR-14 + brainstorm |

## Features

> Định dạng mỗi requirement: **Mã R** · tiêu đề · hành vi mong đợi (testable) · **nguồn BRD** (kèm MoSCoW từng mã: M = Must, S = Should, C = Could) · **phase**.
> Một mã BR có thể xuất hiện ở 2 R khi BR đó bị tách MVP / GĐ2 (hành vi không chồng lấn). Bảng tra ngược BR → R ở § Ma trận truy vết.

### 1. AUTH — Đăng ký, đăng nhập, xác nhận email, chống spam (BRD §6.1)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-01 | Đăng ký email + mật khẩu | Form đăng ký nhận **email + mật khẩu + họ tên**. Email duy nhất trong hệ thống, **so sánh không phân biệt hoa/thường** (đăng ký `A@x.com` khi đã có `a@x.com` → không tạo tài khoản mới). | BR-AUTH-01 (M) | M | MVP |
| R-02 | Chính sách mật khẩu | Mật khẩu **≥ 8 ký tự**, **≤ 72 ký tự**, bắt buộc có **chữ hoa, chữ thường và chữ số**; vi phạm → từ chối. Hiển thị **thanh độ mạnh mật khẩu**. | BR-AUTH-02 (M) | M | MVP |
| R-03 | Đồng ý điều khoản khi đăng ký | Bắt buộc tick đồng ý **Điều khoản sử dụng** và **Chính sách bảo mật**; chưa tick → không đăng ký được. Lưu **thời điểm + phiên bản điều khoản** đã đồng ý. | BR-AUTH-03 (M) | M | MVP |
| R-04 | Email xác nhận tài khoản | Sau đăng ký, tài khoản ở trạng thái **chưa xác nhận** và hệ thống gửi email chứa **link xác nhận dùng một lần**, **hết hạn sau 24 giờ**. Bấm link hợp lệ → tài khoản **đã xác nhận**; link đã dùng/hết hạn → không xác nhận được. | BR-AUTH-04 (M), §8.1 | M | MVP |
| R-05 | Chặn đặt vé khi chưa xác nhận email | Tài khoản chưa xác nhận **không được giữ ghế / đặt vé** (chặn ở server); giao diện hiển thị **banner nhắc xác nhận** + nút **"Gửi lại email"**. | BR-AUTH-05 (M) | M | MVP |
| R-06 | Gửi lại email xác nhận có giới hạn | Khoảng cách tối thiểu **60 giây** giữa 2 lần gửi; tối đa **5 lần/giờ** cho mỗi email. Trong 60 giây: nút vô hiệu kèm **đồng hồ đếm ngược**, không email nào được gửi thêm. | BR-AUTH-06 (M) | M | MVP |
| R-07 | CAPTCHA | CAPTCHA (Cloudflare Turnstile hoặc tương đương) **bắt buộc** ở form **đăng ký**, **quên mật khẩu**, và ở form **đăng nhập sau 3 lần sai liên tiếp**. | BR-AUTH-07 (M) | M | MVP |
| R-08 | Rate limit đăng ký / đăng nhập | Đăng ký: tối đa **5 tài khoản/IP/giờ**. Đăng nhập: tối đa **10 lần thử/IP/phút**. Vượt ngưỡng → từ chối. | BR-AUTH-08 (M) | M | MVP |
| R-09 | Chặn email dùng một lần | Từ chối đăng ký với email thuộc **danh sách đen domain disposable**; danh sách **cập nhật được** (không sửa code). | BR-AUTH-09 (S) | S | MVP |
| R-10 | Tự xoá tài khoản chưa xác nhận | Tài khoản **chưa xác nhận sau 7 ngày** bị **tự động xoá** (job nền) để giải phóng email. | BR-AUTH-10 (S), §8.1 | S | MVP |
| R-11 | Khoá đăng nhập sau 5 lần sai | Sai mật khẩu **5 lần liên tiếp** → khoá đăng nhập bằng mật khẩu cho tài khoản đó **15 phút** (kể cả nhập đúng trong 15 phút vẫn bị từ chối); gửi **email cảnh báo** cho chủ tài khoản. | BR-AUTH-11 (M) | M | MVP |
| R-12 | Không tiết lộ tồn tại email | Lỗi đăng nhập luôn là **"Email hoặc mật khẩu không đúng"**; quên mật khẩu luôn trả **"Nếu email tồn tại, chúng tôi đã gửi hướng dẫn"**; đăng ký trùng email → **thông báo chung**, không lộ thông tin (§8.1). | BR-AUTH-12 (M), §8.1 | M | MVP |
| R-13 | Quên mật khẩu | Gửi link đặt lại **hết hạn 1 giờ**, **dùng một lần**. Đặt lại thành công → **đăng xuất mọi phiên khác**. | BR-AUTH-13 (M) | M | MVP |
| R-14 | Đổi mật khẩu | Khi đã đăng nhập, đổi mật khẩu **yêu cầu nhập mật khẩu hiện tại**; sau khi đổi gửi **email thông báo**. | BR-AUTH-14 (M) | M | MVP |
| R-15 | Quản lý phiên | Trang hồ sơ có chức năng **"Đăng xuất khỏi mọi thiết bị"**. Phiên tồn tại tối đa **30 ngày** nếu chọn "Ghi nhớ đăng nhập", ngược lại **hết khi đóng trình duyệt**; token **tự gia hạn ngầm**. | BR-AUTH-15 (S), BR-AUTH-16 (S) | S | MVP |
| R-16 | Quay về đúng trang sau đăng nhập | Sau đăng nhập, khách quay lại đúng trang đang thao tác (vd đang chọn ghế → màn chọn ghế của **đúng suất** đó). | BR-AUTH-17 (M) | M | MVP |
| R-17 | Tài khoản nhân sự không tự đăng ký | Vai trò **Staff / Cinema Manager / Admin** chỉ do **Admin/Manager tạo hoặc nâng quyền**; luồng đăng ký công khai chỉ tạo Customer. | BR-AUTH-18 (M) | M | MVP |

### 2. SOCIAL — Đăng nhập & liên kết Google / Facebook (BRD §6.2)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-18 | Đăng nhập / đăng ký nhanh OAuth | Khách đăng nhập / đăng ký bằng **Google** và **Facebook** (OAuth). Chỉ yêu cầu quyền tối thiểu: **email, tên, ảnh đại diện**. Tài khoản MXH đã liên kết → đăng nhập đúng user đó (§8.2). | BR-SOC-01 (M), BR-SOC-02 (M), BR-SOC-11 (M), §8.2 | M | MVP |
| R-19 | Trạng thái xác nhận với tài khoản OAuth | Email đã được nhà cung cấp xác minh → tài khoản **coi như đã xác nhận**, đặt vé ngay. Facebook **không trả email** → bắt buộc khách **nhập email và xác nhận qua link** (như R-04) trước khi được đặt vé. | BR-SOC-03 (M), BR-SOC-04 (M) | M | MVP |
| R-20 | Trùng email không tự gộp | OAuth có email **trùng tài khoản đã có** → **không tạo tài khoản mới, không tự gộp**; hiển thị "Email này đã có tài khoản — hãy đăng nhập bằng phương thức cũ để liên kết". Khách đăng nhập tài khoản cũ thành công → liên kết MXH vào tài khoản cũ. | BR-SOC-05 (M), §8.2 | M | MVP |
| R-21 | Bảo mật & liên kết | Trang **Hồ sơ → Bảo mật & liên kết** liệt kê phương thức đang liên kết (Email/mật khẩu, Google, Facebook) với nút **Liên kết / Huỷ liên kết**. **Không cho huỷ liên kết phương thức cuối cùng** — từ chối và hướng dẫn thêm phương thức khác trước. | BR-SOC-06 (M), BR-SOC-07 (M) | M | MVP |
| R-22 | Thêm mật khẩu cho tài khoản OAuth | Tài khoản chỉ có Google/Facebook có thể **đặt mật khẩu lần đầu** để đăng nhập bằng email. | BR-SOC-08 (S) | S | MVP |
| R-23 | Một tài khoản MXH ↔ một user | Một tài khoản Google/Facebook chỉ liên kết với **tối đa 1** user; cố liên kết tài khoản MXH đã thuộc người khác → **báo lỗi**, không liên kết. | BR-SOC-09 (M) | M | MVP |
| R-24 | Email thông báo liên kết | Gửi email thông báo mỗi khi **liên kết hoặc huỷ liên kết** một phương thức đăng nhập. | BR-SOC-10 (S) | S | MVP |
| R-25 | Trang hướng dẫn xoá dữ liệu | Có trang công khai **Hướng dẫn xoá dữ liệu** (Data Deletion Instructions URL) theo yêu cầu Facebook App Review. | BR-SOC-12 (M) | M | MVP |

### 3. PROFILE — Hồ sơ khách hàng (BRD §6.3)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-26 | Xem / sửa hồ sơ | Khách xem/sửa: **họ tên, số điện thoại, ngày sinh, giới tính (tuỳ chọn), ảnh đại diện**. | BR-PRO-01 (M) | M | MVP |
| R-27 | Đổi email | Gửi link xác nhận tới **email mới**; email chỉ đổi **sau khi xác nhận**; gửi thông báo tới **email cũ**. | BR-PRO-02 (S) | S | MVP |
| R-28 | Ảnh đại diện | Chỉ nhận **JPG / PNG / WebP**, **≤ 2 MB**; ảnh được **tự resize**. | BR-PRO-03 (C) | C | MVP `[cần xác nhận]` |
| R-29 | Xoá tài khoản | Khách yêu cầu xoá → **cảnh báo vé chưa sử dụng sẽ mất hiệu lực** → xác nhận lại bằng **mật khẩu/OAuth** → **ẩn danh hoá dữ liệu cá nhân**; **giữ dữ liệu đơn hàng (ẩn danh)** phục vụ kế toán; vé chưa dùng mất hiệu lực. | BR-PRO-04 (M), NFR-08 | M | MVP |
| R-30 | Tuỳ chọn email khuyến mãi | Nhận email khuyến mãi là **opt-in, mặc định tắt**. Email giao dịch (vé, bảo mật) **luôn gửi** bất kể tuỳ chọn. | BR-PRO-05 (S) | S | MVP |
| R-31 | Rạp yêu thích | Khách chọn **một hoặc nhiều** rạp yêu thích; rạp yêu thích được **ưu tiên hiển thị** ở trang chủ và lịch chiếu. | BR-PRO-06 (S) | S | MVP |

### 4. CHAIN — Quản lý chuỗi rạp & chọn rạp (BRD §6.4)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-32 | Quản lý danh sách rạp | Admin CRUD rạp, mở/đóng rạp. Thông tin: tên, **mã rạp (ngắn, duy nhất — dùng trên vé)**, tỉnh/thành, quận/huyện, địa chỉ, toạ độ bản đồ, hotline, email, giờ mở cửa, ảnh, tiện ích, trạng thái **Đang hoạt động / Sắp khai trương / Tạm đóng / Ngừng hoạt động**. Cinema Manager chỉ **sửa thông tin rạp mình** (§5.3). | BR-CHN-01 (M), BR-ADM-02 (M), §5.3 | M | MVP |
| R-33 | Đóng cửa rạp | Rạp **Tạm đóng / Ngừng hoạt động** không hiển thị suất mới cho khách. Rạp còn suất **tương lai đã bán vé** → hệ thống **bắt buộc chạy huỷ hàng loạt các suất đó** (R-108, kèm email) **trước khi** cho đổi trạng thái rạp. | BR-CHN-02 (M), §7.3 | M | MVP |
| R-34 | Trang danh sách rạp cho khách | Rạp **nhóm theo tỉnh/thành**, có **bản đồ**, địa chỉ, hotline, nút **"Xem lịch chiếu"**. | BR-CHN-03 (M) | M | MVP |
| R-35 | Chọn tỉnh/thành | Khách chọn tỉnh/thành ở **header**; lựa chọn được **ghi nhớ** (trình duyệt + hồ sơ nếu đăng nhập) và **lọc mọi lịch chiếu** theo khu vực đó. Chưa chọn → hỏi chọn tỉnh/thành (§8.3). | BR-CHN-04 (M), §8.3 | M | MVP |
| R-36 | Gợi ý rạp gần nhất | Gợi ý rạp gần nhất theo vị trí thiết bị **chỉ khi khách cho phép định vị**; từ chối → dùng tỉnh/thành đã chọn. Toạ độ khách **chỉ dùng tại trình duyệt, không lưu** (NFR-08). | BR-CHN-05 (S), NFR-08 | S | GĐ2 |
| R-37 | Trang chi tiết rạp | Thông tin rạp + **lịch chiếu 7 ngày tới** của rạp, **nhóm theo phim**. | BR-CHN-06 (M) | M | MVP |
| R-38 | Mở rạp mới không cần sửa code | Tạo rạp → phòng → sơ đồ ghế → bảng giá → suất chiếu hoàn toàn qua trang quản trị; rạp mới **xuất hiện ở danh sách rạp và bán vé được ngay**, không cần deploy. | BR-CHN-07 (M), NFR-16 | M | MVP |
| R-39 | Gán rạp cho nhân sự | Mỗi Staff / Cinema Manager được **gán một hoặc nhiều rạp**; mọi màn quản trị của họ có **bộ chọn rạp chỉ liệt kê rạp được gán**. Quyền theo rạp thực thi ở **RLS + server**, không chỉ ẩn UI. | BR-CHN-08 (M), §5.3, NFR-05 | M | MVP |

### 5. MOVIE — Danh mục phim dùng chung toàn chuỗi (BRD §6.5)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-40 | Trang chủ | Banner phim nổi bật, tab **Đang chiếu** và **Sắp chiếu** theo khu vực đã chọn; phim "đang chiếu" = **có suất tại ít nhất một rạp trong khu vực**. | BR-MOV-01 (M) | M | MVP |
| R-41 | Quản lý thông tin phim | Admin CRUD phim (upload poster/banner lên storage, trạng thái hiển thị). Thông tin: tên VN + gốc, poster, banner, trailer (YouTube embed), mô tả, thể loại, thời lượng, đạo diễn, diễn viên, quốc gia, ngôn ngữ / phụ đề / lồng tiếng, ngày khởi chiếu, nhãn độ tuổi. Cinema Manager **không** quản lý phim. | BR-MOV-02 (M), BR-ADM-01 (M), §5.3 | M | MVP |
| R-42 | Nhãn phân loại độ tuổi | Nhãn thuộc tập **P, K, T13, T16, T18**; hiển thị ở **danh sách, chi tiết, màn chọn ghế và trên vé**. | BR-MOV-03 (M) | M | MVP |
| R-43 | Tìm kiếm & lọc phim | Tìm theo tên; lọc theo **thể loại, tỉnh/thành, rạp, ngày chiếu, định dạng (2D/3D)**. | BR-MOV-04 (S) | S | MVP |
| R-44 | Lịch chiếu trên chi tiết phim | Lịch **7 ngày tới**: chọn ngày → danh sách **các rạp có chiếu** (rạp yêu thích / gần nhất lên đầu) → các suất theo định dạng. | BR-MOV-05 (M) | M | MVP |
| R-45 | Phim sắp chiếu chưa có suất | Hiển thị **ngày khởi chiếu**, **không có nút đặt vé**. | BR-MOV-06 (M) | M | MVP |
| R-46 | SEO trang phim / rạp | Trang phim, trang rạp, lịch chiếu **render phía server (SSR/ISR)**, có meta title/description, **Open Graph**, sitemap, dữ liệu có cấu trúc schema.org `MovieTheater`, `ScreeningEvent`. | BR-MOV-07 (S), NFR-13 | S | MVP |

### 6. CINEMA — Phòng chiếu, sơ đồ ghế, suất chiếu, giá theo rạp (BRD §6.6)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-47 | Phòng chiếu | Mỗi phòng **thuộc đúng một rạp**. Cinema Manager (rạp mình) / Admin CRUD phòng: tên, định dạng hỗ trợ (2D/3D), trạng thái **hoạt động / bảo trì**; có **trình dựng sơ đồ ghế trực quan**. | BR-CIN-01 (M), BR-ADM-03 (M) | M | MVP |
| R-48 | Sơ đồ ghế | Lưới **hàng (A, B, C…) × cột**; mỗi ô là ghế **Thường**, **VIP**, **Đôi (Sweetbox — chiếm 2 ô, bán theo cặp)**, **lối đi**, hoặc **ghế hỏng/khoá**. Có thể **sao chép sơ đồ** từ phòng khác, **kể cả của rạp khác**. | BR-CIN-02 (M) | M | MVP |
| R-49 | Định nghĩa suất chiếu | Suất = rạp + phòng + phim + ngày giờ bắt đầu + định dạng + ngôn ngữ (phụ đề/lồng tiếng). **Giờ kết thúc = giờ bắt đầu + thời lượng phim + thời gian dọn phòng** (mặc định **15 phút**, cấu hình theo rạp). | BR-CIN-03 (M) | M | MVP |
| R-50 | Chặn suất chồng giờ | Không cho tạo suất **chồng giờ trong cùng phòng** (tính cả thời gian dọn phòng). Phòng khác / rạp khác cùng giờ → được phép. | BR-CIN-04 (M) | M | MVP |
| R-51 | Tạo suất đơn lẻ & hàng loạt | Tạo suất đơn lẻ và **hàng loạt** (một phim, nhiều ngày, nhiều khung giờ, nhiều phòng) **có kiểm tra trùng phòng**. Manager: rạp mình; **Admin tạo hàng loạt cho nhiều rạp** cùng lúc. | BR-ADM-04 (M) | M | MVP |
| R-52 | Bảng giá hai cấp | Admin đặt **bảng giá mặc định chuỗi** theo **loại ghế × định dạng × loại ngày (thường / cuối tuần / lễ) × khung giờ (trước 17h / sau 17h)**. Cinema Manager (rạp mình) / Admin **ghi đè giá theo rạp** và **theo từng suất**. Giá áp dụng = **ghi đè suất › ghi đè rạp › mặc định chuỗi**. | BR-CIN-05 (M), BR-ADM-05 (M — phần bảng giá), BR-ADM-06 (M — phần ghi đè giá) | M | MVP |
| R-53 | Ngày lễ | **Admin** quản lý danh sách ngày lễ **chung toàn chuỗi**; ngày lễ áp **giá loại ngày "lễ"** ở mọi rạp. | BR-CIN-06 (S), BR-ADM-05 (M — phần ngày lễ) | S / M | MVP |
| R-54 | Bảo vệ suất đã bán vé | Suất đã có vé bán ra **không được xoá, không được đổi giờ / phòng / phim**; chỉ được **đóng bán** (ngừng bán tiếp) hoặc **huỷ suất** (R-108). | BR-CIN-07 (M) | M | MVP |
| R-55 | Khoá ghế theo suất | Cinema Manager **khoá ghế** cho một suất của rạp mình (khách mời / ghế hỏng); ghế khoá hiển thị trạng thái **Khoá**, không bán được trên web và POS. | BR-CIN-08 (S) | S | MVP |
| R-56 | Cấu hình riêng của rạp | Cinema Manager (rạp mình) / Admin cấu hình cho rạp: **thời gian dọn phòng** và **mốc đóng bán online trước suất**; giá trị mặc định lấy từ cấu hình chuỗi (R-106). | BR-ADM-06 (M — phần cấu hình rạp) | M | MVP |
| R-57 | Giờ Việt Nam | Mọi thời gian suất chiếu hiển thị theo **Asia/Ho_Chi_Minh** ở mọi rạp (lưu UTC — NFR-15). | BR-CIN-10 (M), NFR-15 | M | MVP |
| R-58 | Combo bắp nước theo rạp | **Admin** định nghĩa **danh mục combo chung**; **mỗi rạp bật/tắt combo** và có thể **đặt giá riêng** (Cinema Manager rạp mình / Admin). | BR-CIN-09 (S), BR-ADM-05 (M — phần combo), BR-ADM-06 (M — phần combo theo rạp) | S / M | GĐ2 |

### 7. BOOKING — Đặt vé & giữ ghế (BRD §6.7)

> Luồng chính: chọn khu vực → chọn phim rồi rạp (hoặc rạp rồi phim) → ngày & suất → ghế → combo (GĐ2) → voucher → tóm tắt + cảnh báo không huỷ/không hoàn → xác nhận → PayOS → vé QR (BRD §6.7, §8.3, §8.4).

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-59 | Trạng thái ghế trên sơ đồ | Hiển thị 5 trạng thái: **Trống**, **Đang được giữ** (bởi khách web khác **hoặc** POS — khách không phân biệt nguồn), **Đã bán** (web hoặc POS), **Đang chọn** (của tôi), **Khoá**; có chú thích màu và **giá theo loại ghế**. Có dòng nhắc ngắn chính sách không hoàn ở màn này (§7.2). | BR-BKG-01 (M), §7.2 | M | MVP |
| R-60 | Cập nhật realtime | Trạng thái ghế cập nhật **realtime** cho mọi người đang xem cùng suất, **không tải lại trang**, độ trễ **≤ 2 giây**; kênh realtime **tách theo suất**. | BR-BKG-02 (M), NFR-03 | M | MVP |
| R-61 | Giữ ghế 10 phút | Bấm "Tiếp tục" sau khi chọn ghế → hệ thống **giữ ghế 10 phút**; **đồng hồ đếm ngược** hiển thị trên mọi bước tiếp theo. | BR-BKG-03 (M) | M | MVP |
| R-62 | Giữ ghế nguyên tử | Giữ ghế là **atomic**: bất kỳ ghế nào trong lựa chọn đã bị giữ/bán → **toàn bộ yêu cầu thất bại**, báo **ghế nào bị trùng**. Hai yêu cầu đồng thời cùng ghế → **chỉ một thành công**. Ràng buộc **ở tầng database** (unique/khoá + transaction). | BR-BKG-04 (M), NFR-04 | M | MVP |
| R-63 | Hết hạn giữ ghế | Hết **10 phút** chưa thanh toán thành công → **tự động nhả ghế** (ghế về Trống cho người khác trong ≤ 2 giây), đơn → `expired`, khách được đưa về màn chọn ghế kèm thông báo. | BR-BKG-05 (M) | M | MVP |
| R-64 | Một đơn giữ / khách | Mỗi khách chỉ có **1 đơn đang giữ ghế** trên **toàn chuỗi**; tạo đơn mới → **huỷ đơn giữ cũ** (nhả ghế, đơn cũ `cancelled`). | BR-BKG-06 (M), §8.5 | M | MVP |
| R-65 | Giới hạn đơn | Mỗi đơn thuộc **đúng một suất** (do đó một rạp). Tối đa **8 ghế/đơn**; **ghế đôi tính 2 ghế**. | BR-BKG-07 (M) | M | MVP |
| R-66 | Không để ghế lẻ | Không để trống **1 ghế lẻ** giữa các ghế đã chọn/đã bán hoặc giữa ghế đã chọn và lối đi/tường (trừ khi sơ đồ không còn cách chọn khác). Vi phạm → **báo và chặn bước tiếp**. | BR-BKG-08 (S) | S | MVP |
| R-67 | Đóng bán online trước suất | Đóng bán online **15 phút trước giờ chiếu** (mặc định chuỗi; Cinema Manager cấu hình cho rạp mình). Sau mốc: suất hiển thị **"Ngừng bán online — vui lòng mua tại quầy"**, không giữ ghế được trên web. | BR-BKG-09 (M) | M | MVP |
| R-68 | Kiểm tra độ tuổi | Phim **T13/T16/T18**: hiển thị cảnh báo độ tuổi; khách phải tick **"Tất cả người xem đủ tuổi theo quy định"**; cảnh báo nêu rõ nhân viên **có quyền yêu cầu giấy tờ và từ chối vào phòng — vé không được hoàn**. Ngày sinh trong hồ sơ cho thấy khách **chưa đủ tuổi → chặn đặt vé**. | BR-BKG-10 (M) | M | MVP |
| R-69 | Bước chọn combo | Chỉ hiển thị combo **đang bật tại rạp của suất**; chọn số lượng; hiển thị ảnh, mô tả, giá. Combo nhận tại quầy **đúng rạp** bằng QR của vé. | BR-BKG-11 (S) | S | GĐ2 |
| R-70 | Màn tóm tắt đơn | Hiển thị **tên + địa chỉ rạp (nổi bật)**, phim, nhãn tuổi, suất, phòng, danh sách ghế, combo, tạm tính, giảm giá, **tổng tiền**. | BR-BKG-12 (M) | M | MVP |
| R-71 | Xác nhận không huỷ / không hoàn | Trước khi sang thanh toán hiển thị **hộp thoại cảnh báo** nhắc rõ **tên rạp + giờ chiếu**; nút **"Thanh toán" chỉ bật khi tick checkbox** xác nhận. Lưu **bằng chứng đồng ý** (thời điểm, nội dung/phiên bản điều khoản, user, đơn, IP — §7.2). | BR-BKG-13 (M), §7.2 | M | MVP |
| R-72 | Chốt giá khi giữ ghế | Giá trong đơn **chốt tại thời điểm giữ ghế**; thay đổi bảng giá sau đó **không ảnh hưởng** đơn đang giữ. | BR-BKG-14 (M) | M | MVP |

### 8. PAYMENT — Thanh toán PayOS (BRD §6.8)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-73 | Tạo payment link | Tạo payment link PayOS với **`orderCode` số duy nhất**, số tiền, **mô tả chứa mã rạp + mã đặt vé**, `returnUrl`, `cancelUrl`; khách quét **VietQR** / chuyển khoản. **Thời hạn link = thời gian giữ ghế còn lại** (không vượt mốc hết hạn giữ). Đơn → `pending_payment`. | BR-PAY-01 (M), BR-PAY-02 (M), §8.5 | M | MVP |
| R-74 | Xác nhận chỉ qua webhook / truy vấn server | Thanh toán chỉ được xác nhận dựa trên **webhook PayOS** hoặc **truy vấn trạng thái từ server**; **không tin tham số `returnUrl`**. Webhook **kiểm tra chữ ký (checksum key)**; sai chữ ký → **bỏ qua, đơn không đổi trạng thái, ghi log cảnh báo**. | BR-PAY-03 (M) | M | MVP |
| R-75 | Webhook idempotent + đối chiếu số tiền | Cùng một giao dịch gửi nhiều lần → **chỉ ghi nhận một lần** (chỉ 1 email vé). Kiểm tra **số tiền nhận = tổng tiền đơn**; lệch → không xác nhận đơn (vào đối soát — R-116, R-134). | BR-PAY-04 (M), §7.3 | M | MVP |
| R-76 | Thanh toán thành công | Đơn → `paid`, ghế → **sold**, sinh **vé QR**, gửi **email vé trong ≤ 1 phút**. | BR-PAY-05 (M) | M | MVP |
| R-77 | Huỷ / hết hạn trên PayOS | Khách bấm huỷ trên trang PayOS → đơn `cancelled`; link hết hạn → `expired`; **nhả ghế ngay**. | BR-PAY-06 (M) | M | MVP |
| R-78 | Thanh toán đến muộn | Tiền về sau khi giữ ghế hết hạn: ghế **vẫn trống** → **tự động chốt bán** (`expired → paid`); ghế **đã bán cho người khác** → đơn `needs_manual_review`, **báo Admin + Cinema Manager của rạp đó**, **email khách hướng dẫn liên hệ rạp**. | BR-PAY-07 (M), §8.5, §7.3 | M | MVP |
| R-79 | Màn đang xác nhận thanh toán | Quay về `returnUrl` → màn **"Đang xác nhận thanh toán"** **polling** trạng thái tới khi có kết quả; không bắt khách bấm lại. | BR-PAY-08 (M) | M | MVP |
| R-80 | Job đối soát PayOS | Job định kỳ (vd **mỗi 5 phút**) truy vấn PayOS các đơn `pending` quá hạn để phát hiện **webhook bị lỡ** và cập nhật trạng thái. | BR-PAY-09 (M) | M | MVP |
| R-81 | Không lưu dữ liệu thẻ / tài khoản | **Không lưu** thông tin tài khoản ngân hàng / thẻ của khách; chỉ lưu **mã giao dịch, số tiền, thời điểm, trạng thái** từ PayOS. | BR-PAY-10 (M) | M | MVP |
| R-82 | Đơn 0đ | Đơn có tổng tiền **= 0đ** (voucher giảm 100%) → **bỏ qua PayOS**, chốt đơn trực tiếp (`paid`). | BR-PAY-11 (C) | C | MVP `[cần xác nhận]` |
| R-83 | PayOS chung, tách theo rạp | **Một tài khoản PayOS** cho toàn chuỗi; **mọi đơn và giao dịch gắn `cinema_id`** để tách doanh thu và đối soát theo rạp. | BR-PAY-12 (M) | M | MVP |
| R-84 | PayOS môi trường demo | Dùng PayOS thật với **số tiền nhỏ** (vd giá vé demo **2.000–10.000đ**) hoặc môi trường thử nghiệm nếu có; **khoá PayOS khác nhau** giữa dev và bản deploy demo. | BR-PAY-13 (S) | S | MVP |

### 9. TICKET — Vé điện tử & thông báo (BRD §6.9)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-85 | Mã đặt vé & QR | Mỗi đơn đã thanh toán có **mã đặt vé** ngắn, dễ đọc, **có tiền tố mã rạp** (vd `HN01-7K3P9Q`), và **mã QR** chứa **token ngẫu nhiên không đoán được**, **không chứa thông tin cá nhân**. | BR-TKT-01 (M) | M | MVP |
| R-86 | Email vé | Email gồm: mã đặt vé, QR, **tên rạp + địa chỉ + link bản đồ + hotline rạp**, phim, nhãn tuổi, suất, phòng, ghế, combo, tổng tiền, lưu ý (**đến trước 15 phút**, **vé chỉ dùng tại rạp ghi trên vé**, **vé không huỷ/không hoàn**, yêu cầu giấy tờ với phim T13+). | BR-TKT-02 (M), §7.2 | M | MVP |
| R-87 | Trang "Vé của tôi" | Tab **Sắp tới / Đã xem**; hiển thị rõ rạp; xem lại QR (**tăng độ sáng màn hình tối đa** khi mở QR); trang chi tiết vé nhắc lại chính sách không huỷ/không hoàn (§7.2). Customer chưa xác nhận thấy danh sách rỗng (§5.3). | BR-TKT-03 (M), §7.2, §5.3 | M | MVP |
| R-88 | Email nhắc lịch | Gửi email nhắc **2 giờ trước giờ chiếu**, kèm địa chỉ rạp. | BR-TKT-04 (C) | C | GĐ2 |
| R-89 | Thêm vào lịch | Nút **"Thêm vào lịch"** tải file **`.ics`**, địa điểm = **địa chỉ rạp**. | BR-TKT-05 (C) | C | GĐ2 |

### 10. PROMO — Mã giảm giá (BRD §6.10)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-90 | Tạo & quản lý voucher (lõi) | **Chỉ Admin** tạo/quản lý voucher (Cinema Manager **chỉ xem** — §5.3, Q8). Thuộc tính: mã, loại giảm (**%** có **trần tối đa** / **số tiền cố định**), áp dụng cho (**vé / combo / cả đơn**), thời gian hiệu lực, giá trị đơn tối thiểu, tổng lượt dùng, lượt dùng mỗi khách, phim / khung giờ áp dụng (tuỳ chọn). Voucher lõi áp dụng toàn chuỗi. | BR-PRM-01 (M — phần lõi), BR-ADM-05 (M — phần voucher), §5.3 | M | MVP `[cần xác nhận]` |
| R-91 | Voucher theo phạm vi rạp | Voucher có **phạm vi rạp: toàn chuỗi / danh sách rạp / tỉnh-thành**. Nhập voucher cho đơn tại rạp ngoài phạm vi → báo **"Mã không áp dụng tại rạp này"**. | BR-PRM-01 (M — phần phạm vi rạp), BR-PRM-04 (M — lỗi "không áp dụng tại rạp này") | M | GĐ2 |
| R-92 | Tối đa 1 voucher / đơn | Mỗi đơn áp **tối đa 1 voucher**. | BR-PRM-02 (M) | M | MVP `[cần xác nhận]` |
| R-93 | Giữ & hoàn lượt dùng | Lượt dùng voucher **giữ cùng đơn** trong thời gian giữ ghế; **hoàn lại lượt** nếu đơn hết hạn/huỷ trước khi thanh toán. Đếm lượt **chống race condition** (dùng đồng thời ở nhiều rạp không vượt tổng lượt). | BR-PRM-03 (M) | M | MVP `[cần xác nhận]` |
| R-94 | Thông báo lỗi voucher | Lỗi phân biệt rõ: **không tồn tại**, **hết hạn**, **hết lượt**, **chưa đủ giá trị đơn**, **không áp dụng cho suất này**. (Lỗi "không áp dụng tại rạp này" thuộc R-91.) | BR-PRM-04 (M — trừ phần rạp) | M | MVP `[cần xác nhận]` |
| R-95 | Rate limit nhập voucher | Tối đa **10 lần nhập/phút/khách**; vượt → từ chối (chống dò mã). | BR-PRM-05 (S) | S | MVP `[cần xác nhận]` |
| R-96 | Báo cáo voucher theo rạp | Thống kê voucher: **số lượt dùng, tổng tiền giảm**, **tách theo từng rạp** (phân bổ chi phí khuyến mãi). | BR-PRM-06 (S), BR-RPT-05 (S) | S | GĐ2 |

### 11. CHECKIN — Soát vé (BRD §6.11)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-97 | Màn soát vé | Staff đăng nhập web trên điện thoại, **chọn rạp đang làm việc** (nếu gán nhiều rạp), mở màn **Soát vé**, quét QR bằng camera hoặc **nhập mã đặt vé thủ công**. Cinema Manager (rạp mình) và Admin cũng được soát (§5.3). | BR-CHK-01 (M), §5.3 | M | MVP |
| R-98 | Kết quả soát vé | Kết quả màu rõ ràng: ✅ **Hợp lệ** (phim, suất, phòng, ghế, combo, nhãn tuổi); ❌ **Đã sử dụng** (kèm **thời điểm + người soát lần trước**); ❌ **Sai rạp** (tên + địa chỉ rạp đúng); ❌ **Sai suất / chưa tới giờ / suất đã kết thúc**; ❌ **Không tồn tại / chưa thanh toán**. | BR-CHK-02 (M) | M | MVP |
| R-99 | Quy tắc check-in | Mỗi vé **check-in một lần**, **chỉ tại rạp của suất**, trong cửa sổ **từ 30 phút trước giờ chiếu đến giờ kết thúc phim**. Check-in thành công → đơn `checked_in`. Vé của suất bị huỷ (`affected`) không check-in được. | BR-CHK-03 (M), BR-ADM-12, §8.5 | M | MVP |
| R-100 | Đánh dấu đã nhận combo | Đánh dấu riêng **đã nhận combo** tại quầy bắp nước **của đúng rạp**. | BR-CHK-04 (S) | S | GĐ2 |
| R-101 | Log lượt quét | Ghi log **mọi lượt quét**: staff, rạp, thời điểm, kết quả. | BR-CHK-05 (M) | M | MVP |
| R-102 | Không lộ dữ liệu vé rạp khác | Staff **không xem được chi tiết** (tên khách, ghế…) vé thuộc rạp khác; màn "Sai rạp" **chỉ hiển thị tên và địa chỉ rạp đúng**; vé **không bị đánh dấu check-in**. | BR-CHK-06 (M) | M | MVP |

### 12. ADMIN — Quản trị Admin chuỗi & Cinema Manager (BRD §6.12)

> Các BR quản trị đã gộp vào module nghiệp vụ tương ứng: BR-ADM-01 → R-41; BR-ADM-02 → R-32; BR-ADM-03 → R-47; BR-ADM-04 → R-51; BR-ADM-05 → R-52/R-53/R-58/R-90; BR-ADM-06 → R-52/R-56/R-58.

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-103 | Tra cứu đơn hàng | Tra cứu theo **mã đặt vé, email, SĐT, mã giao dịch PayOS**; xem chi tiết + **lịch sử trạng thái**. Staff/Manager: chỉ rạp mình (Staff **chỉ đọc** — §5.3); Admin: toàn chuỗi. | BR-ADM-07 (M), §5.3 | M | MVP |
| R-104 | Xử lý đơn cần xem xét thủ công | Danh sách đơn `needs_manual_review` (Manager rạp mình / Admin); ghi chú cách xử lý, **đánh dấu đã giải quyết**. | BR-ADM-08 (M), §7.3 | M | MVP |
| R-105 | Quản lý người dùng & vai trò | Admin: tìm kiếm, **khoá/mở khoá**, gán vai trò **Staff / Cinema Manager / Admin** và **gán rạp**. Cinema Manager **chỉ thêm/bớt Staff cho rạp mình**, không gán vai trò khác. | BR-ADM-09 (M), §5.3 | M | MVP |
| R-106 | Cấu hình toàn chuỗi | Admin cấu hình: **thời gian giữ ghế**, **nội dung cảnh báo không hoàn tiền**, **điều khoản sử dụng**, giá trị mặc định cho cấu hình rạp. Cinema Manager **không** được cấu hình chính sách khác (§7.1). | BR-ADM-10 (S), §7.1 | S | MVP |
| R-107 | Audit log | Ghi audit **mọi thao tác thay đổi dữ liệu** của Admin / Manager / Staff / POS: **ai, rạp nào, khi nào, đối tượng, giá trị trước/sau**. | BR-ADM-11 (M) | M | MVP |
| R-108 | Huỷ suất chiếu | Chọn **một / nhiều suất** (hoặc **tất cả suất tương lai của một rạp** khi đóng cửa), **nhập lý do** → **xem trước số đơn/vé bị ảnh hưởng** → xác nhận. Kết quả: suất `cancelled`, **ngừng bán trên web và POS**, ghế đang giữ bị nhả, mọi đơn `paid` của suất → `affected`, vé **không check-in được**. Manager rạp mình / Admin. | BR-ADM-12 (M), §7.3 | M | MVP |
| R-109 | Email thông báo hàng loạt | Tự động gửi email tới **mọi khách có đơn `affected`**: tên rạp, phim, suất bị huỷ, lý do, hướng xử lý (**huỷ suất**: mang mã đặt vé tới quầy để đổi suất, hoặc liên hệ rạp để hoàn tiền nếu đồng ý; **đóng cửa rạp**: rạp sẽ liên hệ hoàn tiền thủ công), hotline rạp. **Theo dõi trạng thái gửi từng email**, cho phép **gửi lại** email lỗi. | BR-ADM-13 (M) | M | MVP |
| R-110 | Màn Đơn bị ảnh hưởng | Danh sách đơn `affected` theo suất/rạp, lọc theo trạng thái xử lý, hiển thị trạng thái gửi email. Ghi nhận từng đơn: **Đã đổi suất** (suất mới / mã vé mới cấp tại quầy) → `exchanged`; **Đã hoàn tiền thủ công** (**bắt buộc**: số tiền, ngày, phương thức, **mã giao dịch ngân hàng**, người thực hiện — thiếu → chặn lưu) → `refunded_manual`. **Xuất CSV**. Staff/Manager rạp mình, Admin. | BR-ADM-14 (M), §7.3 | M | MVP |
| R-111 | Khoá API POS | Admin quản lý **khoá API POS cho từng rạp**: tạo, **chỉ xem toàn bộ lần đầu**, thu hồi, xoay khoá; xem **nhật ký gọi API** của POS. | BR-ADM-15 (M) | M | MVP |

### 13. REPORT — Báo cáo (BRD §6.13)

> Phạm vi dữ liệu: Cinema Manager chỉ thấy rạp mình; Admin thấy toàn chuỗi (§5.3). BR-RPT-05 gộp vào R-96.

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-112 | Doanh thu theo kỳ | Doanh thu theo **ngày / tuần / tháng**; tách **vé và combo**; **trước và sau giảm giá**; lọc **theo rạp** hoặc **toàn chuỗi**. | BR-RPT-01 (M) | M | MVP `[cần xác nhận]` |
| R-113 | Doanh thu theo phim / suất / rạp | Doanh thu và **số vé** theo **phim**, theo **suất**, theo **rạp**. | BR-RPT-02 (M) | M | MVP `[cần xác nhận]` |
| R-114 | Tỷ lệ lấp đầy | Tỷ lệ lấp đầy theo **suất, phòng, khung giờ, rạp**. | BR-RPT-03 (S) | S | GĐ2 |
| R-115 | So sánh giữa các rạp | Bảng xếp hạng **doanh thu, lấp đầy, số vé** giữa các rạp — **chỉ Admin**. | BR-RPT-04 (S) | S | GĐ2 |
| R-116 | Đối soát PayOS | Danh sách giao dịch PayOS, **đơn lệch trạng thái/số tiền**, tổng tiền **theo rạp**. | BR-RPT-06 (M), §7.3 | M | MVP `[cần xác nhận]` |
| R-117 | Xuất báo cáo CSV | Mọi báo cáo xuất được ra **CSV**. | BR-RPT-07 (S) | S | GĐ2 |
| R-118 | Dashboard tổng quan | Doanh thu hôm nay, số vé hôm nay, suất sắp chiếu, số tài khoản mới — Manager thấy rạp mình; Admin thấy toàn chuỗi + từng rạp. | BR-RPT-08 (C) | C | GĐ2 |
| R-119 | Báo cáo kênh bán & suất bị huỷ | Tách **kênh Web / POS** (số ghế, theo dữ liệu POS báo về); báo cáo **suất bị huỷ**: số đơn ảnh hưởng, số đã đổi suất, số đã hoàn tiền, **tổng tiền hoàn thủ công**. | BR-RPT-09 (S) | S | GĐ2 `[cần xác nhận]` |

### 14. POS — Đồng bộ khoá ghế với quầy vé (BRD §6.14)

> Web là **nguồn sự thật duy nhất** về trạng thái ghế; ghế đang bị một bên thao tác thì bên còn lại không thao tác được.

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-120 | API cho POS theo rạp | API xác thực bằng **khoá API riêng của từng rạp**, chỉ truy cập suất của rạp đó: lấy danh sách suất, sơ đồ + trạng thái ghế, **giữ ghế**, **nhả ghế**, **xác nhận bán**, tra cứu / soát vé bằng mã đặt vé. Khoá rạp A gọi suất rạp B → **từ chối (403)**. | BR-POS-01 (M) | M | MVP |
| R-121 | POS giữ ghế → web thấy ngay | Nhân viên chọn ghế trên POS → POS gọi giữ ghế ngay; ghế chuyển **"Đang được giữ"** trên web trong **≤ 2 giây**, khách web **không chọn được**. | BR-POS-02 (M) | M | MVP |
| R-122 | Web giữ/bán → POS không khả dụng | Ghế đang được giữ / đã bán trên web → API trả **không khả dụng**; POS không chọn được. | BR-POS-03 (M) | M | MVP |
| R-123 | Cơ chế nguyên tử chung | Giữ ghế từ POS dùng **cùng cơ chế nguyên tử** với web (R-62); web và POS tranh cùng ghế đồng thời → **chỉ một bên thành công**. | BR-POS-04 (M) | M | MVP |
| R-124 | Thời hạn giữ ghế POS | Giữ từ POS **5 phút** (cấu hình được), hết hạn **tự nhả** (ghế về Trống trên cả web và POS); POS **gia hạn** được khi nhân viên còn thao tác; nhân viên huỷ thao tác → POS **gọi nhả ngay**. | BR-POS-05 (M) | M | MVP |
| R-125 | Xác nhận bán từ POS | POS xác nhận bán (sau khi thu tiền tại quầy) → ghế **Đã bán**; hệ thống ghi **đơn kênh `POS`** (mã đặt vé, ghế, tổng tiền POS báo, nhân viên) cho báo cáo và soát vé. Đơn POS **không đi qua PayOS**. | BR-POS-06 (M) | M | MVP |
| R-126 | API POS idempotent | Mỗi thao tác có **`requestId`**; gọi lặp cùng `requestId` **không tạo giữ/bán trùng**. | BR-POS-07 (M) | M | MVP |
| R-127 | Từ chối suất huỷ / ngừng bán | Suất bị huỷ / ngừng bán → API **từ chối** giữ/bán mới cho suất đó. | BR-POS-08 (M) | M | MVP |
| R-128 | Không bán offline | Mất kết nối với web → POS **không được bán** ghế chưa giữ thành công (không có chế độ bán offline). | BR-POS-09 (M) | M | MVP |
| R-129 | POS giả lập | Trang web nội bộ đơn giản cho vai trò **Staff**: chọn suất, chọn ghế (gọi API giữ), xác nhận bán, in mã đặt vé — dùng demo và kiểm thử đồng bộ hai chiều. | BR-POS-10 (M) | M | MVP |
| R-130 | Log & rate limit API POS | Ghi log **mọi lời gọi API POS** (rạp, khoá API, thao tác, kết quả, thời điểm); **rate limit theo khoá API**. | BR-POS-11 (M) | M | MVP |

### 15. POLICY — Chính sách Không huỷ – Không hoàn tiền (BRD §7)

| Mã | Tiêu đề | Hành vi mong đợi | Nguồn BRD | Ưu tiên | Phase |
|---|---|---|---|:-:|:-:|
| R-131 | Không huỷ / không hoàn cho khách | Áp dụng **thống nhất mọi rạp**; Cinema Manager **không cấu hình khác**. Vé đã thanh toán: khách **không thể tự huỷ, đổi suất, đổi ghế, đổi rạp, yêu cầu hoàn tiền**. Hệ thống **không có** chức năng huỷ vé cho khách và **không có** luồng hoàn tiền tự động. | §7.1, §4.2 | M | MVP |
| R-132 | Vé chỉ dùng tại rạp ghi trên vé | Vé **chỉ có giá trị tại rạp ghi trên vé**. Khách đến nhầm rạp → Staff thấy "Sai rạp" kèm địa chỉ rạp đúng; **không đổi vé, không hoàn tiền**. | §7.1, §7.3, BR-CHK-02 | M | MVP |
| R-133 | Cảnh báo nhiều lớp | Chính sách hiển thị ở: (1) **Điều khoản sử dụng** (đồng ý khi đăng ký); (2) **dòng nhắc ở màn chọn ghế**; (3) **hộp thoại xác nhận** trước thanh toán với nội dung chứa **{Tên rạp} – {Địa chỉ}**, **suất {giờ} ngày {ngày}**, không huỷ/đổi/hoàn (trừ rạp huỷ suất), chỉ dùng tại rạp này, cảnh báo T13/T16/T18 + checkbox "Tôi đã đọc và đồng ý"; (4) nút **Thanh toán chỉ bật khi tick**; (5) nhắc lại trong **email vé** và **trang chi tiết vé**; (6) lưu **bằng chứng đồng ý** từng đơn (**thời điểm, phiên bản nội dung, user, IP**). | §7.2, BR-BKG-13 | M | MVP |
| R-134 | Ngoại lệ & hoàn tiền thủ công | Ngoại lệ duy nhất: **rạp huỷ suất** (khách chọn đổi suất tại quầy hoặc hoàn tiền thủ công nếu đồng ý) / **rạp đóng cửa** (hoàn tiền thủ công toàn bộ đơn suất tương lai). Hoàn tiền luôn **thủ công ngoài hệ thống**; hệ thống chỉ **ghi nhận** để đối soát, **không gọi API hoàn tiền PayOS**. Khách chuyển **sai số tiền** → đơn **không được xác nhận**, giao dịch xuất hiện trong **báo cáo đối soát**. | §7.1, §7.3 | M | MVP |

> Ghi chú ưu tiên: BRD §7 **không gắn mã MoSCoW**. R-131…R-134 được gán `M` vì §7.1 phát biểu dưới dạng nguyên tắc áp dụng thống nhất và §7.2 ghi rõ "bắt buộc".

### Vòng đời đơn hàng (BRD §8.5) — dạng kiểm thử được

| Từ | Sang | Điều kiện | R liên quan |
|---|---|---|---|
| (mới) | `holding` | Giữ ghế thành công (atomic, 10 phút) | R-61, R-62 |
| `holding` | `pending_payment` | Tạo payment link PayOS | R-73 |
| `holding` | `expired` | Hết 10 phút | R-63 |
| `holding` | `cancelled` | Khách bỏ / tạo đơn mới | R-64 |
| `pending_payment` | `paid` | Webhook thành công (chữ ký đúng, số tiền khớp) | R-74, R-75, R-76 |
| `pending_payment` | `cancelled` | Khách huỷ trên PayOS | R-77 |
| `pending_payment` | `expired` | Link / giữ ghế hết hạn | R-77 |
| `expired` | `paid` | Tiền về muộn, ghế còn trống | R-78 |
| `expired` | `needs_manual_review` | Tiền về muộn, ghế đã bán | R-78 |
| `paid` | `checked_in` | Soát vé tại đúng rạp, đúng cửa sổ thời gian | R-99 |
| `paid` | (kết thúc) | Suất kết thúc, không check-in | — |
| `paid` | `affected` | Rạp huỷ suất / đóng cửa | R-108, R-33 |
| `affected` | `exchanged` | Ghi nhận đổi suất tại quầy | R-110 |
| `affected` | `refunded_manual` | Ghi nhận hoàn tiền thủ công (đủ trường bắt buộc) | R-110 |
| `needs_manual_review` | (kết thúc) | Manager/Admin đánh dấu đã giải quyết | R-104 |

- Trạng thái cuối: `checked_in`, `exchanged`, `refunded_manual`, `needs_manual_review` (sau khi giải quyết), `paid` sau suất kết thúc, `cancelled` (BRD chưa định nghĩa luồng tiền về sau khi huỷ — xem § Điểm cần xác nhận #10).
- `expired` **không phải** trạng thái cuối tuyệt đối: còn có thể sang `paid` / `needs_manual_review` khi tiền về muộn (R-78).
- **Không có** chuyển trạng thái nào do khách khởi tạo từ `paid` (không huỷ, không hoàn — R-131).
- Trạng thái ghế liên quan: Trống ↔ Đang được giữ (web/POS) → Đã bán; Khoá (do Manager). Đơn kênh POS: xem § Điểm cần xác nhận.

### Ngoài phạm vi (không thành R-xx)

**BRD §4.2 — giai đoạn hiện tại:**
- Nhiều thương hiệu / nhiều chuỗi trên cùng hệ thống (multi-tenant).
- Khách tự huỷ vé, đổi vé, đổi rạp; hoàn tiền **tự động** qua PayOS.
- Ứng dụng mobile native (iOS/Android).
- Phần mềm **POS thật** tại quầy (chỉ cung cấp API khoá ghế + POS giả lập).
- Hoá đơn điện tử (VAT) (Q4).
- Phân loại giá theo đối tượng (HSSV, U22, người cao tuổi…) (Q5).
- Vận hành production thật (SLA, trực sự cố, khách hàng thật).
- Chương trình tích điểm / hạng thành viên.
- Đa ngôn ngữ (chỉ tiếng Việt).
- Đánh giá / bình luận phim.
- Thanh toán thẻ quốc tế, ví điện tử khác ngoài PayOS.

**BRD §15 — Giai đoạn 3:** tích điểm/thành viên toàn chuỗi; đa ngôn ngữ; đánh giá phim; PWA.

**Không phải requirement chức năng:** KPI G1–G9 (§3) là mục tiêu thiết kế — hệ thống phải đo được, không phải hành vi cần test trực tiếp. Rủi ro §12 là tham chiếu (đánh mã `BRD-R1…R14` để tránh nhầm với `R-xx` của spec).

## Non-Functional Requirements (BRD §9)

| Mã | Nhóm | Yêu cầu (kiểm thử được) | R liên quan |
|---|---|---|---|
| NFR-01 | Hiệu năng | **LCP ≤ 2,5s** trên 4G cho trang chủ / chi tiết phim / chi tiết rạp; **API p95 ≤ 500ms**; **giữ ghế p95 ≤ 1s**. | R-40, R-44, R-37, R-62 |
| NFR-02 | Tải | Mục tiêu demo: **≥ 100 người dùng đồng thời** và **≥ 20 thao tác giữ ghế/giây** (web + POS) **không bán trùng ghế** — kiểm chứng bằng test đồng thời. | R-62, R-123 |
| NFR-03 | Realtime | Thay đổi trạng thái ghế hiển thị cho người khác **≤ 2 giây**; kênh realtime **tách theo suất**. | R-60, R-121 |
| NFR-04 | Toàn vẹn | Chống double-booking bằng **ràng buộc unique / khoá ở database**; mọi thao tác giữ/bán ghế là **transaction**. | R-62, R-123 |
| NFR-05 | Bảo mật dữ liệu | **RLS bật cho mọi bảng**; khách chỉ đọc đơn/vé của mình; **Staff/Manager chỉ truy cập dữ liệu rạp được gán**; **service role key chỉ dùng phía server**. | R-39, R-102, R-103 |
| NFR-06 | Bảo mật ứng dụng | **OWASP Top 10**; HTTPS toàn bộ; cookie phiên `HttpOnly`/`Secure`/`SameSite`; chống CSRF/XSS; kiểm tra quyền (vai trò + rạp) **ở server** cho mọi thao tác quản trị. | R-39, R-105 |
| NFR-07 | Bí mật | Khoá PayOS (client id, api key, checksum key), OAuth secret, SMTP lưu ở **biến môi trường / secret manager**; **không commit vào git**. Nếu sau này PayOS riêng từng rạp → khoá lưu mã hoá, chỉ server đọc. | R-83, R-84 |
| NFR-08 | Dữ liệu cá nhân | Tuân thủ **Nghị định 13/2023/NĐ-CP**: thu thập tối thiểu, có đồng ý, cho phép xem/sửa/xoá, chính sách bảo mật công khai. Định vị chỉ dùng tại trình duyệt, **không lưu toạ độ**. | R-03, R-26, R-29, R-36 |
| NFR-09 | Khả dụng | Không cam kết SLA; dùng sao lưu của gói Supabase; **script seed** dựng lại dữ liệu mẫu (**5 rạp**, phòng, sơ đồ ghế, phim, suất). Sự cố một rạp không ảnh hưởng bán vé rạp khác. | R-33, R-38 |
| NFR-10 | Email | **SMTP riêng** (vd Resend/SES), domain cấu hình **SPF, DKIM, DMARC**; email giao dịch vào hộp thư chính **≥ 95%**. | R-04, R-86, R-109 |
| NFR-11 | Giao diện | Responsive, **ưu tiên mobile (≥ 360px)**; Chrome, Safari, Edge, Firefox **2 phiên bản mới nhất**; **Safari iOS 15+**. | toàn bộ UI |
| NFR-12 | Tiếp cận | **WCAG 2.1 mức AA** (tương phản, điều hướng bàn phím, **nhãn cho ghế** cho trình đọc màn hình). | R-59 |
| NFR-13 | SEO | Trang phim, trang rạp, lịch chiếu **render phía server**; sitemap, meta, Open Graph, schema.org `MovieTheater`, `ScreeningEvent`. | R-46 |
| NFR-14 | Giám sát | Log lỗi tập trung (vd Sentry) gắn **`cinema_id`**; cảnh báo khi **webhook PayOS lỗi/sai chữ ký**, khi **tỷ lệ lỗi giữ ghế tăng bất thường**, khi **email gửi thất bại**. | R-74, R-62, R-109 |
| NFR-15 | Múi giờ & tiền tệ | Hiển thị theo **Asia/Ho_Chi_Minh** (lưu **UTC**); tiền tệ **VND, không phần thập phân**. | R-57 |
| NFR-16 | Mở rộng | Thêm rạp/phòng/suất **không sửa code**; quy mô demo **~5 rạp**, mỗi rạp **3–5 phòng**; không giới hạn cứng số rạp. | R-38 |
| NFR-17 | Kiểm thử | Test tự động bắt buộc cho: giữ ghế đồng thời **web ↔ POS**; webhook PayOS (**chữ ký, idempotent, tiền về muộn**); auth (**xác nhận email, liên kết tài khoản**); **phân quyền theo rạp** (Staff/Manager/khoá API POS không truy cập rạp khác); **huỷ suất + email hàng loạt**. | R-62, R-123, R-74, R-75, R-78, R-04, R-20, R-21, R-39, R-120, R-108, R-109 |
| NFR-18 | Chi phí | Ưu tiên **gói miễn phí** (Supabase, Vercel, Resend…) đủ cho demo; không phát sinh chi phí cố định bắt buộc. | — |

## Acceptance Criteria (BRD §13)

| Mã | Nguồn BRD | Given / When / Then (rút gọn) | R-xx | Phase |
|---|---|---|---|:-:|
| AC-01 | BR-AUTH-04/05 | **G** khách vừa đăng ký email/mật khẩu **W** chưa xác nhận mà thử giữ ghế **T** bị chặn + banner yêu cầu xác nhận email. | R-04, R-05 | MVP |
| AC-02 | BR-AUTH-06 | **G** vừa bấm "Gửi lại email" **W** bấm lại trong 60 giây **T** nút vô hiệu kèm đếm ngược, không gửi thêm email. | R-06 | MVP |
| AC-03 | BR-AUTH-11 | **G** sai mật khẩu 5 lần liên tiếp **W** nhập đúng ở lần 6 trong 15 phút **T** vẫn bị từ chối + email cảnh báo tới chủ tài khoản. | R-11 | MVP |
| AC-04 | BR-SOC-05 | **G** đã có tài khoản email/mật khẩu `a@x.com` **W** đăng nhập Google cùng `a@x.com` lần đầu **T** không tạo tài khoản mới; yêu cầu đăng nhập mật khẩu rồi liên kết Google vào tài khoản cũ. | R-20 | MVP |
| AC-05 | BR-SOC-07 | **G** tài khoản chỉ còn Facebook **W** bấm Huỷ liên kết Facebook **T** từ chối + hướng dẫn thêm phương thức khác. | R-21 | MVP |
| AC-06 | BR-BKG-04 | **G** hai khách cùng chọn E5 một suất **W** cùng bấm Tiếp tục gần đồng thời **T** chỉ một người giữ được; người kia nhận thông báo E5 vừa có người chọn. | R-62 | MVP |
| AC-07 | BR-BKG-05 | **G** khách đang giữ ghế **W** quá 10 phút chưa thanh toán **T** ghế về Trống cho mọi người xem trong ≤ 2 giây, đơn `expired`. | R-63, R-60 | MVP |
| AC-08 | BR-BKG-13 | **G** ở màn tóm tắt **W** chưa tick checkbox **T** nút Thanh toán vô hiệu; hộp thoại đúng tên + địa chỉ rạp của suất; tick + thanh toán → đơn có bản ghi đồng ý kèm thời điểm. | R-71, R-133 | MVP |
| AC-09 | BR-PAY-03 | **G** webhook giả mạo chữ ký sai **W** gửi tới endpoint webhook **T** đơn không đổi trạng thái + log cảnh báo. | R-74 | MVP |
| AC-10 | BR-PAY-04 | **G** PayOS gửi cùng webhook thành công 3 lần **T** đơn chỉ ghi nhận thanh toán 1 lần, chỉ 1 email vé. | R-75, R-76 | MVP |
| AC-11 | BR-PAY-07 | **G** đơn `expired`, ghế đã bán cho khách khác **W** tiền đơn cũ về **T** đơn `needs_manual_review`; Admin + Manager rạp đó thấy trong danh sách cần xử lý; khách nhận email hướng dẫn liên hệ rạp. | R-78, R-104 | MVP |
| AC-12 | BR-CHK-03 | **G** vé đã check-in **W** quét lại **T** báo đỏ "Đã sử dụng" kèm thời điểm + người soát lần đầu. | R-99, R-98 | MVP |
| AC-13 | BR-CHK-02/06 | **G** vé rạp HN01 **W** Staff làm việc tại HN02 quét QR **T** báo đỏ "Sai rạp" kèm tên + địa chỉ HN01, không hiện tên khách/ghế, vé không bị check-in. | R-98, R-102, R-132 | MVP |
| AC-14 | BR-CIN-04 | **G** phòng 1 HN01 có suất 19:00–21:15 (gồm dọn phòng) **W** tạo suất 21:00 phòng 1 HN01 **T** bị chặn, báo trùng lịch; tạo 21:00 phòng 1 HN02 → được phép. | R-50, R-49 | MVP |
| AC-15 | BR-CIN-05 | **G** giá mặc định VIP 2D tối cuối tuần 120.000đ, HN02 ghi đè 100.000đ **W** khách chọn VIP suất 2D tối thứ Bảy **T** tại HN02 giá hiển thị & chốt 100.000đ; tại HN01 (không ghi đè) 120.000đ. | R-52, R-72 | MVP |
| AC-16 | NFR-05 | **G** Cinema Manager chỉ được gán HN01 **W** gọi API/truy vấn suất, đơn, báo cáo của HN02 **T** không nhận dữ liệu, không sửa được (RLS chặn). | R-39 (NFR-05) | MVP |
| AC-17 | NFR-05 | **G** khách A đăng nhập **W** gọi API/truy vấn đơn của khách B **T** không nhận dữ liệu (RLS chặn). | R-87 (NFR-05) | MVP |
| AC-18 | BR-PRM-01/04 | **G** voucher chỉ áp dụng HN01 **W** nhập cho đơn tại HN02 **T** báo "Mã không áp dụng tại rạp này". | R-91 | GĐ2 |
| AC-19 | BR-CHN-07 | **G** Admin tạo rạp mới, phòng, sơ đồ ghế, suất qua quản trị **T** rạp mới xuất hiện ở danh sách rạp và bán vé được ngay, không deploy. | R-38 | MVP |
| AC-20 | BR-POS-02 | **G** nhân viên chọn F7 trên POS HN01 **W** khách đang xem sơ đồ suất đó trên web **T** trong ≤ 2 giây F7 "Đang được giữ", khách không chọn được. | R-121 | MVP |
| AC-21 | BR-POS-03/04 | **G** khách web đang giữ F8 **W** nhân viên chọn F8 trên POS **T** API trả không khả dụng; web và POS cùng chọn F9 gần đồng thời → chỉ một bên giữ được. | R-122, R-123 | MVP |
| AC-22 | BR-POS-05 | **G** POS giữ G1 nhưng bỏ dở **W** quá 5 phút không gia hạn/xác nhận **T** G1 tự về Trống trên cả web và POS. | R-124 | MVP |
| AC-23 | BR-POS-01 | **G** khoá API rạp HN01 **W** POS dùng khoá đó giữ ghế suất của HN02 **T** bị từ chối (403). | R-120 | MVP |
| AC-24 | BR-ADM-12/13 | **G** suất có 10 đơn `paid` **W** Manager huỷ suất **T** suất ngừng bán trên web và POS; 10 đơn `affected`; vé không check-in được; 10 email gửi kèm hướng dẫn đổi suất / hoàn tiền; trạng thái gửi hiển thị trên màn Đơn bị ảnh hưởng. | R-108, R-109, R-110, R-127 | MVP |
| AC-25 | BR-ADM-14 | **G** một đơn `affected` **W** ghi nhận "Đã hoàn tiền thủ công" thiếu số tiền hoặc mã giao dịch ngân hàng **T** chặn lưu; nhập đủ → đơn `refunded_manual` và xuất hiện trong báo cáo suất bị huỷ. | R-110, R-119 | MVP `[cần xác nhận]` |
| AC-26 | BR-CHN-02 | **G** rạp HN03 còn 3 suất tương lai đã bán vé **W** Admin chuyển rạp sang "Tạm đóng" **T** hệ thống yêu cầu huỷ hàng loạt 3 suất (kèm email) trước khi cho đổi trạng thái. | R-33, R-108 | MVP |

## API Endpoints
<!-- Mức ý định — derived from BRD §6, §8.4, §10. KHÔNG phải contract. -->

> **Chi tiết path, method, request/response shape sẽ do implementation quyết định** và được ghi vào `docs/API_SPEC.md` (as-built) khi có code. Spec chỉ cố định các **bề mặt tích hợp** bắt buộc theo BRD:

| Bề mặt | Ý định | Nguồn |
|---|---|---|
| Webhook PayOS | Nhận kết quả thanh toán; kiểm chữ ký checksum; idempotent; đối chiếu số tiền | BR-PAY-03, BR-PAY-04 |
| Tạo payment link / truy vấn trạng thái PayOS | Gọi ra PayOS từ server (không từ client) | BR-PAY-01, BR-PAY-02, BR-PAY-09 |
| `returnUrl` / `cancelUrl` | Màn "Đang xác nhận thanh toán" (polling) / xử lý huỷ | BR-PAY-06, BR-PAY-08 |
| API cho POS | Xác thực khoá API theo rạp; danh sách suất, sơ đồ + trạng thái ghế, giữ / nhả / gia hạn / xác nhận bán, tra cứu / soát vé; idempotent theo `requestId`; log + rate limit theo khoá; sai rạp → 403 | BR-POS-01…11 |
| Thao tác ứng dụng (Server Actions / Route Handlers) | Giữ ghế, đặt vé, voucher, soát vé, quản trị — mọi thao tác quản trị kiểm tra vai trò + rạp **ở server** | §10, NFR-06 |
| Realtime | Kênh trạng thái ghế **theo suất chiếu** | BR-BKG-02, NFR-03 |
| Trang công khai bắt buộc | Điều khoản sử dụng, Chính sách bảo mật, Hướng dẫn xoá dữ liệu (Facebook) | BR-AUTH-03, BR-SOC-12 |

## Database Schema
<!-- Mức ý định — derived from BRD. KHÔNG bịa tên bảng/cột. -->

> **Chi tiết bảng / cột / index / RLS policy sẽ do implementation quyết định** và được ghi vào `docs/ERD.md` (as-built). Dưới đây là **domain entity** và **quan hệ chính** BRD yêu cầu.

**Domain entities:**
- Người dùng & hồ sơ (họ tên, SĐT, ngày sinh, giới tính, avatar, tuỳ chọn email khuyến mãi, tỉnh/thành đã chọn); phương thức đăng nhập liên kết (email/mật khẩu, Google, Facebook); bằng chứng đồng ý điều khoản (thời điểm + phiên bản).
- Vai trò & gán rạp (Staff / Cinema Manager ↔ nhiều rạp); Admin toàn chuỗi.
- Rạp yêu thích (khách ↔ nhiều rạp).
- Rạp (cinemas) — mã rạp duy nhất, thông tin, trạng thái, cấu hình riêng (thời gian dọn phòng, mốc đóng bán).
- Phòng chiếu (rooms) — thuộc một rạp; định dạng hỗ trợ; trạng thái.
- Sơ đồ ghế (seat layout) — lưới hàng × cột, loại ô (Thường / VIP / Đôi / lối đi / hỏng-khoá).
- Phim (movies) — dùng chung toàn chuỗi; nhãn độ tuổi.
- Suất chiếu (showtimes) — rạp + phòng + phim + thời gian + định dạng + ngôn ngữ; trạng thái (đang bán / đóng bán / huỷ).
- Bảng giá: mặc định chuỗi (price tables), ghi đè theo rạp và theo suất (price overrides); ngày lễ (holidays).
- Khoá ghế theo suất (do Manager).
- Đơn hàng (orders) — kênh Web / POS, `cinema_id`, trạng thái theo §8.5, giá chốt, voucher, mã đặt vé.
- Ghế của đơn / giữ ghế (order seats / seat holds) — nguồn giữ (web / POS), thời hạn; **ràng buộc unique ghế × suất** chống double-booking.
- Vé (tickets) — mã QR token ngẫu nhiên.
- Thanh toán (payments) — `orderCode`, mã giao dịch, số tiền, thời điểm, trạng thái PayOS; `cinema_id`.
- Voucher (vouchers) + lượt dùng; phạm vi rạp (GĐ2).
- Combo (combos) — danh mục chung + cấu hình bật/tắt/giá theo rạp (GĐ2).
- Đơn bị ảnh hưởng (affected orders) — kết quả xử lý (đổi suất / hoàn tiền thủ công), trạng thái gửi email.
- Cấu hình toàn chuỗi (thời gian giữ ghế, nội dung cảnh báo, điều khoản).
- Audit log; nhật ký soát vé (check-in logs); khoá API POS (POS API keys) + nhật ký gọi API POS.
- Danh sách đen domain email disposable.

**Quan hệ chính (chỉ những gì BRD nêu):**
- Mỗi phòng thuộc **đúng một rạp** (BR-CIN-01); mỗi phòng có sơ đồ ghế (BR-CIN-02); suất = rạp + phòng + phim (BR-CIN-03).
- Mỗi đơn thuộc **đúng một suất** (do đó một rạp) (BR-BKG-07); đơn chứa danh sách ghế (tối đa 8).
- Mỗi đơn đã thanh toán có **1 mã đặt vé + 1 mã QR** (BR-TKT-01).
- Mọi đơn và giao dịch thanh toán gắn `cinema_id` (BR-PAY-12).
- Khoá API POS cấp **theo từng rạp** (BR-POS-01, BR-ADM-15); Staff / Cinema Manager gán **một hoặc nhiều rạp** (BR-CHN-08).
- Mọi dữ liệu vận hành truy được `cinema_id` để RLS theo rạp (NFR-05).
- Các cardinality khác (vd số giao dịch thanh toán / đơn, phiên bản sơ đồ ghế / phòng) **do implementation quyết định**.

## Authentication
<!-- Derived from BRD §5.3, §6.1, §6.2, NFR-05, NFR-06 -->

- **Cơ chế:** Supabase Auth — email/mật khẩu + xác nhận email; OAuth Google, Facebook; identity linking (R-01…R-25).
- **Phiên:** cookie `HttpOnly`/`Secure`/`SameSite`; "Ghi nhớ" 30 ngày, ngược lại hết khi đóng trình duyệt (R-15, NFR-06).
- **Phân quyền:** kiểm tra **vai trò + rạp được gán** ở **server và RLS**, không chỉ ẩn UI (§5.3, NFR-05, NFR-06).
- **POS:** xác thực bằng **khoá API theo rạp**, không dùng phiên người dùng (R-120).

### Ma trận phân quyền (BRD §5.3)

| Chức năng | Guest | Customer (chưa XN) | Customer | Staff | Cinema Manager | Admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Xem phim, rạp, lịch chiếu, sơ đồ ghế | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Đăng ký / đăng nhập | ✅ | — | — | — | — | — |
| Quản lý hồ sơ, liên kết tài khoản | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Giữ ghế, đặt vé, thanh toán | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| Xem "Vé của tôi" | — | ✅ (rỗng) | ✅ | — | — | — |
| Soát vé (quét QR) | — | — | — | ✅ rạp mình | ✅ rạp mình | ✅ |
| Tra cứu đơn hàng | — | — | — | ✅ rạp mình (chỉ đọc) | ✅ rạp mình | ✅ |
| Quản lý danh mục phim | — | — | — | — | ❌ | ✅ |
| Quản lý danh sách rạp (thêm/sửa/đóng rạp) | — | — | — | — | ✏️ chỉ sửa thông tin rạp mình | ✅ |
| Quản lý phòng, sơ đồ ghế, suất chiếu, giá, khoá ghế, combo | — | — | — | — | ✅ rạp mình | ✅ |
| Quản lý voucher | — | — | — | — | 👁 xem | ✅ |
| Gán Staff cho rạp | — | — | — | — | ✅ rạp mình | ✅ |
| Quản lý người dùng & mọi vai trò | — | — | — | — | ❌ | ✅ |
| Báo cáo | — | — | — | — | ✅ rạp mình | ✅ toàn chuỗi |

> Nguyên tắc: mọi kiểm tra quyền của Staff / Cinema Manager đối chiếu `cinema_id` của dữ liệu với danh sách rạp được gán — thực thi ở **database (RLS)** và server (BRD §5.3).

## Scalability Profile (OPTIONAL — chỉ khi user bật Scalability Option)

- **Scalability Option:** off
- **Tier:** — (không áp dụng; dự án demo ~5 rạp, BRD Q9)
- **CCU dự kiến:** tham chiếu thiết kế ≥ 100 người dùng đồng thời (NFR-02)
- **Peak RPS ước tính:** tham chiếu ≥ 20 thao tác giữ ghế/giây (NFR-02)
- **Tỉ lệ đọc/ghi:** — (BRD không nêu)
- **Peak/off-peak chênh lệch:** — (BRD không nêu)
- **Tăng trưởng 6–12 tháng:** — (BRD không nêu; demo)
- **Availability (SLA):** không cam kết SLA (NFR-09)
- **Recovery (RTO/RPO):** dùng sao lưu sẵn có của gói Supabase + script seed (NFR-09)

> Option off → đi theo mặc định đơn giản (modular monolith + stateless + PostgreSQL), phù hợp kiến trúc Next.js + Supabase của BRD §10.

## Deployment
<!-- Derived from BRD §10, §11.2, NFR-07, NFR-09, NFR-18, BR-PAY-13 -->

- **Hosting:** Vercel (đề xuất) — `[chốt ở brainstorm]`.
- **Backend dịch vụ:** Supabase project (gói free đủ cho demo; lưu ý project free có thể bị tạm dừng khi không hoạt động — §11.2).
- **Môi trường:** dev + bản deploy demo; **khoá PayOS khác nhau** giữa hai môi trường (BR-PAY-13).
- **Bí mật:** PayOS (client id, api key, checksum key), OAuth secret, SMTP qua biến môi trường / secret manager, không commit (NFR-07); service role key chỉ phía server (NFR-05).
- **Dữ liệu mẫu:** script seed 5 rạp, phòng, sơ đồ ghế, phim, bảng giá, suất (NFR-09, §11.2).
- **Email:** domain + DNS SPF/DKIM/DMARC (NFR-10, §11.2).
- **Facebook App:** demo ở **chế độ Development** (chỉ tester đăng nhập); mở công khai cần App Review + Privacy Policy URL + Data Deletion URL (§11.2, §15).
- **Chi phí:** ưu tiên gói miễn phí (NFR-18).
- Không vận hành production thật (§4.2).

## Ma trận truy vết BR → R

| Module | Mã BR → R-xx |
|---|---|
| AUTH | BR-AUTH-01→R-01 · 02→R-02 · 03→R-03 · 04→R-04 · 05→R-05 · 06→R-06 · 07→R-07 · 08→R-08 · 09→R-09 · 10→R-10 · 11→R-11 · 12→R-12 · 13→R-13 · 14→R-14 · 15→R-15 · 16→R-15 · 17→R-16 · 18→R-17 |
| SOCIAL | BR-SOC-01→R-18 · 02→R-18 · 03→R-19 · 04→R-19 · 05→R-20 · 06→R-21 · 07→R-21 · 08→R-22 · 09→R-23 · 10→R-24 · 11→R-18 · 12→R-25 |
| PROFILE | BR-PRO-01→R-26 · 02→R-27 · 03→R-28 · 04→R-29 · 05→R-30 · 06→R-31 |
| CHAIN | BR-CHN-01→R-32 · 02→R-33 · 03→R-34 · 04→R-35 · 05→R-36 · 06→R-37 · 07→R-38 · 08→R-39 |
| MOVIE | BR-MOV-01→R-40 · 02→R-41 · 03→R-42 · 04→R-43 · 05→R-44 · 06→R-45 · 07→R-46 |
| CINEMA | BR-CIN-01→R-47 · 02→R-48 · 03→R-49 · 04→R-50 · 05→R-52 · 06→R-53 · 07→R-54 · 08→R-55 · 09→R-58 · 10→R-57 |
| BOOKING | BR-BKG-01→R-59 · 02→R-60 · 03→R-61 · 04→R-62 · 05→R-63 · 06→R-64 · 07→R-65 · 08→R-66 · 09→R-67 · 10→R-68 · 11→R-69 · 12→R-70 · 13→R-71 · 14→R-72 |
| PAYMENT | BR-PAY-01→R-73 · 02→R-73 · 03→R-74 · 04→R-75 · 05→R-76 · 06→R-77 · 07→R-78 · 08→R-79 · 09→R-80 · 10→R-81 · 11→R-82 · 12→R-83 · 13→R-84 |
| TICKET | BR-TKT-01→R-85 · 02→R-86 · 03→R-87 · 04→R-88 · 05→R-89 |
| PROMO | BR-PRM-01→R-90, R-91 · 02→R-92 · 03→R-93 · 04→R-94, R-91 · 05→R-95 · 06→R-96 |
| CHECKIN | BR-CHK-01→R-97 · 02→R-98 · 03→R-99 · 04→R-100 · 05→R-101 · 06→R-102 |
| ADMIN | BR-ADM-01→R-41 · 02→R-32 · 03→R-47 · 04→R-51 · 05→R-52, R-53, R-58, R-90 · 06→R-52, R-56, R-58 · 07→R-103 · 08→R-104 · 09→R-105 · 10→R-106 · 11→R-107 · 12→R-108 · 13→R-109 · 14→R-110 · 15→R-111 |
| REPORT | BR-RPT-01→R-112 · 02→R-113 · 03→R-114 · 04→R-115 · 05→R-96 · 06→R-116 · 07→R-117 · 08→R-118 · 09→R-119 |
| POS | BR-POS-01→R-120 · 02→R-121 · 03→R-122 · 04→R-123 · 05→R-124 · 06→R-125 · 07→R-126 · 08→R-127 · 09→R-128 · 10→R-129 · 11→R-130 |
| POLICY | §7.1→R-131, R-132, R-134 · §7.2→R-133 · §7.3→R-132, R-134 |

**Tổng:** 134 requirement (R-01…R-134) — **121 MVP** (trong đó 10 gắn phase `[cần xác nhận]`), **13 GĐ2** (trong đó 1 gắn phase `[cần xác nhận]`). Phủ **140/140** mã BR, **18/18** NFR, **26/26** AC.

## Điểm cần xác nhận

> Chỉ ghi nhận — spec-init **không tự quyết**. Giải quyết qua `/brainstorm` hoặc Change Request (BRD là intent doc).

1. **Phase của voucher lõi** — §15 MVP không nhắc voucher; GĐ2 chỉ ghi "voucher theo phạm vi rạp". Spec tạm gán voucher lõi (R-90, R-92, R-93, R-94, R-95) = MVP, phạm vi rạp (R-91) = GĐ2. Kéo theo **R-82** (đơn 0đ do voucher 100%, BR-PAY-11 mức C) và R-28 (avatar, BR-PRO-03 mức C) — tạm MVP.
2. **Báo cáo nào thuộc MVP** — §15 MVP chỉ ghi "Admin + Cinema Manager cơ bản"; GĐ2 ghi "báo cáo đầy đủ". Spec tạm gán BR-RPT-01, BR-RPT-02, BR-RPT-06 (đều M) = MVP `[cần xác nhận]` (R-112, R-113, R-116); còn lại GĐ2. Lưu ý: cụm "đối soát" trong §15 MVP ("thanh toán PayOS (webhook, đối soát, tiền về muộn)") nhiều khả năng chỉ **job đối soát** BR-PAY-09 (R-80), không phải **báo cáo** đối soát BR-RPT-06.
3. **AC-25 vs BR-RPT-09** — AC-25 (luồng huỷ suất, MVP) yêu cầu đơn `refunded_manual` "xuất hiện trong **báo cáo suất bị huỷ**" — báo cáo này thuộc BR-RPT-09 (S, GĐ2 "báo cáo đầy đủ"). Cần chốt: báo cáo suất bị huỷ là MVP hay phần đó của AC-25 test ở GĐ2.
4. **Xuất CSV** — BR-ADM-14 (MVP) yêu cầu xuất CSV đơn bị ảnh hưởng, trong khi §15 xếp "xuất CSV" vào GĐ2. Spec giả định GĐ2 chỉ áp cho báo cáo (BR-RPT-07), CSV đơn bị ảnh hưởng vẫn MVP (R-110).
5. **AC-18 thuộc GĐ2** — AC-18 kiểm tra voucher theo phạm vi rạp (GĐ2); không thể nghiệm thu trong MVP.
6. **Staff ghi nhận đơn bị ảnh hưởng** — §5.3 ghi Staff "Tra cứu đơn hàng: rạp mình (**chỉ đọc**)", nhưng BR-ADM-14 cho Staff ghi nhận kết quả (Đã đổi suất / Đã hoàn tiền thủ công) — tức quyền ghi.
7. **POS giả lập & quyền Staff** — §5.3 ghi Staff ❌ "Giữ ghế, đặt vé"; BR-POS-10 cho Staff dùng POS giả lập giữ/bán ghế. Cần chốt POS giả lập xác thực bằng **khoá API của rạp** (như POS thật) hay bằng **phiên Staff**.
8. **Vòng đời đơn kênh POS** — §8.5 chỉ mô tả đơn web. Đơn POS (BR-POS-06) có trạng thái nào? Khi huỷ suất, đơn POS có chuyển `affected` và nhận email hàng loạt không (đơn POS không chắc có email khách)? Đếm vào báo cáo hoàn tiền thế nào?
9. **Tạo đơn mới khi đơn cũ đang `pending_payment`** — BR-BKG-06 "tạo đơn mới sẽ huỷ đơn giữ cũ", nhưng §8.5 chỉ có `holding → cancelled`. Đơn cũ đã có payment link: có huỷ không, và nếu tiền về sau đó thì xử lý như tiền về muộn?
10. **Tiền về sau khi đơn `cancelled`** — §8.5 chỉ định nghĩa tiền về muộn từ `expired`; khách huỷ trên PayOS rồi vẫn chuyển khoản → chưa có luồng.
11. **"Giờ kết thúc phim" khi check-in** — BR-CHK-03 cho check-in tới "giờ kết thúc phim"; BR-CIN-03 định nghĩa giờ kết thúc suất **gồm** thời gian dọn phòng. Mốc check-in tính theo giờ bắt đầu + thời lượng phim hay giờ kết thúc suất?
12. **Thời gian giữ ghế web** — BR-BKG-03/05 cố định **10 phút**, BR-ADM-10 cho Admin cấu hình thời gian giữ ghế. Spec hiểu 10 phút là giá trị mặc định; cần xác nhận.
13. **Định nghĩa "Sắp chiếu"** — BR-MOV-01 định nghĩa "Đang chiếu" (có suất ≥ 1 rạp trong khu vực) nhưng không định nghĩa "Sắp chiếu" (ngày khởi chiếu tương lai? chưa có suất?) — phim có suất chiếu sớm trước ngày khởi chiếu thuộc tab nào.
14. **Tự xoá tài khoản chưa xác nhận với tài khoản Facebook không email** — BR-AUTH-10 (7 ngày) có áp dụng cho tài khoản tạo qua Facebook chưa xác nhận email bổ sung (BR-SOC-04) không.
15. **Thứ tự mã rủi ro §12** — bảng rủi ro liệt kê R1…R10, **R13, R14, R11, R12** (không theo thứ tự). Không ảnh hưởng nghiệp vụ; ngoài ra mã rủi ro BRD `R1…R14` trùng tiền tố với `R-xx` của spec — spec gọi là `BRD-R1…R14`.
16. **Hạng mục `[chốt ở brainstorm]`** — hosting (Vercel đề xuất), bản đồ (Google Maps / OpenStreetMap), công cụ giám sát (Sentry là ví dụ).
17. **Đơn đang giữ / chờ thanh toán khi suất bị huỷ, và tiền về cho suất không còn bán được** (gộp với #9, #10) — BR-ADM-12 nói "ghế đang giữ bị nhả" nhưng không nói đơn `holding`/`pending_payment` chuyển trạng thái gì (payment link còn hiệu lực?). R-78 (BR-PAY-07) áp nguyên văn "ghế còn trống → tự chốt bán" sẽ **bán vé cho suất đã huỷ / đã đóng bán / đã kết thúc**. Cần chốt: tiền về muộn chỉ tự chốt khi suất chưa bị huỷ/đóng bán và chưa qua mốc đóng bán online; ngược lại → `needs_manual_review`? (Nguồn: BR-PAY-07, BR-ADM-12, §8.5.)
18. **Facebook không email + email nhập trùng tài khoản đã có** — §8.2 đi thẳng F → H (tạo tài khoản), bỏ qua bước kiểm tra trùng email. Mâu thuẫn tiềm ẩn với BR-AUTH-01 (email duy nhất) và BR-AUTH-12 (không tiết lộ email tồn tại). Cần chốt: chặn + yêu cầu đăng nhập phương thức cũ để liên kết (như R-20), hay thông báo chung kiểu "đã gửi link xác nhận" để không lộ email. Liên quan R-19, R-20.
19. **Quy tắc giá chi tiết (BR-CIN-05)** — chưa định nghĩa: ghế **Sweetbox** giá theo ghế hay theo cặp; mốc **17h** tính theo giờ bắt đầu suất và biên (17:00 thuộc "sau 17h"?); "**cuối tuần**" là T7–CN hay T6 tối–CN; **ngày lễ trùng cuối tuần** thì áp loại ngày nào. Ảnh hưởng R-72 (chốt giá) và AC-15.

### Quyết định brainstorm (2026-11-10) — áp dụng cho build
> Nguồn: `.context/brainstorm-log.md`. Các mục dưới đây **thay thế** trạng thái "cần xác nhận" của mục tương ứng ở trên.

| # | Quyết định |
|---|---|
| 1, 2, 4, 5 | Giữ phase như spec đã gán (voucher lõi, đơn 0đ, avatar, RPT-01/02/06, CSV đơn bị ảnh hưởng = MVP; voucher theo phạm vi rạp = GĐ2; AC-18 nghiệm thu ở GĐ2). |
| 3 | Phần **báo cáo suất bị huỷ** của BR-RPT-09 (cần cho AC-25) làm ở **MVP**; phần kênh Web/POS của BR-RPT-09 vẫn GĐ2. |
| 6 | Staff **được ghi** kết quả xử lý đơn `affected` của rạp mình (BR-ADM-14 thắng §5.3 cho riêng thao tác này); các đơn khác Staff chỉ đọc. |
| 7 | POS giả lập: Staff đăng nhập → backend dùng **khoá API POS của rạp** gọi cùng service API POS; khoá không ra client. |
| 8 | Đơn kênh POS dùng cùng vòng đời đơn; huỷ suất → `affected`, không gửi email, đánh dấu "liên hệ tại quầy", tính vào báo cáo hoàn tiền / suất bị huỷ. |
| 9, 10, 17 | Tiền về cho đơn `expired` **hoặc** `cancelled`: tự chốt bán **chỉ khi** suất chưa huỷ/đóng bán, chưa qua mốc đóng bán online **và** mọi ghế còn trống; ngược lại → `needs_manual_review` (như R-78). Tạo đơn mới khi đơn cũ `pending_payment` → đơn cũ `cancelled` + huỷ payment link. Huỷ suất → đơn `holding`/`pending_payment` của suất → `cancelled`. |
| 11 | Check-in cho phép tới **giờ bắt đầu + thời lượng phim** (không tính thời gian dọn phòng). |
| 12 | Giữ ghế web **10 phút là mặc định**, Admin cấu hình được (BR-ADM-10). |
| 13 | "Sắp chiếu" = phim có ngày khởi chiếu tương lai **và** chưa có suất trong khu vực; phim có suất chiếu sớm → "Đang chiếu". |
| 14 | Tự xoá sau 7 ngày **không** áp cho tài khoản Facebook chưa xác nhận email bổ sung. |
| 16 | Hosting/bản đồ/giám sát: xem Tech Stack. |
| 18 | Facebook không email + email nhập trùng tài khoản đã có: luôn thông báo chung "kiểm tra email"; email gửi tới chủ tài khoản hướng dẫn đăng nhập phương thức cũ để liên kết; **không** tạo tài khoản trùng, **không** lộ email tồn tại. |
| 19 | Sweetbox **giá theo cặp**, tính 2 ghế vào giới hạn 8; khung giờ theo **giờ bắt đầu suất**, 17:00 thuộc "sau 17h"; **cuối tuần = Thứ 7 + Chủ nhật**; **ngày lễ ưu tiên** hơn cuối tuần. |

> **Ghi chú tham chiếu chéo (từ spec-validator round 1, ℹ️):** R-17 bị giới hạn bởi R-105 (Manager chỉ thêm/bớt Staff rạp mình, không nâng quyền khác) · R-125 chịu ràng buộc R-128/R-122/R-123 (chỉ xác nhận bán ghế đang được POS giữ hợp lệ) · "ngừng bán" ở R-127 chỉ gồm suất `cancelled` (R-108) và suất bị Manager đóng bán (R-54); mốc đóng bán online R-67 chỉ chặn web, **không** chặn POS (khách vẫn mua tại quầy) · Combo và "rạp gần nhất" là GĐ2 → các nhắc tới combo/gần nhất trong requirement MVP là N/A ở MVP · Script seed 5 rạp (NFR-09) không có R riêng → graph phải lập task riêng · `spec/test-scope/current.json` hiện liệt kê cả R GĐ2 → spec-publisher cắt theo phạm vi thực build ở cuối layer cuối.

---
*Generated by: /spec-init (derived from docs/BRD.md v0.3 — greenfield, chưa có code)*
*Validated by: .agent/spec-validator.md — round 2 PASS (2026-11-10, .context/review-reports/start-filmbooking-spec-round-2-review.md)*
