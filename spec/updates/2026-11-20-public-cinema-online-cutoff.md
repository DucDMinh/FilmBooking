# Spec Update — 2026-11-20 public-cinema-online-cutoff
**spec_version:** 3.5.0 → 3.5.1 (PATCH — làm rõ R-138/R-44/R-67, thêm AC-33, bỏ hạn chế đã biết)
**Trigger:** bug-fix · `spec/changes/archive/2026-11-19-public-cinema-online-cutoff.md` (CR-011) · `tasks/bug-public-cinema-online-cutoff/phase-1-task-01.md` (reviewer STRICT PASS round 2)

## Requirements
Bug: `CinemaDto` công khai không đưa mốc đóng bán online của rạp ra, nên lịch chiếu R-44 và thanh Đặt vé nhanh R-138 luôn dùng mặc định 15 phút; rạp có mốc riêng (R-56, vd 30 phút) vẫn bấm được suất còn 20 phút rồi mới bị server từ chối khi giữ ghế. Hạn chế này đã được ghi nhận trong spec 3.5.0 (mục "Làm rõ sau spec-validator", R-138) và hẹn xử lý bằng CR-011.

- **Hiện thực:** `CinemaDto` công khai có `effectiveOnlineCutoffMinutes` = mốc riêng của rạp (R-56), nếu không cấu hình thì `app_settings.default_online_cutoff_minutes` (R-106), thiếu nữa thì 15. Lịch chiếu R-44 (`/phim/[slug]`, `/lich-chieu`), trang rạp `/rap/[code]` và Đặt vé nhanh R-138 đều dùng mốc hiệu lực của **từng rạp**; suất quá mốc hiện "Ngừng bán online — vui lòng mua tại quầy" và không bấm được (R-67). Server giữ ghế vốn đã áp mốc này (`coalesce(online_cutoff_minutes, default_online_cutoff_minutes)`) và vẫn là nơi quyết định cuối.
- **SỬA (làm rõ) R-138:** bỏ đoạn "mặc định 15 phút của chuỗi ... mốc riêng của từng rạp do server áp ... xem CR-011"; nay ghi dùng **mốc đóng bán hiệu lực của chính rạp đó** (mốc riêng R-56, không cấu hình thì mặc định chuỗi R-67 = 15 phút), như lịch chiếu R-44 và trang rạp; dữ liệu rạp công khai đã có mốc này.
- **SỬA (làm rõ) R-44:** thêm câu: suất quá mốc đóng bán hiệu lực của rạp hiện "Ngừng bán online — vui lòng mua tại quầy" và không bấm được, ở lịch chiếu chi tiết phim, `/lich-chieu` và trang rạp.
- **SỬA (làm rõ) R-67:** thêm câu: mốc hiệu lực của từng rạp được áp nhất quán ở R-44, trang rạp, R-138 và khi giữ ghế (server quyết định cuối).
- **THÊM AC-33** (CR-011): rạp mốc 30 phút, suất còn 20 phút → không bấm được / không liệt kê ở Đặt vé nhanh; rạp không mốc riêng vẫn theo mặc định chuỗi; đổi mặc định chuỗi thì rạp không mốc riêng theo; server vẫn từ chối giữ ghế quá mốc.
- **Không đổi** requirement nào khác (nghiệp vụ đặt vé, giá, thanh toán, soát vé, chính sách không huỷ/hoàn). Không đổi DB/migration.

## Ảnh hưởng
Module: `packages/shared` (`CinemaDto`), `apps/api` catalog (`cinemas.service.ts`, `movies.service.ts`), cinema-ops (`showtimes.service.ts`, mới `chain-defaults.ts`), `apps/web` (`showtime-schedule.tsx`, `lib/quick-book.ts`, mới `lib/showtime-closing.ts`, `/rap/[code]`, `/phim/[slug]`, `/lich-chieu`), `docs/API_SPEC.md`, mock API `e2e/scrub/mock-api.mjs`.
Test: lịch chiếu / trang rạp / Đặt vé nhanh với rạp mốc riêng 30 phút và rạp mặc định; hồi quy luồng đặt vé, QuickBookBar, bộ Playwright cuộn.
Lưu ý: mốc đổi có thể trễ ~60 giây ở trang khách do ISR/cache; server giữ ghế không bị ảnh hưởng.
