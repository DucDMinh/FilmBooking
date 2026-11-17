# Scan: hiển thị bản đồ của rạp — 2026-11-17

## Phạm vi đã soi
- Bản đồ vị trí rạp (Leaflet + OpenStreetMap) ở 2 màn khách: `/rap` (danh sách rạp) và `/rap/[code]` (chi tiết rạp).
- Component `CinemaMap`, popup marker, link "Chỉ đường", luồng dữ liệu `latitude/longitude` (DB → API → DTO → web), form admin nhập toạ độ, seed toạ độ.
- Đối chiếu spec R-34, R-37, NFR-08.
- Chế độ READ-ONLY: không chạy dev server, không chạy lệnh ghi. Chưa chạy typecheck/lint/test (không liên quan tới defect đã ghi, tiết kiệm thời gian).

## Classification
- Type: SINGLE-SURFACE (1 luồng: hiển thị bản đồ rạp)
- Source roots: `apps/web`, `apps/api`, `packages/shared`, `supabase`

## Coverage
- Enumerated surfaces: 9
- Đã soi: 9
- Coverage: 100%

| File | Surface type | Batch | Count | Kết luận |
|---|---|---:|---:|---|
| `apps/web/src/components/catalog/cinema-map.tsx` | component | 1 | 3 | soi, có defect (#2, #3, #5) |
| `apps/web/src/components/catalog/cinema-map-popup.ts` | component | 1 | 0 | soi, no match (dùng DOM node + textContent, an toàn XSS) |
| `apps/web/src/app/(public)/rap/page.tsx` | page | 1 | 1 | soi, có defect (#1) |
| `apps/web/src/app/(public)/rap/[code]/page.tsx` | page | 1 | 1 | soi, có defect (#5 trùng lặp directionsUrl) |
| `apps/web/src/components/shell/site-header.tsx` | component | 1 | 1 | đọc đúng dòng `z-40`, đối chiếu với defect #2 |
| `apps/api/src/modules/catalog/cinemas.service.ts` | service | 1 | 0 | soi, no match (select + map `latitude/longitude` đúng) |
| `packages/shared/src/schemas/catalog.ts` | schema | 1 | 0 | soi, no match (lat/lng nullable, có min/max) |
| `supabase/seed.sql` + migration `core_identity_chain` | data | 1 | 0 | soi, no match (HN01/HN02/HN03/HCM01/Đà Nẵng đều có toạ độ hợp lệ) |
| `apps/web/src/components/admin/cinema-form.tsx` | component | 1 | 0 | soi, no match (admin nhập được Vĩ độ/Kinh độ) |

## Chưa soi
- Không có file/surface nào chưa soi (0%).
- Hành vi runtime trên trình duyệt (tải CSS, tải tile, chồng lớp với header) chưa quan sát được vì chế độ read-only → ghi ở mục "Chưa xác minh".

## CRUD / Capability Matrix

Không áp dụng — khu vực này chỉ hiển thị dữ liệu, không có CRUD riêng. Toạ độ rạp được nhập ở màn admin cinema (`cinema-form.tsx:266-267`, có trường Vĩ độ/Kinh độ).

## Defects

| # | Mô tả | Tái hiện | Expected | Actual | Root cause (file:line) | Severity | File cần sửa | Ước lượng |
|---|-------|----------|----------|--------|------------------------|----------|--------------|-----------|
| 1 | Trang `/rap` chỉ vẽ **1 rạp** trên bản đồ, không phải toàn bộ rạp | Mở `/rap` khi có ≥ 2 rạp → kéo xuống cuối trang | Spec R-34: danh sách rạp "có bản đồ". Bản đồ thể hiện các rạp đang liệt kê (mỗi rạp 1 marker, bấm marker xem tên/địa chỉ/chỉ đường), theo bộ lọc tỉnh/thành | Chỉ hiện rạp đầu tiên có toạ độ ("Vị trí rạp (CINEMO HN01…)"), 1 marker duy nhất. Chọn tỉnh nào cũng chỉ thấy 1 điểm; các rạp còn lại không có trên bản đồ | `apps/web/src/app/(public)/rap/page.tsx:54-56` (chọn `featuredCinema` bằng `find`), `:238-256` (render 1 `CinemaMap`); `cinema-map.tsx:13-18` (props chỉ nhận 1 toạ độ, `:89-109` chỉ tạo 1 marker) | medium | `rap/page.tsx`, `cinema-map.tsx` (thêm chế độ nhiều marker, `fitBounds`) | M |
| 2 | Bản đồ có thể **đè lên header dính (sticky)** khi cuộn | Mở `/rap/[code]` hoặc `/rap`, cuộn để bản đồ trượt dưới header; mở menu thả xuống của header | Header (z-40) và menu của nó luôn nằm trên bản đồ | Leaflet đặt z-index cho các pane/control (tile 200, marker 600, popup 700, control 800+). Wrapper bản đồ chỉ `relative overflow-hidden`, **không tạo stacking context** nên các z-index này cạnh tranh trực tiếp với header z-40 → bản đồ/nút zoom/popup có thể che header. **Nghi ngờ cao, chưa quan sát runtime** | `apps/web/src/components/catalog/cinema-map.tsx:166-167` (wrapper không có `isolate`/`z-0`) vs `apps/web/src/components/shell/site-header.tsx:47` (`z-40`) | medium | `cinema-map.tsx` (thêm `isolate` hoặc `z-0` cho wrapper) | S |
| 3 | Tải CSS Leaflet bằng `import("leaflet/dist/leaflet.css")` động trong effect → rủi ro bản đồ **vỡ layout/không hiện tile** (CSS tới muộn hoặc không được inject) | Mở trang có bản đồ ở production build / Turbopack; quan sát tile bị xếp rời, marker lệch, ô vuông xám | Bản đồ có style đầy đủ ngay khi khởi tạo | Chỉ đã xác nhận cách làm; **chưa chắc có lỗi thật**. CSS được nạp bất đồng bộ sau `import("leaflet")`; nếu bundler không inject dynamic CSS (hoặc inject sau `L.map`) thì pane Leaflet không có `position:absolute` | `apps/web/src/components/catalog/cinema-map.tsx:63-64` (không có import CSS tĩnh nào khác; `globals.css` không nhắc leaflet) | medium (nghi ngờ) | `cinema-map.tsx` hoặc `globals.css` (import CSS tĩnh) | S |
| 4 | Không có test cho nhánh **có toạ độ** của `CinemaMap` (khởi tạo Leaflet, marker, cleanup) | Chạy `cinemas.test.tsx` | Test phủ nhánh render bản đồ + dọn map khi unmount (React StrictMode chạy effect 2 lần) | Chỉ test nhánh `latitude={null}` (fallback) và popup | `apps/web/src/components/catalog/__tests__/cinemas.test.tsx:163-181` | low | `__tests__/cinemas.test.tsx` | S |
| 5 | Logic `directionsUrl` bị **lặp 2 nơi** và dạng URL `directions?to=lat,lng` **chưa chắc OSM hỗ trợ** | Bấm "Chỉ đường" ở `/rap/[code]` hoặc "Mở chỉ đường" dưới bản đồ | Mở trang chỉ đường OSM với điểm đến là rạp | Hai nơi tự ghép URL giống nhau. Tham số chuẩn của OSM Directions là `route=<from>;<to>` — `to=` có thể bị bỏ qua (chỉ mở form trống). **Nghi ngờ, cần mở link thật để xác nhận** | `apps/web/src/components/catalog/cinema-map.tsx:50-52` và `apps/web/src/app/(public)/rap/[code]/page.tsx:162-165` | low | gộp thành 1 hàm dùng chung + sửa param nếu xác nhận sai | S |

## Chưa xác minh / cần thêm info
- #2 và #3 cần mở trình duyệt thực (dev/build) để xác nhận; `/bug-check` read-only nên không chạy server.
- #5: cần thử bấm link chỉ đường OSM với toạ độ thật để biết `to=` có hoạt động không.
- Chưa kiểm tra: tile OSM có bị chặn bởi mạng/CSP môi trường deploy hay không. Hiện repo **không có** CSP (`proxy.ts` không đặt header CSP), nên ở code không có gì chặn.
- Câu "hiển thị bản đồ của rạp" hơi mơ hồ: tôi hiểu là **bản đồ vị trí** (không phải sơ đồ ghế). Nếu bạn đang gặp một triệu chứng cụ thể (bản đồ trắng, không có marker, lệch vị trí…), cho tôi biết màn nào để thu hẹp — nhiều khả năng liên quan #2/#3.
- Phần tốt đã xác nhận: popup dùng `textContent` (không XSS), không gọi `navigator.geolocation` (đúng NFR-08), cleanup `map.remove()` đúng cho StrictMode, dữ liệu toạ độ đi đủ DB → API → web.
