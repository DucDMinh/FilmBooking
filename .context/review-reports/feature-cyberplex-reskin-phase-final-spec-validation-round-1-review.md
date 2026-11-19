Agent: spec-validator

# Review hết phase: CR-010 cyberplex-reskin (spec 3.5.0), round 1

- Phạm vi: nhánh `staging`, HEAD `5a4adfd`. Chỉ đọc, không sửa code/spec.
- Nguồn spec: `SPECIFICATIONS.md` (R-16, R-35, R-44, R-45, R-56, R-67, R-71, R-98, R-99, R-102, R-133, R-137, R-138, NFR-11, NFR-12, NFR-19, AC-31, AC-32), `spec/changes/2026-11-19-cyberplex-reskin.md`, `.context/design-spec.md` §16, `skills/react-nodejs/design-tokens.md`, `e2e/scrub/scrub.spec.ts`, các report `.context/review-reports/feature-cyberplex-reskin-*`.
- Ràng buộc: không dùng bash để đọc source; `git diff 3daeb47 HEAD` không chạy được trong phiên này (xem Residual R-1).

## Verdict: FAIL

Lý do: 2 MAJOR thật.
- MAJOR-1: NFR-19 bị vi phạm. CTA hero là điều khiển nằm trong khung nhìn lúc vào trang nhưng bị giảm opacity về 0.
- MAJOR-2: R-138 sai hành vi so với spec. Thanh Đặt vé nhanh không loại suất quá mốc đóng bán theo cấu hình rạp (R-56).

Không có BLOCKER. Các hạng mục còn lại là MINOR hoặc Residual.

## Ma trận coverage

| Requirement | Nguồn | Trạng thái | Ghi chú |
|---|---|---|---|
| R-138 Đặt vé nhanh: đủ 4 ô Rạp/Phim/Ngày/Giờ, đặt lại ô sau, "Chưa có suất", mở chọn tỉnh, điều hướng `/dat-ve/<id>`, báo lỗi tại chỗ | SPEC R-138; `quick-book-bar.tsx:100-268`; `quick-book.ts:85-127` | PASS | Ô đủ 4, `applyFieldChange` reset ô sau, `missingFieldsMessage` + `role=status` không điều hướng, `resolveSelection` trả `/dat-ve/<id>`. Chưa chọn tỉnh thì mở `ProvincePickerDialog`. Nguồn dữ liệu là `GET /cinemas/:code?date=` giống R-44 (`quick-book.ts:142-171`). |
| R-138 loại suất CLOSED/CANCELLED, rạp không OPEN, 7 ngày | `quick-book.ts:67-71,85-99,156`; `showtime-schedule.tsx:65-77`; `cinemas.service.ts:135` | PASS | Rạp chỉ lấy `status === "OPEN"`, API list cũng `eq("status","OPEN")`. Ngày = `generateNext7Days`. |
| R-138 quá mốc đóng bán theo cấu hình rạp (R-56) | `quick-book.ts:48-49,68-70`; `cinemas.service.ts:20,76-81,146-152` | FAIL (MAJOR-2) | Client hard-code 15 phút. Public DTO không có `online_cutoff_minutes` hay `effectiveOnlineCutoffMinutes`. |
| R-138 "server quyết định cuối" | SPEC R-138 | Không xác minh | Chưa kiểm luồng đặt ghế phía server trong phạm vi này. Không dùng việc này để bù cho MAJOR-2. |
| R-138 vị trí "đáy khối hero" | `home-hero.tsx:78` `hs-qbar-wrap` sau `hs-body` | PASS | |
| R-138 Guest điều hướng, R-16 ở màn ghế | `quick-book-bar.tsx:190` `router.push` không kiểm đăng nhập | PASS (một phần) | R-16 ở màn chọn ghế không thuộc diff này, không kiểm lại. |
| R-138 bàn phím và trình đọc màn hình | `quick-book-bar.tsx:71-94,240-262` | PASS | 4 `<select>` có `<label htmlFor>`, `aria-invalid`, `aria-describedby`, vùng lỗi `role=status aria-live=polite`. |
| R-35 chọn tỉnh, R-137 rạp không hoạt động | `page.tsx:67-79`; `cinemas.service.ts:142-152` | PASS | Trang chủ lọc `?province=`. Rạp không OPEN trả 200 không có suất. |
| R-44 lịch chiếu, R-45 phim sắp chiếu, R-67 "Ngừng bán online" | `showtime-schedule.tsx:229,254` | PASS (kế thừa) | Cùng nguồn với R-138. R-44 cũng không đọc cấu hình rạp từ public API (xem MAJOR-2). |
| R-71, R-133, R-59 (luồng ghế, hộp cảnh báo, tick xác nhận) | `components/booking/*` | Không xác minh bằng diff | Xem Residual R-1. Đọc `hold-countdown.tsx` ngưỡng 2 phút/30 giây khớp design. |
| R-98, R-99, R-102 soát vé | `components/ticket/ticket-qr.tsx:93` | PASS (đọc) | Portal `createPortal` vẫn có ở `ticket-qr.tsx:93`. Logic soát vé không thuộc diff của task. |
| NFR-11 responsive ≥ 360 | `movie-card.module.css:6-16`; `home-hero.css:145-154` | Không kiểm runtime | Có media query tới 520px. Chưa chạy 360px. |
| NFR-12 tương phản khi nghỉ | `home-hero.css:170-171`; `qbar` | PASS (đọc) | `.qbar` và `.qfield` luôn opacity 1. Chưa đo contrast tự động. |
| NFR-19 chuyển động: reduced-motion | `globals.css:218-220,363-392,396-398`; `popElement` `seat-map.tsx:77-81` | PASS | Global `reduce` rút thời lượng về 0.01ms. Scrub nằm trong `no-preference`. `popElement` có kiểm `matchMedia`. |
| NFR-19 chuyển động: cuộn xuống hiện, cuộn lên thu về | `globals.css:345-390`; `home-hero.css:251-320`; `e2e` (b), (c) | PASS | Test (b) đọc computed đảo ngược. Test (c) hiện muộn ≥ 200px. |
| NFR-19 không JS scroll listener, không IntersectionObserver, không infinite | Grep `apps/web/src`: không có `addEventListener('scroll'`, `IntersectionObserver`, `infinite` | PASS | |
| NFR-19 không kẹt ẩn khi cuộn tới cuối | `e2e` (a) 4 cỡ × 14 route; `collectStuck` bỏ qua `.hs-lead` | FAIL (MAJOR-1) | Test loại trừ đúng chỗ bị lỗi. |
| NFR-19 điều khiển trong khung nhìn lúc vào trang không giảm opacity | `home-hero.tsx:67` `hs-cta hs-lead`; `home-hero.css:302,248-250` | FAIL (MAJOR-1) | CTA "Đặt vé ngay"/"Xem chi tiết" fade về 0 và `visibility:hidden`. |
| NFR-19 focus bàn phím luôn hiện | `globals.css:381-386`; `home-hero.css:304`; `movie-card.module.css:89-97`; e2e (e) | PASS | |
| NFR-19 không CLS ≥ 0.1, LCP | e2e perf (PerformanceObserver) | PASS (đo tự chế) | Chưa chạy Lighthouse chính thức (Residual R-4). |
| NFR-19 Admin/Soát vé không chuyển động | `grep data-scrub|scanline|motion/scrub` `app/admin`, `app/staff`, `components/admin|staff|checkin`: 0 kết quả; `scanline` chỉ ở `(public)/layout.tsx:56`; test (h) | PASS | Kiểm bằng mã nguồn, không chạy runtime (Residual R-3). |
| AC-32 cỡ màn 390×844, 1280×800, 1440×900, 1920×1080 không ẩn, không scroll ngang | e2e (a) | PASS (có ngoại lệ) | Ngoại lệ: `.hs-lead` (MAJOR-1). Route `/tai-khoan/*`, `/ve/*` chưa vào bộ kiểm. |
| AC-32 `/dat-ve/*`, footer, trang ngắn `--scrub-inset: 0` | `dat-ve/layout.tsx:8`; `ve/page.tsx:39`; `ve/[bookingCode]/page.tsx:22`; `site-footer.tsx:50` | PASS | Trang đăng nhập, tài khoản, lỗi không có `data-scrub`, nên ngoại lệ trong design §16.4 không còn tác dụng (MINOR-3). |
| AC-32 `QuickBookBar` opacity luôn 1 | `home-hero.css:306-310,325`; e2e (b) | PASS | |
| AC-32 CLS, LCP, không lỗi console | e2e perf, (a) | PASS (tự đo) | |
| AC-32 bộ e2e 20 test | `e2e/scrub/scrub.spec.ts` | PASS | Đếm 20 test. |
| AC-31 bộ kiểm 20 test | như trên | PASS | Không có test QuickBookBar trong `scrub.spec.ts`. Test logic nằm trong `quick-book` (không kiểm lại). |
| Số liệu spec 3.5.0 | `SPECIFICATIONS.md` | PASS | Đếm: R 138 dòng; MVP 113 dòng; NFR 19 dòng; AC 32 dòng, trong đó AC-20…AC-23 REMOVED, còn 28. Dòng 530 khớp. GĐ2 (13) và REMOVED (12) không đếm lại. |
| Tài liệu thiết kế vs thực tế | §16.4, `design-tokens.md` | Có mismatch (MINOR-2) | Xem danh sách bên dưới. |

## Findings

### MAJOR-1: NFR-19 / AC-32, CTA hero bị giảm opacity
- Vị trí: `apps/web/src/components/home/home-hero.tsx:67` (`<div className="hs-cta hs-lead">`); `apps/web/src/components/home/home-hero.css:302` (`.hs-lead { animation-name: hsLeadOut; animation-range: 4svh 34svh }`); `home-hero.css:248-250` (`hsLeadOut`: opacity 0, `visibility: hidden`).
- Requirement: NFR-19 "riêng thanh đặt vé nhanh (R-138) và các điều khiển trong khung nhìn lúc vào trang không bao giờ giảm opacity". Và "không phần tử nào bị kẹt ở trạng thái ẩn khi cuộn tới cuối trang".
- Hành vi: trên desktop (≥768px, cao ≥620px), nút "Đặt vé ngay" và "Xem chi tiết" fade về 0 khi cuộn từ 4svh đến 34svh, và đến cuối trang vẫn `visibility:hidden`. Trong vùng cuộn 34svh đến 90svh, hero vẫn hiển thị nhưng không còn nút.
- Nguyên nhân: đưa `.hs-lead` vào hero theo design §16.4 ("Kicker, meta, CTA hero: mờ đi"), mâu thuẫn với ngoại lệ trong NFR-19. Test (a) không bắt được vì `collectStuck` loại `.hs-lead`.
- Đề xuất (1 câu): bỏ class `hs-lead` khỏi `.hs-cta` (giữ opacity 1 cho nút) và thêm assertion Playwright cho nút hero ở mọi mốc cuộn.

### MAJOR-2: R-138 không loại suất quá mốc đóng bán theo cấu hình rạp (R-56)
- Vị trí: `apps/web/src/lib/quick-book.ts:48-49` (`DEFAULT_ONLINE_CUTOFF_MINUTES = 15`) và `:68-70` (`sellableShowtimes` dùng hằng số này). `apps/web/src/components/catalog/showtime-schedule.tsx:229` đọc `group.cinema.onlineCutoffMinutes ?? onlineCutoffMinutes`, nhưng public không có trường này. `apps/api/src/modules/catalog/cinemas.service.ts:20` (`CINEMA_COLUMNS`) và `:76-81` (`cinemaToDto`) không đưa `online_cutoff_minutes` hay `effectiveOnlineCutoffMinutes` ra public.
- Requirement: R-138: "suất đã quá mốc đóng bán theo cấu hình rạp R-56" không được liệt kê. R-56 cho rạp cấu hình mốc riêng.
- Hành vi: rạp cấu hình mốc 30 phút sẽ vẫn có suất ở ô Giờ chiếu của thanh, khách bấm Đặt vé và gặp lỗi ở màn ghế.
- Ghi chú: việc server quyết định cuối không thay thế yêu cầu loại suất ở thanh. Lỗi này nằm sẵn ở R-44 (public chưa trả cấu hình rạp), nên R-138 kế thừa. Không xác minh được server có áp mốc theo rạp khi giữ ghế hay không (ngoài phạm vi).
- Đề xuất (1 câu): thêm `effectiveOnlineCutoffMinutes` (cột công khai, không lộ dữ liệu nhạy cảm) vào detail public và truyền vào `sellableShowtimes`, đồng thời áp cho R-44.

### MINOR-1: Mốc đóng bán tính theo thời điểm tải, không theo thời điểm hiện tại
- Vị trí: `apps/web/src/components/catalog/quick-book-bar.tsx:145-148` (`sellableShowtimes(showtimes, loadedAt)`).
- Hành vi: mở trang rồi để lâu, suất đã quá mốc vẫn được liệt kê cho tới khi chọn lại rạp.
- Đề xuất: tính lại theo `new Date()` khi render ô Giờ chiếu hoặc khi bấm Đặt vé.

### MINOR-2: Tài liệu thiết kế lệch thực tế (dispatcher sửa)
1. `.context/design-spec.md:277`: "lưới MovieCard (D 5 cột, tablet 3, M 2)". Code `apps/web/src/components/catalog/movie-card.module.css:8,12,15` dùng 4 / 3 / 2. Hoặc sửa doc thành 4/3/2, hoặc đổi code. Spec không quy định số cột.
2. `skills/react-nodejs/design-tokens.md:151`: `--text-display: clamp(48px, 8vw, 112px)`. Hero dùng class riêng `.hs-title` tại `home-hero.css:63`: `clamp(36px, min(7vw, 8.5svh), 112px)`, không phải token. Nên ghi rõ trong doc hoặc thêm token riêng.
3. `.context/design-spec.md` §16.4, dòng hero (khoảng dòng 878): "Kicker, meta, CTA hero: mờ đi + bay lên". Phải sửa theo MAJOR-1. Đồng thời ghi rõ kicker/meta (không phải điều khiển) có được về opacity 0 hay không.
4. `.context/design-spec.md` §16.4 (khoảng dòng 847): ngoại lệ `--scrub-inset: 0px` nêu trang đăng nhập, tài khoản, lỗi. Các trang này không có `data-scrub` nào. Bỏ hoặc làm rõ.
5. `--dur-wipe`, `--stagger`, `HUD_LABEL` (dấu `!`): không tìm thấy trong `design-tokens.md` hay `design-spec.md`. Không có gì để sửa trong doc; không xác minh được phần code.
6. z-index: `design-tokens.md:220` (ticket QR 60) khớp `ticket-qr.tsx:59` (`z-60`).

### MINOR-3: Chưa có bằng chứng AC-32 cho một số mệnh đề
- Chọn ghế khi đã đăng nhập: không có test. Chỉ có kiểm "ghế đang thấy không bị thu về" cho khách (test f).
- `/admin`, `/staff/soat-ve` runtime: chỉ kiểm bằng mã nguồn (test h).
- "Không nhấp nháy quá 3 lần/giây": không có test tự động. Mã nguồn không có keyframes nhấp nháy và không có `infinite` (grep 0 kết quả). Vẫn là bằng chứng thiết kế.
- "Trình duyệt không hỗ trợ scroll-driven → tĩnh": chỉ có `@supports` trong CSS, không chạy Firefox hay trình duyệt không hỗ trợ.
- Lighthouse chính thức, axe: chưa có. Change doc yêu cầu Lighthouse CLS < 0.1, LCP < 2.5s.
- Route `/tai-khoan/*`, `/ve/*`, `/dat-ve/*/thanh-toan` chưa vào bộ (a).
- Phần kicker và meta của hero (không phải điều khiển) về opacity 0 khi cuộn qua. NFR-19 nói trạng thái nghỉ "đã cuộn qua" phải đạt NFR-12. Cần spec làm rõ.
- Trang chủ khi chưa có cookie tỉnh: `page.tsx:247` luôn render `ProvincePickerDialog`, và `quick-book-bar.tsx:263` render thêm một cái. Chưa xác minh runtime có hai hộp thoại hay không.

### Residual
- R-1: `git diff 3daeb47 HEAD -- apps/web/src/components/booking apps/web/src/components/ticket apps/web/src/components/staff` không chạy được vì ràng buộc không đọc source bằng bash. Bằng chứng gián tiếp: report `phase-2-task-05-round-1` ghi "chỉ trình bày; không đụng hold logic"; `phase-1-task-02-round-1` ghi `payment-result` giữ logic; `phase-1-task-02-round-2` xác nhận portal. Dispatcher nên chạy lệnh này và rà `seat-map.tsx` (`popElement`), `hold-countdown.tsx` (đã đọc: ngưỡng 120/30 giây khớp design, `onExpire` gọi một lần), `payment-result.tsx`, `ticket-qr.tsx` (portal `:93`).
- R-2: `e2e/scrub` cần Chromium và web build. Không chạy lại trong round này.
- R-3: `/admin`, `/staff` không kiểm runtime.
- R-4: Lighthouse, axe chưa chạy.
- R-5: Các report phase-1 và phase-2 có MINOR residual đã ghi (ví dụ `text-[27px]`, QR nền trắng). Không ảnh hưởng verdict.

## Đề xuất cho dispatcher (không sửa trong round này)
1. Sửa MAJOR-1: bỏ `hs-lead` khỏi `.hs-cta`, mở rộng test (a) hoặc thêm test cho CTA hero ở mọi mốc cuộn.
2. Sửa MAJOR-2: đưa cấu hình mốc hiệu lực vào detail public và dùng trong `quick-book.ts` và R-44. Thêm test: rạp cấu hình mốc 30 phút thì suất 20 phút trước giờ chiếu không được liệt kê.
3. Sửa MINOR-1 nếu cần.
4. Cập nhật `design-spec.md` §16.4 và `design-tokens.md` theo MINOR-2.
5. Sau khi sửa, chạy lại `spec-validator` round 2.
