---
id: public-cinema-online-cutoff
type: bug
status: pending
created: 2026-11-19
---

# Mốc đóng bán online riêng của từng rạp (R-56) chưa có trong dữ liệu rạp công khai, nên lịch chiếu và thanh đặt vé nhanh dùng mặc định 15 phút

## Yêu cầu
R-56 cho Cinema Manager cấu hình mốc đóng bán online riêng của rạp (`online_cutoff_minutes`), R-44/R-67 yêu cầu lịch chiếu chỉ hiện suất còn bán. Hiện `CinemaDto` công khai (`apps/api/src/modules/catalog/cinemas.service.ts`: `CINEMA_COLUMNS` và `cinemaToDto`) không đưa mốc hiệu lực của rạp ra, nên:
- `showtime-schedule.tsx` (R-44) đọc `group.cinema.onlineCutoffMinutes` nhưng giá trị luôn rỗng, rơi về mặc định 15 phút.
- `apps/web/src/lib/quick-book.ts` (R-138, thanh Đặt vé nhanh) dùng `DEFAULT_ONLINE_CUTOFF_MINUTES = 15`.

## Bối cảnh / tái hiện (bug)
- Màn/route/role: khách ở `/`, `/phim/[slug]`, `/rap/[code]`, `/lich-chieu`.
- Bước tái hiện: Cinema Manager đặt mốc đóng bán của rạp = 30 phút (R-56). Khách mở lịch chiếu 20 phút trước giờ chiếu.
- Expected: suất đó không còn được liệt kê/bấm được (đã quá mốc 30 phút của rạp).
- Actual: vẫn hiện và bấm được (mốc mặc định 15 phút). Server từ chối khi giữ ghế (xem R-62/giữ ghế), nên khách đi tới màn chọn ghế rồi mới bị từ chối.
- Chưa xác minh: server có áp mốc riêng của rạp khi giữ ghế hay không (cần kiểm `booking.service.ts`/hàm giữ ghế).

## Acceptance (bắt buộc)
- [ ] `CinemaDto` công khai có mốc hiệu lực (`effectiveOnlineCutoffMinutes` = mốc riêng của rạp, hoặc mặc định cấu hình chuỗi), schema shared + API + test.
- [ ] `showtime-schedule.tsx` (R-44) và `quick-book.ts` (R-138) dùng mốc đó; test: rạp mốc 30 phút thì suất còn 20 phút không được liệt kê.
- [ ] Xác nhận server (giữ ghế) cũng áp đúng mốc rạp; nếu không, thêm kiểm tra + test.
- [ ] Không đổi hành vi với rạp không cấu hình mốc riêng (vẫn mặc định của chuỗi).

## Ghi chú
Phát hiện khi spec-validator kiểm CR-010 (R-138). Hạn chế có từ trước CR-010 (R-44 cũng bị). R-138 hiện ghi "mốc mặc định 15 phút (R-67), mốc riêng của rạp do server áp khi giữ ghế, xem CR-011". Kiểm R-56, R-67, R-44 trong `SPECIFICATIONS.md` trước khi làm. P2.
