# Spec Validation Report — feature remove-pos (phase-1)

Agent: spec-validator
Change: `spec/changes/2026-11-12-remove-pos.md` (class REMOVE, spec 1.1.0 → 2.0.0, scopeVersion 3)
Ngày: 2026-11-12
Round: 1 (ghi theo tên caller yêu cầu; rerun cùng round thì ghi đè file này)
Phạm vi kiểm: SPECIFICATIONS.md, spec/updates, spec/CHANGELOG.md, spec/test-scope/current.json, docs/BRD.md, docs/specs/2026-11-10-filmbooking-mvp-design.md, .context/design-spec.md, docs/design/cinemo/manifest.json + README-FIGMA.md, tasks/build-filmbooking/PLAN.md + layer 5–8, tasks/bug-layer34-review/phase-2-task-03/04/06.md, spec/changes/BACKLOG.md.

**Giới hạn kiểm chứng:** Bash bị agent-guard chặn cho vai spec-validator (không chạy được `git diff`, không chạy JSON parser). Không so được diff đầy đủ với HEAD. Thay vào đó đối chiếu với `spec/archive/SPECIFICATIONS-1.1.0.md` cho toàn bộ dòng có POS / R-111 / R-12x / R-130 / AC-20..23, và đọc toàn văn các mục liên quan (Điểm cần xác nhận, §5.3, §8.5, traceability). JSON test-scope đọc tay thấy hợp lệ.

## Verdict: FAIL

Lý do: 2 HIGH conflict (H1, H2) và ≥ 3 ⚠️ (M1–M4). Việc bỏ POS tự thân **nhất quán** với spec/BRD: không tìm thấy requirement MVP không-POS nào bị xoá nhầm. Hai HIGH là hệ quả của việc bỏ POS trong khi spec/BRD giữ nguyên phần "quầy vật lý" — cần PO quyết, không phải lỗi builder.

## Ma trận coverage

| # | Requirement / mục | Source | Status | Ghi chú |
|---|---|---|---|---|
| 1 | R-111, R-120→R-130 REMOVED, giữ dòng, không đánh số lại | SPECIFICATIONS.md:246, 271–281 | ✅ | Đúng format gạch + `[REMOVED ...]`, phase = REMOVED |
| 2 | AC-20→AC-23 REMOVED | SPECIFICATIONS.md:384–387 | ✅ | |
| 3 | AC-24 bỏ "và POS", bỏ R-127 | SPECIFICATIONS.md:388 | ✅ | Refs còn R-108, R-109, R-110 |
| 4 | R-55, R-59, R-107, R-108, R-119 sửa wording chỉ-web | SPECIFICATIONS.md:156, 167, 242, 243, 261 | ⚠️ | R-55/59/107/108 đúng. R-119 tiêu đề vẫn "Báo cáo kênh bán & suất bị huỷ" (M2) |
| 5 | NFR-02/03/04/17 bỏ tham chiếu R-120/121/123 | SPECIFICATIONS.md:343–358 | ✅ | NFR-17 còn "web ↔ web" |
| 6 | Không còn "web và POS / web ↔ POS / kênh POS / POS giả lập" còn hiệu lực | grep `\bPOS\b` toàn spec | ✅ | Chỉ còn trong dòng gạch/REMOVED, mục 14, Điểm #7–8 gạch, ghi chú :562 |
| 7 | Ma trận quyền §5.3 | SPECIFICATIONS.md:451–466 | ✅ | Không còn cột/hàng POS; Staff (soát vé, tra cứu chỉ đọc) giữ nguyên |
| 8 | Vòng đời đơn §8.5 | SPECIFICATIONS.md:296–317 | ✅ | Không còn nhánh POS; `affected → exchanged/refunded_manual` giữ (H1) |
| 9 | Dữ liệu: đơn chỉ kênh Web; giữ ghế bỏ "nguồn giữ (web/POS)"; bỏ khoá API POS | SPECIFICATIONS.md:422–430 | ✅ | |
| 10 | Overview "Chỉ kênh web" + quầy vật lý ngoài hệ thống | SPECIFICATIONS.md:27 | ⚠️ | Mâu thuẫn với "nguồn sự thật duy nhất" khi quầy bán ngoài hệ thống (H2) |
| 11 | Traceability ADMIN/POS | SPECIFICATIONS.md:512, 514 | ✅ | |
| 12 | Footer tổng / Phủ | SPECIFICATIONS.md:517 | ⚠️ | Vẫn "134 requirement — 121 MVP", "Phủ 140/140 BR", "26/26 AC"; thực tế 122 / 109 MVP / 128 BR / 22 AC (M1) |
| 13 | Điểm cần xác nhận #7, #8 gạch; Quyết định #3, #6, #7, #8 | SPECIFICATIONS.md:529–552 | ✅ | |
| 14 | spec_version 2.0.0 | SPECIFICATIONS.md:2 | ✅ | |
| 15 | spec/updates/2026-11-12-remove-pos.md khớp spec | spec/updates/2026-11-12-remove-pos.md | ✅ | Đối chiếu từng mục (R-111, R-120→130, AC-20→23, R-55/59/107/108/119, NFR-02/03/04/17, AC-24, overview, actor, tech stack, dữ liệu, ngoài phạm vi, traceability) — khớp spec hiện tại |
| 16 | spec/CHANGELOG.md dòng 2.0.0 | spec/CHANGELOG.md:9 | ✅ | Khớp scopeVersion 3 |
| 17 | test-scope/current.json: specVersion 2.0.0, scopeVersion 3 | spec/test-scope/current.json:2–3 | ✅ | |
| 18 | test-scope specRefs = 122, không có R-111, R-120..R-130 | spec/test-scope/current.json:8–129 | ✅ | Đếm: R-01..R-110 (110) + R-112..R-119 (8) + R-131..R-134 (4) = 122 |
| 19 | test-scope acceptance = 22 (AC-01..19, 24, 25, 26) | spec/test-scope/current.json:183–205 | ✅ | Không còn AC-20..23 |
| 20 | test-scope regression ghi nhớ code POS còn lại | spec/test-scope/current.json:177–180 | ✅ | Ghi rõ là residual chờ task code |
| 21 | BRD v0.5 changelog, §6.14 gạch, BR-POS/BR-ADM-15 gạch, AC-20..23 gạch, R10 gạch, Q1 đổi | docs/BRD.md:25, 98, 140, 349, 365–383, 608, 639–642, 653 | ✅ | |
| 22 | BRD vai trò POS (§5.2) | docs/BRD.md:140 | ✅ | Gạch |
| 23 | Staff: soát vé, tra cứu, đơn bị ảnh hưởng giữ | docs/BRD.md:348 (BR-ADM-14), §5.3; SPECIFICATIONS.md:37, 225–238, 245 | ✅ | |
| 24 | BRD đổi suất "mã vé mới cấp tại quầy — ngoài hệ thống" | docs/BRD.md:411 | ❌ | H1 |
| 25 | "Mua tại quầy" (R-67) + "web là nguồn sự thật duy nhất về ghế" | docs/BRD.md:43; SPECIFICATIONS.md:27, 175 | ❌ | H2 |
| 26 | Design doc header, MVP count, hold_seats signature | docs/specs/2026-11-10-filmbooking-mvp-design.md:4, 9, 87 | ⚠️ | M3 |
| 27 | Design doc: POS gạch, Staff/soát vé/đơn bị ảnh hưởng giữ | docs/specs/...:6, 17, 60, 75–82, 105, 111, 119 | ✅ | |
| 28 | design-spec.md: scope change, màn 29/39 REMOVED, Staff giữ | .context/design-spec.md:6, 17, 49, 60, 82, 147–169, 401, 497–501, 708–716 | ✅ | Khối màn 29 (:407–414) còn nội dung trong khối REMOVED để truy vết (chấp nhận) |
| 29 | design-spec màn 34 "Đã đổi suất tại quầy → mã vé mới" | .context/design-spec.md:472 | ❌ | H1 |
| 30 | manifest.json: 29/39 vào removed_screens | docs/design/cinemo/manifest.json:47–50 | ⚠️ | `"source": "BRD v0.4"` (M4); screens[] vẫn liệt kê 29/39 |
| 31 | README-FIGMA: 29/39 REMOVED, Staff giữ | docs/design/cinemo/README-FIGMA.md:16–30 | ✅ | |
| 32 | ERD.md (as-built) | docs/ERD.md:44, 45, 48, 53, 59, 60, 64, 77 | ⚠️ | Còn bảng pos_*, cột kênh POS, seed POS keys — residual chờ task code (M5) |
| 33 | PLAN.md: 2 task REMOVED (5-05, 7-09), 109 R-xx MVP hiệu lực | tasks/build-filmbooking/PLAN.md:4, 124, 162, 211 | ✅ | |
| 34 | PLAN: mọi R-xx MVP hiệu lực có ≥1 task | tasks/build-filmbooking/PLAN.md:217–337 | ✅ | Kiểm mẫu R-55..R-68, R-90..R-110, R-112..R-116, R-131..R-134: mọi dòng còn task. R-119 (lát MVP) ở PLAN:212 |
| 35 | Không task hiệu lực phụ thuộc task REMOVED | grep `layer-5-task-05\|layer-7-task-09` | ✅ | Chỉ còn trong task REMOVED hoặc dòng "bỏ phụ thuộc" (layer-6-task-01, layer-8-task-05, layer-8-task-06) |
| 36 | Task layer 5–8 còn lại không tham chiếu R/AC đã bỏ | tasks/build-filmbooking/layer-5..8 | ⚠️ | layer-5-task-06, layer-7-task-03/07, layer-8-task-02/05 có banner "Scope change" nhưng header R-xx chưa gạch (LOW, M6) |
| 37 | bug-layer34-review phase-2 task-03/04/06: mục Scope change | tasks/bug-layer34-review/phase-2-task-03.md:9–14; -04.md:9–13; -06.md:9–13 | ✅ | Thu hẹp khớp change doc (bỏ confirm_pos_sale, FK tickets.seat_id → backlog CR-002, bỏ nhánh POS idempotency/extend); residual ghi rõ |
| 38 | BACKLOG CR-001 / CR-002 | spec/changes/BACKLOG.md:11–12 | ⚠️ | CR-002 không có change doc (cột "—") (M7) |
| 39 | Không còn requirement MVP không-POS bị xoá | archive vs current | ✅ | Tập REMOVED = đúng 12 R + 4 AC, toàn bộ POS-specific; các R tương đương web (R-108, R-62, R-60, R-55) còn đủ |
| 40 | R-67 "mua tại quầy" / R-110 "đổi suất tại quầy" giữ nghĩa vật lý | SPECIFICATIONS.md:175, 245, 290 | ❌ | H1, H2 |

## Cross-document conflicts

| Mã | Conflict | Source A | Source B | Mức |
|---|---|---|---|---|
| H1 | Đổi suất cần "mã vé mới", nhưng không có cơ chế hệ thống nào phát hành/soát vé mới | SPECIFICATIONS.md:245 (R-110 "mã vé mới cấp tại quầy" → `exchanged`), :244 (R-109), :290 (R-134); docs/BRD.md:348, :411; .context/design-spec.md:472 | SPECIFICATIONS.md:226 (R-98: "Không tồn tại / chưa thanh toán" → đỏ), :227 (R-99: vé affected không check-in được); không có R nào tạo vé/đơn mới cho suất thay thế | **HIGH** |
| H2 | Quầy vật lý bán/đổi **ngoài hệ thống, không đồng bộ ghế**, nhưng spec tuyên bố web là "nguồn sự thật duy nhất về ghế" và chống bán trùng chỉ cho web | SPECIFICATIONS.md:27 (quầy không đồng bộ ghế), :175 (R-67 "mua tại quầy"), :345 (NFR-04 chỉ web), :317 (trạng thái ghế); docs/BRD.md:43 | SPECIFICATIONS.md:27 ("Web là nguồn sự thật duy nhất về trạng thái ghế") | **HIGH** |
| M-cross | Vé bán tại quầy (không có bản ghi trong hệ thống) không quét được ở soát vé: R-98 trả "Không tồn tại / chưa thanh toán" → từ chối vào rạp | SPECIFICATIONS.md:225–226 (R-97, R-98) | SPECIFICATIONS.md:245 (quầy bán / cấp vé ngoài hệ thống) | Gộp vào H2 (cùng nguyên nhân) |

## Gaps cần PO quyết (không tự chọn — không thêm requirement)

**G1 (H1) — Vé đổi suất tại quầy.** Hệ thống không có requirement nào tạo vé/đơn mới cho suất thay thế. Spec yêu cầu Staff "ghi nhận mã vé mới cấp tại quầy" mà vé đó không tồn tại trong hệ thống → không soát được (R-98/R-99) và `exchanged` là trạng thái cuối không truy vết tới đơn mới. PO chọn một:
- (a) Hệ thống phát hành vé mới trong web khi ghi nhận `exchanged` (chọn suất/ghế mới, chống bán trùng qua R-62, sinh mã + QR) → cần change ADDITIVE có requirement mới (chỉ làm sau khi PO chốt).
- (b) Giữ quy trình ngoài hệ thống: spec ghi rõ vé đổi suất quầy không soát được bằng QR, quy trình thủ công; sửa R-98/R-110 cho đúng thực tế.
- (c) Khác (PO nêu).

**G2 (H2) — Quầy bán ngoài hệ thống.** Quầy bán "mua tại quầy" (R-67) và đổi suất không ghi vào hệ thống → rủi ro bán trùng ghế tại rạp (web vs quầy) và vé quầy không soát được. PO chọn một:
- (a) Quy trình vận hành: quầy chỉ bán ghế đã được Manager khoá trên web (R-55 "Khoá ghế") — spec ghi rõ quy trình, hoặc
- (b) Quầy chỉ bán sau mốc đóng bán online và không bán ghế đang mở trên web — ghi rõ, hoặc
- (c) Chấp nhận rủi ro double-booking tại quầy, ghi residual risk và sửa câu "nguồn sự thật duy nhất" cho đúng phạm vi web.
Sau khi PO chọn, sửa câu tuyên bố ở Overview (:27) và R-67/R-110 cho khớp (đây là MODIFY của intent — cần duyệt).

**G3 (LOW) — Trạng thái `exchanged`.** Nếu chọn (b)/(c) ở G1, `exchanged` vẫn là trạng thái cuối không liên kết đơn mới — PO xác nhận có cần liên kết hay chỉ ghi nhận.

## Findings theo severity

### HIGH
- **H1** — Đổi suất "mã vé mới cấp tại quầy" không có cơ chế hệ thống. Nguồn: SPECIFICATIONS.md:244–245, :290; docs/BRD.md:348, :411; .context/design-spec.md:472. Liên quan: R-98 (:226), R-99 (:227). Cần G1.
- **H2** — Quầy vật lý bán/đổi ngoài hệ thống mâu thuẫn "web là nguồn sự thật duy nhất về ghế" và chống bán trùng chỉ cho web (NFR-04, :345). Nguồn: SPECIFICATIONS.md:27, :175, :345; docs/BRD.md:43, :274. Cần G2.

### MEDIUM (⚠️)
- **M1** — SPECIFICATIONS.md:517 footer stale: "134 requirement — 121 MVP", "Phủ 140/140 BR", "26/26 AC". Thực tế: 122 hiệu lực (109 MVP + 13 GĐ2), 128 BR, 22 AC. Dòng :562 và :566 ("round 2 PASS") là ghi chú lịch sử, cần ghi rõ đã cũ. Cập nhật footer khi spec-publisher chạy lại.
- **M2** — SPECIFICATIONS.md:261 tiêu đề R-119 "Báo cáo kênh bán & suất bị huỷ" còn chữ "kênh bán" dù nội dung và change doc đã bỏ tách kênh; docs/BRD.md:363 tiêu đề là "Báo cáo suất bị huỷ". Đề nghị đổi tiêu đề (wording, không đổi nghĩa).
- **M3** — docs/specs/2026-11-10-filmbooking-mvp-design.md:4 ghi "BRD v0.3 · SPECIFICATIONS.md 1.1.0"; :9 ghi "121 requirement tag MVP" (thực tế 109); :87 `hold_seats(showtime, seats[], channel, requestId)` còn tham số chỉ dùng cho nhánh POS — bỏ hoặc ghi là residual.
- **M4** — docs/design/cinemo/manifest.json:3 `"source": "BRD v0.4"` (nên v0.5); `screens[]` vẫn liệt kê 29 và 39 (chấp nhận nhờ `removed_screens`, nhưng ghi rõ `screen_count` gồm màn REMOVED).

### LOW (ℹ️ / residual)
- **M5** — docs/ERD.md:44, 45, 48, 53, 59, 60, 64, 77: as-built còn `pos_api_keys`, `pos_api_logs`, `pos_requests`, cột kênh WEB/POS, `affected_order_cases.counter_contact`, seed 5 POS keys. Residual đúng quy trình (chờ task code), không phải lỗi spec; phải reconcile ERD khi code task xong (AGENTS Doc Impact).
- **M6** — Task header còn ID REMOVED chưa gạch: tasks/build-filmbooking/layer-2-task-02.md:10 (R-111, R-130), layer-4-task-01.md:10–11 (R-122..124, AC-21/22), layer-4-task-02.md:10 (R-125, R-128), layer-4-task-04.md:10 (R-127). PLAN.md đã gạch đúng. Đây là task đã/đang build (lịch sử), chỉ ghi chú.
- **M7** — spec/changes/BACKLOG.md:12 CR-002 (bỏ FK `tickets.seat_id` → backlog) không có change doc, trái quy tắc "1 dòng = 1 change doc". Bỏ FK là giảm ràng buộc toàn vẹn; spec không yêu cầu FK nên không vi phạm spec, nhưng cần change doc để truy vết.
- **M8** — .context/design-spec.md:466 cột "kênh" trong chi tiết đơn còn tồn tại (chỉ còn Web) — nên bỏ hoặc ghi "kênh: Web".
- **M9** — Không diff được với HEAD (Bash bị chặn): residual risk cho kiểm "không đổi nghĩa requirement khác ngoài ý muốn". Đã đối chiếu archive 1.1.0 cho mọi dòng POS-liên quan và các dòng sửa wording; các R/NFR/AC khác không diff đầy đủ.

## Edge cases / non-functional (xét lại sau CR)
- Bỏ POS → không còn rate limit / requestId theo khoá (R-126, R-130) và NFR tương ứng. Không có gap.
- NFR-02 (≥ 20 thao tác giữ ghế/giây web), NFR-03, NFR-04, AC-06 (web↔web) còn nguyên. Không có gap.

## Suggestions (actionable)
1. PO chọn G1 và G2 trước khi chạy phase-2 (code) và trước khi chạy spec-publisher lần nữa; sau đó MODIFY spec/intent theo change doc mới (không sửa tay).
2. Sửa footer SPECIFICATIONS.md:517, tiêu đề R-119 (M1, M2) và dòng stale trong design doc/manifest (M3, M4) — cùng CR hoặc CR nhỏ để tránh drift.
3. Tạo change doc cho CR-002 (M7).
4. Khi code task `remove-pos` phase-2 xong: reconcile ERD.md / API_SPEC (nếu có) theo as-built (M5, M6).
5. Validation round 2 ghi file riêng, không gộp.

## Verdict reasoning
- FAIL: 2 HIGH conflict (H1, H2) và ≥ 3 ⚠️ (M1–M4). Không tự resolve HIGH — trả PO.
- Phần bỏ POS (R-111, R-120..R-130, AC-20..23, sửa wording, test-scope 122/22, PLAN 109 MVP coverage, bug-layer34 scope change) đúng và nhất quán. Nếu PO chốt G1/G2 và sửa M1–M4, có thể PASS ở round 2.

## Ghi chú về tên file
Caller yêu cầu tên `feature-remove-pos-phase-1-spec-validation.md`; template dùng `<feature>-<slug>-phase-<N>-round-<R>-<kind>.md`. Đã ghi theo tên caller yêu cầu; primary có thể rename theo quy ước (vd `feature-remove-pos-phase-1-round-1-spec.md`).
