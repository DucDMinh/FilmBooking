---
id: nav-skeleton-and-first-row-visible
type: feature
status: in_progress
created: 2026-11-23
---

# Điều hướng tức thì kèm skeleton trang + dòng dữ liệu đầu tiên hiện ngay (trang khách)

## Yêu cầu
User (2026-11-23), gom hai ý:
1. "Các trang đang bị tình trạng bấm vào phải đợi tải xong dữ liệu rồi mới được điều hướng đến. Sửa lại cho chuyển đến trang đó luôn, thêm skeleton page vào."
2. "Phần hiển thị của trang user, các dữ liệu ở dòng đầu tiên như phim, lịch chiếu, hệ thống rạp cho hiện ra trước chứ không phải kéo xuống mới thấy, tránh cảm giác web bị lỗi."

## Bối cảnh / hiện trạng (đã dò, chưa sửa)
- Ý 1: `apps/web/src/app` hiện **không có file `loading.tsx` nào**. Các trang server component (vd `(public)/page.tsx`) `await apiFetch(...)` rồi mới render, nên Next giữ nguyên trang cũ tới khi dữ liệu về mới chuyển. Cần ranh giới loading (route `loading.tsx` và/hoặc `Suspense`) + skeleton đúng bố cục từng trang.
- Ý 2: các section trang chủ dùng `Scrub` (CSS scroll-driven, `globals.css` §"CHUYỂN ĐỘNG THEO CUỘN", `animation-range: entry ...`). Phần tử bắt đầu `opacity: 0` và chỉ hiện dần khi cuộn qua mép dưới viewport, nên dòng đầu của các mục Phim / Lịch chiếu / Hệ thống rạp nằm ở màn hình đầu vẫn trống tới khi người dùng cuộn → trông như lỗi. Chưa xác minh bằng trình duyệt.
- Liên quan CR-010 (re-skin CYBERPLEX + chuyển động theo cuộn, design-spec §16.4) và memory "chuyển động theo cuộn": giữ hiệu ứng hiện dần khi cuộn cho các hàng sau, chỉ đổi cách xử lý hàng đầu.

## Phạm vi (đề xuất, agent xác nhận khi classify)
- Trang khách (nhóm `(public)`): trang chủ, `/phim` + chi tiết phim, `/lich-chieu`, `/rap` + chi tiết rạp, `/dat-ve`, `/tai-khoan`, `/ve`. Trang admin/staff: KHÔNG thuộc phạm vi (chốt 2026-11-23 khi validator hỏi, khớp NFR-20; admin/staff không có scrub, project demo giữ gọn). Nếu sau này cần, mở CR riêng.

## Acceptance (bắt buộc)
- [ ] Bấm liên kết/nút điều hướng giữa các trang khách → URL đổi và khung trang + skeleton hiện **ngay**, dữ liệu điền vào sau; không còn trạng thái "đứng yên chờ tải xong mới chuyển".
- [ ] Mỗi trang khách có skeleton khớp bố cục thật (không nhảy bố cục khi dữ liệu về), dùng token/thành phần sẵn có của giao diện CYBERPLEX; có `aria-busy`/nhãn cho trình đọc màn hình; `prefers-reduced-motion` tắt hiệu ứng nhấp nháy.
- [ ] Trang chủ và các trang danh sách: dòng dữ liệu đầu tiên của mỗi mục (phim đang chiếu, lịch chiếu, hệ thống rạp) luôn hiển thị đầy đủ (opacity 1), không chờ cuộn, kể cả khi mục còn nằm dưới khung nhìn lúc mở trang, không cần cuộn mới thấy.
- [ ] Các hàng phía dưới vẫn giữ chuyển động hiện dần theo cuộn xuống và thu về khi cuộn lên (CR-010); không phá `Scrub` cho phần còn lại.
- [ ] Lỗi tải dữ liệu vẫn vào `error.tsx`/trạng thái lỗi hiện có; không đổi API hay contract dữ liệu.
- [ ] Test web cập nhật/bổ sung (skeleton hiển thị khi chờ; hàng đầu không bị ẩn); `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` PASS. Kiểm tay bằng trình duyệt thật (điều hướng + cuộn) trước khi đóng.

## Ghi chú
- Không đổi hành vi nghiệp vụ, API, DB nên dự kiến `no doc impact` ngoài `design-spec` (bổ sung quy tắc skeleton + ngoại lệ hàng đầu cho scroll-reveal) và có thể bump spec nhỏ theo `/change`.
- Chọn mặc định đơn giản (project demo): ưu tiên `loading.tsx` theo route + skeleton dùng chung, không tối ưu streaming từng khối trừ khi cần.
