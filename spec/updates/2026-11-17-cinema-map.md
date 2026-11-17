# Spec Update — 2026-11-17 cinema-map
**spec_version:** 3.1.0 → 3.1.0 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · `tasks/bug-cinema-map/phase-1-task-01.md` (review NORMAL PASS round 2)

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Đây là đưa bản đồ trên trang rạp (web) về đúng requirement đã có: **R-34** (danh sách rạp có bản đồ) và **R-37** (chi tiết rạp). Tuân thủ **NFR-08**: bản đồ/popup không gọi định vị, không lưu toạ độ khách.

## Lỗi đã sửa (UI web, không đổi API/DB)
1. Bản đồ nền xám, không có tile: DNS nhà mạng VN chặn `*.openstreetmap.org` (0/12 tile tải được). Nay tile layer dùng OSM France `https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png` (subdomain `abc`, maxZoom 20), attribution "© OpenStreetMap contributors, tiles by OpenStreetMap France". (CARTO đã thử và loại vì đóng dấu "API KEY REQUIRED".)
2. Link chỉ đường / tìm địa chỉ cũng trỏ `openstreetmap.org` nên chết cùng lúc. Nay dùng Google Maps URL API: có toạ độ → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`; không có → `https://www.google.com/maps/search/?api=1&query=<tên + địa chỉ>`. Gộp một hàm dùng chung `buildDirectionsUrl` ở `apps/web/src/lib/map-links.ts`.
3. Nhãn UI: "Mở chỉ đường (Google Maps)", "Tìm địa chỉ trên Google Maps", popup "Chỉ đường trên Google Maps →", tiêu đề phụ /rap "Bản đồ trực quan".

## Ảnh hưởng
- Module: web `/rap` (`page.tsx`), `/rap/[code]` (`page.tsx`), `CinemaMap`, popup, `lib/map-links.ts`.
- Test: bản đồ có tile thật (không nền xám / watermark), marker + popup, link chỉ đường Google Maps, rạp thiếu toạ độ → fallback search, không gọi `navigator.geolocation`, không request `*.openstreetmap.org`. Tile phụ thuộc mạng ngoài (OSM France) nên E2E bản đồ cần mạng có internet.
- Không đổi DB / schema / API contract.
- Residual (ngoài phạm vi, chưa sửa): scan #1 (/rap chỉ 1 rạp), #2 (z-index bản đồ đè header), #3 (CSS động), #4 (thiếu test nhánh có toạ độ); OSM France fair-use, không SLA.

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 20, specVersion 3.1.0, risk low (UI thuần, 2 trang, không đổi contract; rủi ro chính là phụ thuộc tile bên thứ ba, đã khoá bằng test URL/attribution).
