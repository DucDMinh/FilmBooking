# Spec Validation Report — CR-016 nav-skeleton-and-first-row-visible (spec 3.6.0), Round 2

Agent: spec-validator
Round: 2 (xác nhận hẹp sau round 1 FAIL: `.context/review-reports/feature-nav-skeleton-first-row-visible-phase-1-spec.md`)
Mode: spec delta check (pre-task). Không sửa SPECIFICATIONS.md, design, change doc hay mã.
Sources: `SPECIFICATIONS.md` (L2 spec_version 3.6.0; L363 NFR-19; L364 NFR-20; L404 AC-35; L401 AC-32; L531-535 ma trận/tổng), `.context/design-spec.md` (L250 §5; L844-849 NGOẠI LỆ HÀNG ĐẦU + hiện muộn; L858-872 bảng vùng; L891 chống kẹt ẩn; L903-907 §16.5), `spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md`, `spec/updates/2026-11-23-nav-skeleton-and-first-row-visible.md`, `spec/CHANGELOG.md` (có mục 3.6.0/CR-016), `spec/test-scope/current.json` (specVersion 3.6.0, scopeVersion 34), `spec/changes/BACKLOG.md` L26, `tasks/feature-nav-skeleton-first-row/phase-2-task-01.md`, `phase-2-task-02.md`, `phase-3-task-03.md`.

## Verdict: PASS (kèm ghi chú MINOR, không tính vào ngưỡng FAIL)

Round 1 có 1 HIGH (C-1) và 3 ⚠️ (C-2, F-2, F-3). Round 2 xác nhận tất cả đã được xử lý. Không còn HIGH conflict, không còn ⚠️ nào mở, không có ❌.

## Xác nhận từng finding

| ID | Finding round 1 | Trạng thái round 2 | Bằng chứng |
|---|---|---|---|
| C-1 (HIGH) | design-spec §16.4 scrub hàng đầu mâu thuẫn NFR-19 mới | RESOLVED | design-spec L844 "NGOẠI LỆ HÀNG ĐẦU (CR-016, NFR-19, AC-35)": hàng đầu + tiêu đề ngay phía trên KHÔNG scrub, `opacity 1`, kể cả dưới khung nhìn; quy tắc hiện muộn/lệch pha/tia quét/hai bên "chỉ áp từ hàng thứ hai trở đi"; đánh dấu `data-scrub-first`. L845-846 cũng dẫn chiếu "(xem ngoại lệ hàng đầu ở trên)". Đối chiếu các dòng cũ: L847 lưới nhiều hàng, L858 DateStrip/ShowtimeGroup, L866 tiêu đề section, L867 lưới phim, L868 rạp, L869-870, L880 hero ghim (không đổi, đúng NFR-19), L891 chống kẹt ẩn, L907 QuickBookBar (không đổi). Không có câu nào còn khẳng định hàng đầu bị scrub. Các dòng cũ bị bao trùm bởi câu mở đầu đoạn NGOẠI LỆ, không mâu thuẫn trực tiếp. Xem ghi chú M-1. |
| C-2 (⚠️) | design-spec §5 L250 nói loading chủ yếu client fetch | RESOLVED | design-spec L250: "Trang công khai là SSR: skeleton đặt ở ranh giới server `loading.tsx` theo route (NFR-20, CR-016)...". Khớp NFR-20 và task-01. Khớp NFR-13 (SSR). |
| F-1 (= C-2) | như trên | RESOLVED | như C-2 |
| F-2 (⚠️) | "màn hình đầu" vs "khi mục vào khung nhìn", hai cách đọc | RESOLVED | NFR-19 L363: "luôn hiện đủ (opacity 1, không trượt/phóng/wipe), không chờ cuộn mới thấy, kể cả khi mục còn nằm dưới khung nhìn lúc mở trang". AC-35 (b) L404: "ở mọi vị trí cuộn (kể cả khi vừa vào khung nhìn và khi cuộn lên lại)". Cách đọc (b) đã được chốt. Không mâu thuẫn AC-32 L401 ("mọi opacity = 1 khi cuộn hết", trừ hero ghim) và không mâu thuẫn "hàng sau vẫn hiện dần" (L363 cuối, AC-35 (b)). Xem M-2 về wording change doc. |
| F-3 (⚠️) | admin/staff: "làm nếu cùng cơ chế, còn lại follow-up" vs NFR-20 loại hẳn | RESOLVED | change doc L21: admin/staff "KHÔNG thuộc phạm vi (chốt 2026-11-23...)". NFR-20 L364: "Admin và soát vé không thuộc phạm vi". design-spec L897 và L844 cuối: admin/staff không dùng scrub. Khớp nhau, không còn follow-up mở. |
| I-1 (Info, bước spec-publisher) | chưa có updates/CHANGELOG 3.6.0 | RESOLVED | `spec/updates/2026-11-23-nav-skeleton-and-first-row-visible.md` tồn tại (3.5.2 → 3.6.0, MINOR, scopeVersion 34). `spec/CHANGELOG.md` có mục 3.6.0 / CR-016 (grep khớp L27). `spec/test-scope/current.json` có specVersion 3.6.0 (L2), workItem `feature/nav-skeleton-first-row`, scope v34 các mục web.skeleton.*, web.first-row.*, REGRESSION. `spec/changes/BACKLOG.md` L26 CR-016 in_progress. |

## Kiểm bổ sung round 2

### Nhất quán version / ref (SPECIFICATIONS.md 3.6.0)
- Frontmatter `spec_version: 3.6.0` (L2). Ma trận truy vết L532: CR nav-skeleton → NFR-20, NFR-19 sửa, AC-35 (khớp updates L9).
- Tổng L535: 20/20 NFR (NFR-20 có ở L364), 31/31 AC còn hiệu lực (AC-35 ở L404, AC-20…AC-23 REMOVED). Khớp updates L9.
- Không có R-* nào thêm/sửa/xoá (updates L10); 138 mã, 126 còn hiệu lực, khớp L535.
- NFR-19/20, AC-35 không tham chiếu mã không tồn tại (NFR-11/12/13/19/20, AC-32, R-138 đều có).

### Mềm wording còn lại (MINOR, không FAIL)
- M-1: Exception design L844 liệt kê "lưới phim `/` và `/phim`, lịch chiếu `/lich-chieu` + `/rap/[code]` + `/phim/[slug]`, lưới rạp `/` và `/rap`". Danh sách phim ở `/rap/[code]` (design L868) không có trong liệt kê này. Câu mở đầu "mỗi mục dữ liệu ở trang khách" bao trùm, nên PASS, nhưng nên thêm `/rap/[code]` để tránh builder hiểu hẹp (task-02 đã có `rap/[code]/page.tsx` nên không lệch thực tế).
- M-2: `spec/changes/...md` Acceptance 3 (L26) vẫn viết "hiển thị đầy đủ ngay khi nằm trong màn hình đầu". NFR-19/AC-35 rộng hơn (mọi vị trí cuộn). Spec là tập cha, không mâu thuẫn; change doc là tập con. Nên đồng bộ wording change doc với spec khi sửa MINOR (dòng ghi "chốt" ở L13 đã trích đúng ý user "hiện ra trước chứ không phải kéo xuống mới thấy").
- M-3 (wording cũ, cần khớp, chỉ MINOR): 
  - `spec/updates/...md` L6: "hiện đủ ngay khi mục đi vào khung nhìn" còn cách đọc cũ; nên viết theo NFR-19 mới ("luôn hiện đủ, kể cả khi mục còn dưới khung nhìn lúc mở trang").
  - `spec/test-scope/current.json` L816 (`web.first-row.visible`): "ngay khi mục vào khung nhìn, không cần cuộn thêm" và L1140 (A2): "When cuộn tới khi mục dữ liệu vừa vào khung nhìn". Nên khớp AC-35 (b) "ở mọi vị trí cuộn". Không đổi nghĩa kiểm thử đáng kể vì test vẫn kiểm cả hai vị trí (L816 ghi "mục nằm ở màn đầu và mục vừa cuộn tới"). Đây là chỉnh MINOR, change-request có thể sửa.
- M-4: `spec/changes` Acceptance 5 và updates "Ảnh hưởng" không có vấn đề.

### Task (tasks/feature-nav-skeleton-first-row/)
- Chỉ có 3 file: `phase-2-task-01.md`, `phase-2-task-02.md`, `phase-3-task-03.md`. Design-spec không còn trong file list của task nào (task-01 L23 và task-02 L19 ghi rõ chỉ đọc). Khớp yêu cầu.
- Không chồng file: task-01 chỉ tạo `components/common/page-skeleton.tsx`, test của nó, và `loading.tsx` dưới `app/(public)/`. Task-02 chỉ sửa `globals.css`, `motion/scrub.tsx` + test, `catalog/section-heading.tsx`, `catalog/movie-card.tsx`, `catalog/showtime-schedule.tsx`, và các `page.tsx` (public)/page, phim, phim/[slug], lich-chieu, rap, rap/[code]. Task-03 chỉ sửa `e2e/scrub/*` và `playwright.scrub.config.ts`. Không có file trùng giữa các task. Task-01 và task-02 chạy song song được; task-03 sau merge phase 2 đúng như ghi.
- Bám spec: task-01 (NFR-20, AC-35 ý 1, NFR-11/12/19) phủ 9 route khách (trang chủ, phim, phim/[slug], lich-chieu, rap, rap/[code], dat-ve, ve, tai-khoan). Task-02 (NFR-19 sửa, AC-35 ý 2, AC-32, R-138/AC-31, NFR-12) khớp NGOẠI LỆ HÀNG ĐẦU, giữ hero/QuickBookBar không đổi.
- task-03 (NFR-19, NFR-20, AC-32, AC-35) phủ điều hướng tức thì, lỗi tải, hàng đầu hiện ngay ở 4 cỡ màn, AC-32, reduced-motion.
- Ghi chú (Info, không FAIL):
  - task-01 Files list không liệt kê `dat-ve/don/**` loading riêng; task ghi "nếu bố cục khác nhau nhiều thì thêm". Nhưng `dat-ve/loading.tsx` của cha vẫn áp cho route con theo cơ chế Next, nên phủ được. Builder nên ghi rõ trong task file nếu thêm.
  - task-02 đúng thứ tự: `section-heading.tsx` là nơi đánh dấu tiêu đề "first" theo design L844.
  - Các task có chỗ `Actual after` / `Evidence` để builder điền. Không ảnh hưởng validate.

## Feature Coverage Matrix (round 2, delta CR-016)

| # | Requirement | Source | Status | Note |
|---|---|---|---|---|
| 1 | Điều hướng: URL đổi + khung + skeleton ngay | NFR-20 L364; AC-35 (a) L404; change §Acceptance 1 | OK | Task-01 (loading.tsx theo route) |
| 2 | Skeleton khớp bố cục, aria-busy/role=status, reduced-motion tắt shimmer | NFR-20; AC-35 (a); design §5 L250 | OK | Task-01 (`PageSkeleton`, role=status, aria-busy) |
| 3 | Dòng đầu mỗi mục + tiêu đề hiện đủ, không chờ cuộn, mọi vị trí | NFR-19 L363; AC-35 (b) L404; design §16.4 L844 | OK | Task-02 (`data-scrub-first`); M-2/M-3 wording |
| 4 | Hàng sau vẫn hiện dần theo cuộn, thu về | NFR-19 L363 cuối; AC-32 L401; design L845-851 | OK | Task-02 (giữ --i/--n từ hàng 2); task-03 regression |
| 5 | Lỗi tải vào trạng thái lỗi, không kẹt skeleton; không đổi API | NFR-20 L364; AC-35 (a); change §Acc 5 | OK | Task-01 L21; task-03 (500 case) |
| 6 | Phạm vi 9 route khách | NFR-20 L364; AC-35 (a) L404; change §Phạm vi | OK | Task-01 Files list khớp 9 route |
| 7 | Admin/staff ngoài phạm vi | NFR-20 L364; change L21; design L844/L897 | OK | F-3 đã chốt |
| 8 | Cập nhật design-spec (C-1, C-2) | design §16.4 L844; §5 L250 | OK | M-1 (thêm /rap/[code] danh sách phim vào liệt kê) |
| 9 | Spec version/ref nhất quán 3.6.0 | SPECIFICATIONS L2, L531-535; updates; CHANGELOG; test-scope L2 | OK | I-1 đã có |
| 10 | Tổng 20/20 NFR, 31/31 AC | SPECIFICATIONS L535 | OK | |
| 11 | Không chồng file giữa task-01/02/03 | tasks/*/phase-*-task-*.md Files list | OK | Đã đối chiếu |

## Gaps
- MISSING: không có.
- PARTIAL: không có ở nội dung spec/design/task. Các chỗ wording cũ (M-2, M-3) là MINOR, không làm mất requirement.

## Residual risk / Blocked
- Không chạy được `git diff` (hook chặn `cd` ra khỏi `.worktrees/`), nên không đối chiếu từng hunk với bản 3.5.2. Đối chiếu bằng nội dung hiện tại qua Grep/Read.
- Không parse được `spec/test-scope/current.json` (không có bash/jq cho JSON). Chỉ kiểm bằng Grep các khóa chính (specVersion 3.6.0, scopeVersion 34 ở đầu file, mục CR-016).
- Không kiểm trình duyệt/code (ngoài phạm vi spec validator).

## Kết luận
Round 2 PASS. Không còn HIGH conflict, không còn ⚠️ mở, không có ❌. Có thể chuyển sang chia/chạy phase 2 (task-01 và task-02 song song, task-03 sau merge). Khuyến nghị (không bắt buộc, MINOR): thêm `/rap/[code]` vào liệt kê NGOẠI LỆ ở design-spec §16.4 (M-1) và đồng bộ wording "khi vào khung nhìn" ở updates L6 và test-scope L816/L1140 với AC-35 (b) (M-3), để change-request sửa cùng lượt khi tiện.
