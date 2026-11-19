Agent: spec-validator

# Spec validation — CR-010 cyberplex-reskin (spec 3.5.0)

**Verdict: FAIL** (1 BLOCKER conflict + 4 MAJOR + nhiều WARN; theo trigger FAIL của workflow)
**Phạm vi:** delta R-138, NFR-19, AC-31, AC-32; đối chiếu R-35, R-43, R-44, R-45, R-59, R-67, R-137, NFR-11, NFR-12, design-spec §16, design-tokens §4, §6.
**Không sửa** code/spec/design. Chỉ ghi report.
**Lưu ý đường dẫn:** report ghi theo path được giao (`spec-validation-cyberplex-reskin.md`), chưa có hậu tố `round-<R>` theo quy tắc đặt tên; xem mục 6.

## 0. Conflict chặn (BLOCKER)

**C-00 BLOCKER — Hero ghim: nguồn sự thật mâu thuẫn với chính nó.**
- `spec/changes/2026-11-19-cyberplex-reskin.md:25` (quyết định 4): "Hero không ghim khi cuộn".
- Cùng file, dòng 13, 34, 35: yêu cầu "hero ghim + QuickBookBar sáng dần", "Hero ghim chỉ desktop ≥ 768px và cao ≥ 620px".
- `.context/design-spec.md:913` (§16.6 #4): mặc định "Ghim 90svh trên desktop". §16.8 (dòng 949, mục "không hỏi"): "hero không ghim: giữ theo mặc định". Hai dòng trong cùng §16 mâu thuẫn nhau; §16.4 (dòng 873-885) và §16.5 (dòng 904) đặc tả chi tiết scene ghim.
- Hệ quả: builder không biết có dựng scene ghim hay không; QuickBookBar "sáng dần theo cuộn" (R-138 không nói, change doc dòng 13) phụ thuộc quyết định này.
- Đề xuất: chốt một lựa chọn (đề xuất: ghim desktop theo §16.4, vì dòng 13/34/35 đều cần nó), sửa dòng 25 của change doc và dòng "hero không ghim" trong §16.8, rồi validate lại.

## 1. Đếm số liệu (câu hỏi 3) — KHỚP

Đếm thật trên `SPECIFICATIONS.md`, đối chiếu cột phase từng dòng:

| Mục | Đếm thực | Khai báo "Tổng (spec 3.5.0)" | Kết quả |
|---|---|---|---|
| Dòng R-xx | 138 (R-01…R-138) | 138 | PASS |
| R REMOVED | 12 (R-111, R-120…R-130) | 12 | PASS |
| R còn hiệu lực | 126 | 126 | PASS |
| R MVP | 113 (10 gắn `[cần xác nhận]`) | 113 (10) | PASS |
| R GĐ2 | 13 (1 gắn `[cần xác nhận]`) | 13 (1) | PASS |
| NFR | 19 (NFR-01…NFR-19) | 19 | PASS |
| AC dòng | 32; REMOVED 4 (AC-20…AC-23) → 28 | 28 | PASS |

Chưa xác minh: "Phủ 128/128 BR" (cần BRD, ngoài phạm vi). ID trùng lặp không kiểm tra riêng (số dòng khớp 138).

## 2. Ma trận coverage

| # | Requirement | Nguồn | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | R-138 đặt vé nhanh | SPECIFICATIONS.md:146; spec/updates/2026-11-19-cyberplex-reskin.md:8 | WARN | "suất thật" chưa định nghĩa (F-01) |
| 2 | R-138 vs R-44 | SPEC:146 "không thay thế R-44" | PASS | Không mâu thuẫn |
| 3 | R-138 vs R-59 | SPEC:146, :171 | PASS | Đích là màn chọn ghế R-59 |
| 4 | R-138 vs R-67 (ngừng bán 15') | SPEC:146, :179 | WARN | Thanh loại suất ngừng bán; R-67 nói suất "hiển thị Ngừng bán". AC-31 không test (F-08) |
| 5 | R-138 vs R-137 (rạp không hoạt động) | SPEC:127, :146 | PASS / WARN | Loại rạp không hoạt động; banner R-136 không đề cập (F-09) |
| 6 | R-138 vs R-35 (tỉnh) | SPEC:129, :146 | WARN | Chưa chọn tỉnh: R-35 yêu cầu hỏi chọn; R-138/AC-31 không nói (F-10) |
| 7 | R-138 vs R-45 (sắp chiếu không đặt vé) | SPEC:144, :146 | PASS (qua "suất thật") | CTA trên MovieCard chưa loại trừ sắp chiếu (F-12) |
| 8 | AC-31 đặt vé nhanh | SPEC:504 | WARN | G/W/T rõ cho luồng chính; thiếu ngừng bán, rạp đóng, chưa chọn tỉnh |
| 9 | AC-32 reduced-motion + cuộn | SPEC:505 | WARN | Thiếu: admin/soát vé không cuộn, fallback tĩnh (Firefox), CLS (F-13) |
| 10 | NFR-19 vs NFR-11 | SPEC:355, :362 | PASS | Firefox và Safari <26 nhận tĩnh; NFR-19 cho phép |
| 11 | NFR-19 vs NFR-12 (WCAG AA) | SPEC:356, :362; design-spec.md:903-904 | FAIL (MAJOR) | Tương phản QuickBookBar lúc opacity 0.6 (M-01); flicker 2.3.1 (M-02) |
| 12 | NFR-19 "tắt hoàn toàn" khi reduced-motion | SPEC:362 | WARN (MINOR) | Chỉ áp rõ cho chuyển động cuộn; hover/feedback time-based chưa nêu (F-04) |
| 13 | NFR-19 "chỉ transform/opacity" | SPEC:362 | WARN | Design dùng filter, box-shadow (F-11) |
| 14 | Design §16.4 scroll-driven, scrub-inset | design-spec.md:825-871 | PASS | Khớp change doc dòng 33-34 |
| 15 | Phần tử kẹt ẩn (inset 300px) | design-spec.md:847 | WARN (MAJOR M-03) | Quy tắc là phán đoán, không đo được |
| 16 | Vị trí QuickBookBar | design-spec.md:792, :879, :916 vs SPEC:146 | WARN | Ba mô tả khác nhau (F-07) |
| 17 | Soát vé: animation | design-spec.md:775 vs :818 | WARN | "Tắt hết" vs "fade 150ms" vs "không hiệu ứng" (F-14) |
| 18 | Phân loại thay đổi | change doc dòng 3 vs SPEC:146, :504 | WARN (MAJOR M-04) | Ghi MODIFY "không đổi nghiệp vụ" nhưng thêm R-138 |
| 19 | Thứ tự NFR-19 | SPEC:362 | WARN | Đặt trước NFR-18; delta ghi "sau NFR-18" (F-15) |
| 20 | Hero ghim vs hero không ghim | change doc dòng 25 vs 13/34/35; design-spec.md:913, :949 | FAIL (BLOCKER C-00) | Mâu thuẫn nguồn sự thật |

## 3. Trả lời các câu hỏi

**Câu 1 (R-138 vs R-44, R-59, R-67, R-137, R-35; suất có thể đặt bị chặn):**
- Không mâu thuẫn trực tiếp với R-44, R-59, R-137. R-138 tự khai "không thay thế R-44".
- R-67 và R-137 được R-138 loại khỏi danh sách. Chưa rõ "suất thật" có gồm suất đã qua giờ hay suất sau mốc 15 phút không; R-67 ngầm phủ nhưng R-138 không nói rõ (F-01).
- Kiểm bảo vệ phía server khi bấm: Grep `apps/api/src/modules/booking/booking.service.ts` không tìm thấy kiểm mốc đóng bán trong đoạn đã quét. Chưa xác minh đầy đủ (xem mục 5). Vì đích là `/dat-ve/[showtimeId]` (đường vào chung), đây là rủi ro chung cho mọi lối vào, không riêng R-138; giảm xuống MINOR nếu xác minh được luồng giữ ghế đã chặn.

**Câu 2 (NFR-19 vs NFR-11/NFR-12; chuyển động ẩn có vi phạm WCAG?):**
- NFR-11 không mâu thuẫn: Firefox và Safari cũ nhận hiển thị tĩnh, NFR-19 cho phép.
- Opacity 0 của nội dung cuộn tự nó không vi phạm WCAG 2.1 AA: nội dung nằm trong DOM, trình đọc màn hình đọc được, và tương phản được đo ở trạng thái nghỉ.
- Vấn đề thật:
  - **Tương phản (1.4.3 / 1.4.11), đã ước lượng:** trên desktop, khi hero ghim ở đầu trang, QuickBookBar nằm ở opacity 0.6 (design-spec.md:904: "hero đầu trang opacity .6"). Nhãn `hud` fg-muted `#8A8AA0` ở 0.6 trên nền gần `#07070A` (ước lượng, chưa tính lớp phủ ảnh) cho tỉ lệ khoảng 2.7:1, dưới 4.5:1. Viền input `#6E6E86` ở 0.6 cho khoảng 2.1:1, dưới 3:1 (1.4.11). Tokens §6 chỉ tính ở opacity 1. (M-01)
  - **Nháy (2.3.1):** "glitch crimson/cyan nhấp nháy" gắn với scroll (design-spec.md:865, design-tokens.md §4). Cuộn nhanh có thể vượt 3 lần/giây. (M-02)
  - **Focus ẩn (2.4.7):** phần tử focusable còn opacity 0 khi được Tab tới; chỉ QuickBookBar có sàn 0.6. (M-03 cùng nhóm kẹt ẩn)
  - **2.2.2:** không áp dụng. Chuyển động theo cuộn do người dùng khởi động, không tự chạy theo thời gian.
  - **2.3.3 (AAA):** được reduced-motion bảo vệ; ngoài phạm vi AA.
- Phần tử kẹt ẩn: có khả năng ở trang có nội dung scrub ở đáy, footer < 300px, hoặc trang ngắn (lịch chiếu rỗng, phim sắp chiếu). Quy tắc design (design-spec.md:847) là phán đoán, không có test tự động. (M-03)

**Câu 3 (số liệu):** Khớp toàn bộ, xem mục 1.

**Câu 4 (AC-31/AC-32 kiểm được? gap/conflict với design §16):**
- AC-31 và AC-32 có G/W/T rõ cho luồng chính. Thiếu case: ngừng bán, rạp đóng, chưa chọn tỉnh, Guest (F-08, F-10, F-02).
- Gap design → spec: nhiều animation thời gian (hover, chọn ghế 160ms, dialog 200ms, toast 300ms) chưa được ghi là tắt dưới reduced-motion (F-04). CTA MovieCard với R-45 (F-12). Vị trí QuickBookBar (F-07).
- Conflict nội bộ design: Soát vé (F-14), hero ghim (C-00).

**Câu 5 ("không đổi R-xx nghiệp vụ" nhưng đổi hành vi?):**
- Các R cũ không bị sửa nội dung trong phạm vi đã đọc. Tuy nhiên R-138 là chức năng nghiệp vụ mới. Câu "không đổi nghiệp vụ đặt vé" đúng cho R cũ, nhưng delta và CHANGELOG 3.5.0 viết gọn quá (M-04).

## 4. Findings

Mức: BLOCKER / MAJOR / MINOR.

**C-00 BLOCKER** — change doc dòng 25 vs dòng 13, 34, 35; design-spec.md:913 vs :949. Hero ghim mâu thuẫn. Xem mục 0.

**M-01 MAJOR** — design-spec.md:903-904 (QuickBookBar opacity 0.6) + design-tokens.md §6 (tương phản tính ở opacity 1) vs NFR-12 (SPEC:356). Ước lượng 2.7:1 (nhãn) và 2.1:1 (viền input) ở trạng thái nghỉ trên desktop khi hero ghim.
- Đề xuất: không để nhãn/viền dưới 0.6 opacity; hoặc sàn opacity 1 cho nhãn và viền, chỉ animate vị trí/scale; hoặc tính lại tương phản ở opacity thực tế và ghi kết quả vào tokens §6. Ràng buộc với C-00.

**M-02 MAJOR** — design-spec.md:865 và design-tokens.md §4 (glitch crimson/cyan nhấp nháy, scroll-linked) vs NFR-12 (WCAG 2.3.1).
- Đề xuất: bỏ nhấp nháy, hoặc giới hạn tối đa một chu kỳ đỏ/cyan không lặp; ghi vào NFR-19.

**M-03 MAJOR** — design-spec.md:847, :887; change doc dòng 33, 35. Phần tử kẹt ẩn không có kiểm chứng tự động; focus vào phần tử ẩn chưa được ràng buộc.
- Đề xuất: (a) thêm rule `:focus-within` / `:focus-visible` ép opacity 1 cho phần tử scrub; (b) đo chiều cao footer và trang ngắn bằng Playwright cho mọi route công khai; (c) AC-32 thêm: cuộn tới cuối từng trang công khai, mọi phần tử scrub đạt tiến độ 100%.

**M-04 MAJOR** — spec/changes/2026-11-19-cyberplex-reskin.md:3; spec/updates/…:11; spec/CHANGELOG.md:20 — phân loại "MODIFY, không đổi nghiệp vụ" nhưng thêm R-138, AC-31 (chức năng mới).
- Đề xuất: ghi R-138 là ADDITIVE (hoặc "MODIFY UI + ADDITIVE R-138"); sửa câu "không đổi nghiệp vụ" thành "không đổi R nghiệp vụ hiện có".

**F-01 MINOR** — R-138 (SPECIFICATIONS.md:146), R-67 (:179), R-46 (:145). "Suất thật" chưa định nghĩa; chưa nêu rõ suất đã qua giờ và suất sau mốc 15 phút.
- Đề xuất: "Suất thật = suất còn mở bán online (chưa qua mốc R-67), rạp đang hoạt động (R-137), phim đang chiếu (R-45)." Residual risk: chưa xác minh server chặn lại khi bấm (mục 5).

**F-02 MINOR** — R-138 / AC-31 vs role matrix (SPECIFICATIONS.md:34-36). Guest chưa được nói rõ khi bấm Đặt vé. Role matrix cho Guest xem sơ đồ ghế chỉ đọc; đích `/dat-ve/*` đã có hành vi xác định.
- Đề xuất: thêm một câu vào R-138: "Guest hoặc tài khoản chưa xác minh bấm Đặt vé → chuyển đăng nhập/xác minh theo role matrix."

**F-04 MINOR** — SPECIFICATIONS.md:362 ("tắt hoàn toàn") vs design-spec.md:867 và design-tokens.md §4.1 (hover, chọn ghế, dialog, toast). Chưa ghi rõ các animation thời gian có tắt dưới reduced-motion không. AA không cấm hover/feedback ngắn; 2.3.3 là AAA.
- Đề xuất: làm rõ trong NFR-19: "dưới reduced-motion tắt mọi chuyển động cuộn; animation thời gian chỉ phản hồi trạng thái được giữ ở mức tối thiểu, không scale/trượt."

**F-07 MINOR** — SPECIFICATIONS.md:146 "dưới banner trang chủ" vs design-spec.md:792 "đáy hero", :879 "bay lên giữa màn", :916 "dưới hero". Phụ thuộc C-00.
- Đề xuất: thống nhất vị trí sau khi chốt C-00.

**F-08 MINOR** — AC-31 (SPECIFICATIONS.md:504) trace R-67, R-137 nhưng không có G/W/T kiểm loại trừ.
- Đề xuất: thêm G/W/T "suất ngừng bán và rạp đóng không xuất hiện trong thanh".

**F-09 MINOR** — R-137 (SPECIFICATIONS.md:127) banner lịch đổi R-136 không được R-138 xử lý.
- Đề xuất: ghi rõ rạp đang hoạt động có lịch đổi vẫn hiện trong thanh (hoặc không).

**F-10 MINOR** — R-35 (SPECIFICATIONS.md:129): chưa chọn tỉnh → hỏi chọn. R-138 không nói.
- Đề xuất: thêm vào R-138: "chưa chọn tỉnh → thanh gợi ý chọn tỉnh (R-35), không liệt kê rạp".

**F-11 MINOR** — NFR-19 (SPECIFICATIONS.md:362 "chỉ transform/opacity") vs design-tokens.md:256 (filter cho "lên đạn"), design-spec.md:871 (bóng crimson).
- Đề xuất: sửa NFR-19 thành "transform/opacity/clip-path/filter; không animate box-shadow".

**F-12 MINOR** — design-spec.md:802 (CTA "Đặt vé" trên MovieCard) vs R-45 (SPECIFICATIONS.md:144).
- Đề xuất: "CTA chỉ hiện khi phim có suất thật (R-45)".

**F-13 MINOR** — AC-32 (SPECIFICATIONS.md:505) không phủ: admin/soát vé không cuộn, fallback tĩnh (NFR-19), CLS < 0.1 (NFR-19).
- Đề xuất: thêm G/W/T cho ba điểm này hoặc tách AC-33.

**F-14 MINOR** — design-spec.md:775 "Tắt hết. Banner chỉ fade 150ms" vs :818 "không hiệu ứng".
- Đề xuất: "soát vé không có animation nào, kể cả fade".

**F-15 MINOR** — SPECIFICATIONS.md:362: NFR-19 đặt trước NFR-18; delta ghi "sau NFR-18".
- Đề xuất: di chuyển xuống sau NFR-18 (chỉ sắp xếp).

**F-16 MINOR** — R-138 / design-spec.md:§16.5: không định nghĩa khoảng "Ngày" (R-44 là 7 ngày), cascade Rạp→Phim→Ngày→Giờ, trạng thái rỗng.
- Đề xuất: "Ngày = 7 ngày tới (như R-44); mỗi ô chỉ liệt kê giá trị hợp lệ theo các ô trước; rỗng → thông báo tại chỗ."

## 5. Residual risk / chưa xác minh

- Không chạy Playwright/Lighthouse. Các nhận định về kẹt ẩn, nháy, tương phản là phân tích tĩnh. Số tương phản là ước lượng (không tính lớp phủ ảnh) và cần đo lại.
- Kiểm bảo vệ server khi bấm (F-01): Grep trên `booking.service.ts` không xác nhận được kiểm mốc đóng bán. Lệnh `graphify query` bị agent-guard chặn (không phải lỗi dữ liệu), nên không dùng được; không retry. Cần builder/reviewer xác nhận.
- BRD và "128/128 BR" không đọc trong phạm vi này.

## 6. Hành động đề xuất

Không sửa spec ngay. Thứ tự:
1. Chốt C-00 (hero ghim), sửa change doc dòng 25 và design-spec §16.8.
2. Sửa M-01 đến M-04, M-03 (đo footer/trang ngắn) và M-02.
3. Gộp F-01 đến F-16 cùng vòng.
4. Validate lại theo round 2. Tên file đúng quy tắc `spec-validation-cyberplex-reskin-round-2.md` hoặc `feature-cyberplex-reskin-spec-round-2.md`; giữ bản này làm round 1.
