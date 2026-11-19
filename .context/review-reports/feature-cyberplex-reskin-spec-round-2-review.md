Agent: spec-validator

# Spec validation round 2 (vòng cuối): CR-010 cyberplex-reskin, spec 3.5.0

**Verdict: FAIL.**
- Matrix có 2 dòng FAIL (mục 4: dòng 8 NFR-19 vs NFR-12, dòng 11 QuickBookBar opacity).
- Có 3 MAJOR: M-R2-01, M-R2-02, M-R2-03.
- Không có BLOCKER.
- Có 9 MINOR.

Lưu ý: đây là vòng 2, giới hạn của bước 1b (AGENTS.md) là 2 vòng. Đã hết vòng. Primary cần chuyển user quyết định, không chạy vòng 3 tự động.

**Không sửa** code/spec/design. Chỉ ghi report này. Round 1 giữ nguyên tại `feature-cyberplex-reskin-spec-round-1-review.md`.
**Không dùng graphify** (theo yêu cầu). Chỉ dùng Grep/Read.

## 1. Trạng thái các finding round 1

| Mã R1 | Nội dung | Trạng thái R2 | Bằng chứng |
|---|---|---|---|
| C-00 | Hero ghim mâu thuẫn | CLOSED | change doc `spec/changes/2026-11-19-cyberplex-reskin.md:25`; design `.context/design-spec.md:915` và `:951`; tokens `skills/react-nodejs/design-tokens.md:259`; task `tasks/feature-cyberplex-reskin/phase-2-task-03.md:7` đều ghi ghim 90svh desktop, mobile không ghim |
| M-01 | QuickBookBar opacity 0.6 vs NFR-12 | PARTIAL | Rule đúng: design `:880`, `:905` ("opacity luôn 1"); task-03 `:8`. Còn sót ở design `:906` → M-R2-01 |
| M-02 | Glitch nhấp nháy (WCAG 2.3.1) | CLOSED | design `:864` (bỏ glitch); tokens `:255` ("Không glitch/nhấp nháy"); NFR-19 `SPECIFICATIONS.md:363` (≤ 3 lần/giây). Còn sót cụm "viền glitch" → m-03 |
| M-03 | Phần tử kẹt ẩn / focus | CLOSED về rule | design `:889` (`[data-scrub]:focus-within` ép hiện; test 4 cỡ màn); AC-32 `SPECIFICATIONS.md:505`; tokens `:256`; change doc `:34`. Chưa chạy lại test (mục 5) |
| M-04 | MODIFY nhưng thêm R-138 | CLOSED | change doc `:3` (ADDITIVE R-138 + MODIFY); `spec/updates/2026-11-19-cyberplex-reskin.md:3, :11`; CHANGELOG `:20` |
| F-01 | "suất thật" chưa định nghĩa | CLOSED | R-138 `SPECIFICATIONS.md:146` liệt kê điều kiện lọc; AC-31 `:504` |
| F-02 | Guest khi bấm Đặt vé | CLOSED | R-138 `:146` ("Guest vẫn được chuyển tới đó và bị yêu cầu đăng nhập đúng như R-16") |
| F-04 | Reduced-motion với animation theo thời gian | PARTIAL → m-05 | NFR-19 `:363` |
| F-07 | Vị trí QuickBookBar | PARTIAL → m-08 | |
| F-08 | AC-31 thiếu case ngừng bán/rạp đóng | CLOSED | AC-31 `:504` |
| F-09 | Banner lịch đổi R-136 | CLOSED | R-138 `:146` (rạp đang có lịch đổi vẫn hiện) |
| F-10 | Chưa chọn tỉnh | CLOSED | R-138 `:146`; AC-31 `:504` |
| F-11 | NFR-19 "chỉ transform/opacity" | PARTIAL → m-04 | NFR-19 `:363` đã thêm clip-path, filter |
| F-12 | CTA MovieCard với sắp chiếu | CLOSED | design `:802` ("Phim sắp chiếu không có CTA (R-45)") |
| F-13 | AC-32 thiếu case | CLOSED phần lớn | AC-32 `:505` (admin/soát vé, Firefox tĩnh, CLS). "tự chạy" còn thiếu → m-09 |
| F-14 | Soát vé fade 150ms vs không hiệu ứng | CLOSED | design `:775` và `:818` đều "không hiệu ứng"; grep không còn "150ms" |
| F-15 | Thứ tự NFR-19 | CLOSED | NFR-19 `:363` đứng sau NFR-18 `:362` |
| F-16 | Ngày/cascade/rỗng | CLOSED | R-138 `:146` (Ngày = 7 ngày tới; đặt lại các ô sau; "Chưa có suất") |

## 2. Trả lời 5 câu hỏi

**(1) Còn mâu thuẫn "hero không ghim", "opacity .6/0.6", "glitch", "fade 150ms" không?**
- "Hero không ghim": không còn, trừ mô tả mobile (đúng).
- "Glitch": còn cụm "viền glitch" ở tokens `:16` (m-03).
- "fade 150ms": không còn.
- "opacity .6 / 0.6": CÒN ở design `:906` (M-R2-01).

Sweep 7 file task (`tasks/feature-cyberplex-reskin/phase-*-task-*.md`): không còn `.6`, không còn glitch là hành vi. Các dòng khớp gồm task-01 `:10` ("không glitch"), task-04 `:8` ("không glitch", lịch chiếu nhóm A trái → phải), task-07 `:9` (AC-32, cuộn hết trang opacity 1 ở 4 cỡ màn). Hai dòng cần lưu ý: task-03 `:26` ("sáng dần", đã nêu ở m-06), và task-03 `:8` (đúng: opacity luôn 1).

**(2) R-138 có mâu thuẫn với R-44, R-56, R-67, R-137, R-35, R-16 không? "Mốc đóng bán" ở R-56 có đúng là cấu hình rạp không?**
- Không mâu thuẫn trực tiếp với R-35, R-16, R-137, R-59.
- R-56 `:161` đúng là "mốc đóng bán online trước suất" cấu hình riêng của rạp. R-67 `:179` là mặc định chuỗi 15 phút, Cinema Manager cấu hình cho rạp mình. R-138 dùng "mốc đóng bán theo cấu hình rạp R-56" là đúng.
- R-67 yêu cầu R-44 vẫn hiện suất "Ngừng bán", còn R-138 loại suất này trong khi viết "đúng như R-44, cùng điều kiện". Đây là lệch chữ nghĩa (m-07).

**(3) Số liệu "Tổng (spec 3.5.0)" có khớp không?** Khớp. Đã đếm lại:
- R: 138 dòng (R-01…R-138).
- REMOVED: 12 (R-111, R-120…R-130) → 126 còn hiệu lực.
- MVP: 113 (trong đó 10 có `[cần xác nhận]`). GĐ2: 13 (trong đó 1 có `[cần xác nhận]`). 113 + 13 = 126.
- NFR: 19 (NFR-01…NFR-19).
- AC: 32 (AC-01…AC-32). AC-20…AC-23 là REMOVED → 28 còn hiệu lực.
- Ghi chú: đếm MVP/GĐ2 phải tính cả dòng phase kết thúc bằng `[cần xác nhận]` (không có `|` cuối). Đếm đúng thì khớp.
- Nhưng AC-31/AC-32 nằm sai vị trí (M-R2-03), nên con số "32 dòng AC" đếm được chỉ nhờ regex, không nhờ bảng.

**(4) NFR-19 và AC-32 kiểm thử được và không tự mâu thuẫn không?**
- AC-31 và AC-32: G/W/T rõ, kiểm được bằng test. AC-32 không tự mâu thuẫn về nội dung.
- NFR-19 có mâu thuẫn (M-R2-02): câu "Mọi cặp chữ/nền ở mọi thời điểm của chuyển động vẫn đạt NFR-12" không thể thoả với keyframe opacity 0 ở 0% (design `:836`) áp cho mọi `[data-scrub]`, gồm tiêu đề, thẻ, ghế, footer. Không AC nào kiểm "mọi thời điểm". Câu này cũng rộng hơn tokens `:255` (chỉ "chữ/viền điều khiển").
- Kẹt ẩn: AC-32 đo được bằng Playwright. Kết quả 0/43 ở 4 cỡ màn là lời báo cáo, chưa xác minh lại (mục 5).

**(5) Còn BLOCKER/MAJOR nào không?**
- BLOCKER: không.
- MAJOR: 3 (M-R2-01, M-R2-02, M-R2-03). Cả ba là lỗi nội dung hoặc cấu trúc trong spec/design sau vòng sửa, không phải requirement mới. Mỗi cái sửa được bằng một câu hoặc chuyển dòng.

## 3. Findings

### MAJOR

**M-R2-01 MAJOR. Acceptance còn giá trị opacity .6 cũ.**
- Nguồn: `.context/design-spec.md:906` ("hero đầu trang `opacity .6, translate -36px, scale .9` … về lại đầu trang trả `.6/-36px/.9`").
- Mâu thuẫn với: `.context/design-spec.md:880` và `:905` (opacity luôn 1); NFR-19 `SPECIFICATIONS.md:363`; preview `docs/design/cyberplex/preview.html:160` (keyframe 0% đã là `opacity:1`).
- Task liên quan: phase-2-task-03 (Verify, Playwright đọc `.qfield`).
- Đề xuất: sửa `:906` thành `opacity 1, translate -36px, scale .9` ở đầu trang; `1, 0, 1` sau 90svh; bỏ mọi giá trị `.6`.

**M-R2-02 MAJOR. NFR-19 "mọi thời điểm" mâu thuẫn với keyframe fade-from-0 và không kiểm được.**
- Nguồn: NFR-19 `SPECIFICATIONS.md:363` ("Mọi cặp chữ/nền ở mọi thời điểm của chuyển động vẫn đạt NFR-12 (không giảm opacity chữ/viền điều khiển dưới ngưỡng tương phản)").
- Mâu thuẫn với: `.context/design-spec.md:836` (keyframe `opacity 0` ở 0%), áp cho tiêu đề `:864`, thẻ `:865`, ghế `:857`, footer `:868`. Tokens `skills/react-nodejs/design-tokens.md:255` hẹp hơn: chỉ nói "chữ/viền điều khiển".
- Task liên quan: phase-1 task-01 (scrub CSS), task-02/04/05 (dùng `<Scrub>`).
- Đề xuất: sửa NFR-19 thành "ở trạng thái nghỉ (đã cuộn qua hoặc reduced-motion) mọi cặp chữ/nền và viền điều khiển đạt NFR-12; trong lúc chuyển động cho phép fade từ opacity 0 như ngoại lệ có chủ đích"; đồng bộ tokens `:255` và thêm tiêu chí đó vào AC-32.

**M-R2-03 MAJOR. AC-31 và AC-32 nằm ngoài bảng AC.**
- Nguồn: `SPECIFICATIONS.md:504-505`. Bảng AC kết thúc ở AC-30 (`:398`), rồi `## API Endpoints` (`:400`). AC-31 và AC-32 đứng ngay sau bullet "Không vận hành production thật" (`:503`) trong mục Deployment (`:492`), không có dòng trống, không có header bảng.
- Hệ quả: trong Markdown, các dòng `| AC-31 ...` bị coi là phần tiếp của bullet, không render thành bảng; parser đọc bảng AC sẽ bỏ sót. Cũng chưa có AC-31/AC-32 trong `spec/test-scope/current.json` (chỉ có tới AC-30, dòng 20). Việc này có thể do spec-publisher chưa chạy, nhưng dòng AC lệch chỗ là lỗi cấu trúc đã có sẵn.
- Round 1 không bắt lỗi này.
- Đề xuất: chuyển `:504-505` vào sau dòng `:398` (cùng bảng AC) và thêm dòng trống trước `## API Endpoints`. Sau đó để spec-publisher đưa AC-31/AC-32 vào `spec/test-scope/current.json`.

### MINOR

- **m-03** `skills/react-nodejs/design-tokens.md:16` (T2): "Cyan = thông tin/VIP + viền glitch" còn sót. Glitch đã bỏ (`:74`, `:255`). Đề xuất: bỏ cụm "+ viền glitch".
- **m-04** `.context/design-spec.md:883`: "brightness 1.25 + bóng crimson" có thể là animate box-shadow, ngoài whitelist NFR-19 `:363` (transform/opacity, clip-path, filter). Tokens `:255` chỉ nêu filter cho nút "lên đạn". Đề xuất: ghi "drop-shadow (filter)" hoặc bỏ animate bóng.
- **m-05** NFR-19 `:363` "chuyển màu ≤ 120ms được giữ", nhưng `skills/react-nodejs/design-tokens.md:240` có `--dur-hover: 200ms` cho "Hover, đổi màu", và design `:802`, `:812`, `:813` có scale 700ms, dialog 200ms, toast 300ms. Spec không nói các chuyển động theo thời gian (không theo cuộn, không tự chạy) có tắt dưới reduced-motion không (F-04 còn mở một phần). Đề xuất: NFR-19 ghi rõ "dưới reduced-motion, hover/dialog/toast chỉ đổi màu/opacity ≤ 120ms, không scale/trượt", và đổi `--dur-hover` cho khớp.
- **m-06** Từ "sáng dần" gợi opacity 0→1, trong khi quy định mới là opacity luôn 1: change doc `spec/changes/2026-11-19-cyberplex-reskin.md:13, :35`; task-03 `:26`; design `:880` ("sáng lần lượt"). Đề xuất: đổi thành "lần lượt hiện (trượt + pop, nhãn đổi màu)".
- **m-07** R-138 `SPECIFICATIONS.md:146` ghi "Nguồn và quy tắc lọc = đúng như R-44 (cùng truy vấn, cùng điều kiện)", nhưng R-67 `:179` yêu cầu R-44 hiện suất "Ngừng bán". Đề xuất: "Nguồn dữ liệu và điều kiện lọc của R-44, trừ việc loại suất Ngừng bán online (R-67)".
- **m-08** Vị trí QuickBookBar lệch chữ: R-138 `:146` "đáy khối banner"; design `:792` "ở đáy hero"; design `:918` (§16.6 #6) "dưới hero". Đề xuất: thống nhất "ở đáy hero, trong khối banner".
- **m-09** AC-32 `:505` chưa phủ "tự chạy" (shimmer `design-spec.md:250`) và "không nhấp nháy > 3 lần/giây" (NFR-19 `:363`). Đề xuất: thêm vào AC-32 "reduced-motion tắt shimmer; không có gì nhấp nháy".

## 4. Ma trận coverage

| # | Requirement | Nguồn | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | R-138 đặt vé nhanh | SPEC:146; update:8 | WARN | m-07, m-08 |
| 2 | R-138 vs R-44/R-59/R-35/R-16/R-137 | SPEC:146, :143, :171, :129, :127 | PASS | Không mâu thuẫn trực tiếp |
| 3 | R-138 vs R-67 (ngừng bán) | SPEC:146, :179 | WARN | m-07 |
| 4 | R-138 vs R-56 (mốc đóng bán theo rạp) | SPEC:146, :161 | PASS | Đúng là cấu hình rạp |
| 5 | Số liệu "Tổng 3.5.0" | SPEC:530 | PASS | Đếm lại khớp (mục 2, câu 3) |
| 6 | AC-31 đặt vé nhanh | SPEC:504 | WARN | G/W/T kiểm được; vị trí sai (M-R2-03) |
| 7 | AC-32 reduced-motion/cuộn/kẹt ẩn | SPEC:505 | WARN | m-09; vị trí sai (M-R2-03); kết quả đo chưa xác minh lại |
| 8 | NFR-19 vs NFR-12 | SPEC:363 vs :356; design:836 | FAIL | M-R2-02 |
| 9 | NFR-19 vs NFR-11 (Firefox tĩnh) | SPEC:355, :363 | PASS | Không mâu thuẫn |
| 10 | Hero ghim | change:25; design:915, :951; tokens:259 | PASS | C-00 đã đóng |
| 11 | QuickBookBar opacity | design:880, :905, :906 | FAIL | M-R2-01 |
| 12 | Glitch | design:864; tokens:16, :255 | WARN | m-03 |
| 13 | Thuộc tính animate | SPEC:363; tokens:255; design:883 | WARN | m-04 |
| 14 | Phân loại MODIFY/ADDITIVE | change:3; update:3; CHANGELOG:20 | PASS | M-04 đã đóng |
| 15 | Soát vé không hiệu ứng | design:775, :818 | PASS | F-14 đã đóng |
| 16 | Thứ tự NFR-19 | SPEC:362-363 | PASS | F-15 đã đóng |
| 17 | Cấu trúc bảng AC (AC-31/32) | SPEC:398, :400, :504-505; test-scope current.json:20 | FAIL | M-R2-03 |

## 5. Residual risk / chưa xác minh

- Kết quả đo 0/43 (4 cỡ màn, không scroll ngang, focus-within): chỉ là lời báo của builder/user. Không chạy Playwright trong vòng này. Cần test thật ở task-03 và task-07, và AC-32.
- Không đọc BRD và không kiểm `booking.service.ts` trong vòng này. Đây là phạm vi round 1, không thuộc câu hỏi round 2.
- Mục "Phủ 128/128 BR" không kiểm (cần BRD).

## 6. Hành động đề xuất

Giới hạn vòng (2) đã hết. Primary cần đưa user quyết định, không tự chạy vòng 3. Ba MAJOR đều là sửa văn bản ngắn:
1. Sửa `design-spec.md:906` (M-R2-01): thay giá trị `.6` bằng `1`.
2. Sửa NFR-19 `SPECIFICATIONS.md:363` và đồng bộ `design-tokens.md:255` + AC-32 (M-R2-02): giới hạn "mọi thời điểm" thành "trạng thái nghỉ".
3. Chuyển AC-31/AC-32 vào bảng AC, sau dòng 398 (M-R2-03).
4. Gộp m-03 đến m-09 cùng đợt sửa.
5. Sau khi user duyệt sửa, Playwright AC-32 (4 cỡ màn) chạy lại để xác nhận 0/43.
