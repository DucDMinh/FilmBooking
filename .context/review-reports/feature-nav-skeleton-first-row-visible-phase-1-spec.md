# Spec Validation Report — CR-016 nav-skeleton-and-first-row-visible (spec delta 3.5.2 → 3.6.0)

Agent: spec-validator
Round: 1
Mode: spec delta check (pre-task). Không sửa SPECIFICATIONS.md hay mã.
Sources: `SPECIFICATIONS.md` (spec_version 3.6.0; NFR-19, NFR-20, AC-32, AC-35, dòng ma trận truy vết ~L532, tổng ~L535), `spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md`, `.context/design-spec.md` §5 (L250) và §16.3/§16.4 (L797–L906).
Residual: git diff không chạy được (xem Residual risk), nên đối chiếu nội dung hiện tại thay vì từng hunk.

## Verdict: ❌ FAIL

Lý do theo `.agent/spec-validator.md`: 1 HIGH cross-doc conflict (design-spec §16.4 vs NFR-19 mới) và 3 ⚠️. Nội dung SPECIFICATIONS.md (NFR-19/20, AC-35) tự nhất quán; FAIL nằm ở tài liệu thiết kế cần reconcile trước khi chia task, không phải ở delta spec.

## Feature Coverage Matrix (delta CR-016)

| # | Requirement (change doc) | Source | Status | Note |
|---|---|---|---|---|
| 1 | Bấm điều hướng → URL đổi + khung trang + skeleton ngay, dữ liệu điền sau | change §Acceptance 1 | ✅ | NFR-20 (cl. 1); AC-35 (cl. 1) |
| 2 | Skeleton khớp bố cục, không nhảy, aria-busy/nhãn, reduced-motion tắt shimmer | change §Acceptance 2 | ✅ | NFR-20 (role=status, aria-busy, shimmer tắt, ≤3 lần/s); AC-35. Token CYBERPLEX là chi tiết triển khai, design-spec §5 L250 đã có |
| 3 | Dòng dữ liệu đầu tiên hiện đủ ngay trong màn hình đầu | change §Acceptance 3 | ⚠️ | NFR-19 cl. mới và AC-35 (cl. 2) có. Xem Finding F-2 (ambiguity "màn hình đầu" vs "khi mục đi vào khung nhìn") |
| 4 | Hàng sau vẫn hiện dần theo cuộn, thu về khi cuộn lên; không phá Scrub | change §Acceptance 4 | ✅ | NFR-19 cuối ("chỉ áp cho các hàng từ hàng thứ hai trở đi"); AC-35 (cl. 2) |
| 5 | Lỗi tải vào error.tsx/trạng thái lỗi hiện có; không đổi API/contract | change §Acceptance 5, Ghi chú | ✅ | NFR-20 ("Tải dữ liệu lỗi… không kẹt ở skeleton"; "Không đổi API, dữ liệu hay nghiệp vụ"); AC-35 |
| 6 | Phạm vi 9 route khách (trang chủ, phim, chi tiết phim, lịch chiếu, rạp, chi tiết rạp, đặt vé, vé, tài khoản) | change §Phạm vi | ✅ | NFR-20 và AC-35 liệt kê đúng 9 route, khớp nhau |
| 7 | Admin/staff: làm nếu cùng cơ chế, còn lại ghi follow-up | change §Phạm vi | ⚠️ | NFR-20: "Admin và soát vé không thuộc phạm vi" (loại hẳn, không có follow-up). Xem F-3 |
| 8 | Test/lint/typecheck/build PASS, kiểm tay trình duyệt | change §Acceptance 6 | — | Thuộc verification/plan, không phải requirement spec. Không yêu cầu bổ sung vào spec |
| 9 | Ràng buộc §16.4 scrub (design) áp dụng cho hàng đầu | design-spec §16.4 L864–L880 | ❌→HIGH | Xem C-1: design vẫn scrub hàng đầu, mâu thuẫn NFR-19 mới |
| 10 | Skeleton / loading mechanism cho trang khách | design-spec §5 L250 | ⚠️ | Xem C-2 |
| 11 | Frontmatter spec_version 3.6.0, changelog CR-016 trong source | SPECIFICATIONS.md L2–L4 | ✅ | Đã có. spec/updates và CHANGELOG chưa có mục 3.6.0 (xem Info I-1) |
| 12 | Dòng ma trận truy vết CR-016 → NFR-20, NFR-19 sửa, AC-35 | SPECIFICATIONS.md ~L532 | ✅ | Có đủ |
| 13 | Tổng: NFR 20/20 | SPECIFICATIONS.md ~L535 | ✅ | Đếm được 20 dòng `| NFR-xx |` (NFR-01…NFR-20) |
| 14 | Tổng: AC 31/31 còn hiệu lực | SPECIFICATIONS.md ~L535 | ✅ | AC-01…AC-35 đủ 35 dòng; AC-20…AC-23 REMOVED (4 dòng); 35−4=31. Khớp |
| 15 | NFR-19 (cũ) vs AC-32 (reduced-motion, trình duyệt không hỗ trợ, không phần tử ẩn một phần, Admin không scroll) | SPECIFICATIONS.md L363, L401 | ✅ | Không mâu thuẫn. AC-32 "mọi opacity = 1 khi cuộn hết" đúng với hàng đầu (opacity 1) |
| 16 | NFR-19 hero "ngoại lệ duy nhất" vs clause hàng đầu | SPECIFICATIONS.md L363 | ✅ | "Ngoại lệ duy nhất" nói về giảm opacity; clause hàng đầu không giảm opacity, không mâu thuẫn. Ghi chú I-2 |
| 17 | R-138/AC-31 (thanh đặt vé nhanh không giảm opacity) | SPECIFICATIONS.md L363, L400 | ✅ | Không đổi, không mâu thuẫn |
| 18 | NFR-11 (responsive, ≥360px) / NFR-12 (WCAG AA, nhãn) | SPECIFICATIONS.md L355–L356 | ✅ | NFR-20 cite NFR-11; skeleton có nhãn role=status. Không mâu thuẫn |
| 19 | NFR-13 SEO: trang public render server | SPECIFICATIONS.md L357 | ✅ | Không mâu thuẫn; skeleton dùng loading ranh giới server (xem C-2) |
| 20 | AC-35 kiểm chứng được (số đo, viewport, CLS, aria-busy) | SPECIFICATIONS.md L404 | ✅ | Có viewport 390×844/1280×800, CLS<0.1, aria-busy, opacity 1 |
| 21 | NFR-20 kiểm chứng được | SPECIFICATIONS.md L364 | ✅ | CLS≥0.1, ≤3 lần/s, role/aria-busy, phạm vi route rõ. Thiếu ngưỡng thời gian "ngay" (xem F-4, info) |

## Cross-Document Conflicts

| ID | Conflict | Source A | Source B | Mức |
|---|---|---|---|---|
| C-1 | Hàng đầu của lưới/lịch chiếu/rạp vẫn bị scrub (pop, trượt, opacity 0 khi chưa vào, `inset 300px`) trong khi NFR-19 mới yêu cầu hàng đầu hiện đủ opacity 1 không trượt/phóng | design-spec §16.4 L864–L866 (Lưới phim: "Nhóm n = số thẻ… Mỗi thẻ: pop"), L856 (Lịch chiếu DateStrip/ShowtimeGroup), L866 (Rạp, `/rap`), L844 (hiện muộn inset) | SPECIFICATIONS.md NFR-19 (clause hàng đầu), AC-35 cl. 2 | **HIGH** |
| C-2 | design-spec §5 nói loading trang công khai "chủ yếu ở client fetch" (SSR nên không có skeleton server); NFR-20 + change doc yêu cầu skeleton ngay khi chuyển route với server component `await apiFetch` | design-spec §5 L250 | SPECIFICATIONS.md NFR-20; change doc §Bối cảnh ý 1; NFR-13 (SSR bắt buộc) | ⚠️ (Medium, cần reconcile tài liệu) |

## Findings

### Gaps
- Không có ❌ (MISSING) trong delta spec. Mọi requirement của change doc §Acceptance 1–5 và §Phạm vi đều có điểm tương ứng trong NFR-19/NFR-20/AC-35.
- [PARTIAL] Không có ở spec. PARTIAL nằm ở design-spec (C-1, C-2) — xem dưới.

### ⚠️ (3 mục, đủ ngưỡng FAIL)
- **F-1 (= C-2)** design-spec §5 L250 "SSR trang công khai nên loading chủ yếu ở client fetch" mâu thuẫn với cơ chế server component mà NFR-20 cần (ranh giới loading/Suspense phía server). Task: sửa §5 L250 nêu rõ loading ranh giới server (`loading.tsx`/Suspense) + skeleton.
- **F-2 (requirement ambiguity)** NFR-19 clause hàng đầu viết "hiện đủ ngay khi mục đi vào khung nhìn", change doc viết "khi nằm trong màn hình đầu, không cần cuộn mới thấy", AC-35 viết "khi mục dữ liệu vừa vào khung nhìn… không cần cuộn thêm". Hai cách đọc khác nhau: (a) chỉ hàng đầu ở màn hình đầu lúc tải trang; (b) hàng đầu của MỌI mục, bất kể vị trí cuộn, không bao giờ scrub (rộng hơn change doc). Cần chốt. Đề xuất: "hàng đầu của mỗi mục dữ liệu không chịu chuyển động theo cuộn (opacity 1, không trượt/phóng) ở mọi vị trí" (cách b) hoặc giới hạn "trong màn hình đầu" (cách a) — user quyết vì ảnh hưởng thiết kế.
- **F-3 (scope)** change doc §Phạm vi ghi admin/staff "chỉ làm nếu cùng cơ chế và chi phí nhỏ, còn lại ghi follow-up". NFR-20 ghi "Admin và soát vé không thuộc phạm vi" — loại hẳn, không có mục follow-up nào trong change doc hay spec. Cần xác nhận với user hoặc thêm dòng follow-up. (Admin đã không có scroll motion theo NFR-19/design §16.1, nên chỉ là quyết định về skeleton.)

### Info (không tính vào ngưỡng)
- **I-1** spec/updates/ và spec/CHANGELOG.md chưa có mục 3.6.0 cho CR-016 (grep "3.6.0" không thấy trong spec/). Đây là bước spec-publisher của change-request, chưa phải lỗi delta. Cần chạy trước khi đóng.
- **I-2** NFR-19 có hai câu "ngoại lệ" (hero lead, hàng đầu). Câu "với một ngoại lệ duy nhất" nằm trong ngữ cảnh giảm opacity; clause hàng đầu không giảm opacity nên không xung đột. Có thể viết lại cho rõ, không bắt buộc.
- **I-3** NFR-20 không có ngưỡng thời gian cho "hiện ngay" (không cần vì được đo bằng CLS/hành vi), nhưng nên ghi là "trước khi dữ liệu về" để test được. Không bắt buộc.
- **I-4** AC-35 cl. 2 lặp NFR-19 clause hàng đầu (cùng điều kiện), chấp nhận được vì AC là test. Không chồng chéo requirement khác.

### Edge cases / NFR
- Lỗi API: có (NFR-20, AC-35 cl. 1). Hết hạn/không có dữ liệu (empty state) của trang rỗng: spec không nói rõ skeleton có hiện khi dữ liệu rỗng không (chỉ có error). Không phải gap bắt buộc; ghi nhận.
- Reduced-motion, không hỗ trợ scroll-driven, Tab focus: có (NFR-19, AC-32). Không thiếu.
- CLS, aria, shimmer ≤3 lần/s: có (NFR-20).

## Suggestions (actionable)
1. Thêm task reconcile **design-spec §16.4** (C-1): loại hàng đầu của Lưới phim, Lịch chiếu (ShowtimeGroup/DateStrip), Rạp khỏi `data-scrub` hoặc đặt `--i` ngoài hiệu ứng; cập nhật thêm dòng "hiện muộn inset" không áp cho hàng đầu. Thêm ghi chú NFR-20/AC-35 vào design-spec.
2. Thêm task reconcile **design-spec §5 L250** (C-2/F-1).
3. Chốt F-2 và F-3 với user (cách hiểu "màn hình đầu" và phạm vi admin/staff), rồi viết lại đúng một câu trong NFR-19/NFR-20 nếu cần.
4. Sau đó chạy spec-publisher (I-1) để có spec/updates + CHANGELOG 3.6.0.
5. Chạy lại spec-validator round 2 sau khi các mục trên xong.

## Verdict Reasoning
- FAIL triggers: có 1 HIGH conflict (C-1) và đúng 3 ⚠️ (C-2, F-2, F-3). Theo rule `.agent/spec-validator.md`, đây là FAIL.
- Bản thân delta SPECIFICATIONS.md (NFR-19 sửa, NFR-20, AC-35, ma trận, tổng 20/20 và 31/31, AC-20…23 REMOVED) đúng và khớp change doc. Không có ❌ nội dung spec.

## Residual risk / Blocked
- **Blocked — Bash:** hook `agent-guard` chặn lệnh `cd "E:/FilmBooking" && git diff SPECIFICATIONS.md` (reviewer/spec-validator chỉ được cd vào `.worktrees/`). Theo luật, không retry/không đổi biến thể. Vì vậy không chạy được `git diff` và không so từng hunk với bản 3.5.2. Đối chiếu nội dung hiện tại qua Grep/Read.
- CRLF (check (5)): Grep cho thấy 589 dòng kết thúc `\r`, 0 dòng không có CR (kể cả dòng trống). File giữ CRLF toàn bộ. Không đo được byte-level trên phần vừa sửa do không có diff.
- Không kiểm trình duyệt/code (ngoài phạm vi spec validator).
