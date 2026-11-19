Agent: spec-validator

# Review hết phase: CR-010 cyberplex-reskin (spec 3.5.0), round 2 (vòng cuối, rút gọn)

Đối chiếu với round 1: `feature-cyberplex-reskin-phase-final-spec-validation-round-1-review.md`. Commit đã sửa: 73902ef (staging). Chỉ đọc, không sửa code/spec.

## Verdict: PASS (có điều kiện)

- Không còn BLOCKER hay MAJOR về implementation.
- Hai thay đổi lời văn yêu cầu (MAJOR-1, MAJOR-2 round 1) đã được làm rõ trong spec. Đây là chỗ đổi yêu cầu, nên **cần xác nhận của user** (chi tiết mục 2).
- Có 1 MINOR cần sửa trước khi đóng: AC-32 và test-scope chưa đồng bộ với ngoại lệ mới của NFR-19.

## Kiểm tra theo yêu cầu

### (1) Nhất quán giữa SPECIFICATIONS, design-spec §16.4 và test
- **R-138** (`SPECIFICATIONS.md:146`): ghi mốc mặc định 15 phút của chuỗi (R-67), mốc riêng rạp (R-56) do server áp khi giữ ghế, dẫn chiếu CR-011. Khớp với code: `quick-book.ts:48-49,68-70` vẫn là 15 phút. Đã kiểm `cinemas.service.ts` `CINEMA_COLUMNS` không có cột mốc (dữ liệu công khai thiếu mốc riêng), nên lời văn mô tả đúng hạn chế thực tế.
- **CR-011** tồn tại: `spec/changes/2026-11-19-public-cinema-online-cutoff.md` và dòng `CR-011` trong `spec/changes/BACKLOG.md:21` (pending, BUG, P2).
- **MINOR-1** đã sửa: `quick-book-bar.tsx:131,144-145` dùng `new Date()` thay `loadedAt`. Đạt.
- **NFR-19** (`SPECIFICATIONS.md:363`): đã thêm ngoại lệ "khối lời dẫn của hero ghim (nhãn, dòng meta, nút CTA hero) được phép mờ dần và ẩn khi cuộn qua hero trên desktop... hiện lại khi cuộn về ... luôn hiện khi đang giữ focus". Test (b2) `e2e/scrub/scrub.spec.ts:447-496` khớp ngoại lệ này: CTA opacity 1 ở đầu trang, lời dẫn mờ khi cuộn tới 720, QuickBookBar luôn 1, hiện lại khi cuộn về, focus ép hiện.
- **Chưa khớp (MINOR-A)**: AC-32 (`SPECIFICATIONS.md:400`) vẫn ghi "mọi opacity = 1" khi cuộn tới cuối trang, và test-scope (`spec/test-scope/current.json:705-706`) vẫn ghi "điều khiển trong khung nhìn lúc vào trang không bao giờ giảm opacity" và "mọi opacity = 1". Hai câu này mâu thuẫn với ngoại lệ mới của NFR-19. Cần sửa để cùng một câu chuyện.
- **Chưa xác minh**: `.context/design-spec.md` §16.4. Grep "mọi opacity|không bao giờ giảm opacity" không ra kết quả nào, nên không xác nhận được đoạn đã đồng bộ hay chưa.

### (2) Có làm yếu yêu cầu không chính đáng?
Đánh giá độc lập:
- Ngoại lệ hero **không phải** sửa lỗi implementation mà là đổi lời văn NFR-19. Trước đó NFR-19 bảo vệ rõ "thanh R-138 và các điều khiển trong khung nhìn lúc vào trang"; hai nút hero ("Đặt vé ngay", "Xem chi tiết") nằm trong khung nhìn lúc vào trang nên thuộc đúng nhóm được bảo vệ. Ngoại lệ mới biến chúng thành ngoại lệ. Đây là một quyết định yêu cầu, không phải kỹ thuật.
- Lý do của ngoại lệ có cơ sở: hành động "Đặt vé" đã có ở thanh R-138 luôn opacity 1. Tuy nhiên "Xem chi tiết" không có tương đương ở thanh. Lối đến trang chi tiết phim lúc đó chỉ còn ở lưới phim bên dưới. Đây là điểm cần user nhận biết.
- Điều kiện NFR-19 còn bị vi phạm sau ngoại lệ? Không phát hiện điều khiển nào khác trong khối lời dẫn ngoài hai nút CTA (`home-hero.tsx:55-74`: nhãn, tiêu đề, meta, chip tuổi, hai nút). Tiêu đề không phải điều khiển. Chip tuổi chỉ là nhãn. Vậy ngoại lệ chỉ bao trùm đúng phần cần thiết.
- Ngoại lệ còn có điều kiện "trên desktop" và "luôn hiện khi focus", nên mobile không bị ảnh hưởng và truy cập bàn phím vẫn ổn.
- Ngoài ra, AC-32 chưa được sửa theo ngoại lệ (xem MINOR-A), nên về mặt tài liệu tồn tại một mâu thuẫn chưa giải quyết.

Kết luận: không phải weakening vô lý, nhưng là đổi yêu cầu. **Cần xác nhận của user** cho ngoại lệ NFR-19 (hero CTA) và cho việc chấp nhận mốc mặc định 15 phút ở R-138 kèm CR-011.

MAJOR-2 (round 1, mốc theo rạp): hướng "làm rõ spec + CR-011" được chấp nhận về mặt tài liệu, vì CR cam kết không đổi API/DB và hạn chế có từ R-44. Vẫn là đổi lời văn yêu cầu R-138, nên cũng cần user xác nhận. Lưu ý: bản R-138 mới vẫn đòi hỏi lọc theo cấu hình rạp ở mức nghiệp vụ, nay chuyển sang server; trải nghiệm có thể có suất hiện ở thanh rồi bị từ chối ở màn ghế cho tới khi CR-011 xong.

### (3) `spec/test-scope/current.json`
- Hợp lệ JSON theo phần đã đọc: `specVersion` 3.5.0, `scopeVersion` 27, `trigger` feature-update.
- `specRefs` có R-138, NFR-19, NFR-12, NFR-11, AC-31, AC-32. Có đủ.
- Mục scope (dòng 698-708) có mô tả AC-31/R-138 và NFR-19/AC-32. Dòng 703 ghi "20 test" cho `scrub.spec.ts`, nhưng bộ hiện có 21 test (có (b2)). Cập nhật số lượng.
- Dòng 705-706 mâu thuẫn với ngoại lệ mới (xem MINOR-A).
- Dòng 698 ghi unit test `quick-book.test.ts` và `quick-book-bar.test.tsx`. Chưa kiểm đường dẫn file test có tồn tại. Mục `changed.files` (dòng 233, 272) có liệt kê hai file này.

### (4) Số liệu "Tổng (spec 3.5.0)"
- Đếm dòng bảng hiện tại: R-xx 138, NFR-xx 19, AC-xx 32 (trong đó AC-20…23 REMOVED, còn 28). Khớp với số liệu cũ.
- Dòng 189 lần khớp thô (R + NFR + AC) không phân biệt được từng loại; đã đếm riêng từng nhóm.
- Dòng 530 "Tổng (spec 3.5.0)" chưa đọc lại trong vòng này. Cần kiểm lại nếu có thay đổi số mã. Vòng này không thêm mã R, NFR, AC mới nên số liệu không đổi.

## Findings

### MINOR-A (cần sửa trước khi đóng, không chặn implementation)
- `SPECIFICATIONS.md:400` (AC-32) và `spec/test-scope/current.json:705-706`: thay "mọi opacity = 1" và "điều khiển trong khung nhìn ... không bao giờ giảm opacity" bằng câu khớp ngoại lệ NFR-19 (hoặc ghi rõ ngoại lệ hero).
- `spec/test-scope/current.json:703`: "20 test" đổi thành 21.

### Cần xác nhận của user (không tự quyết)
1. Ngoại lệ NFR-19 cho khối lời dẫn hero (nhãn, meta, CTA hero). Đã đổi lời văn yêu cầu, không chỉ sửa code.
2. Mốc đóng bán mặc định 15 phút ở R-138 và R-44 cho tới khi CR-011 hoàn thành. Đã đổi lời văn R-138.

## Chưa xác minh
- `.context/design-spec.md` §16.4 có đồng bộ với ngoại lệ mới hay không.
- Sự tồn tại của các file test được nêu trong test-scope dòng 698-702.
- Chạy lại bộ Playwright (21 test) trong vòng này. Theo báo cáo của coordinator, 20 test cũ và (b2) đã PASS.
- Logic `payment-result.tsx` và các điểm khác của diff nghiệp vụ (R-1 round 1) vẫn chưa xác minh bằng diff.
