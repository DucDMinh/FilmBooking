# Spec Validation Report — CR-016 nav-skeleton-and-first-row-visible (round 3, delta 3.6.0 → 3.6.1)

Agent: spec-validator
Round: 3 (hẹp)
Mode: spec validation, delta 3.6.1 (PATCH làm rõ R-137, AC-28, NFR-20). Không sửa SPECIFICATIONS.md, spec/, docs/ hay mã.
Tiền đề: round 1 FAIL (`...-phase-1-spec.md`), round 2 PASS (`...-round-2-spec.md`).
Nguồn đã đối chiếu: `SPECIFICATIONS.md` (front-matter L2-L5, R-37 L131, R-46 L145, R-137 L127, NFR-19 L363, NFR-20 L364, AC-28 L397, AC-32 L401, AC-35 L404, ma trận L532-L535, CR-017 không xuất hiện), `spec/updates/2026-11-23-nav-skeleton-and-first-row-visible.md`, `spec/updates/2026-11-23-booking-error-messages.md`, `spec/CHANGELOG.md` (dòng 27-29), `spec/test-scope/current.json` (specVersion/scopeVersion L2-L3, dependents L1024-L1028, residual L1116, L1189-L1191, acceptance L1253-L1264, L1357-L1359, changed L1377-L1379).
Ghi chú công cụ: không chạy `git diff` và không chạy Bash (không cần, đã dùng Grep/Read). JSON không parse bằng máy; kiểm bằng Grep multiline (không có dấu phẩy thừa trước `]`/`}`) và Read đầu/cuối file (cấu trúc đóng đúng).

## Verdict: FAIL

Lý do: 3 chỗ trong `spec/test-scope/current.json` còn khẳng định "404" cho mã rạp/slug phim không tồn tại, mâu thuẫn trực tiếp với R-137 / AC-28 / NFR-20 bản 3.6.1 (HIGH). Chính `SPECIFICATIONS.md` (3.6.1) nhất quán: không còn câu nào nói bot/trình duyệt nhận 404 cho mã sai; NFR-19, NFR-20, AC-28, AC-32, AC-35, R-137 khớp nhau và khớp số đo. Lỗi nằm ở artifact test-scope, không ở spec. Sửa bằng `spec-publisher` (chỉ sửa text acceptance/scope trong current.json), sau đó chạy lại round 4 hẹp.

## Feature Coverage Matrix (round 3)

| # | Requirement / kiểm | Source | Status | Note |
|---|---|---|---|---|
| 1 | R-137: mã rạp không tồn tại → 200 + noindex, cho mọi client (kể cả Googlebot, Bingbot) | SPECIFICATIONS.md L127 | OK | Khớp NFR-20 L364 và AC-28 L397; khớp số đo (spec update L14, L33-34 nêu Chrome/Googlebot/Bingbot) |
| 2 | AC-28: rạp CLOSED → 200 + thông báo, không 404; mã sai → 200 + noindex; OPEN có lịch đóng → banner | SPECIFICATIONS.md L397 | OK (xem MEDIUM M-1 về noindex rạp không OPEN) | Khớp R-137 |
| 3 | NFR-20: hệ quả 200 + noindex cho mã sai, lý do `notFound()` không đổi status khi đã stream | SPECIFICATIONS.md L364 | OK | Khớp R-137/AC-28; có "user chấp nhận 2026-11-23" |
| 4 | NFR-19 (dòng dữ liệu đầu + tiêu đề hiện đủ, kể cả dưới khung nhìn lúc mở; scrub từ hàng 2) | SPECIFICATIONS.md L363 | OK | Khớp AC-35 cl. 2 (L404) và AC-32 (L401). Ambiguity round 1 (F-2) đã được chốt: "kể cả khi mục còn nằm dưới khung nhìn lúc mở trang" |
| 5 | AC-35: skeleton điều hướng + cuộn; route list 9 nhóm | SPECIFICATIONS.md L404 | OK | Route list NFR-20 L364 và AC-35 L404 trùng nhau (9 route) |
| 6 | R-37 (trang rạp, "Rạp không Đang hoạt động → xem R-137") | SPECIFICATIONS.md L131 | OK | Không có "404" trong R-37 |
| 7 | R-46 (SEO SSR, meta, schema.org) | SPECIFICATIONS.md L145 | OK | Không có "404"/"bot" trong R-46 |
| 8 | Toàn văn SPECIFICATIONS: không còn câu khẳng định bot nhận 404 hoặc "trình duyệt thường khác bot" | grep "404" và "bot"/"Googlebot"/"trình duyệt thường" | OK | Chỉ có 3 chỗ nhắc 404: L127, L364, L397, và tất cả đều nói 200 chứ không phải 404. L4 (front-matter) nói về lịch sử CR-009 "thay vì 404" — không mâu thuẫn |
| 9 | front-matter spec_version 3.6.1 | SPECIFICATIONS.md L2 | OK | Khớp spec/updates (3.6.1), CHANGELOG L28, test-scope L2 |
| 10 | Ma trận truy vết CR nav-skeleton (L532) | SPECIFICATIONS.md L532 | MINOR (M-3) | Liệt kê NFR-20, NFR-19 sửa, AC-35; thiếu R-137/AC-28 mà 3.6.1 làm rõ |
| 11 | Tổng: NFR 20/20 | SPECIFICATIONS.md L535 | OK | Đếm được NFR-01…NFR-20 (20 dòng L345-L364) |
| 12 | Tổng: AC 31/31 còn hiệu lực | SPECIFICATIONS.md L535 | OK | AC-01…AC-35 trừ AC-20…AC-23 REMOVED = 31 |
| 13 | Tổng: 138 R-*, 126 còn hiệu lực | SPECIFICATIONS.md L535 | OK | Không đổi mã R-* ở 3.6.1 (đúng với spec update L13) |
| 14 | spec/updates/2026-11-23-nav-skeleton... (3.6.0 + 3.6.1, residual) | spec/updates L1-L44 | OK | Nêu đúng 404→200+noindex; L38 "Bot không nhận 404" là phát biểu residual đúng; không còn "dự kiến" hay "bot nhận 404" như khẳng định |
| 15 | spec/CHANGELOG 3.6.0 (scope 34) | CHANGELOG L27 | OK | |
| 16 | spec/CHANGELOG 3.6.1 (scope 35, PATCH) | CHANGELOG L28 | OK | Khớp spec update; mô tả 200+noindex cho mọi client |
| 17 | spec/CHANGELOG 3.6.1 không bump scope 36 (CR-017) | CHANGELOG L29 | OK | Đúng định dạng "(không bump)" của các bug-fix trước (3.5.2 CR-002/005/015) |
| 18 | spec/test-scope/current.json: specVersion 3.6.1, scopeVersion 36 | current.json L2-L3 | OK | |
| 19 | current.json: JSON hợp lệ | current.json | OK (kiểm tĩnh) | Không có dấu phẩy thừa; file đóng `]` L1380 và `}` L1381. Không parse máy |
| 20 | current.json specRefs có R-137, AC-28, NFR-19, NFR-20, AC-35, AC-32 | current.json L8-L63 | OK | Đủ; có R-37/R-46 trong specRefs CR-016 không bắt buộc |
| 21 | current.json scope v35 web.notfound.http-200-noindex (R-137, AC-28, NFR-20) | current.json L1014 | OK | Khớp 3.6.1 |
| 22 | current.json dependents L1026: HTTP 200 + noindex cho mọi client | current.json L1026 | OK | |
| 23 | current.json acceptance A3 CR-016 (Googlebot/Bingbot → 200 + noindex) | current.json L1357 | OK | |
| 24 | current.json acceptance A4 CR-016 (CLOSED → 200 + thông báo + noindex) | current.json L1358 | MEDIUM (M-1) | "noindex" cho rạp CLOSED không có trong R-137/AC-28 của SPECIFICATIONS |
| 25 | current.json L935 (scope v26): "mã rạp không tồn tại -> 404" cho `/rap/<mã>` | current.json L935 | HIGH (H-1) | Mâu thuẫn R-137/AC-28/NFR-20 3.6.1 (200 + noindex). Dòng 933 là API JSON `GET /cinemas/:code` nên 404 ở đó vẫn đúng; L935 là web page |
| 26 | current.json L1189 (`/phim/[slug]`): "slug không tồn tại → 404 như cũ" | current.json L1189 | HIGH (H-1) | Mâu thuẫn NFR-20/R-137 3.6.1. Câu "404 như cũ" là wording cũ đúng loại user yêu cầu loại bỏ |
| 27 | current.json L1264 (acceptance A3 CR-cinema-status-notice): "mã rạp không tồn tại Then vẫn 404" | current.json L1264 | HIGH (H-1) | Chính acceptance này trích AC-28 nhưng ghi ngược 3.6.1. Cùng một mâu thuẫn |
| 28 | current.json L1116 (dependent SEO/JSON-LD): "Rạp không OPEN: không JSON-LD, noindex." | current.json L1116 | MEDIUM (M-1) | Quy tắc noindex cho rạp không OPEN có trong spec/updates/2026-11-18 L36 nhưng không có trong SPECIFICATIONS R-137/AC-28 |
| 29 | current.json L1191 (residual): "?province= sai ... vẫn cho 404" | current.json L1191 | MINOR (M-4) | Là ghi chú residual "không viết test kỳ vọng hành vi đúng", không phải acceptance; nhưng nên cập nhật theo 3.6.1 để không gây hiểu nhầm |
| 30 | current.json L933 (API `GET /cinemas/:code` mã không tồn tại → 404) | current.json L933 | OK | Đây là API JSON, không phải trang web; 404 vẫn là hành vi đúng |
| 31 | CR-017 bug-fix: SPECIFICATIONS.md không có thay đổi | grep "CR-017|DOB_REQUIRED|booking-error|CONSENT_VERSION_INVALID|INVALID_SEATS" trong SPECIFICATIONS.md | OK | Không khớp file nào trong SPECIFICATIONS.md; chỉ có trong spec/updates, spec/CHANGELOG, spec/changes, spec/test-scope, docs/API_SPEC.md |
| 32 | CR-017 không bump là hợp lý | CHANGELOG L29; spec/updates/2026-11-23-booking-error-messages.md L2-L7 | OK | Không đổi requirement (R-68, R-71, R-94 đều đã có và không đổi nội dung). Không có mã HTTP nào trong SPECIFICATIONS.md để mâu thuẫn với 400→422, 400→409, 400→500 (chỉ có 409 cho last-admin R-105/AC-34, không liên quan) |
| 33 | CR-017 mã lỗi chỉ ở docs/API_SPEC.md | grep kết quả: docs/API_SPEC.md khớp | OK | |
| 34 | test-scope còn wording cũ "dự kiến"/"bot nhận 404" | grep spec/test-scope/current.json | OK | Không có "dự kiến" trong current.json. Các "bot" đều là "200 + noindex" (L1014, L1026, L1028, L1357, L1378) |

## Cross-Document Conflicts

| ID | Conflict | Source A | Source B | Mức |
|---|---|---|---|---|
| H-1 | test-scope còn 3 acceptance/scope khẳng định mã rạp/slug phim sai → 404 (`/rap/<mã>` L935, `/phim/[slug]` L1189, acceptance A3 L1264) | SPECIFICATIONS.md R-137 L127, AC-28 L397, NFR-20 L364 (200 + noindex, mọi client) | spec/test-scope/current.json L935, L1189, L1264 | HIGH |
| M-1 | noindex cho rạp không OPEN (CLOSED/TEMP_CLOSED/COMING_SOON) được test-scope khẳng định (L935, L1116, L1253, L1358) và spec/updates/2026-11-18 L36, nhưng R-137/AC-28 trong SPECIFICATIONS.md không nói | SPECIFICATIONS.md R-137 L127, AC-28 L397 | current.json L935, L1116, L1358; spec/updates/2026-11-18 L36 | MEDIUM |
| M-3 | Ma trận truy vết CR-016 (L532) không liệt kê R-137 / AC-28 là điều khoản được làm rõ ở 3.6.1 | SPECIFICATIONS.md L532 | spec/updates/2026-11-23 L13-L15; CHANGELOG L28 | MINOR |
| M-4 | current.json L1191 residual "vẫn cho 404" cho `?province=` sai chưa theo 3.6.1 | current.json L1191 | R-137/NFR-20 3.6.1 | MINOR |

Không có mâu thuẫn trong bản thân SPECIFICATIONS.md ở 3.6.1.

## Findings

### Gaps
- [PARTIAL] `spec/test-scope/current.json` chưa đồng bộ 3.6.1 ở 3 chỗ 404 (H-1). Liên quan requirement: R-137, AC-28, NFR-20. Task liên quan: spec-publisher (cập nhật current.json, không đổi scopeVersion của CR-016 nếu chỉ sửa text; cân nhắc bump theo quy trình publisher).
- [PARTIAL] Quy tắc noindex cho rạp không OPEN chưa có trong R-137/AC-28 (M-1). Hai lựa chọn: (a) bổ sung 1 câu vào R-137 (PATCH) "rạp không Đang hoạt động trả 200 + thông báo kèm noindex", hoặc (b) bỏ "noindex" khỏi acceptance A4 L1358, L935, L1116 nếu PO không muốn ràng buộc này. Chọn (a) hay (b) là quyết định của user/PO, không tự chọn.
- Không có [MISSING] trong delta 3.6.1.

### Ghi nhận sửa đổi round 2 → round 3
- Round 1 F-2 (ambiguity "màn hình đầu") đã được chốt trong NFR-19 L363 và AC-35 L404 theo cách rộng (mọi vị trí cuộn, kể cả dưới khung nhìn lúc mở).
- Round 1 C-1 (design-spec §16.4) và C-2 (design-spec §5) không thuộc phạm vi round 3, không đánh giá lại ở đây.

### Info (không tính vào ngưỡng)
- test-scope A5 CR-016 (L1359) và spec/updates test list kiểm 5 cỡ màn; AC-35 chỉ nêu 390×844 và 1280×800. Test rộng hơn spec là chấp nhận được.
- Spec/updates L38 "Bot không nhận 404" là phát biểu residual đúng nghĩa, không phải khẳng định sai.

### Edge cases / NFR
- Mã sai và rạp đóng: R-137, AC-28, NFR-20 đã phủ. Reduced-motion/shimmer: NFR-20 đã phủ. Lỗi API: NFR-20 đã phủ.

## Suggestions (actionable)
1. spec-publisher sửa `spec/test-scope/current.json`: L935 "mã rạp không tồn tại -> 404" → "200 + noindex + giao diện không tìm thấy (3.6.1)"; L1189 "slug không tồn tại → 404 như cũ" → "HTTP 200 + noindex + giao diện không tìm thấy (3.6.1, R-137/NFR-20)"; L1264 "Given mã rạp không tồn tại Then vẫn 404" → "Then HTTP 200 + noindex + giao diện không tìm thấy (R-137, NFR-20, 3.6.1)"; L1191 cập nhật tương tự (MINOR).
2. Hỏi user/PO quyết M-1 (noindex cho rạp không OPEN): thêm vào R-137 (PATCH) hay bỏ khỏi acceptance. Không tự quyết.
3. Bổ sung R-137 / AC-28 vào dòng ma trận L532 (MINOR, có thể làm cùng lượt spec-publisher).
4. Sau khi sửa, chạy spec-validator round 4 hẹp chỉ kiểm H-1 và M-1.

## Verdict Reasoning
- FAIL triggers: có 1 HIGH conflict (H-1) và 1 MEDIUM (M-1), không có ❌ nội dung trong SPECIFICATIONS.md. Theo `.agent/spec-validator.md` HIGH là FAIL.
- Phần user yêu cầu kiểm (1)-(4) trong SPECIFICATIONS.md và spec/updates, CHANGELOG, front-matter, tổng 20/20 NFR và 31/31 AC, CR-017 không đổi requirement: đều PASS.

## Residual risk / Blocked
- Không chạy `git diff` (đã dùng Read/Grep theo yêu cầu). Không đối chiếu từng hunk với bản 3.6.1 nháp; đối chiếu nội dung hiện tại.
- Không parse JSON bằng máy; kiểm tĩnh.
- Không kiểm mã và không đo Playwright lại; chỉ đối chiếu số đo đã ghi trong spec/updates và task (`tasks/feature-nav-skeleton-first-row/phase-3-task-03.md` không đọc trong round này).
