---
name: ai-readable-codebase
description: "Chuẩn code AI-native: viết code cho 2 độc giả (người + AI agent) — tên self-descriptive, ít indirection, 1 file 1 trách nhiệm, document kèm code (README + ARCHITECTURE map). Hook conventions + reviewer gate check AI-chaos indicators. Trigger: setup project mới, review task code, refactor codebase."
---

# AI-Readable Codebase — Code Chuẩn cho Agent Đọc & Dùng (Curated)

> Chuẩn "AI-native codebase" — code không chỉ người đọc được, mà AI agent cũng hiểu nhanh, sửa đúng, ít lạc. Áp dụng khi viết mới, refactor, và review.

## Nguyên tắc cốt lõi

Code có **2 độc giả: con người + AI agent**. Agent đọc nhanh hơn khi: tên tự mô tả, ít indirection, cấu trúc rõ, tài liệu đi kèm trong repo. Nguyên tắc: **nếu agent phải đoán, code chưa đạt chuẩn.**

## 1. Tên tự mô tả (self-descriptive naming)

- Tên file/hàm/biến **nói đúng việc nó làm** — agent không cần mở file mới hiểu.
- ✅ Tốt: `getUserByEmail()`, `createStripeCheckoutSession()`, `videoUploadHandler.ts`
- ❌ Dở: `processData()`, `utils.ts`, `handleThing()`, `temp2`, `foo`
- **KHÔNG viết tắt khó đoán** (`calcAmt`, `updUsr`) — token rẻ hơn thời gian agent đoán.
- Component React đặt tên theo màn hình/vai trò: `SalesPipelineBoard`, `SchedulerCalendar` (không `MainComponent`).

## 2. Ít indirection — dễ trace

- **1 file 1 trách nhiệm rõ**; đường gọi hàm ngắn, dễ trace từ entry → logic.
- Tránh: wrapper 3 lớp, dynamic import vô tội vạ, proxy ẩn, "service chuyển tiếp" không làm gì.
- Nếu agent không trace được luồng trong ≤3 bước nhảy → tách hoặc ghi rõ doc.
- **Tránh import vòng** (circular) — agent (và runtime) dễ lạc.

## 3. Function/Component kích thước dễ nuốt

- Hàm ≤ 50 dòng; component React ≥ 200 dòng → tách sub-component.
- 1 hàm 1 việc: nếu tên hàm cần "and" (`validateAndSaveAndNotify`) → tách.
- Side-effect tách khỏi pure logic (agent dễ test + hiểu).

## 4. Comment giải thích WHY, không phải WHAT

- WHAT → code tự nói (tên tốt). Comment để giải thích **tại sao** (ràng buộc business, workaround, lý do lựa chọn).
- ✅ Có giá trị: `// REASON: Ayrshare rate-limits 100/min — retry với backoff`
- ❌ Vô nghĩa: `// increment i by 1`
- **Magic number/chuỗi** phải có hằng số đặt tên (`MAX_RETRY = 3`) hoặc comment lý do.

## 5. Tài liệu đi kèm repo (agent onboard nhanh)

Repo PHẢI có (bắt buộc khi agent nhận project):
- **`README.md`** — chạy được ngay: install, build, test, dev, env vars
- **`ARCHITECTURE.md`** — module map: entry points, luồng chính, nơi gọi DB/integrations (cập nhật khi đổi)
- **`docs/`** hoặc tương đương cho quyết định quan trọng (ADR-style): vì sao chọn X không chọn Y
- Entry point khai báo rõ (file chính, route map, migration folder)

> Agent mới clone repo → đọc README + ARCHITECTURE là hiểu được 80% trước khi đọc code.

## 6. Reviewer gate — AI-chaos indicators (FAIL khi gặp)

Khi review diff, check các dấu hiệu "chaos" làm AI/người lạc:

- [ ] Tên mơ hồ (`utils`, `helpers`, `data`, `thing`, `temp`) trong code mới
- [ ] Hàm >50 dòng / component >200 dòng / quá nhiều nested ternary
- [ ] Đường call >3 bước nhảy để hiểu 1 feature (indirection thừa)
- [ ] Magic number/string không có hằng số hoặc lý do
- [ ] Comment WHAT thay vì WHY (nhất là comment lặp lại tên hàm)
- [ ] Code mới không cập nhật ARCHITECTURE.md/README khi thay đổi luồng chính
- [ ] Dynamic import / require ẩn làm khó trace (trừ lazy-load có lý do)
- [ ] Import vòng / phụ thuộc ẩn giữa module

> ❌ **Refuse (FAIL nếu thấy ≥3 indicators):** trả loop sửa theo chuẩn trên.

## Hook vào template

- **Loop khi code**: áp dụng mục 1-4 khi viết/sửa code.
- **Reviewer**: chạy mục 6 (AI-chaos check) cùng karpathy surgical check trước khi PASS.
- **Setup project mới** (Phase 0/1): đảm bảo README + ARCHITECTURE.md tồn tại ngay từ đầu.
- Bổ trợ `karpathy-guidelines` (surgical: chỉ chạm đúng chỗ — chuẩn này thêm "viết sao cho AI hiểu"), `anti-slop` (chống low-evidence pattern), `aislop` (chống AI-slop nội dung).

## Lưu ý

- Không phải chuẩn "tối ưu performance" — ưu tiên readability cho agent, đánh đổi nhỏ về perf nếu cần (chỉ khi thật sự hot path).
- Không ép mọi thứ thành comment — comment ít nhưng đúng chỗ (WHY) > comment nhiều vô nghĩa.
- Code cũ (legacy) chưa đạt chuẩn → KHÔNG viết lại hàng loạt; áp dụng dần theo từng slice sửa tới (surgical), ghi nợ vào audit report.

## Output

Trả về: danh sách AI-chaos indicators tìm thấy (file:dòng), mức vi phạm, hành động (sửa tên/tách hàm/thêm doc/hằng số), xác nhận README+ARCHITECTURE có cập nhật cho code mới.