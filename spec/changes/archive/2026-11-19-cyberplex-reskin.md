---
id: cyberplex-reskin
type: feature                       # ADDITIVE (R-138 thanh đặt vé nhanh) + MODIFY (giao diện); không đổi nghiệp vụ đặt vé/thanh toán
status: done
created: 2026-11-19
---

# Re-skin toàn bộ giao diện theo phong cách CYBERPLEX + chuyển động đặt vé / nội dung

## Yêu cầu
Đổi "da" giao diện từ CINEMO coral sang CYBERPLEX (vàng điện `#FCEE09` / crimson / cyan, chamfer, nhãn HUD mono) theo file tham chiếu `index-cyberplex-enhanced (2).html`. **Không đổi route, bố cục, nghiệp vụ, requirement.** Thêm chuyển động:
**Mọi chuyển động chạy theo vị trí cuộn chuột: cuộn xuống thì hiện dần, cuộn lên thì thu về** (CSS scroll-driven animations, không JS; tham khảo `open-design.ai`).
- Phần **đặt vé** (hero ghim + QuickBookBar hiện lần lượt từng ô, lịch/chip giờ, stepper, chọn ghế, tóm tắt) vào **từ trái sang phải**, từng phần tử một, phóng to (0.86 → 1.05 → 1).
- Phần **bên dưới** (phim, rạp, footer, tiêu đề section) vào **từ trên xuống hoặc từ hai bên**, từng phần tử một, cùng kiểu phóng to; poster có tia vàng quét từ trên xuống.
- Thêm component mới `QuickBookBar` (Rạp / Phim / Ngày / Giờ) trên trang chủ, dùng dữ liệu lịch chiếu sẵn có.

Nguồn sự thật (đã được user duyệt 2026-11-19): `skills/react-nodejs/design-tokens.md`, `.context/design-spec.md` §1 + §16, bản xem thử `docs/design/cyberplex/preview.html`.

**Bổ sung khi chạy `/change` (user, 2026-11-19):** cho hiệu ứng **hiện muộn hơn** để thấy rõ chuyển động, vì hiện ngay ở mép dưới trang thì khó nhìn thấy. Đã xử lý bằng `--scrub-inset` (spec §16.4); lưới phim dùng timeline riêng từng thẻ lệch pha theo cột.

## Quyết định đã chốt (user, 2026-11-19)
1. Admin + Soát vé: chỉ áp màu + font + chamfer nút/badge/dialog; **không** scanline/lưới/chuyển động A-B (soát vé tắt hết).
2. Nút chính: vàng đặc, chữ tối `#07070A`.
3. Có build `QuickBookBar`. **Không** build "hành trình điện ảnh", "định dạng phòng chiếu" của tham chiếu.
4. Heading tiếng Việt dùng Chakra Petch (Orbitron chỉ cho wordmark + số/ASCII, vì không có glyph Việt). **Hero ghim 90svh trên desktop** (≥ 768px và cao ≥ 620px) để thanh đặt vé hiện lần lượt trái → phải theo cuộn; mobile/màn thấp không ghim.
5. Triển khai qua `/change`: MODIFY giao diện + ADDITIVE R-138 (spec 3.5.0).
6. Sau spec-validator vòng 1 (FAIL, 2026-11-19): bỏ glitch scrub (WCAG 2.3.1), QuickBookBar không giảm opacity (NFR-12), phần tử đang focus luôn hiện, kiểm "cuộn tới cuối không còn phần tử ẩn" trên nhiều cỡ màn.

## Acceptance (bắt buộc)
- [ ] `globals.css` + `next/font` theo tokens §2, §5: 4 họ font có subset `vietnamese` (trừ Orbitron), không còn Inter/Rajdhani; token màu/seat/chamfer/motion đúng `design-tokens.md`; shadcn `--radius: 0`.
- [ ] Utility `chamfer-*`, `frame`, `hud`, `reveal-*`; focus của phần tử `clip-path` là vòng inset (không outline ngoài).
- [ ] Component dùng chung (SiteHeader, Footer, Button, Chip/Badge, Input, Tabs, Dialog, Toast, MovieCard, CinemaCard, DateStrip, ShowtimeChip, BookingStepper, SeatMap, BookingSummary, QrTicket, CountdownTimer) theo design-spec §16.3.
- [ ] Chuyển động theo cuộn bằng CSS (`animation-timeline: view()` / `view-timeline` / `scroll(root)`) trong `@supports` + `prefers-reduced-motion: no-preference`; `<Scrub>`/`<ScrubGroup>` chỉ gắn thuộc tính, **không JS, không scroll listener**; ngoài điều kiện thì nội dung hiển thị tĩnh đầy đủ (kể cả Firefox).
- [ ] Hiện muộn: phần tử bắt đầu khi đã cao hơn mép dưới ≥ ~300px (`--scrub-inset`), xong khi còn cách mép dưới ≥ 200px; footer, `/dat-ve/*` và trang ngắn dùng `--scrub-inset: 0px` (không có phần tử nào bị kẹt ở trạng thái ẩn khi cuộn hết trang).
- [ ] Nhóm A (trái → phải, theo cuộn) áp ở: hero ghim + QuickBookBar (hiện lần lượt từng ô), lịch chiếu `/phim/[slug]` `/lich-chieu` `/rap/[code]`, chọn ghế, xác nhận, thanh toán, kết quả. Nhóm B (trên xuống / hai bên) áp ở: tiêu đề section, lưới phim (tia quét poster), rạp, footer. Cuộn xuống hiện dần, **cuộn lên thu về**.
- [ ] Trang `/dat-ve/*`: phần trong khung nhìn lúc vào hiện đủ ngay (đồng hồ giữ ghế), ghế đang chọn không bao giờ bị thu về. Hero ghim chỉ desktop ≥ 768px và cao ≥ 620px; mobile tĩnh.
- [ ] `QuickBookBar` là `<form>` 4 `<select>` gốc, đích `/dat-ve/[showtimeId]`, báo lỗi ô thiếu.
- [ ] Admin/Soát vé không có scanline/lưới/chuyển động A-B; bảng dữ liệu vuông.
- [ ] Không còn chuỗi giao diện chứa em-dash/en-dash; không hex thô trong component.
- [ ] Verify bằng Playwright: cuộn tới các mốc, đọc computed `opacity/translate/scale`, cuộn lên trả đúng giá trị cũ (mẫu trong `docs/design/cyberplex/preview.html` đã PASS); typecheck, lint, test hiện có vẫn PASS; Lighthouse CLS < 0.1, LCP < 2.5s trang chủ; kiểm tay 360px không scroll ngang; Tab bàn phím thấy vòng focus trên nút chamfer; bật reduced-motion thì mọi thứ hiện ngay.

## Ghi chú
- Không đổi spec nghiệp vụ: spec delta chỉ ghi "re-skin UI", bump bản patch/minor tuỳ spec-publisher; test-scope không đổi hành vi.
- Gợi ý chia task (tuần tự, mỗi task 1 commit): (1) tokens + font + utility + focus; (2) shell + component dùng chung; (3) CSS scrub + `<Scrub>`/`<ScrubGroup>` + hero ghim + QuickBookBar; (4) màn khách nhóm A; (5) màn khách nhóm B; (6) admin + soát vé; (7) quét em-dash + Lighthouse + kiểm reduced-motion.
- Rủi ro: `clip-path` cắt tooltip/dropdown bên trong (portal ra ngoài); Orbitron chỉ cho ASCII; e2e/test snapshot có thể phụ thuộc class cũ.
