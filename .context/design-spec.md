# Design Spec — FilmBooking (CINEMO)

> Sinh bởi `.agent/design.md` (Phase 3), ngày 2026-11-11. **Trạng thái: chờ user confirm tokens** (checkpoint ở session chính) trước khi Graph chia layer.
> **Nguồn sự thật thiết kế:** handoff CINEMO `docs/design/cinemo/` (40 SVG: 37 desktop 1440×1000, 3 mobile 390×844; `tokens/design-tokens.json`; `prototype/index.html`; `CINEMO-contact-sheet.jpg`). Tài liệu này **chuyển handoff thành tài liệu build**, không sáng tác phong cách khác. Thay thế hoàn toàn design-spec cũ.
> Phạm vi: requirement tag **MVP** trong `SPECIFICATIONS.md` 1.1.0. Nội dung handoff thuộc **GĐ2** được đánh dấu và **không build** ở initial build.
> Token: `skills/react-nodejs/design-tokens.md` (tên khái niệm §1; tên CSS thực thi §4.2). Stack: Next.js App Router + Tailwind v4 + shadcn/ui (Radix) + lucide-react.

## Mục lục
1. Ngôn ngữ thiết kế CINEMO
2. Quyết định thiết kế
3. IA / sitemap & route
4. Bảng 40 màn handoff → route → R-xx
5. App shell & component dùng chung
6. Trạng thái chung (loading / empty / error / success)
7. Màn khách hàng
8. Màn Staff (soát vé) & POS giả lập
9. Màn quản trị (Admin / Cinema Manager)
10. Màn MVP thiếu trong handoff
11. Điều chỉnh so với handoff
12. Điểm cần user quyết
13. Ma trận phủ R-xx MVP → màn
14. Pre-Flight check

---

## 1. Ngôn ngữ thiết kế CINEMO

**Design Read (§0 taste-skill):** web đặt vé chuỗi rạp, tiếng Việt, dark-cinema "rạp tối, poster làm chủ, một màu nhấn coral" — khách cần chọn nhanh suất/ghế trên điện thoại, nhân sự cần bảng dày đặc thông tin trên desktop, soát vé cần kết quả đọc được trong một liếc mắt.

**Dials (§1):** `DESIGN_VARIANCE = 3` (bám handoff, bố cục quy củ) · `MOTION_INTENSITY = 2` (chỉ chuyển màu/opacity, không parallax) · `VISUAL_DENSITY`: khách `4`, admin `7`, soát vé `3`.

Đặc trưng rút ra từ handoff:
- **Phân lớp bằng màu nền, không bằng bóng:** bg `#0B0D12` → chrome `#111620` (header/sidebar) → surface `#151A24` (card/panel, viền `#252C39`, radius 16) → elevated `#1B222E` (popover/dialog).
- **Coral là tín hiệu hành động duy nhất:** nút CTA gradient `#FF6B56 → #E63C58`, chip ngày đang chọn, ghế đang chọn, thanh active sidebar, link `#FF927E`. Không dùng coral cho trang trí.
- **Mint `#8FE0B1` = trạng thái tốt / thời gian còn**, cam `#F2B17D` = lưu ý (độ tuổi, sắp hết giờ), đỏ hồng `#F07173` = lỗi. Badge dùng mẫu "nền tối ngả màu + chữ sáng cùng tông", bo pill.
- **Typography Inter, tương phản trọng lượng mạnh:** display 44/850 UPPERCASE cho tên phim hero; tiêu đề trang 25–32/750; body 13–14/450; overline 10–11/750 UPPERCASE tracking rộng ("BƯỚC 2 / 5", "RẠP ĐÃ CHỌN", "PHIM NỔI BẬT").
- **Rạp luôn nổi bật:** tên rạp in hoa đậm + địa chỉ đầy đủ ở xác nhận đơn, thanh toán, vé (BRD: vé chỉ dùng tại rạp ghi trên vé).
- **Bố cục:** khách — header 72px (logo, nav, chọn tỉnh/thành, tìm kiếm, đăng nhập), nội dung max 1300, lưới 2 cột "nội dung + aside 370px" cho luồng đặt vé. Admin — sidebar 250 + topbar 72 (breadcrumb, **bộ chọn phạm vi rạp**, thông báo, avatar), tiêu đề trang + mô tả, thanh filter, DataTable, phân trang. Soát vé / POS — header riêng không sidebar, nhãn rạp mint góc phải.
- **Mobile 390:** header 56 (logo, tìm, menu), chip tỉnh/thành, bottom nav 4 mục (Trang chủ / Rạp / Vé / Tài khoản), thanh tóm tắt dính đáy ở luồng đặt vé.

## 2. Quyết định thiết kế

| # | Quyết định | Lý do / nguồn |
|---|---|---|
| D1 | **Chỉ dark theme** mọi bề mặt; **không làm light mode**, không có nút đổi theme. | Handoff không có light; user chốt 2026-11-11. |
| D2 | Stepper đặt vé MVP = **4 bước**: 1 Chọn suất · 2 Chọn ghế · 3 Xác nhận · 4 Thanh toán. Handoff "BƯỚC x / 5" có bước Combo (07) thuộc **GĐ2** (R-58, R-69). Khi GĐ2 bật combo → chèn bước 3 Combo, quay lại 5 bước. | SPEC phase tag. |
| D3 | Cảnh báo không huỷ/không hoàn (R-71, R-133): **khối cảnh báo inline** trong aside màn Xác nhận (giữ handoff 08) có checkbox gating nút Thanh toán **+ AlertDialog xác nhận cuối** khi bấm "Thanh toán" nhắc lại `{Tên rạp} – {Địa chỉ}`, `suất {giờ} ngày {ngày}`. Xem "Điểm cần user quyết" #2 (phương án chỉ inline). | R-71 ghi "hộp thoại cảnh báo"; handoff có component "Warning modal / No cancellation & refund". |
| D4 | Admin, Cinema Manager, Staff **dùng chung một shell `/admin`**; sidebar lọc theo vai trò; bộ chọn phạm vi rạp ở topbar (Admin: "Toàn chuỗi" + từng rạp; Manager/Staff: chỉ rạp được gán, ẩn "Toàn chuỗi"). Soát vé `/staff/soat-ve` và POS `/pos` là màn **toàn màn hình riêng** như handoff 17/29. | Handoff 18–40, 40 ghi "Dữ liệu chỉ giới hạn trong rạp được phân công"; R-39. |
| D5 | Màn đích sau đăng nhập của nhân sự ở MVP = **"Việc cần làm"** (`/admin`): đơn cần xử lý, đơn bị ảnh hưởng chưa xử lý, email lỗi, suất sắp bắt đầu. KPI doanh thu/biểu đồ của handoff 18/40 là **dashboard R-118 (GĐ2)** — không build. | R-118 = GĐ2. |
| D6 | Icon dùng **lucide-react** thay glyph ký tự trong SVG. | Taste-skill §4: SVG icon, không emoji/glyph. |
| D7 | Không dùng bóng đổ cho card; overlay (dialog/popover/sheet) dùng `--shadow-overlay`. | Handoff. |
| D8 | Mục nav "Khuyến mãi" của handoff **ẩn ở MVP** (không có requirement trang khuyến mãi công khai). | Không có R-xx. |
| D9 | Khu "Rạp nổi bật gần bạn" / "3,2 km" (01, 30) đổi thành **"Rạp yêu thích"** (R-31, khi đăng nhập có rạp yêu thích) hoặc **"Rạp tại {tỉnh/thành}"**; không xin định vị, không hiển thị khoảng cách. | R-36 gợi ý rạp gần nhất = GĐ2. |

---

## 3. IA / sitemap & route

Route group Next.js theo design doc: `(public)`, `(auth)`, `account`, `booking`, `admin`, `staff`, `pos-sim`. Slug tiếng Việt không dấu.

```
(public)  /                         Trang chủ                       01, 30
          /phim                     Danh sách & tìm phim            [bổ sung — dùng layout 05]
          /phim/[slug]              Chi tiết phim + lịch 7 ngày     02
          /rap                      Hệ thống rạp + bản đồ           03
          /rap/[code]               Chi tiết rạp + lịch 7 ngày      04
          /lich-chieu               Chọn suất (lọc phim/khu vực/ngày) 05
          /dieu-khoan · /chinh-sach-bao-mat · /huong-dan-xoa-du-lieu   [bổ sung]
(auth)    /dang-nhap · /dang-ky · /xac-nhan-email · /quen-mat-khau · /dat-lai-mat-khau · /auth/callback
booking   /dat-ve/[showtimeId]      Chọn ghế                        06, 31
          /dat-ve/don/[orderId]/xac-nhan    Xác nhận đơn            08
          /dat-ve/don/[orderId]/thanh-toan  Thanh toán VietQR       09
          /dat-ve/don/[orderId]/ket-qua     Đang xác nhận → thành công / thất bại   [returnUrl R-79] + 10
          (GĐ2) /dat-ve/don/[orderId]/combo                         07
account   /ve · /ve/[bookingCode]   Vé của tôi, chi tiết vé         11, 32
          /tai-khoan                Thông tin cá nhân               15
          /tai-khoan/bao-mat        Bảo mật & liên kết              16
          /tai-khoan/rap-yeu-thich · /tai-khoan/email               [bổ sung theo menu 15]
staff     /staff/chon-rap           Chọn rạp làm việc               [bổ sung]
          /staff/soat-ve            Soát vé QR                      17
pos-sim   /pos                      POS giả lập (Staff)             29
admin     /admin                    Việc cần làm (MVP) | Dashboard (GĐ2) 18, 40
          /admin/phim · /admin/phim/moi · /admin/phim/[id]          20, 37
          /admin/rap · /admin/rap/moi · /admin/rap/[id]             19, 36
          /admin/rap/[id]/phong · /admin/phong/[roomId]/so-do       22
          /admin/lich-chieu · /admin/lich-chieu/moi · /admin/lich-chieu/[id]   21, 38, [bổ sung chi tiết suất]
          /admin/gia · /admin/ngay-le                               35, [bổ sung]
          /admin/voucher                                            25
          /admin/don-hang · /admin/don-hang/[code]                  23, [bổ sung chi tiết]
          /admin/don-can-xu-ly                                      [bổ sung R-104]
          /admin/don-bi-anh-huong · /admin/don-bi-anh-huong/[code]  24, 34
          /admin/nguoi-dung                                         26
          /admin/bao-cao                                            27 (phần MVP)
          /admin/cau-hinh · /admin/audit-log                        28
          /admin/tich-hop-pos                                       39
system    not-found · error · /khong-co-quyen (403)                 [bổ sung]
```

**Sidebar theo vai trò** (thứ tự giữ handoff; mục GĐ2 ẩn):

| Mục | Admin | Manager | Staff |
|---|:-:|:-:|:-:|
| Việc cần làm | ✅ | ✅ | ✅ |
| Phim | ✅ | — | — |
| Rạp chiếu | ✅ | ✏️ rạp mình | — |
| Phòng & sơ đồ ghế | ✅ | ✅ | — |
| Lịch chiếu | ✅ | ✅ | — |
| Đơn hàng | ✅ | ✅ | 👁 |
| Đơn cần xử lý | ✅ | ✅ | — |
| Đơn bị ảnh hưởng | ✅ | ✅ | ✅ |
| Giá & ngày lễ (handoff "Giá & combo") | ✅ | ✅ giá rạp mình | — |
| Voucher | ✅ | 👁 | — |
| Người dùng | ✅ | ✅ Staff rạp mình | — |
| Báo cáo | ✅ | ✅ | — |
| Audit log | ✅ | — (R-107 không nêu Manager được xem; xem "Điểm cần user quyết") | — |
| Cấu hình | ✅ | ✅ cấu hình rạp | — |
| Tích hợp POS | ✅ | — | — |
| Soát vé ↗ · POS giả lập ↗ | ✅ | ✅ | ✅ |

> Ẩn menu chỉ là UX; quyền thực thi ở RLS + Nest guard (R-39, NFR-05). Truy cập URL không có quyền → trang `/khong-co-quyen`.

---

## 4. Bảng 40 màn handoff → route → R-xx

Cột "Phase": **MVP** = build ở initial build · **MVP*** = build nhưng bỏ phần GĐ2 trong màn · **GĐ2** = không build.

| # | Màn handoff | Route | R-xx MVP chính | Phase | Ghi chú lệch handoff |
|---|---|---|---|---|---|
| 01 | Trang chủ | `/` | R-35, R-40, R-42, R-45, R-31, R-46 | MVP* | Thêm tab Đang chiếu/Sắp chiếu (R-40); "Rạp nổi bật gần bạn" → Rạp yêu thích / Rạp tại tỉnh (D9); ẩn "Khuyến mãi" (D8) |
| 02 | Chi tiết phim | `/phim/[slug]` | R-41, R-42, R-44, R-45, R-46, R-57, R-67 | MVP | Sửa dữ liệu demo mâu thuẫn (badge T18 cạnh meta "T16"); phim sắp chiếu không có nút đặt (R-45) |
| 03 | Danh sách rạp | `/rap` | R-34, R-35 | MVP | Bản đồ Leaflet/OSM; nhóm theo tỉnh/thành |
| 04 | Chi tiết rạp | `/rap/[code]` | R-37, R-42, R-46, R-57 | MVP | 7 ngày, nhóm theo phim; sửa meta nhãn tuổi lệch |
| 05 | Chọn suất | `/lich-chieu` | R-43, R-44, R-35, R-67 | MVP | Thêm lọc thể loại/rạp/định dạng (R-43); trạng thái "Ngừng bán online" |
| 06 | Chọn ghế | `/dat-ve/[showtimeId]` | R-59…R-68, R-16, R-05, R-42 | MVP | "BƯỚC 2 / 4"; thêm chú thích Khoá + Sweetbox; lỗi ghế trùng/ghế lẻ; cảnh báo tuổi |
| 07 | Combo bắp nước | `/dat-ve/don/[id]/combo` | (R-58, R-69) | **GĐ2** | Không build |
| 08 | Xác nhận đơn | `/dat-ve/don/[id]/xac-nhan` | R-70, R-71, R-133, R-68, R-90, R-92, R-94, R-95, R-82, R-61 | MVP* | Bỏ dòng combo; thêm ô voucher + lỗi; checkbox tuổi; cảnh báo có địa chỉ + suất; AlertDialog cuối (D3) |
| 09 | Thanh toán VietQR | `/dat-ve/don/[id]/thanh-toan` | R-73, R-79, R-61, R-63, R-77, R-83 | MVP | Đồng hồ = thời gian giữ còn lại; nút "Tôi đã chuyển khoản" chỉ kích hoạt polling, không xác nhận |
| 10 | Vé thành công | `/dat-ve/don/[id]/ket-qua` | R-76, R-79, R-85, R-86, R-133 | MVP | Thêm trạng thái "Đang xác nhận" (polling) + thất bại/hết hạn; nhắc không huỷ/không hoàn |
| 11 | Vé của tôi | `/ve` | R-87, R-131, R-05 | MVP | Customer chưa xác nhận → rỗng + banner |
| 12 | Đăng nhập | `/dang-nhap` | R-07, R-11, R-12, R-15, R-16, R-18, R-20 | MVP | Thêm Turnstile sau 3 lần sai; thông báo khoá 15'; lỗi chung |
| 13 | Đăng ký | `/dang-ky` | R-01, R-02, R-03, R-07, R-08, R-09, R-12, R-30 | MVP | Gợi ý mật khẩu nêu hoa/thường/số; Turnstile; opt-in khuyến mãi **mặc định bỏ tick** |
| 14 | Xác nhận email | `/xac-nhan-email` | R-04, R-06 | MVP | Đếm ngược 60s; trạng thái link hết hạn/đã dùng |
| 15 | Hồ sơ | `/tai-khoan` | R-26, R-27, R-28, R-29, R-31, R-30 | MVP | Thêm upload avatar; đổi email; luồng xoá tài khoản (§10) |
| 16 | Bảo mật & liên kết | `/tai-khoan/bao-mat` | R-14, R-15, R-21, R-22, R-23, R-24 | MVP | Thêm đổi/đặt mật khẩu; chặn huỷ liên kết phương thức cuối |
| 17 | Soát vé QR | `/staff/soat-ve` | R-97…R-99, R-101, R-102, R-132 | MVP | Thêm 4 kết quả thất bại, "Sai rạp" chỉ tên + địa chỉ; tối ưu mobile |
| 18 | Dashboard Admin | `/admin` | (R-118) | **GĐ2** | MVP thay bằng "Việc cần làm" (D5) |
| 19 | Quản lý rạp | `/admin/rap` | R-32, R-33, R-38, R-39 | MVP | Đổi trạng thái rạp có guard huỷ suất (R-33) |
| 20 | Quản lý phim | `/admin/phim` | R-41, R-42 | MVP | |
| 21 | Lịch chiếu | `/admin/lich-chieu` | R-49, R-50, R-51, R-54, R-57 | MVP | Kéo thả đổi giờ: chỉ suất chưa bán (R-54) — tuỳ chọn, xem §9 |
| 22 | Phòng & sơ đồ ghế | `/admin/phong/[roomId]/so-do` | R-47, R-48 | MVP* | Bỏ cột giá trong "Thuộc tính ghế" (giá ở R-52); thêm "Sao chép sơ đồ" |
| 23 | Đơn hàng | `/admin/don-hang` | R-103 | MVP | Thêm tra cứu theo SĐT/mã giao dịch; trang chi tiết + lịch sử trạng thái |
| 24 | Đơn bị ảnh hưởng | `/admin/don-bi-anh-huong` | R-109, R-110 | MVP | Thêm nút **Xuất CSV** (MVP theo R-110); lọc trạng thái xử lý |
| 25 | Giá / voucher | `/admin/voucher` | R-90, R-93, R-94 | MVP* | Cột "Phạm vi" rạp/tỉnh = R-91 **GĐ2** → MVP chỉ "Toàn chuỗi"; Manager chỉ xem |
| 26 | Người dùng & phân quyền | `/admin/nguoi-dung` | R-105, R-17, R-39 | MVP | Dialog gán vai trò + rạp; khoá/mở khoá |
| 27 | Báo cáo | `/admin/bao-cao` | R-112, R-113, R-116, (R-119 phần suất huỷ) | MVP* | Bỏ KPI "Tỷ lệ lấp đầy" (R-114), "Hiệu quả theo rạp" so sánh (R-115), "Xuất CSV" (R-117), "Voucher đã dùng" theo rạp (R-96) — đều GĐ2 |
| 28 | Cấu hình & audit log | `/admin/cau-hinh`, `/admin/audit-log` | R-106, R-56, R-107 | MVP | Thêm sửa nội dung cảnh báo + điều khoản (có phiên bản); tách audit log thành trang có lọc |
| 29 | POS giả lập | `/pos` | R-129, R-121…R-128 | MVP | Thêm gia hạn/nhả giữ; in mã đặt vé |
| 30 | Mobile trang chủ | `/` (< 768) | như 01 | MVP* | Như 01 |
| 31 | Mobile chọn ghế | `/dat-ve/[showtimeId]` (< 768) | như 06 | MVP | Chú thích đủ trạng thái |
| 32 | Mobile vé điện tử | `/ve/[bookingCode]` | R-85, R-87, R-133 | MVP | "Mở vé toàn màn hình" tăng độ sáng (R-87) |
| 33 | Quên mật khẩu | `/quen-mat-khau` | R-13, R-07, R-12 | MVP | Turnstile; thông báo chung sau gửi |
| 34 | Chi tiết đơn bị ảnh hưởng | `/admin/don-bi-anh-huong/[code]` | R-110, R-109 | MVP | Thêm trường **phương thức** hoàn tiền (bắt buộc theo R-110); gửi lại email |
| 35 | Bảng giá | `/admin/gia` | R-52, R-53 | MVP* | Cột khung giờ trước/sau 17h (R-52); "combo" GĐ2; ghi đè theo suất |
| 36 | Form rạp | `/admin/rap/moi`, `/admin/rap/[id]` | R-32, R-38, R-56 | MVP | Thêm toạ độ bản đồ, tiện ích, ảnh, cấu hình dọn phòng/đóng bán |
| 37 | Form phim | `/admin/phim/moi`, `/admin/phim/[id]` | R-41, R-42 | MVP | Thêm diễn viên, ngôn ngữ/phụ đề/lồng tiếng, trạng thái hiển thị |
| 38 | Form suất chiếu | `/admin/lich-chieu/moi` | R-49, R-50, R-51, R-52, R-56 | MVP | Tạo hàng loạt nhiều rạp (Admin) |
| 39 | API keys POS | `/admin/tich-hop-pos` | R-111, R-130 | MVP | Thêm dialog hiển thị secret một lần, xoay/thu hồi, nhật ký gọi API |
| 40 | Dashboard Cinema Manager | `/admin` (Manager) | (R-118) | **GĐ2** | MVP như D5, phạm vi rạp được gán |

**Tổng:** 40 màn → **37 build ở MVP** (trong đó 6 màn MVP* bỏ phần GĐ2) + **3 màn GĐ2** (07, 18, 40). Bổ sung **22 màn/khối** không có trong handoff (§10).

---

## 5. App shell & component dùng chung

Đặt tại `apps/web/src/components/` (ui = shadcn gốc; `cinemo/` = component nghiệp vụ). Mọi component đọc token, không hex thô.

### 5.1 Shell

| Component | Dùng ở | Spec |
|---|---|---|
| `SiteHeader` | (public), account, booking | Desktop 72px nền chrome, viền dưới `border`: logo CINEMO 22/850 · nav (Phim, Rạp chiếu, Vé của tôi khi đăng nhập) · `ProvinceSelect` · ô tìm (Command palette, `⌘K`/`/`) · nút "Đăng nhập" (secondary) hoặc `UserMenu` (avatar → Tài khoản, Vé của tôi, Bảo mật, [Quản trị nếu là nhân sự], Đăng xuất). Mobile 56px: logo · icon tìm · icon menu (Sheet trái chứa nav + tỉnh/thành). Sticky. |
| `MobileBottomNav` | khách < 768 | 4 mục: Trang chủ, Rạp, Vé, Tài khoản (icon + nhãn 11px, active = brand). Ẩn trong luồng `/dat-ve/*` (nhường chỗ `BookingSummaryBar`). Vùng chạm ≥ 44px, `safe-area-inset-bottom`. |
| `SiteFooter` | (public) | Link Điều khoản, Chính sách bảo mật, Hướng dẫn xoá dữ liệu, hotline chuỗi; text-muted 12px. |
| `ProvinceSelect` | header | Popover danh sách tỉnh/thành có rạp; ghi nhớ cookie + profile (R-35). Lần đầu chưa chọn → `ProvincePickerDialog` (§10). |
| `UnverifiedEmailBanner` | mọi trang khách khi Customer chưa xác nhận | Dải warning-soft dưới header: "Xác nhận email để đặt vé. Đã gửi tới {email}." + nút "Gửi lại email" (đếm ngược 60s, R-06). (R-05) |
| `AdminShell` | /admin/* | Sidebar 250 (chrome, logo + pill vai trò "ADMIN"/"MANAGER"/"STAFF" brand-soft, nhóm "WORKSPACE" overline, item 40px radius 10, active = nền `sidebar-active` + vạch 3px brand trái + chữ trắng 650; footer avatar + tên + email) · Topbar 72: breadcrumb "Quản trị hệ thống / {trang}" · `CinemaScopeSelect` · chuông thông báo · avatar. Nội dung padding 32. **< 1024px:** sidebar thành Sheet (nút menu ở topbar). |
| `CinemaScopeSelect` | topbar admin, soát vé, POS | Admin: "Toàn chuỗi" + danh sách rạp `HN01 • Long Biên`; Manager/Staff: chỉ rạp được gán, 1 rạp → hiển thị dạng nhãn không mở được. Đổi phạm vi → giữ trong URL `?cinema=HN01`. Kèm ghi chú text-muted "Dữ liệu chỉ giới hạn trong rạp được phân công" (40). (R-39) |
| `PageHeader` | admin | Tiêu đề h1 27/760 + mô tả 12 text-muted + slot hành động phải (nút gradient "＋ Tạo …"). Mô tả **theo từng trang**, không lặp câu chung "Cập nhật dữ liệu và theo dõi vận hành chuỗi rạp" của handoff. |
| `StaffHeader` | /staff/*, /pos | 72px chrome: "CINEMO / SOÁT VÉ" hoặc "CINEMO POS / HN01" 17/800 · pill mint mã rạp (`success-soft`) · (POS) pill trạng thái kết nối API · menu người dùng. |

### 5.2 Component nghiệp vụ

| Component | Props chính | Spec |
|---|---|---|
| `MovieCard` | movie, variant `grid`/`row` | Poster 2:3 radius 16 (placeholder gradient poster1..5), `AgeRatingBadge` góc trên trái, overline "ĐANG CHIẾU"/"SẮP CHIẾU", tên 15/700 (2 dòng, clamp), meta "2D • Phụ đề", "Từ 75.000đ" (đang chiếu) hoặc "Khởi chiếu dd/MM" (sắp chiếu, không nút đặt — R-45). Cả card là link; focus ring quanh card. |
| `CinemaCard` | cinema | Ảnh/ô mã rạp, tên 16/700, địa chỉ text-secondary, "4 phòng • 2D / 3D", badge trạng thái, link "Xem lịch chiếu →". Nút ☆ yêu thích khi đăng nhập (R-31). |
| `AgeRatingBadge` | rating, tone `neutral`/`semantic` | Tokens §1.7. |
| `AgeWarning` | rating | Khối warning-soft: "Phim {T16}: chỉ dành cho khán giả từ 16 tuổi. Nhân viên có quyền yêu cầu giấy tờ và từ chối vào phòng — vé không được hoàn." + Checkbox "Tất cả người xem đủ tuổi theo quy định". Chỉ với T13/T16/T18 (R-68). |
| `DateStrip` | days(7), value | Chip 2 dòng "HÔM NAY / 11", "THỨ NĂM / 12"; chọn = brand fill + chữ tối; cuộn ngang mobile (snap), không scroll ngang trang. |
| `ShowtimeChip` | showtime | Pill giờ `19:30` 14/650 tabular, radius pill, nền surface-control viền border; trạng thái: đang bán (hover viền brand), **ngừng bán online** (disabled + tooltip "Ngừng bán online — vui lòng mua tại quầy", R-67), **hết ghế** (disabled "Hết ghế"), đã huỷ (ẩn). Vùng chạm ≥ 44×44. |
| `ShowtimeGroup` | cinema hoặc movie + chips | Hàng: tên rạp 16/700 + địa chỉ text-secondary + định dạng "2D • Phụ đề" + dải chip. |
| `BookingStepper` | step 1–4 | Overline "BƯỚC 2 / 4" + 4 chấm/đoạn, bước hiện tại brand, đã qua mint. `aria-label="Bước 2 trên 4: Chọn ghế"`. |
| `CountdownTimer` | expiresAt | Pill "Giữ ghế trong 09:42": > 2' mint (`success-soft`), ≤ 2' warning, ≤ 30s danger + `aria-live="assertive"` một lần lúc còn 1'. Tính theo `expires_at` server, đồng bộ lại khi tab focus. Hết giờ → `HoldExpiredDialog` (§10). Hiện trên mọi bước sau chọn ghế (R-61). `role="timer"`. |
| `SeatMap` | layout, states, selected, priceByType, readOnly | §5.3. |
| `SeatLegend` | types có trong phòng | Trống, Đang chọn, Đang giữ, Đã bán, Khoá, VIP, Sweetbox (chỉ loại có mặt) + giá theo loại ghế (R-59). |
| `BookingSummary` (aside) / `BookingSummaryBar` (mobile) | order | Aside 370 radius 16: phim + nhãn tuổi + định dạng, **tên rạp** 15/700 + phòng • giờ • ngày, `CountdownTimer`, ghế đã chọn (chip có nút × ≥ 44px trên mobile), dòng "2 × Ghế thường 180.000đ", tạm tính, "Đã bao gồm thuế, phí", CTA gradient. Mobile: thanh dính đáy (64px + safe area) "2 ghế • E5, E6 / Tạm tính 180.000đ / [Tiếp tục]" mở Sheet chi tiết. |
| `NoRefundNotice` | variant `line`/`panel` | `line`: dòng danger nhỏ "Không hỗ trợ huỷ / hoàn vé" (06). `panel`: khối danger-soft viền danger-line radius 12, tiêu đề "⚠ LƯU Ý QUAN TRỌNG" danger-strong 12/800, nội dung `#F1D8D4`→ text 13 (R-133). |
| `PolicyConfirmDialog` | order | AlertDialog §7 màn 08 (D3). |
| `VoucherField` | — | Input + nút "Áp dụng"; đã áp → chip mã + số giảm + nút gỡ; lỗi dưới ô (R-94): "Mã không tồn tại", "Mã đã hết hạn", "Mã đã hết lượt sử dụng", "Đơn chưa đạt giá trị tối thiểu {x}đ", "Mã không áp dụng cho suất này"; quá 10 lần/phút → "Bạn thử quá nhiều lần, vui lòng đợi 1 phút" (R-95). |
| `QrTicket` | ticket | Thẻ vé radius 22 viền nét đứt `#677384`→`border-input`: overline "VÉ ĐIỆN TỬ", mã đặt vé 22/800 letter-spacing, badge "ĐÃ THANH TOÁN", phim + nhãn tuổi, **tên rạp + địa chỉ**, giờ • ngày • phòng, ghế; QR trắng nền trắng viền 10px (≥ 180px desktop, ≥ 240px toàn màn hình), "QUÉT MÃ TẠI CỬA"; lưu ý "Đến trước giờ chiếu 15 phút • Vé chỉ có giá trị tại rạp này • Vé không huỷ/không hoàn". `alt` QR = "Mã QR vé {mã đặt vé}". |
| `OrderStatusBadge`, `EmailStatusBadge`, `EntityStatusBadge` | status | Tokens §1.8. |
| `CheckinResult` | result | §8 màn 17. |
| `DataTable` | columns, query | TanStack Table + shadcn Table: thanh công cụ (ô tìm "⌕ Tìm kiếm…", "Bộ lọc" popover, select trạng thái, pill tổng số) · header 11/650 UPPERCASE text-muted · hàng 56px, hover elevated · cột hành động "•••" (DropdownMenu, `aria-label="Thao tác cho {mã}"`) · footer "Hiển thị 1–5 trên 128 bản ghi" + phân trang. Mobile < 768: hàng chuyển thành card xếp chồng (cột chính + badge + menu). Lọc/sort/trang lưu vào URL. |
| `FormSection` | title | Card surface radius 16, tiêu đề h3, lưới 2 cột (≥ 1024) / 1 cột; nhãn trên ô 12/550 text-secondary; lỗi dưới ô danger 12 + `aria-describedby`; nút lưu gradient ở cuối hoặc thanh dính đáy khi form dài. |
| `ConfirmDialog` | destructive? | AlertDialog: tiêu đề, mô tả hậu quả, nút huỷ (secondary) + nút xác nhận (destructive hoặc gradient). Focus mặc định vào nút **huỷ** với thao tác phá huỷ. |
| `EmptyState`, `ErrorState`, `Skeleton*` | | §6. |
| `KpiCard`, `ChartCard` | | Báo cáo MVP (27): card surface, nhãn 11/550, giá trị 26/800 tabular; biểu đồ Recharts màu `chart-1..5`. |
| `MapView` | markers | Leaflet + OSM tile; marker tròn brand có mã rạp; lazy-load (dynamic import, `ssr:false`), placeholder skeleton cùng kích thước. |
| `TurnstileField` | — | Widget Cloudflare Turnstile `theme="dark"`, căn trái trên nút submit; lỗi tải → "Không tải được xác minh, thử lại". |

### 5.3 SeatMap (chi tiết)

- Cấu trúc: "MÀN HÌNH" overline + thanh `seat-screen` 70% rộng, cong nhẹ; nhãn hàng A–H hai bên (text-muted 11); lưới CSS grid theo cột của sơ đồ; lối đi = ô trống; sweetbox chiếm 2 cột.
- Ô ghế: desktop 32×28, gap 8 · mobile 28×26 gap 6 trong vùng **cuộn ngang + pinch-zoom** riêng (không làm trang cuộn ngang), có nút "＋/－" zoom và nút "Vừa màn hình". Với phòng ≤ 12 cột vừa 360px không cần cuộn.
- Trạng thái/ký hiệu: tokens §1.5. Ghế của mình đang giữ (sau "Tiếp tục") hiển thị như **Đang chọn**.
- A11y: mỗi ghế chọn được là `<button>` với `aria-pressed`; ghế không chọn được là `<button aria-disabled="true">` (vẫn focus được để đọc trạng thái). `aria-label="Hàng E, ghế 5, VIP, còn trống, 110.000đ"` / "…, đã bán" / "…, đang được giữ" / "…, khoá" / "Hàng H, ghế đôi 7–8, Sweetbox, còn trống, 320.000đ". Lưới `role="grid"` + điều hướng phím mũi tên (roving tabindex), Space/Enter chọn. Vùng `aria-live="polite"` thông báo "Đã chọn E5. Tổng 2 ghế, 180.000đ" và "Ghế E7 vừa được người khác giữ".
- Realtime (R-60): ghế đổi trạng thái → chuyển màu 120ms; nếu ghế **đang chọn của tôi** bị người khác giữ trước khi tôi bấm Tiếp tục → bỏ chọn + toast warning "E7 vừa có người chọn".
- Ràng buộc client (server vẫn kiểm): tối đa 8 (sweetbox = 2) → ghế còn lại vẫn bấm được nhưng hiện toast "Tối đa 8 ghế mỗi đơn" (R-65); ghế lẻ (R-66) → khung danger quanh ô lẻ + thông báo "Không để trống 1 ghế lẻ giữa các ghế. Vui lòng chọn lại." và khoá nút Tiếp tục.
- `readOnly` (Guest, Staff, admin xem): hiển thị trạng thái, không chọn; Guest bấm ghế → `LoginRequiredDialog` "Đăng nhập để chọn ghế" → quay lại đúng suất (R-16).
- Biến thể `builder` (màn 22) và `lock` (khoá ghế theo suất, R-55): §9.

---

## 6. Trạng thái chung (loading / empty / error / success)

Handoff chưa có các trạng thái này (README). Quy ước dùng chung, đúng ngôn ngữ handoff:

| Trạng thái | Pattern | Chi tiết |
|---|---|---|
| Loading trang | `Skeleton` cùng hình khối nội dung thật (poster 2:3, hàng chip, hàng bảng 56px) nền `surface-elevated`, shimmer opacity (tắt khi reduced-motion). Không spinner toàn trang. | SSR trang công khai nên loading chủ yếu ở client fetch. |
| Loading thao tác | Nút giữ nguyên kích thước, icon `Loader2` quay + nhãn tiến trình ("Đang giữ ghế…", "Đang lưu…"), `aria-busy`. Chặn bấm lặp. | Giữ ghế p95 ≤ 1s (NFR-01). |
| Empty | `EmptyState`: icon lucide 32px text-muted trong vòng tròn surface-elevated, tiêu đề 16/700, mô tả 13 text-secondary, 1 CTA (secondary hoặc gradient). | Câu chữ cụ thể theo màn (§7–§9). |
| Lỗi tải | `ErrorState` trong panel: icon `AlertTriangle` danger, "Không tải được {dữ liệu}", mô tả ngắn, nút "Thử lại". Lỗi mạng ≠ lỗi quyền (403 → `/khong-co-quyen`). | Map mã lỗi Nest → thông điệp tiếng Việt (design doc §Error Handling). |
| Lỗi field | Viền danger + text danger 12 dưới ô + icon; focus ô lỗi đầu tiên khi submit. | |
| Lỗi nghiệp vụ trong luồng | `Alert` danger-soft inline gần CTA (vd "Ghế E5, E6 vừa có người giữ. Vui lòng chọn ghế khác." — R-62 nêu ghế trùng). | |
| Thành công | `Sonner` toast góc dưới phải (desktop) / trên (mobile), nền elevated viền success-line, icon `CheckCircle2` success, tự ẩn 4s; thao tác quan trọng (check-in, thanh toán) dùng màn/banner kết quả thay toast. | |
| Đang xác nhận (async) | Panel với icon `RefreshCw` quay chậm + "Đang chờ xác nhận" + mô tả, polling 3s, timeout mềm 2' → nút "Kiểm tra lại". | R-79. |
| Offline | Dải warning trên cùng "Mất kết nối. Trạng thái ghế có thể chưa cập nhật." ; ở POS chặn bán (R-128). | |

Trang hệ thống: **404** "Không tìm thấy trang" (hero gradient nhỏ + nút "Về trang chủ"); **500** "Đã có lỗi xảy ra" + "Thử lại"; **403** `/khong-co-quyen` "Bạn không có quyền truy cập trang này" + nút về trang phù hợp vai trò.

---

## 7. Màn khách hàng

Mỗi màn: **Mục đích · R-xx · Bố cục (D = desktop, M = mobile < 768) · Components · States · Interactions · Nội dung bắt buộc**.

### 01 / 30 — Trang chủ `/`
- **Mục đích:** khám phá phim theo khu vực, vào luồng đặt nhanh. **R:** R-40, R-35, R-42, R-45, R-31, R-46.
- **D:** `SiteHeader` → Hero radius 22 gradient `hero` cao ~360: overline "PHIM NỔI BẬT" (`#FFB2A6`→ link), tên phim display UPPERCASE 2 dòng, tagline 16 text-secondary, meta "Khởi chiếu 14.11.2026 • 2D • T16", CTA gradient "Đặt vé ngay →" (→ `/phim/[slug]#lich-chieu`) + secondary "Xem trailer" (Dialog YouTube embed, lazy). Banner phim từ storage, lớp phủ gradient tối dưới chữ. → Section "Phim" với **Tabs Đang chiếu / Sắp chiếu** (R-40) + "Xem tất cả →" (`/phim`); lưới 5 cột `MovieCard`. → Section "Rạp yêu thích" (đăng nhập & có) hoặc "Rạp tại {tỉnh}" 3 `CinemaCard` ngang (D9).
- **M (30):** header 56, chip "HÀ NỘI ⌄", hero cao 300 tên phim 32, 1 CTA; tabs; lưới 2 cột (cuộn dọc) — handoff 30 cuộn ngang 3 card, spec giữ cuộn ngang snap cho "Đang chiếu" ≤ 8 phim, "Xem tất cả" cuối dải; rạp dạng danh sách; `MobileBottomNav`.
- **States:** loading skeleton hero + 5 poster; tab rỗng "Chưa có phim đang chiếu tại {tỉnh}" + "Xem rạp khác" (mở `ProvinceSelect`); chưa chọn tỉnh → `ProvincePickerDialog`; lỗi section → `ErrorState` riêng từng section (không vỡ cả trang).
- **Interactions:** đổi tỉnh → refetch, giữ tab. Card phim sắp chiếu: không có nút/giá, hiển thị "Khởi chiếu dd/MM/yyyy" (R-45).
- **SEO:** SSR/ISR, meta + OG (R-46).

### Bổ sung — Danh sách & tìm phim `/phim`
- **R:** R-43, R-40, R-45. Dùng layout 05: thanh lọc (ô tìm tên, Thể loại, Rạp, Ngày, Định dạng 2D/3D; tỉnh lấy từ header) + Tabs Đang chiếu/Sắp chiếu + lưới `MovieCard` (D 5 cột, tablet 3, M 2). M: bộ lọc trong Sheet "Bộ lọc (3)". Empty "Không tìm thấy phim phù hợp" + "Xoá bộ lọc". Lọc lưu URL.

### 02 — Chi tiết phim `/phim/[slug]`
- **R:** R-41, R-42, R-44, R-45, R-46, R-57, R-67, R-31.
- **D:** băng banner mờ phía trên; cột trái poster 2:3 radius 16 + `AgeRatingBadge`; cột phải: badge "ĐANG CHIẾU", tên VN h1, tên gốc • năm, "Tình cảm • Tâm lý • 118 phút • Việt Nam", đạo diễn/diễn viên, ngôn ngữ (Phụ đề/Lồng tiếng), mô tả (clamp 4 dòng + "Xem thêm"), CTA gradient "Chọn suất chiếu" (cuộn tới lịch) + "▶ Trailer". Section `#lich-chieu` "Lịch chiếu tại {tỉnh}": `DateStrip` 7 ngày → danh sách `ShowtimeGroup` theo rạp (rạp yêu thích lên đầu, badge ☆), mỗi rạp: tên + địa chỉ + nhóm theo định dạng → chip giờ.
- **M:** poster nhỏ 120 cạnh tiêu đề, meta xuống dòng, CTA full-width dính đáy "Chọn suất chiếu"; DateStrip cuộn ngang.
- **States:** ngày không có suất "Không có suất chiếu ngày {dd/MM} tại {tỉnh}" + gợi ý ngày gần nhất có suất; phim sắp chiếu chưa có suất: ẩn lịch, hiện "Khởi chiếu {ngày}", **không có CTA** (R-45); 404 phim ẩn.
- **Lưu ý handoff:** demo ghi T18 trên badge nhưng meta "T16" — dữ liệu thật lấy 1 nguồn `movie.ageRating`.
- **SEO:** schema.org `Movie` + `ScreeningEvent` (R-46).

### 03 — Hệ thống rạp `/rap`
- **R:** R-34, R-35, R-31.
- **D:** h1 "Hệ thống rạp CINEMO" + mô tả; thanh: ô tìm "Tìm theo tên rạp, địa chỉ…", select Tỉnh/thành, nút "Tìm rạp"; lưới 2 cột: trái `MapView` (marker mã rạp LB/CG/HD, click → highlight card), phải danh sách `CinemaCard` **nhóm theo tỉnh/thành** (heading tỉnh). Card: tên, địa chỉ, hotline, số phòng • định dạng, badge trạng thái, "Xem lịch chiếu →" (R-34).
- **M:** danh sách trước, nút "Xem bản đồ" mở bản đồ full-height Sheet.
- **States:** rạp "Sắp khai trương" hiện badge info, không có link lịch chiếu; rạp Tạm đóng/Ngừng hoạt động **ẩn**. Empty tìm kiếm "Không có rạp phù hợp". Bản đồ lỗi tải → ẩn khối bản đồ, danh sách vẫn dùng được.

### 04 — Chi tiết rạp `/rap/[code]`
- **R:** R-37, R-42, R-46, R-57, R-31.
- **D:** hero radius 22: overline "CINEMO LONG BIÊN", h1, địa chỉ đầy đủ, "Hotline 1900 8888 • Mở cửa 08:30 – 23:30", nút "Chỉ đường" (mở OSM/Google Maps ngoài, `target=_blank` + `rel`), nút ☆ "Rạp yêu thích". Section "Lịch chiếu tại rạp": `DateStrip` **7 ngày**, danh sách theo **phim** (poster nhỏ, tên, nhãn tuổi, "118 phút • 2D / Phụ đề", chip giờ).
- **M:** hero thu gọn, nút hotline `tel:` ≥ 44px.
- **States:** ngày không suất; rạp sắp khai trương: "Rạp sắp khai trương — lịch chiếu sẽ cập nhật sớm".
- **SEO:** `MovieTheater` (R-46). Sửa meta nhãn tuổi demo như 02.

### 05 — Chọn suất `/lich-chieu`
- **R:** R-43, R-44, R-35, R-67, R-57.
- **D:** h1 "Chọn suất chiếu"; thanh lọc Phim / Khu vực / Ngày (DatePicker) / [bổ sung: Rạp, Định dạng] + "Áp dụng" (D: áp ngay khi đổi, nút chỉ trên M); `DateStrip`; danh sách hàng phim: poster 64, tên + nhãn tuổi, "CINEMO Long Biên • Hà Nội", định dạng, chip giờ. Nhóm theo phim → rạp.
- **M:** lọc trong Sheet; hàng thành card.
- **States:** chip "Ngừng bán online" disabled + tooltip/nhãn dưới chip trên M (không chỉ tooltip); empty "Không có suất phù hợp".

### 06 / 31 — Chọn ghế `/dat-ve/[showtimeId]` (BƯỚC 2 / 4)
- **R:** R-59…R-68, R-05, R-16, R-42, R-57, R-133(2).
- **D (06):** `BookingStepper` + h1 "Chọn ghế của bạn" + dòng "CINEMO Long Biên • Vệt sáng cuối cùng • 19:30, 11/11/2026". Lưới: trái panel 900 `SeatMap` + `SeatLegend` (thêm Khoá, Sweetbox) + giá theo loại; phải aside 370 `BookingSummary`: phim, nhãn tuổi semantic, rạp, "Phòng 03 • 19:30 • 11/11", ghế đã chọn, dòng giá theo loại, Tạm tính, CTA gradient "Tiếp tục →", dưới CTA `NoRefundNotice line` "Không hỗ trợ huỷ / hoàn vé" (R-59, R-133 lớp 2). Phim T13+: `AgeWarning` trong aside, checkbox bắt buộc trước "Tiếp tục" (R-68).
- **M (31):** header + tiêu đề "Chọn ghế" + "Long Biên • 19:30 • Phòng 03"; SeatMap cuộn/zoom; chú thích dạng lưới 2 cột (đủ trạng thái, handoff 31 chỉ có 3 → bổ sung); `BookingSummaryBar` dính đáy với Tạm tính + CTA.
- **Trước khi giữ:** chưa có đồng hồ. Sau "Tiếp tục" → gọi giữ ghế → thành công: điều hướng 08, đồng hồ bắt đầu (R-61). Quay lại từ 08 (đơn còn giữ) → ghế hiển thị Đang chọn + đồng hồ "Giữ ghế trong 09:42".
- **States:** loading skeleton lưới; **Guest** → `readOnly` + CTA "Đăng nhập để đặt vé" (R-16 returnTo); **chưa xác nhận email** → CTA disabled + `UnverifiedEmailBanner` (R-05); **suất ngừng bán online** → banner warning "Ngừng bán online — vui lòng mua tại quầy", `readOnly` (R-67); **suất đã huỷ/đã chiếu** → `ErrorState` "Suất chiếu không còn mở bán" + "Chọn suất khác"; **chưa đủ tuổi theo ngày sinh hồ sơ** → Alert danger "Theo ngày sinh trong hồ sơ, bạn chưa đủ tuổi xem phim {T18}" + CTA disabled (R-68); **giữ thất bại ghế trùng** → Alert danger nêu ghế + ghế đó chuyển Đang giữ (R-62); **ghế lẻ** (R-66); **đã có đơn đang giữ ở suất khác** → ConfirmDialog "Bạn đang giữ ghế cho {phim} lúc {giờ} tại {rạp}. Tiếp tục sẽ huỷ đơn đó." [Giữ đơn cũ] [Huỷ đơn cũ và tiếp tục] (R-64); **mất realtime** → dải warning "Đang kết nối lại…".
- **Không dùng** khoảng trống của bước Combo (D2).

### 07 — Combo `/dat-ve/don/[id]/combo` — **GĐ2, không build.**

### 08 — Xác nhận đơn `/dat-ve/don/[id]/xac-nhan` (BƯỚC 3 / 4)
- **R:** R-70, R-71, R-133, R-68, R-61, R-90, R-92…R-95, R-82, R-72.
- **D:** h1 "Xác nhận đơn hàng" + "Kiểm tra kỹ rạp, suất chiếu và ghế trước khi thanh toán." Trái panel "Thông tin suất chiếu": **khối rạp nổi bật** (overline "RẠP ĐÃ CHỌN", tên rạp UPPERCASE 22/800, địa chỉ đầy đủ text 14) → phim + nhãn tuổi semantic + định dạng → "19:30 • Thứ Tư, 11/11/2026 • Phòng 03" → Ghế. Phải aside 490: "Tổng thanh toán": Vé (n ghế) theo loại, **[bổ sung] `VoucherField`**, Giảm giá (mint, "−30.000đ"), **Tổng cộng** 22/800; `CountdownTimer`; `NoRefundNotice panel` nội dung: "Vé đã mua **không thể huỷ, đổi hoặc hoàn tiền**, trừ trường hợp rạp huỷ suất. Vé chỉ dùng tại **{Tên rạp} – {Địa chỉ}**, suất **{19:30} ngày {11/11/2026}**." (+ câu tuổi nếu T13+); Checkbox "Tôi đã đọc và đồng ý điều kiện vé." (+ Checkbox tuổi nếu chưa tick ở 06); CTA gradient "Thanh toán 325.000đ →" **disabled đến khi tick đủ**, dòng dưới "Nút chỉ khả dụng sau khi xác nhận điều khoản" (R-71). Link "← Đổi ghế" (nhả giữ hiện tại? Không — quay về 06 giữ nguyên ghế đang giữ).
- **Bấm Thanh toán → `PolicyConfirmDialog`** (D3): tiêu đề "Xác nhận mua vé", nội dung lặp tên rạp + địa chỉ + suất + "không huỷ/không đổi/không hoàn", nút [Quay lại] [Đồng ý và thanh toán] (gradient). Đồng ý → lưu bằng chứng đồng ý (R-71) → tạo payment link → 09. Tổng = 0đ (R-82) → bỏ 09, sang thẳng 10.
- **Bỏ** dòng "Combo Couple × 1" của handoff (GĐ2).
- **M:** khối rạp đầu trang, rồi phim/ghế, tổng, voucher, cảnh báo + checkbox, CTA dính đáy (disabled state rõ).
- **States:** hết giờ giữ → `HoldExpiredDialog`; tạo link lỗi → Alert danger "Không tạo được thanh toán. Thử lại." (giữ đơn); voucher lỗi ở field; giá hiển thị là giá đã chốt (R-72) — không tính lại phía client.

### 09 — Thanh toán VietQR `/dat-ve/don/[id]/thanh-toan` (BƯỚC 4 / 4)
- **R:** R-73, R-74 (UI không tin returnUrl), R-61, R-63, R-77, R-79, R-83.
- **D:** h1 "Thanh toán đơn hàng" + "Hoàn tất chuyển khoản VietQR để nhận vé điện tử." Trái panel: "Quét mã VietQR bằng ứng dụng ngân hàng", ảnh QR (từ PayOS) trên nền trắng 240px, "Đơn hàng #HN01-7K3P9Q", Số tiền 28/800 brand, Ngân hàng, Chủ tài khoản, Nội dung chuyển khoản (mỗi dòng có nút **Sao chép** ≥ 44px), pill `CountdownTimer` "Còn 08:34 để thanh toán". Nút secondary "Mở trang thanh toán PayOS" (checkoutUrl). Phải panel "Trạng thái thanh toán": icon ↻, "Đang chờ xác nhận", "Hệ thống sẽ tự động xác nhận khi nhận được thông báo từ PayOS."; tóm tắt Mã đơn, **Rạp**, Tổng tiền; nút secondary "Tôi đã chuyển khoản" (chỉ chuyển sang chế độ polling dày hơn + hiện "Đang kiểm tra…", **không** xác nhận đơn); note "Không đóng trang trong khi hệ thống xác nhận." + link "Huỷ thanh toán" (ConfirmDialog → đơn `cancelled`, nhả ghế, về 06).
- **M:** QR trên cùng (có nút "Lưu ảnh QR"), thông tin chuyển khoản, trạng thái dưới.
- **States:** polling 3s → `paid` → điều hướng 10; `expired` → `HoldExpiredDialog` biến thể "Hết thời gian thanh toán… Nếu bạn đã chuyển khoản, hệ thống sẽ tự xử lý và gửi email." (R-78); `cancelled` → về 06 với toast.

### 10 — Kết quả / Vé thành công `/dat-ve/don/[id]/ket-qua`
- **R:** R-79, R-76, R-85, R-86, R-133(5), R-63, R-77.
- **Trạng thái "Đang xác nhận thanh toán" (returnUrl, bổ sung):** panel giữa trang, icon ↻ quay, "Đang xác nhận thanh toán…", "Vui lòng không đóng trang. Thường mất dưới 1 phút." Polling tới khi có kết quả (R-79); quá 2' → "Chưa nhận được xác nhận từ ngân hàng. Chúng tôi sẽ gửi email khi thanh toán thành công." + "Xem vé của tôi".
- **Thành công (10):** vòng tròn ✓ mint, h1 "Đặt vé thành công!", "Vé điện tử đã được gửi đến {email}"; `QrTicket` (đầy đủ trường §5.2 + "Vé không huỷ/không hoàn"); nút gradient "Xem vé của tôi" + secondary "Về trang chủ".
- **Thất bại:** đơn `cancelled`/`expired` → icon ✕ danger "Thanh toán chưa hoàn tất", "Ghế đã được nhả." + "Chọn lại ghế" (về 06 cùng suất).
- **M:** vé full-width, QR ≥ 240px.

### 11 — Vé của tôi `/ve`
- **R:** R-87, R-131, R-05.
- **D:** h1 + mô tả; Tabs "SẮP TỚI" / "ĐÃ XEM"; danh sách card ngang: poster 120, tên phim, **"CINEMO Long Biên • Hà Nội"**, giờ • ngày, "Phòng 03 • Ghế E5, E6 • 2 vé", badge trạng thái (`OrderStatusBadge`: Đã thanh toán / Đã check-in / Bị ảnh hưởng), ô QR nhỏ, link "Xem chi tiết vé →". Đơn `affected`: badge danger + dòng "Suất đã bị huỷ — mang mã đặt vé tới quầy để đổi suất hoặc liên hệ rạp" + hotline.
- **M:** card dọc, QR mini bấm mở `/ve/[code]`.
- **States:** chưa xác nhận email → rỗng + banner (R-87, §5.3 BRD); empty "Bạn chưa có vé nào" + "Đặt vé ngay"; tab Đã xem rỗng "Chưa có vé đã xem". **Không có** nút huỷ/đổi vé (R-131).

### 32 (+ desktop) — Chi tiết vé `/ve/[bookingCode]`
- **R:** R-85, R-87, R-133(5), R-131.
- **M (32):** tiêu đề "Vé điện tử", `QrTicket`, nút gradient "Mở vé toàn màn hình" → overlay nền trắng, QR ≥ 280px, mã đặt vé, tên rạp; gọi Screen Wake Lock + gợi ý "Tăng độ sáng màn hình" (web không chỉnh được độ sáng hệ thống → dùng nền trắng tối đa + wake lock; xem "Điểm cần user quyết" #6). Dưới vé: khối chính sách "Vé không thể huỷ, đổi hoặc hoàn tiền… Chỉ sử dụng tại rạp ghi trên vé." + địa chỉ + hotline + link bản đồ.
- **D:** vé giữa trang max 600, cùng nội dung. **States:** không phải vé của mình → 404 (không lộ tồn tại).

### Nhóm Auth — bố cục chung (12, 13, 14, 33)
- **D:** split 2 cột: trái nền gradient `hero` + vòng tròn trang trí, logo, tagline lớn ("Một thế giới phim ảnh" / "Một tài khoản, cả thế giới điện ảnh."); phải card form radius 22 rộng 440. 14 và 33: chỉ card giữa trang trên nền hero.
- **M:** chỉ card full-width (gutter 16), tagline 1 dòng trên form; input 16px.
- Mọi form: nhãn hiển thị (không chỉ placeholder), `autocomplete` đúng (`email`, `current-password`, `new-password`, `name`), nút hiện/ẩn mật khẩu `aria-label`, submit loading state.

### 12 — Đăng nhập `/dang-nhap`
- **R:** R-11, R-12, R-07, R-15, R-16, R-18, R-20, R-19.
- **Nội dung:** "Chào mừng trở lại", Email, Mật khẩu + "Quên mật khẩu?", Checkbox "Ghi nhớ đăng nhập" (30 ngày, R-15), CTA gradient "Đăng nhập", divider "HOẶC", "Tiếp tục với Google", "Tiếp tục với Facebook" (secondary, logo SVG chính thức), "Chưa có tài khoản? Đăng ký ngay", dòng điều khoản có link.
- **States:** sai → Alert danger chung "Email hoặc mật khẩu không đúng" (R-12); **sau 3 lần sai** → hiện `TurnstileField` (R-07); **khoá 15'** → Alert danger "Đăng nhập bằng mật khẩu tạm khoá 15 phút do nhập sai nhiều lần. Bạn có thể đặt lại mật khẩu hoặc dùng Google/Facebook." (R-11); rate limit → "Bạn thử quá nhiều lần, vui lòng đợi"; **OAuth email trùng** (R-20) → Alert info "Email này đã có tài khoản — hãy đăng nhập bằng phương thức cũ để liên kết" + form email/mật khẩu điền sẵn email, sau đăng nhập tự liên kết + toast; **Facebook không trả email** (R-19) → màn bước phụ "Nhập email để hoàn tất" (1 ô email + CTA) → 14; tài khoản bị khoá bởi Admin → thông báo chung + hotline.
- **Interactions:** thành công → `returnTo` (R-16) hoặc `/`; nhân sự → `/admin`.

### 13 — Đăng ký `/dang-ky`
- **R:** R-01…R-03, R-07…R-09, R-12, R-17, R-30.
- **Nội dung:** "Tạo tài khoản CINEMO", Họ và tên, Email, Mật khẩu (gợi ý dưới ô: "8–72 ký tự, gồm chữ hoa, chữ thường và chữ số" — sửa "Tối thiểu 8 ký tự" của handoff) + **thanh độ mạnh** 4 đoạn (danger → warning → success) + checklist 3 điều kiện tick realtime (R-02); Checkbox bắt buộc "Tôi đồng ý **Điều khoản sử dụng** và **Chính sách bảo mật**" (link mở tab mới) (R-03); Checkbox "Tôi muốn nhận email ưu đãi và tin tức (không bắt buộc)" **mặc định bỏ tick** (R-30); `TurnstileField` (R-07); CTA "Tạo tài khoản" (disabled đến khi tick điều khoản); Google/Facebook; "Email xác nhận có hiệu lực trong 24 giờ."
- **States:** email disposable → lỗi field "Vui lòng dùng email khác (không hỗ trợ email dùng một lần)" (R-09); email trùng / thành công → **cùng một màn** 14 (không lộ tồn tại, R-12); rate limit IP → Alert "Bạn đã tạo quá nhiều tài khoản, thử lại sau" (R-08).

### 14 — Xác nhận email `/xac-nhan-email`
- **R:** R-04, R-06, R-05.
- **Nội dung:** icon ✉ trong vòng brand-soft, "Kiểm tra hộp thư của bạn", "Chúng tôi đã gửi liên kết xác nhận đến {email}", "Liên kết có hiệu lực trong 24 giờ.", nút secondary "Mở ứng dụng email" (chỉ M, `mailto:`), "Chưa nhận được email?" + nút "Gửi lại email" disabled kèm "Có thể gửi lại sau 00:42" (R-06), quá 5 lần/giờ → "Bạn đã gửi lại quá nhiều lần, thử lại sau 1 giờ".
- **Biến thể kết quả link** (`/xac-nhan-email?status=`): thành công ✓ mint "Email đã được xác nhận" + "Tiếp tục đặt vé" (returnTo); hết hạn/đã dùng ✕ danger "Liên kết đã hết hạn hoặc đã được sử dụng" + "Gửi lại email xác nhận".

### 33 — Quên mật khẩu `/quen-mat-khau` + Bổ sung `/dat-lai-mat-khau`
- **R:** R-13, R-07, R-12.
- 33: icon ✉, "Đặt lại mật khẩu", mô tả "…liên kết có hiệu lực trong 1 giờ.", Email, `TurnstileField`, CTA "Gửi liên kết đặt lại", link "Quay lại đăng nhập". Sau gửi: luôn "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn" (R-12).
- `/dat-lai-mat-khau` (bổ sung, cùng card): Mật khẩu mới + Nhập lại (thanh độ mạnh như 13), CTA "Đặt mật khẩu mới"; thành công → "Mật khẩu đã được đặt lại. Các phiên đăng nhập khác đã bị đăng xuất." + "Đăng nhập"; link hết hạn/đã dùng → ✕ + "Gửi lại liên kết".

### 15 — Tài khoản `/tai-khoan` (+ menu con)
- **R:** R-26…R-31.
- **D:** h1 "Tài khoản của tôi"; trái card 280: avatar (initials fallback), tên, email, menu dọc: Thông tin cá nhân · Vé của tôi · Rạp yêu thích · Bảo mật & liên kết · Tuỳ chọn email (active = sidebar-active + vạch brand). Phải: `FormSection` "Thông tin cá nhân": **[bổ sung] Ảnh đại diện** (nút "Đổi ảnh", JPG/PNG/WebP ≤ 2 MB, R-28; lỗi "Ảnh phải là JPG, PNG hoặc WebP, tối đa 2 MB"), Họ và tên, Email (read-only + nút "Đổi email" → Dialog nhập email mới → "Đã gửi link xác nhận tới {email mới}. Email chỉ đổi sau khi xác nhận." R-27), Số điện thoại, Ngày sinh (DatePicker, dd/MM/yyyy), Giới tính (Select, có "Không muốn nêu"), CTA "Lưu thay đổi". Khối "Vùng nguy hiểm" viền danger-line: "Xoá tài khoản" (destructive outline) + mô tả handoff → luồng §10.
- **Rạp yêu thích** `/tai-khoan/rap-yeu-thich`: chip "CINEMO Long Biên ×" + Combobox thêm rạp (R-31). **Tuỳ chọn email** `/tai-khoan/email`: Switch "Nhận email khuyến mãi" (mặc định tắt) + ghi chú "Email giao dịch (vé, bảo mật) luôn được gửi" (R-30).
- **M:** menu thành Tabs cuộn ngang / danh sách điều hướng trang con.
- **States:** lưu thành công toast; lỗi field; skeleton form.

### 16 — Bảo mật & liên kết `/tai-khoan/bao-mat`
- **R:** R-14, R-15, R-21…R-24.
- **Nội dung:** "Bảo mật & phương thức đăng nhập": danh sách 3 hàng (icon, tên phương thức, email liên kết hoặc "Chưa liên kết", nút phải "Liên kết"/"Huỷ liên kết"; Email & mật khẩu: "Đổi mật khẩu" hoặc "Đặt mật khẩu" nếu chưa có — R-22). Handoff để ô trống "40" ở cột nút → thay bằng nút thật.
  - **Đổi mật khẩu** Dialog: Mật khẩu hiện tại, Mật khẩu mới (+ độ mạnh), CTA; thành công "Đã đổi mật khẩu. Chúng tôi đã gửi email thông báo." (R-14).
  - **Huỷ liên kết phương thức cuối** → nút vẫn bấm được, mở Dialog từ chối "Không thể huỷ liên kết phương thức đăng nhập cuối cùng. Hãy thêm phương thức khác trước." (R-21, AC-05). Huỷ liên kết bình thường → ConfirmDialog.
  - Liên kết tài khoản MXH đã thuộc người khác → Alert danger "Tài khoản Google này đã liên kết với một tài khoản CINEMO khác." (R-23).
  - "Phiên đăng nhập": thiết bị hiện tại + nút destructive-outline "Đăng xuất khỏi mọi thiết bị" → ConfirmDialog (R-15).

---

## 8. Màn Staff (soát vé) & POS giả lập

### Bổ sung — Chọn rạp làm việc `/staff/chon-rap`
- **R:** R-97, R-39. Hiện khi Staff/Manager được gán > 1 rạp và chưa chọn trong phiên. Card giữa trang (nền bg): "Chọn rạp bạn đang làm việc", danh sách radio-card `HN01 • CINEMO Long Biên` + địa chỉ (≥ 56px mỗi hàng), CTA gradient "Bắt đầu soát vé". Lựa chọn lưu theo phiên; đổi lại qua pill mã rạp ở `StaffHeader`. Gán 1 rạp → bỏ qua màn này.

### 17 — Soát vé QR `/staff/soat-ve`
- **R:** R-97…R-99, R-101, R-102, R-132, R-42.
- **Mục tiêu thiết kế:** dùng trên **điện thoại** bằng một tay, đọc kết quả trong 1 giây. Handoff là khung desktop → **M là bố cục chính**.
- **M:** `StaffHeader` (CINEMO / SOÁT VÉ + pill mint "HN01 • LONG BIÊN"); "Xin chào, Minh Anh / Đang làm việc tại CINEMO Long Biên"; vùng camera 1:1 full-width radius 16 với khung ngắm 4 góc brand + nhãn "CAMERA SẴN SÀNG" (mint); dưới: ô "Nhập mã vé" (16px, `inputmode="text"`, `autocapitalize="characters"`, placeholder "HN01-7K3P9Q") + nút "Tra cứu vé". Kết quả mở **Sheet đáy cao ~70%** (`CheckinResult`). Lịch sử quét gần đây: 5 dòng "19:02 • HN01-4D8P2A • Hợp lệ".
- **D (17):** như handoff: panel quét (ô nhập + nút + khối camera bên phải), panel kết quả 1320 bên dưới, lịch sử 2 cột.
- **`CheckinResult` (5 biến thể, R-98):**

| Kết quả | Header banner | Nội dung hiển thị | Hành động |
|---|---|---|---|
| ✓ VÉ HỢP LỆ | success-banner, "✓ VÉ HỢP LỆ" success-strong 20/800 + pill "CHƯA CHECK-IN" | Phim 23/750, "CINEMO Long Biên • Phòng 03 • 19:30", Ghế 20/750, (combo — GĐ2, ẩn), nhãn tuổi semantic + "T16 • Kiểm tra giấy tờ nếu cần" (warning) | CTA gradient "Xác nhận check-in" → thành công: banner chuyển "✓ ĐÃ CHECK-IN 19:05", rung nhẹ (Vibration API nếu có), tự đóng sau 3s, focus về ô nhập |
| ✕ ĐÃ SỬ DỤNG | danger-banner | "Vé đã check-in lúc {19:02, 11/11} bởi {Minh Anh}" + phim/suất/ghế (cùng rạp nên được xem) | "Quét vé khác" |
| ✕ SAI RẠP | danger-banner | **Chỉ**: "Vé thuộc rạp khác. Vui lòng hướng dẫn khách tới:" + **tên rạp đúng** 20/750 + **địa chỉ**. **Không** hiện tên khách, phim, ghế (R-102, AC-13). Ghi chú "Vé không bị đánh dấu check-in." | "Quét vé khác" |
| ✕ SAI SUẤT / CHƯA TỚI GIỜ / SUẤT ĐÃ KẾT THÚC | danger-banner (tiêu đề cụ thể theo lý do) | Suất của vé "19:30, 11/11 • Phòng 03"; với "chưa tới giờ": "Mở check-in từ {19:00}" (30' trước); với suất bị huỷ (`affected`): "Suất chiếu đã bị huỷ — hướng dẫn khách đổi suất/hoàn tiền tại quầy" (R-99) | "Quét vé khác" |
| ✕ KHÔNG TỒN TẠI / CHƯA THANH TOÁN | danger-banner | "Không tìm thấy vé hợp lệ với mã {mã}" | "Nhập lại mã" |

- Mỗi biến thể có icon + tiêu đề chữ (không chỉ màu); vùng `role="status" aria-live="assertive"`. Mọi lượt quét ghi log (R-101) — UI không cần thao tác thêm.
- **States:** camera bị từ chối quyền → khối camera đổi thành hướng dẫn "Cho phép camera trong cài đặt trình duyệt hoặc nhập mã thủ công" (ô nhập vẫn dùng được); đang tra cứu → skeleton trong Sheet; lỗi mạng → Alert "Không kết nối được máy chủ. Thử lại." (không coi là vé không hợp lệ).

### 29 — POS giả lập `/pos`
- **R:** R-129, R-121…R-128, R-130 (log ở server).
- **D:** `StaffHeader` "CINEMO POS / HN01" + pill "KẾT NỐI API • ONLINE" (mint; mất kết nối → danger "OFFLINE — không thể bán", R-128) + menu nhân viên. h1 "Bán vé tại quầy". 3 cột: (1) "Suất đang mở bán" — card suất: phim, "19:30 • Phòng 03", "92/120 ghế", chọn = viền brand; suất huỷ/đóng bán không hiện (R-127). (2) "Sơ đồ ghế • {phim}" — `SeatMap` dùng chung (realtime, POS thấy cả ghế web đang giữ); chọn ghế → **gọi giữ ngay** (R-121), ghế chuyển Đang chọn; "Đã chọn: C4, C5", pill đồng hồ "Giữ ghế 04:58" (5', R-124) + nút "Gia hạn" (+5') + nút "Nhả ghế" (secondary). (3) "Thanh toán": Ghế, "2 × 90k", Tổng tiền 26/800, CTA gradient "Xác nhận bán", ghi chú "Đơn tại quầy không đi qua PayOS." + "Hệ thống web là nguồn dữ liệu trạng thái ghế duy nhất."
- **Sau bán:** Dialog "Đã bán • Mã đặt vé HN01-8Q2P7B" + QR + nút "In mã đặt vé" (`window.print`, stylesheet in nền trắng) + "Giao dịch mới".
- **States:** ghế không khả dụng (R-122) → toast danger "Ghế F8 đang được giữ hoặc đã bán"; hết 5' → ghế tự nhả + toast warning; bấm rời suất khi đang giữ → ConfirmDialog nhả ghế; lỗi `requestId` trùng → UI không hiện lỗi (idempotent).
- **M/tablet:** POS là màn desktop/tablet ≥ 1024; < 1024 chuyển 3 cột thành 3 bước dọc (Suất → Ghế → Thanh toán).

---

## 9. Màn quản trị (Admin / Cinema Manager)

Chung: `AdminShell` + `PageHeader` + `CinemaScopeSelect` (topbar). Mọi danh sách dùng `DataTable` (loading = 5 hàng skeleton; empty = "Chưa có {đối tượng}" + nút tạo nếu có quyền; lỗi = `ErrorState`). Mọi form dùng `FormSection`, nút lưu gradient, rời trang khi có thay đổi chưa lưu → ConfirmDialog. Mọi thao tác thay đổi dữ liệu được audit ở server (R-107) — UI không thêm bước. **< 1024px:** sidebar → Sheet; bảng → card; form 1 cột.

### Bổ sung (thay 18/40) — Việc cần làm `/admin` (D5)
- **R:** R-104, R-110, R-109, R-39. Theo phạm vi rạp ở topbar.
- **Nội dung:** h1 "Việc cần làm"; hàng 3 card đếm có link: "Đơn cần xử lý" (danger nếu > 0) → `/admin/don-can-xu-ly`; "Đơn bị ảnh hưởng chưa xử lý" → `/admin/don-bi-anh-huong?status=pending`; "Email gửi lỗi" → lọc `failed`. Bảng "Suất chiếu sắp bắt đầu" (Rạp, Phim, Suất, Phòng, Vé bán `92/120`, Trạng thái) — giữ bảng handoff 18. Staff: chỉ card "Đơn bị ảnh hưởng" + lối tắt Soát vé / POS.
- **Không build:** KPI doanh thu, biểu đồ doanh thu, doanh thu theo rạp (R-118 GĐ2).
- **Empty:** "Không có việc cần xử lý" (icon CheckCircle mint).

### 20 — Quản lý phim `/admin/phim` · 37 — Form phim
- **R:** R-41, R-42. Chỉ Admin.
- **20:** `DataTable` cột: Phim (poster 40 + tên), Mã phim, Thể loại, Thời lượng, Phân loại (`AgeRatingBadge`), Khởi chiếu, Trạng thái (Đang chiếu/Sắp chiếu/Ẩn). Hành động: Sửa, Ẩn/Hiện. Nút "＋ Thêm phim".
- **37:** 2 cột: trái `FormSection` "Thông tin phim": Tên phim (VN)*, Tên gốc, Thời lượng (phút)*, Ngày khởi chiếu*, Thể loại (multi-select), Phân loại độ tuổi* (Select P/K/T13/T16/T18 — R-42), Đạo diễn, **[bổ sung] Diễn viên**, Quốc gia, **[bổ sung] Ngôn ngữ / Phụ đề / Lồng tiếng**, Mô tả (textarea), **[bổ sung] Trạng thái hiển thị** (Switch). Phải "Tài nguyên media": ô upload Poster (2:3) và Banner (16:9) có preview + thay/xoá (Supabase Storage), Trailer YouTube URL (validate + preview embed). Lỗi upload: định dạng/dung lượng.

### 19 — Quản lý rạp `/admin/rap` · 36 — Form rạp
- **R:** R-32, R-33, R-38, R-56, R-39.
- **19:** cột Mã rạp, Tên rạp, Tỉnh/thành, Phòng, Quản lý, Trạng thái (badge 4 trạng thái), "•••" (Sửa, Phòng chiếu, Đổi trạng thái). Manager: chỉ thấy rạp mình, không có "＋ Thêm rạp", không đổi trạng thái.
- **Đổi trạng thái sang Tạm đóng / Ngừng hoạt động (R-33, AC-26):** Dialog chọn trạng thái → hệ thống kiểm tra; còn suất tương lai đã bán → Dialog chặn: "Rạp còn {3} suất tương lai đã bán vé ({n} đơn). Cần huỷ các suất này (kèm email cho khách) trước khi đổi trạng thái." + nút "Huỷ hàng loạt các suất" → `CancelShowtimesDialog` (§10) với phạm vi "tất cả suất tương lai của rạp", lý do đóng cửa → xong mới cho đổi.
- **36:** `FormSection` "Thông tin cơ bản": Tên rạp*, Mã rạp* (ngắn, in hoa, duy nhất, dùng trên vé — khoá sau khi có vé bán), Tỉnh/thành*, Quận/huyện, Địa chỉ*, Hotline, Email, Giờ mở cửa/đóng cửa, Trạng thái. "Bản đồ & tiện ích": `MapView` click đặt toạ độ + ô lat/lng, tiện ích (checkbox chip: Bãi đỗ xe, Thang máy, Phòng VIP…). "Ảnh đại diện rạp" upload. **[bổ sung] "Cấu hình rạp"** (R-56): Thời gian dọn phòng (phút, mặc định từ chuỗi), Đóng bán online trước suất (phút) — có ghi chú "Mặc định chuỗi: 15 phút". Manager chỉ sửa được thông tin + cấu hình rạp mình.

### 22 — Phòng & sơ đồ ghế
- **R:** R-47, R-48.
- **Bổ sung danh sách phòng** `/admin/rap/[id]/phong`: bảng Tên phòng, Định dạng (2D/3D), Số ghế, Trạng thái (Hoạt động/Bảo trì), "Sơ đồ ghế"; nút "＋ Thêm phòng" (Dialog: tên, định dạng, trạng thái).
- **Trình dựng `/admin/phong/[roomId]/so-do` (22):** header "CINEMO Long Biên / Phòng 03" + badge trạng thái + CTA "Lưu sơ đồ". Trái panel "Trình dựng sơ đồ ghế": hướng dẫn "Chọn loại ghế bên phải, sau đó nhấn vào ô để đặt loại ghế."; `SeatMap` biến thể `builder` (ô lưới có viền nét đứt cho ô trống/lối đi, kéo-chọn nhiều ô). Phải "Thuộc tính ghế": palette chọn loại **Ghế thường / Ghế VIP / Ghế đôi (Sweetbox — đặt 2 ô liền) / Lối đi / Ghế hỏng** — **bỏ cột giá** của handoff (giá thuộc Bảng giá R-52; xem §11 Đ-H4); số hàng/cột (stepper), "＋ Thêm hàng ghế", **[bổ sung] "Sao chép sơ đồ từ phòng khác"** (Dialog chọn rạp → phòng, cảnh báo ghi đè). Footer "Tổng: 80 ghế • 6 VIP • 2 Sweetbox".
- **States:** phòng có suất đã bán → sơ đồ **chỉ đọc** + Alert "Phòng có suất đã bán vé, không thể sửa sơ đồ" (bảo vệ dữ liệu vé); sweetbox đặt lẻ ô → báo lỗi; lưu lỗi validate (hàng trống, ghế trùng nhãn).
- Bàn phím: mũi tên di chuyển ô, phím 1–5 chọn loại, Space đặt.

### 21 — Lịch chiếu `/admin/lich-chieu` · 38 — Tạo suất · Bổ sung chi tiết suất
- **R:** R-49…R-51, R-54, R-55, R-57, R-108.
- **21:** filter Rạp / Ngày / Phòng + CTA "＋ Tạo suất chiếu"; tiêu đề ngày "Thứ Tư, 11 tháng 11, 2026"; **lưới thời gian** 08:00–24:00 hàng = phòng, khối suất (phim, giờ, màu theo trạng thái: đang bán = surface-control viền brand; đóng bán = neutral; huỷ = danger-soft gạch ngang). Click khối → trang chi tiết suất. Kéo thả đổi giờ (handoff) **chỉ với suất chưa có vé bán** (R-54) và vẫn kiểm trùng phòng — tuỳ chọn, có thể để sau (xem "Điểm cần user quyết" #7). M: lưới → danh sách theo phòng.
- **38:** `FormSection` "Thông tin suất chiếu": Rạp*, Phòng chiếu*, Phim*, Ngày chiếu*, Giờ bắt đầu*, Định dạng*, Ngôn ngữ* (Phụ đề/Lồng tiếng), Giá áp dụng (Theo bảng giá rạp | ghi đè suất → mở bảng nhập giá theo loại ghế, R-52), Đóng bán online trước (phút, R-56). Khối "Tạo hàng loạt" (Switch): nhiều ngày (range), nhiều khung giờ (chips), nhiều phòng; Admin thêm chọn **nhiều rạp** (R-51). Cột phải "Xem trước": card suất + "Kết thúc dự kiến 21:51 (đã gồm dọn phòng)" (R-49) + kiểm trùng: mint "Phòng không bị trùng" / danger "Trùng với suất {phim} 19:00–21:15 tại Phòng 03" (R-50, chặn lưu). Hàng loạt → bảng preview n suất, đánh dấu suất trùng (bỏ qua hoặc chặn), CTA "Tạo {n} suất chiếu". Ghi chú handoff: "Suất có vé bán sẽ không thể xoá hoặc sửa giờ."
- **Bổ sung — Chi tiết suất `/admin/lich-chieu/[id]`:** thông tin suất + badge trạng thái + số vé bán/sức chứa; `SeatMap readOnly` thời gian thực; hành động: **Sửa** (chỉ khi chưa bán), **Xoá** (chỉ khi chưa bán), **Đóng bán** (ConfirmDialog, R-54), **Huỷ suất** (destructive → `CancelShowtimesDialog`, R-108), **Khoá ghế** (chế độ `lock`: chọn ghế → "Khoá {n} ghế" kèm lý do Khách mời/Ghế hỏng; mở khoá ghế đã khoá — R-55). Suất có vé bán: nút Sửa/Xoá disabled + tooltip lý do.

### 35 — Bảng giá `/admin/gia` · Bổ sung ngày lễ `/admin/ngay-le`
- **R:** R-52, R-53.
- **35:** khối "BẢNG GIÁ MẶC ĐỊNH TOÀN CHUỖI" (chỉ Admin sửa): ma trận Loại ghế × Định dạng (hàng) × **Loại ngày (Ngày thường / Cuối tuần / Ngày lễ) × Khung giờ (Trước 17h / Sau 17h)** (cột nhóm 2 cấp — handoff thiếu khung giờ, bổ sung); ô giá sửa inline (input số, hậu tố đ, tabular), "＋ Thêm quy tắc". Ghi chú "Đơn vị: VND • Có thể ghi đè theo rạp hoặc theo suất chiếu." + "Sweetbox: giá theo cặp". Khối "Ghi đè giá theo rạp" (theo rạp ở topbar; Manager chỉ rạp mình): card mỗi ghi đè "VIP 2D • Cuối tuần • Sau 17:00 — Giá chuỗi 135.000đ → Giá rạp 120.000đ" + "Chỉnh sửa ghi đè"/"Xoá". Thứ tự ưu tiên hiển thị: "Ghi đè suất › Ghi đè rạp › Mặc định chuỗi". **Bỏ** phần combo (GĐ2).
- **Ngày lễ (bổ sung, Admin):** bảng Ngày, Tên ngày lễ, "•••"; Dialog thêm (DatePicker + tên); ghi chú "Ngày lễ áp giá loại ngày 'lễ' ở mọi rạp, ưu tiên hơn cuối tuần."
- **States:** đổi giá → ConfirmDialog "Giá mới áp dụng cho đơn giữ ghế sau thời điểm lưu; đơn đang giữ giữ nguyên giá" (R-72).

### 25 — Voucher `/admin/voucher`
- **R:** R-90, R-93, R-94. Admin CRUD; Manager chỉ xem (ẩn nút tạo/sửa).
- **Bảng:** Mã voucher, Loại giảm ("20% • tối đa 50k" / "50.000đ"), Áp dụng (Vé/Combo/Cả đơn — "Combo" chỉ hiển thị khi GĐ2), Thời hạn, Đã dùng / tổng lượt, Trạng thái (Đang chạy/Tạm dừng/Hết hạn). **Cột "Phạm vi" (rạp/tỉnh) ẩn ở MVP** (R-91 GĐ2) — mọi voucher toàn chuỗi.
- **Form (Sheet phải):** Mã* (in hoa), Loại giảm (% + trần tối đa | số tiền cố định), Áp dụng cho, Hiệu lực từ–đến, Giá trị đơn tối thiểu, Tổng lượt, Lượt mỗi khách, Phim/khung giờ áp dụng (tuỳ chọn), Trạng thái.

### 23 — Đơn hàng `/admin/don-hang` · Bổ sung chi tiết đơn
- **R:** R-103, R-104. Staff chỉ đọc.
- **23:** ô tìm "Mã đặt vé, email, SĐT, mã giao dịch PayOS" (R-103); lọc Trạng thái (§1.8), Kênh (Web/POS), Ngày, Rạp (Admin). Cột: Mã đơn, Khách hàng, Rạp, Phim / suất, Ghế, Tổng tiền, Kênh, Trạng thái (`OrderStatusBadge`).
- **Chi tiết `/admin/don-hang/[code]` (bổ sung):** header mã đơn + badge; 2 cột: thông tin đơn (khách, rạp, phim, suất, ghế, giá chốt, voucher, tổng, kênh) | "Thanh toán" (orderCode PayOS, mã giao dịch, số tiền, thời điểm — không có dữ liệu thẻ/tài khoản, R-81) ; **Timeline "Lịch sử trạng thái"** (dọc: chấm màu tone + trạng thái + thời điểm + tác nhân); "Bằng chứng đồng ý" (thời điểm, phiên bản nội dung, IP — chỉ Admin/Manager). Đơn `needs_manual_review` → khối xử lý (§10).

### 24 — Đơn bị ảnh hưởng `/admin/don-bi-anh-huong` · 34 — Chi tiết
- **R:** R-109, R-110, R-134. Staff/Manager rạp mình + Admin.
- **24:** lọc theo Suất/Rạp, Trạng thái xử lý (Chờ xử lý / Đã đổi suất / Đã hoàn tiền), Trạng thái email; cột: Mã đơn, Rạp, Suất bị huỷ, Khách hàng, Email đã gửi (`EmailStatusBadge`; đơn POS = "Không có email — liên hệ tại quầy"), Xử lý, Thao tác (Ghi nhận / Chi tiết / **Gửi lại** khi email lỗi). **[bổ sung] Nút "Xuất CSV"** ở PageHeader (MVP theo R-110, xuất theo bộ lọc hiện tại).
- **34:** header "ĐƠN BỊ ẢNH HƯỞNG / HN01-7K3P9Q" + CTA "Lưu xử lý". "Thông tin đơn hàng": khách, suất bị huỷ, rạp • phòng • ghế, **Lý do huỷ**, "Email thông báo" badge + thời điểm + nút "Gửi lại email" (khi lỗi). "Ghi nhận phương án xử lý" badge "BẮT BUỘC CHỌN 1" — RadioGroup card:
  - **Đã đổi suất tại quầy** → Suất mới / mã vé mới.
  - **Đã hoàn tiền thủ công** → Số tiền*, Ngày*, **Phương thức*** (Chuyển khoản/Tiền mặt — bổ sung, handoff thiếu), **Mã giao dịch ngân hàng*** ; người thực hiện tự điền ("Người xử lý: Manager HN01"). Thiếu trường → lỗi field + chặn lưu (R-110, AC-25).
  - Ghi chú nội bộ (tuỳ chọn).
  Đã ghi nhận → form chỉ đọc + timeline.

### 26 — Người dùng & phân quyền `/admin/nguoi-dung`
- **R:** R-105, R-17, R-39.
- **Bảng:** Họ tên, Email, Vai trò (badge), Rạp được gán ("HN01" / "Toàn chuỗi" / "—"), Ngày tạo, Trạng thái (Hoạt động/Đã khoá), "•••": Gán vai trò & rạp, Khoá/Mở khoá (ConfirmDialog). Lọc vai trò.
- **Dialog "Gán vai trò & rạp":** Select vai trò (Customer/Staff/Cinema Manager/Admin), multi-select rạp (bắt buộc với Staff/Manager). **Manager:** chỉ thấy nút "＋ Thêm Staff cho rạp" (tìm user theo email → gán Staff rạp mình) và "Gỡ khỏi rạp"; không thấy lựa chọn vai trò khác (R-105). Không có luồng tạo tài khoản nhân sự công khai (R-17).

### 27 — Báo cáo `/admin/bao-cao` (phần MVP)
- **R:** R-112, R-113, R-116, R-119 (phần suất bị huỷ — quyết định #3).
- **Bố cục:** filter Từ–Đến (DateRange), Nhóm theo Ngày/Tuần/Tháng, phạm vi rạp (topbar). Tabs:
  1. **Doanh thu** (R-112): KPI Doanh thu (sau giảm), Trước giảm giá, Vé đã bán; biểu đồ cột doanh thu theo kỳ (chart-1); bảng kỳ × (vé, combo = 0 ở MVP, trước/sau giảm).
  2. **Theo phim / suất / rạp** (R-113): bảng có Tabs con Phim / Suất / Rạp: doanh thu + số vé (Rạp: chỉ liệt kê, **không** xếp hạng so sánh — R-115 GĐ2).
  3. **Đối soát PayOS** (R-116): bảng giao dịch (orderCode, mã giao dịch, số tiền, thời điểm, đơn, trạng thái khớp/lệch), lọc "Chỉ đơn lệch" (badge danger "Lệch số tiền"/"Lệch trạng thái"), tổng tiền theo rạp.
  4. **Suất bị huỷ** (R-119 phần MVP): mỗi suất huỷ: số đơn ảnh hưởng, đã đổi suất, đã hoàn tiền, **tổng tiền hoàn thủ công**.
- **Không build:** KPI "Tỷ lệ lấp đầy", "Voucher đã dùng", "Hiệu quả theo rạp" xếp hạng, nút "Xuất CSV" báo cáo (GĐ2).
- **States:** khoảng ngày không có dữ liệu → EmptyState "Không có giao dịch trong khoảng đã chọn".

### 28 — Cấu hình `/admin/cau-hinh` · Audit log `/admin/audit-log`
- **R:** R-106, R-56, R-107.
- **Cấu hình (Admin):** "Cấu hình toàn chuỗi": Thời gian giữ ghế (phút, mặc định 10), Đóng bán online trước suất (mặc định), Thời gian dọn phòng (mặc định), Email hỗ trợ; **[bổ sung] "Nội dung cảnh báo không hoàn tiền"** (textarea có biến `{Tên rạp}`, `{Địa chỉ}`, `{giờ}`, `{ngày}` + preview khối `NoRefundNotice`) và **"Điều khoản sử dụng"** (editor markdown đơn giản), mỗi lần lưu tạo **phiên bản mới** (hiển thị "Phiên bản 3 • 11/11/2026 09:10"), ConfirmDialog "Thay đổi áp dụng cho đơn/đăng ký mới". **Manager:** chỉ thấy "Cấu hình rạp {HN01}" (dọn phòng, đóng bán online — R-56), không thấy chính sách.
- **Audit log (Admin):** DataTable Thời gian, Người thực hiện (vai trò + tên/POS key), Rạp, Thao tác, Đối tượng; lọc theo rạp/người/loại thao tác/ngày; bấm hàng → Sheet "Giá trị trước / sau" (diff 2 cột, mono 12).

### 39 — Tích hợp POS & khoá API `/admin/tich-hop-pos`
- **R:** R-111, R-130. Chỉ Admin.
- **Nội dung:** "Khoá API theo từng rạp" + CTA "＋ Tạo khoá API"; mô tả "Mỗi khoá chỉ có quyền đọc / giữ / nhả / bán ghế thuộc rạp được gán."; danh sách hàng: "HN01 • Long Biên", khoá che `cnm_live_•••••••82K1` (mono), badge trạng thái, "Gọi gần nhất: 09:12 hôm nay", "•••" (Xoay khoá, Thu hồi, Xem nhật ký). Alert warning cuối: "Secret chỉ hiển thị một lần khi tạo; thu hồi hoặc xoay khoá sẽ ngắt kết nối POS cũ."
- **[bổ sung] Dialog secret một lần:** sau tạo/xoay: khoá đầy đủ trong ô mono read-only + nút "Sao chép", Alert danger "Đây là lần duy nhất khoá được hiển thị", checkbox "Tôi đã lưu khoá" mới cho đóng.
- **[bổ sung] Nhật ký gọi API** (Sheet/trang con): bảng Thời điểm, Rạp, Khoá (4 ký tự cuối), Thao tác (hold/release/confirm/lookup), `requestId`, Kết quả (badge), lọc theo khoá/kết quả.
- Thu hồi/xoay → ConfirmDialog destructive.

---

## 10. Màn MVP thiếu trong handoff

Spec theo ngôn ngữ handoff (cùng token, shell, component). Các màn đã spec đầy đủ ở §7–§9 chỉ liệt kê tham chiếu.

| # | Màn / khối | Route / dạng | R-xx | Spec |
|---|---|---|---|---|
| B1 | Danh sách & tìm phim | `/phim` | R-43 | §7 |
| B2 | Đặt lại mật khẩu | `/dat-lai-mat-khau` | R-13 | §7 (33) |
| B3 | Kết quả link xác nhận email | `/xac-nhan-email?status=` | R-04 | §7 (14) |
| B4 | Bước nhập email cho Facebook không email | `(auth)` bước phụ | R-19 | §7 (12) |
| B5 | Đang xác nhận thanh toán (returnUrl) + thất bại | `/dat-ve/don/[id]/ket-qua` | R-79, R-77 | §7 (10) |
| B6 | Chi tiết vé desktop | `/ve/[bookingCode]` | R-87 | §7 (32) |
| B7 | Rạp yêu thích, Tuỳ chọn email | `/tai-khoan/*` | R-31, R-30 | §7 (15) |
| B8 | **Xoá tài khoản** | Dialog nhiều bước từ `/tai-khoan` | R-29 | dưới |
| B9 | **Điều khoản sử dụng / Chính sách bảo mật / Hướng dẫn xoá dữ liệu** | `/dieu-khoan`, `/chinh-sach-bao-mat`, `/huong-dan-xoa-du-lieu` | R-03, R-25, R-133(1), NFR-08 | dưới |
| B10 | **Chọn tỉnh/thành lần đầu** | `ProvincePickerDialog` | R-35 | dưới |
| B11 | **Banner chưa xác nhận email** | `UnverifiedEmailBanner` | R-05, R-06 | §5.1 |
| B12 | **Hết giờ giữ ghế** | `HoldExpiredDialog` | R-63 | dưới |
| B13 | Đăng nhập để đặt vé | `LoginRequiredDialog` | R-16 | §5.3 |
| B14 | **Staff chọn rạp làm việc** | `/staff/chon-rap` | R-97, R-39 | §8 |
| B15 | Kết quả soát vé thất bại (4 biến thể) | `CheckinResult` | R-98, R-102 | §8 |
| B16 | Việc cần làm (landing nhân sự MVP) | `/admin` | R-104, R-110 | §9 |
| B17 | **Đơn cần xử lý thủ công (`needs_manual_review`)** | `/admin/don-can-xu-ly` + khối trong chi tiết đơn | R-104, R-78 | dưới |
| B18 | Chi tiết đơn + lịch sử trạng thái | `/admin/don-hang/[code]` | R-103 | §9 |
| B19 | Chi tiết suất (đóng bán, khoá ghế) | `/admin/lich-chieu/[id]` | R-54, R-55 | §9 |
| B20 | **Modal huỷ suất (một/nhiều/tất cả suất của rạp)** | `CancelShowtimesDialog` | R-108, R-109, R-33 | dưới |
| B21 | Danh sách phòng + Sao chép sơ đồ | `/admin/rap/[id]/phong`, Dialog | R-47, R-48 | §9 |
| B22 | Ngày lễ | `/admin/ngay-le` | R-53 | §9 |
| B23 | Cấu hình nội dung cảnh báo + điều khoản (phiên bản) | `/admin/cau-hinh` | R-106 | §9 |
| B24 | Dialog secret API một lần + nhật ký API POS | `/admin/tich-hop-pos` | R-111, R-130 | §9 |
| B25 | Trang 404 / 500 / 403 | system | — | §6 |

### B8 — Xoá tài khoản (R-29)
Dialog 3 bước (radius 16, max 480), nút destructive chỉ ở bước cuối:
1. **Cảnh báo:** icon AlertTriangle danger, "Xoá tài khoản CINEMO?", danh sách: "Dữ liệu cá nhân sẽ được ẩn danh", "Lịch sử đơn hàng được lưu ẩn danh theo quy định kế toán", **"Bạn còn {2} vé chưa sử dụng — các vé này sẽ mất hiệu lực và không được hoàn tiền"** (danger, chỉ khi có). Checkbox "Tôi hiểu và muốn xoá tài khoản". [Huỷ] [Tiếp tục].
2. **Xác minh:** tài khoản có mật khẩu → ô "Nhập mật khẩu"; chỉ OAuth → nút "Xác minh với Google/Facebook" (re-auth popup). Sai → lỗi field.
3. **Xác nhận cuối:** nút destructive "Xoá vĩnh viễn tài khoản" → loading → đăng xuất → trang `/` với toast "Tài khoản đã được xoá".

### B9 — Trang pháp lý (R-03, R-25, NFR-08)
Layout đọc dài: nội dung max 760, h1 + "Phiên bản {n} • cập nhật {dd/MM/yyyy}", mục lục dính bên trái (≥ 1024) / Accordion "Mục lục" (M), typography body 16/1.7 (trang đọc — ngoại lệ có chủ đích so với body 14), heading h2/h3, link brand. `/dieu-khoan` render phiên bản điều khoản hiện hành từ cấu hình (R-106) và **có mục chính sách Không huỷ – Không hoàn** (R-133 lớp 1). `/huong-dan-xoa-du-lieu`: các bước xoá trong tài khoản (link `/tai-khoan`), cách yêu cầu xoá dữ liệu Facebook qua email hỗ trợ, thời gian xử lý — URL công khai, không cần đăng nhập, SSR (yêu cầu Facebook App Review).

### B10 — Chọn tỉnh/thành lần đầu (R-35, §8.3 BRD)
Dialog không đóng bằng click ngoài khi chưa có lựa chọn (vẫn có nút "Để sau" → mặc định tỉnh có nhiều rạp nhất, ghi nhớ). Tiêu đề "Bạn muốn xem lịch chiếu ở đâu?", lưới chip tỉnh/thành có rạp (≥ 44px), số rạp mỗi tỉnh text-muted. Không xin định vị (R-36 GĐ2).

### B12 — Hết giờ giữ ghế (R-63)
AlertDialog không đóng được bằng Esc: icon Clock warning, "Đã hết thời gian giữ ghế", "Ghế {E5, E6} đã được nhả cho khách khác. Vui lòng chọn lại." CTA gradient "Chọn lại ghế" → `/dat-ve/[showtimeId]` (cùng suất). Biến thể ở 09 thêm câu về chuyển khoản đến muộn (§7).

### B17 — Đơn cần xử lý thủ công (R-104, R-78, AC-11)
- `/admin/don-can-xu-ly`: DataTable Mã đơn, Rạp, Suất, Khách, Số tiền đã nhận, Lý do (vd "Tiền về sau khi ghế đã bán cho khách khác"), Thời điểm, Trạng thái (Cần xử lý / Đã giải quyết). Lọc trạng thái. Badge số đếm trên sidebar.
- Chi tiết (trong `/admin/don-hang/[code]`): khối danger-soft "Đơn cần xem xét thủ công" + lý do + thông tin giao dịch PayOS; form "Ghi chú cách xử lý"* (textarea) + nút gradient "Đánh dấu đã giải quyết" (ConfirmDialog). Sau giải quyết: khối chỉ đọc "Đã giải quyết bởi {người} lúc {thời điểm}" + ghi chú.

### B20 — Huỷ suất chiếu (R-108, R-109, R-33, AC-24, AC-26)
`CancelShowtimesDialog` (Dialog rộng 640, 3 bước):
1. **Phạm vi:** danh sách suất đã chọn (phim, rạp, phòng, giờ) — mở từ chi tiết suất (1 suất), chọn nhiều trong lưới lịch chiếu (checkbox mode), hoặc "tất cả suất tương lai của rạp" (từ đổi trạng thái rạp). Ô **Lý do huỷ*** (textarea, hiển thị trong email khách).
2. **Xem trước ảnh hưởng:** card số liệu "{3} suất • {10} đơn đã thanh toán • {18} vé • {2} đơn đang giữ/chờ thanh toán sẽ bị huỷ • {1} đơn POS (không có email)" + mẫu email (hướng xử lý theo loại: huỷ suất → đổi suất tại quầy / liên hệ hoàn tiền; đóng cửa → rạp liên hệ hoàn tiền) — R-109.
3. **Xác nhận:** Alert danger "Không thể hoàn tác. Suất sẽ ngừng bán trên web và POS; vé không thể check-in." Ô nhập xác nhận gõ mã rạp (vd `HN01`) để bật nút destructive "Huỷ {3} suất chiếu".
Kết quả: toast + điều hướng `/admin/don-bi-anh-huong?showtime=…` nơi theo dõi trạng thái gửi email (AC-24).

---

## 11. Điều chỉnh so với handoff

### 11.1 Thị giác / a11y (chi tiết + tỉ lệ ở `design-tokens.md` §5–§6)

| # | Handoff | Điều chỉnh | Lý do |
|---|---|---|---|
| Đ1 | Nút coral/gradient chữ trắng | Chữ `#0B0D12` | Trắng/coral 2.98:1, trắng/gradient 2.80–4.08:1 < 4.5 |
| Đ2 | ~20 sắc xám lẻ (`#667184`…) | Map về 3 token chữ | `#667184` 3.54:1 fail; nhất quán |
| Đ3 | Viền input `#303746` | `#66768C` | Ranh giới ô nhập ≥ 3:1 |
| Đ4 | Ghế chỉ khác màu; available/VIP < 3:1 với nền | Viền sáng + ký hiệu (×, đồng hồ, khoá, vạch VIP, ô đôi) + aria-label | WCAG 1.4.11, 1.4.1, NFR-12 |
| Đ5 | Input 13–14px | 16px dưới 768px | Tránh iOS zoom |
| Đ6 | Trạng thái bảng admin là chữ trơn | Badge tone | Quét nhanh trạng thái nguy cấp |
| Đ7 | Thiếu token ghế khoá/sweetbox, nhãn tuổi, soát vé thất bại, trạng thái đơn | Bổ sung từ họ màu handoff | R-42, R-48, R-55, R-98 |
| Đ8 | Glyph ký tự làm icon (⌕ ⌄ ▣ ♧ ⌖ •) | lucide-react | Hiển thị nhất quán, có aria-label |
| Đ9 | Soát vé chỉ có khung desktop | Mobile là bố cục chính, kết quả trong Sheet | R-97 (Staff dùng điện thoại) |
| Đ10 | Trang pháp lý body 14 | Body 16/1.7 cho trang đọc dài | Khả năng đọc |

### 11.2 Nội dung / chức năng (để khớp SPEC MVP)

| # | Màn | Handoff | Điều chỉnh |
|---|---|---|---|
| H1 | 06/07/08/09 | "BƯỚC x / 5" có Combo | 4 bước; bỏ 07 và dòng combo ở 08 (GĐ2) |
| H2 | 01/30 | "Rạp gần bạn • 3,2 km", nav "Khuyến mãi" | Rạp yêu thích / Rạp tại tỉnh; ẩn "Khuyến mãi" |
| H3 | 08 | Không có voucher, không checkbox tuổi, cảnh báo thiếu địa chỉ + suất, chỉ inline | Thêm `VoucherField`, `AgeWarning`, nội dung R-133 đầy đủ, AlertDialog cuối (D3) |
| H4 | 22 | Giá theo loại ghế trong trình dựng sơ đồ | Bỏ giá (giá ở Bảng giá R-52); thêm sao chép sơ đồ |
| H5 | 12/13 | Không có CAPTCHA; gợi ý "Tối thiểu 8 ký tự" | Turnstile; gợi ý 8–72, hoa/thường/số; opt-in khuyến mãi mặc định tắt |
| H6 | 17 | Chỉ kết quả hợp lệ | 5 biến thể kết quả, "Sai rạp" chỉ tên + địa chỉ |
| H7 | 18/40 | Dashboard KPI + biểu đồ | GĐ2; MVP "Việc cần làm" |
| H8 | 25 | Cột "Phạm vi" rạp/tỉnh | Ẩn (R-91 GĐ2) |
| H9 | 27 | Lấp đầy, so sánh rạp, voucher, Xuất CSV | Bỏ (GĐ2); thêm tab Đối soát PayOS + Suất bị huỷ |
| H10 | 24/34 | Thiếu Xuất CSV, thiếu "phương thức" hoàn tiền | Thêm (R-110) |
| H11 | 35 | Thiếu khung giờ trước/sau 17h; có combo | Thêm khung giờ; bỏ combo |
| H12 | 28 | Chỉ 4 cấu hình số | Thêm nội dung cảnh báo + điều khoản có phiên bản |
| H13 | 39 | Không có dialog secret, nhật ký API | Thêm |
| H14 | 02/04/05 | Dữ liệu demo lệch (badge T18, meta "T16") | Một nguồn `ageRating` |
| H15 | Admin | Mô tả trang lặp một câu chung | Mô tả riêng từng trang |

---

## 12. Điểm cần user quyết

| # | Câu hỏi | Mặc định đang spec | Phương án khác |
|---|---|---|---|
| 1 | **Chữ trên nút coral:** handoff chữ trắng nhưng chỉ đạt 2.98:1. | **Chữ tối `#0B0D12`** trên fill coral/gradient giữ nguyên (6.52:1; điểm tối nhất gradient 4.77:1). | (b) Giữ chữ trắng, tối fill nút xuống `#C9473A` (4.72:1) — coral của nút trầm hơn handoff, coral sáng chỉ còn cho chữ/icon/ghế. (c) Giữ nguyên handoff, chấp nhận fail AA (trái NFR-12 — không khuyến nghị). |
| 2 | **Cảnh báo không huỷ/không hoàn (R-71):** handoff là khối inline. | Inline + checkbox (gating nút) **và** AlertDialog xác nhận cuối khi bấm Thanh toán (D3). | Chỉ inline như handoff (ít bước hơn; cần chấp nhận "hộp thoại" = khối cảnh báo trên trang). |
| 3 | **Cỡ chữ nhỏ:** handoff có chữ 8–10px. | Sàn 10px desktop / 11px mobile; thông tin bắt buộc ≥ 12px. | Nâng sàn lên 12px toàn hệ thống (dễ đọc hơn, lệch handoff nhiều hơn ở admin/poster). |
| 4 | **Landing nhân sự MVP:** dashboard 18/40 là GĐ2. | Trang "Việc cần làm" (đếm đơn cần xử lý / bị ảnh hưởng / email lỗi + suất sắp bắt đầu). | Đưa thẳng về `/admin/don-hang`. |
| 5 | **Audit log cho Cinema Manager:** R-107 chỉ yêu cầu ghi log, không nêu ai xem. | Chỉ Admin xem. | Manager xem log của rạp mình. |
| 6 | **"Tăng độ sáng tối đa" khi mở QR (R-87):** trình duyệt không chỉnh được độ sáng hệ thống. | Overlay nền trắng toàn màn hình + Screen Wake Lock + gợi ý tự tăng độ sáng. | Ghi nhận giới hạn kỹ thuật vào spec qua `/change`. |
| 7 | **Kéo thả đổi giờ ở lưới lịch chiếu (21):** handoff có, requirement không bắt buộc. | Để sau (MVP chỉ click mở form sửa). | Làm kéo thả cho suất chưa bán (tốn thêm task, cần a11y bàn phím). |
| 8 | **Phân loại K:** ý nghĩa nhãn hiển thị cho khách. | "Dưới 13 tuổi xem cùng người giám hộ" (theo quy định phổ biến). | User cung cấp câu chữ chính thức cho P/K/T13/T16/T18. |

---

## 13. Ma trận phủ R-xx MVP → màn

121 requirement MVP. "server" = hành vi chỉ ở backend/DB, UI chỉ hiển thị kết quả (ghi màn hiển thị nếu có).

| R-xx | Màn / component |
|---|---|
| R-01, R-02, R-03 | 13 Đăng ký |
| R-04 | 14 + B3 |
| R-05 | `UnverifiedEmailBanner`, 06, 11 |
| R-06 | 14, `UnverifiedEmailBanner` |
| R-07 | 12, 13, 33 (`TurnstileField`) |
| R-08 | server; thông báo ở 12, 13 |
| R-09 | 13 |
| R-10 | server (job) |
| R-11, R-12 | 12, 13, 33 |
| R-13 | 33 + B2 |
| R-14, R-15 | 16 (R-15 cả 12 "Ghi nhớ") |
| R-16 | 12, `LoginRequiredDialog`, 06 |
| R-17 | 13 (chỉ tạo Customer), 26 |
| R-18, R-20 | 12, 13 |
| R-19 | 12 + B4 |
| R-21, R-22, R-23, R-24 | 16 (R-24 email server) |
| R-25 | B9 `/huong-dan-xoa-du-lieu` |
| R-26, R-27, R-28 | 15 |
| R-29 | B8 |
| R-30 | 13, 15 (Tuỳ chọn email) |
| R-31 | 15, 01, 02, 03, 04 |
| R-32 | 19, 36 |
| R-33 | 19, B20 |
| R-34 | 03 |
| R-35 | `ProvinceSelect`, B10, 01, 05 |
| R-37 | 04 |
| R-38 | 19, 36, 22, 35, 38 (luồng quản trị) |
| R-39 | `CinemaScopeSelect`, `AdminShell`, B14 |
| R-40 | 01/30 |
| R-41 | 20, 37, 02 |
| R-42 | `AgeRatingBadge`: 01, 02, 04, 05, 06, 08, 10, 32, 17, 20, 37 |
| R-43 | B1 `/phim`, 05 |
| R-44 | 02 |
| R-45 | 01, 02, `MovieCard` |
| R-46 | 01, 02, 04 (SSR + meta) |
| R-47, R-48 | 22 + B21 |
| R-49, R-50, R-51 | 38, 21 |
| R-52 | 35, 38 |
| R-53 | B22 |
| R-54 | 21, B19 |
| R-55 | B19 (khoá ghế), `SeatMap` locked |
| R-56 | 36 (cấu hình rạp), 28 (Manager) |
| R-57 | mọi hiển thị giờ (`design-tokens.md` §7 quy tắc 5) |
| R-59 | `SeatMap`, `SeatLegend`, 06/31 |
| R-60 | `SeatMap` realtime, 06, 29 |
| R-61 | `CountdownTimer` 06→08→09 |
| R-62 | 06 (lỗi ghế trùng) |
| R-63 | B12 `HoldExpiredDialog` |
| R-64 | 06 (ConfirmDialog đơn cũ) |
| R-65, R-66 | `SeatMap` (giới hạn 8, ghế lẻ) |
| R-67 | `ShowtimeChip`, 02, 05, 06 |
| R-68 | `AgeWarning` 06, 08 |
| R-70 | 08 |
| R-71 | 08 + `PolicyConfirmDialog` |
| R-72 | 08 (giá chốt), 35 (ConfirmDialog đổi giá) |
| R-73 | 09 |
| R-74, R-75 | server; hiển thị lệch ở 27 Đối soát |
| R-76 | 10 |
| R-77 | 09, 10 (thất bại) |
| R-78 | B17, 09 (thông báo hết hạn) |
| R-79 | B5 (10 đang xác nhận) |
| R-80, R-81, R-83, R-84 | server; R-81 thể hiện ở chi tiết đơn (không hiển thị dữ liệu thẻ) |
| R-82 | 08 → 10 (bỏ 09) |
| R-85 | `QrTicket` 10, 32 |
| R-86 | email (nội dung theo `QrTicket`) |
| R-87 | 11, 32 |
| R-90 | 25 |
| R-92, R-93, R-94, R-95 | `VoucherField` 08 (R-93 server) |
| R-97 | 17, B14 |
| R-98, R-99 | `CheckinResult` 17 |
| R-101 | server (log), lịch sử quét 17 |
| R-102 | 17 "Sai rạp" |
| R-103 | 23 + B18 |
| R-104 | B17, B16 |
| R-105 | 26 |
| R-106 | 28 (+ B23) |
| R-107 | 28 Audit log |
| R-108 | B20, B19 |
| R-109 | 24, 34 (trạng thái + gửi lại), B20 bước 2 |
| R-110 | 24, 34 (+ Xuất CSV) |
| R-111 | 39 + B24 |
| R-112, R-113, R-116 | 27 |
| R-120, R-122, R-123, R-126, R-127, R-130 | server (API POS); thể hiện ở 29, 39 nhật ký |
| R-121, R-124, R-125, R-128, R-129 | 29 |
| R-131 | 11, 32 (không có nút huỷ/đổi), 08 |
| R-132 | 17 "Sai rạp", `QrTicket` |
| R-133 | (1) B9 · (2) 06 · (3) 08 + `PolicyConfirmDialog` · (4) 08 · (5) email + 32 · (6) server, hiển thị ở B18 |
| R-134 | 34, 27 Đối soát |

Ngoài ra phần MVP của R-119 (báo cáo suất bị huỷ, quyết định #3) → 27 tab "Suất bị huỷ". GĐ2 không spec màn: R-36, R-58, R-69, R-88, R-89, R-91, R-96, R-100, R-114, R-115, R-117, R-118, R-119 (phần kênh Web/POS).

---

## 14. Pre-Flight check

| Hạng mục | Kiểm | Kết quả |
|---|---|---|
| Tương phản chữ | Mọi cặp chữ/nền trong token ≥ 4.5 (tính toán, `design-tokens.md` §5.1); xám lẻ SVG đã map | PASS sau Đ1, Đ2 |
| Tương phản UI | Viền input, ghế chọn được, focus ring ≥ 3:1 (§5.2) | PASS sau Đ3, Đ4 |
| Không chỉ dựa màu | Ghế có ký hiệu; badge/kết quả soát vé có chữ + icon; nhãn tuổi có chữ | PASS |
| Focus | `:focus-visible` outline 2px brand offset 2 toàn cục; dialog trap focus (Radix); focus về trigger khi đóng; SeatMap roving tabindex | PASS (spec) |
| Nhãn ghế | `aria-label` hàng/số/loại/trạng thái/giá; `aria-live` thông báo chọn/đổi realtime | PASS (spec §5.3) |
| Vùng chạm | Nút/chip/nav ≥ 44×44; ghế 32×28 (D) / 28×26 (M) < 44 → bù bằng zoom + danh sách ghế đã chọn có nút bỏ ≥ 44 | Chấp nhận có bù (ghi rõ) |
| Mobile ≥ 360 | Mọi màn có bố cục M; không scroll ngang trang (SeatMap/DateStrip cuộn trong vùng riêng); input 16px | PASS (spec) |
| Font tiếng Việt | Inter variable subset `vietnamese`; line-height display ≥ 1.05 cho chữ hoa có dấu | PASS |
| Reduced motion | Tắt transition (trừ opacity) | PASS |
| Không light mode | Quyết định D1 / T1, `color-scheme: dark` | Ghi nhận |
| Nội dung BRD bắt buộc | Tên + địa chỉ rạp ở 08, 09, 10, 32; đồng hồ 10' trên mọi bước sau chọn ghế; cảnh báo không huỷ/không hoàn ở 06, 08 (+ dialog), 10, 32, điều khoản | PASS |
| Anti-slop (taste-skill §4/§9) | Không emoji làm icon (lucide); không gradient tím-xanh generic (dùng palette handoff); 1 CTA gradient/màn; câu chữ cụ thể theo màn, không lặp mô tả chung | PASS |
| GĐ2 không lọt vào MVP | 07, 18/40 KPI, combo, phạm vi voucher, lấp đầy/so sánh/CSV báo cáo, rạp gần nhất — đều đánh dấu không build | PASS |
| Diagram archify | Không làm (chưa cài — theo brief) | Bỏ qua |


## 15. Quyết định của user (2026-11-11, checkpoint design)
| # (§12) | Quyết định |
|---|---|
| 1 | Chữ tối `#0B0D12` trên nút coral/gradient (giữ màu handoff) |
| 2 | Cảnh báo không huỷ/không hoàn: khối inline có checkbox **+** AlertDialog xác nhận cuối (nhắc tên rạp + giờ chiếu) |
| 3 | Sàn cỡ chữ 10px desktop / 11px mobile; thông tin bắt buộc ≥ 12px |
| 4 | Màn đích nhân sự ở MVP = "Việc cần làm" |
| 5 | Audit log chỉ Admin |
| 6 | QR: nền trắng toàn màn + Wake Lock + nhắc tự tăng độ sáng (giới hạn trình duyệt) |
| 7 | Kéo thả đổi giờ lưới lịch chiếu: để sau |
| 8 | Nhãn tuổi theo chữ quy định VN (P / K / T13 / T16 / T18) |
