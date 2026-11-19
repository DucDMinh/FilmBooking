# Spec Update — 2026-11-19 cyberplex-reskin
**spec_version:** 3.4.0 → 3.5.0 (MINOR — thêm R-138, NFR-19, AC-31, AC-32)
**Trigger:** feature-update (**ADDITIVE** R-138 + **MODIFY** giao diện) · `spec/changes/2026-11-19-cyberplex-reskin.md` (CR-010)

## Requirements
Yêu cầu của user (2026-11-19): thiết kế lại theo phong cách file `index-cyberplex-enhanced (2).html`; chuyển động gắn với vị trí cuộn (cuộn xuống hiện dần, cuộn lên thu về; phần đặt vé từ trái sang phải, phần bên dưới từ trên xuống hoặc hai bên, từng phần tử một, phóng to; hiện muộn để thấy rõ). Màu sắc và bố cục đã được user duyệt qua `/design`.

- **THÊM R-138 (Đặt vé nhanh trên trang chủ)**: thanh 4 ô Rạp → Phim → Ngày → Giờ chiếu → màn chọn ghế của suất; chỉ liệt kê lựa chọn có suất thật, lỗi thiếu ô báo tại chỗ.
- **THÊM NFR-19 (Giao diện & chuyển động)**: phong cách CYBERPLEX; chuyển động theo cuộn chỉ ở trang khách; tôn trọng `prefers-reduced-motion`; trình duyệt thiếu hỗ trợ hiển thị tĩnh; không CLS; admin và soát vé không có chuyển động cuộn.
- **THÊM AC-31** (đặt vé nhanh), **AC-32** (reduced-motion / cuộn xuôi ngược).
- **Không đổi** R-xx nghiệp vụ cũ nào (đặt vé, thanh toán, giữ ghế, soát vé, chính sách không huỷ/hoàn). Phần **thêm chức năng mới** duy nhất là R-138 (thanh đặt vé nhanh), dùng đúng nguồn/quy tắc lọc của R-44, không đổi API/DB.

## Ảnh hưởng
Module: toàn bộ `apps/web` (tokens, font, component dùng chung, màn khách, admin, soát vé), thêm `components/motion` (CSS + `<Scrub>`), thêm `QuickBookBar` ở trang chủ (dùng dữ liệu lịch chiếu sẵn có, **không đổi API/DB**).
Test: luồng đặt vé end-to-end (retest hồi quy: chọn ghế, giữ ghế, thanh toán, soát vé vẫn đúng), kiểm tra trực quan, reduced-motion, 360px, tương phản; test/snapshot phụ thuộc class CSS cũ có thể phải cập nhật.
Tài liệu thiết kế: `skills/react-nodejs/design-tokens.md`, `.context/design-spec.md` §1 + §16, `docs/design/cyberplex/preview.html`.
