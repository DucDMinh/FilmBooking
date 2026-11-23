# Spec Validation Report — feature/concession-combo (CR-018) — final, round 2

Agent: spec-validator
**Entry Mode:** full_docs (re-validate 9 điểm FAIL round 1 + đối chiếu AC change doc)
**Scope:** spec delta 3.7.0 (CR-018, scopeVersion 37, không bump lại)
**Tiêu chí áp dụng:** theo lead round 2 — FAIL chỉ khi còn Blocker/Major trong phạm vi AC hoặc mâu thuẫn spec chưa được ghi nhận; điều đã ghi GAP có chủ đích chỉ ghi Minor.

**Nguồn đối chiếu:**
- `spec/changes/2026-11-23-concession-combo.md` (AC dòng 29-48)
- `spec/updates/2026-11-23-concession-combo.md` (dòng 6-38)
- `SPECIFICATIONS.md` (dòng 23, 163, 167, 181, 182, 184, 208, 232, 441, 476)
- `spec/CHANGELOG.md` dòng 30
- `spec/test-scope/current.json` (specRefs dòng 73-78; entries dòng 1089-1095, 1185-1189, 1335-1338, 1447-1455; changed/regression map dòng 381-392, 460-465, 936-973)
- `docs/API_SPEC.md` dòng 144, 150, 151
- `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` dòng 43-46 (GAP-037..040)
- Code/test: `supabase/migrations/20261123120000_concession_combo.sql` (dòng 5-32, 85, 104, 119, 128), `supabase/tests/073_concession_combo.test.sql` (plan(31) dòng 9; assertion dòng 81-177), `apps/api/src/modules/booking/__tests__/booking-combos.spec.ts` (dòng 33-229), `apps/api/src/modules/booking/booking.service.ts` (dòng 356-378), `apps/api/test/mail-templates.spec.ts` (dòng 553-575), `apps/api/test/outbox-job.e2e-spec.ts` (dòng 516-551), `apps/api/test/checkin.e2e-spec.ts` (dòng 223-243)
- Báo cáo phase-3 round 2: `.context/review-reports/feature-concession-combo-phase-3-task-03-round-2-review.md` (STRICT PASS, dòng 5, 121-124)
- Round 1: `.context/review-reports/feature-concession-combo-phase-final-spec-validation-round-1-review.md`

## Verdict: ✅ PASS

Không còn Blocker/Major. Cả 9 điểm FAIL round 1 đã được xử lý trên đĩa. Các mục AC chưa đạt đều đã ghi GAP có chủ đích (GAP-037/038/039/040) và được xếp Minor.

## Đối chiếu 9 điểm round 1

| # | Điểm round 1 | Trạng thái round 2 | Bằng chứng (file:line) |
|---|---|---|---|
| #1 | test-scope thiếu combo | ĐÃ XỬ LÝ (còn Minor M9 và Residual) | specRefs có R-58, R-69, R-72, R-86, R-100 (current.json:73-77). Entries `[scope v37 / feature-concession-combo, CR-018]` ở dòng 1089-1095, 1185-1189, 1335-1338, 1447-1455. Changed/regression map dòng 381-392, 460-465, 936-973. Có 1 câu sai ở dòng 1094 (M9). |
| #2 | voucher applies_to | ORDER đạt; COMBO chưa đạt, đã ghi GAP-040 | Migration 20261123120000 không đọc `applies_to` (grep 0 kết quả). GAP-040 (TECHNICAL_REQUIREMENT_GAPS.md:46), SPECIFICATIONS.md:184, current.json:1186. Xem M1. |
| #3 | Admin CRUD combo | NGOÀI AC, ĐÃ GHI GAP, spec đã thu hẹp | SPECIFICATIONS.md:163 (b) "chưa có ở MVP ... GAP-039"; spec/updates dòng 7; GAP-039 (TECHNICAL_REQUIREMENT_GAPS.md:45); A9 (current.json:1455). AC không yêu cầu Admin CRUD. Xem M7. |
| #4 | thiếu test tính tiền | ĐÃ XỬ LÝ (còn Minor M2, M3) | `supabase/tests/073_concession_combo.test.sql` plan(31) (dòng 9). Đếm assertion từ grep: 31 dòng assertion (dòng 81-177), khớp plan(31). Assert giá trị cố định: total 387000, sum 237000 (dòng 86, 88); snapshot giá (97-106); giới hạn 20 và lỗi (113-122); combo ngừng bán / không tồn tại (117-119); HOLD_EXPIRED / ORDER_NOT_HOLDING (124-129); chủ khác không gọi được (136-139); gỡ voucher min_order + RELEASED (146-161); RLS (169-177). Unit: `booking-combos.spec.ts` getCombos (33-72), updateCombos RPC `sync_order_combos` (76-145), lỗi không còn giữ chỗ (147-172), buildBookingSummary total 327000 (199-215). Không tautology: expected là số cố định, không lấy lại từ code. |
| #5 | per-cinema vs chuỗi chung | ĐÃ XỬ LÝ TRONG SPEC; intent docs còn lệch (GAP-038) | SPECIFICATIONS.md:163 thân R-58 = chuỗi chung, (a) per-cinema "chưa có ở MVP" → GAP-038; dòng 23 và 441 thống nhất "theo rạp = GĐ2". spec/updates dòng 7 thống nhất. BRD BR-CIN-09, BR-ADM-06, BR-BKG-11 chưa đổi (intent, đúng luật) → GAP-038 (TECHNICAL_REQUIREMENT_GAPS.md:44). Còn dòng 476 (M5). |
| #6 | wording R-69/R-100 hứa quá | ĐÃ XỬ LÝ | R-69 (SPECIFICATIONS.md:181) "MVP: combo được hiển thị ... chưa có → GAP-037"; R-100 (dòng 232) tiêu đề "Hiển thị combo khi soát vé (đánh dấu đã nhận: GAP-037)", "MVP: chỉ hiển thị combo"; spec/updates dòng 9; CHANGELOG dòng 30. Thống nhất với current.json:1095 và A8 (1454). |
| #7 | thiếu test mail | ĐÃ XỬ LÝ | `apps/api/test/mail-templates.spec.ts:553-575` (có combo: "Bắp nước" và "Combo Solo × 2, Bắp Phô Mai × 1" ở html và text; không combo thì không có khối; escape HTML). `apps/api/test/outbox-job.e2e-spec.ts:516-551` (enrich từ order_combos; escape `<script>`; đơn không combo không có khối). |
| #8 | nhãn "Bắp nước & Combo" | ĐÃ XỬ LÝ MỘT PHẦN (còn Minor M4) | spec/updates dòng 33-34 và current.json:1092 ghi đúng: nhãn ở tiêu đề section, PriceBreakdown liệt kê `name × quantity`. NHƯNG spec/updates dòng 28 vẫn ghi "Component PriceBreakdown: Thêm dòng 'Bắp nước & Combo'". Mâu thuẫn nội bộ file. |
| #9 | hoàn/huỷ/tồn kho chưa nói | ĐÃ GHI GAP | SPECIFICATIONS.md:184 (R-72 "Chưa quy định (GAP-040): ... hoàn/huỷ đơn có combo; mốc giá chốt; tồn kho combo"); GAP-040 (dòng 46); current.json:1187 (DEPENDENT huỷ suất/hoàn, nói rõ test chỉ ghi nhận hành vi hiện tại). |

Ghi chú: round 1 G-02 và G-08 (wording R-69/R-100 và GAP-037) đã đổi (SPECIFICATIONS.md:181, 232) và trỏ GAP-037. Đã đạt.

## Đối chiếu Acceptance Criteria change doc (`spec/changes/2026-11-23-concession-combo.md` dòng 29-48)

| AC | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|
| DB: bảng `combos` (đủ cột) | ĐẠT | migration dòng 5-15 |
| DB: bảng `order_combos` (FK cascade/restrict, quantity > 0, unit_price >= 0, total_price) | ĐẠT | migration dòng 25-32 (`on delete cascade` orders, `on delete restrict` combos, `quantity > 0`, `unit_price >= 0`, `total_price = quantity * unit_price`) |
| DB: subtotal = ghế + combo; total = subtotal − discount | ĐẠT | pgTAP 081-090 (387000, 237000); round 1 migration dòng 151-193 |
| DB: seed 3-4 combo mẫu | ĐẠT | round 1 migration dòng 218-231 (4 combo); current.json:1447 |
| API: `GET /combos` (is_active, display_order) | ĐẠT | round 1 `booking.controller.ts:111-113`; `booking-combos.spec.ts:33-72`; API_SPEC.md:150; current.json:1447 |
| API: `PUT /bookings/:id/combos` (holding, chỉ chủ đơn, số lượng, tính lại total) | ĐẠT (impl) / Minor (test HTTP, M2) | RPC `sync_order_combos` (migration dòng 85, 104, 119, 128); mapping lỗi `booking.service.ts:361-375`; service test `booking-combos.spec.ts:76-172`; pgTAP 113-139; API_SPEC.md:151 |
| API: `BookingSummaryResponse.combos` (id, tên, số lượng, đơn giá, thành tiền) | ĐẠT | `booking-combos.spec.ts:174-229`; API_SPEC.md:144 |
| API: voucher ORDER / COMBO tính đúng quy định | ORDER ĐẠT; COMBO CHƯA ĐẠT, DEFERRED GAP-040 | Xem M1 |
| Web: section "Bắp nước & Combo" trên `/xac-nhan` (ảnh, tên, mô tả, giá, stepper) | ĐẠT | round 1 `concession-selector.tsx`; test `concession-selector.test.tsx`; current.json:1448-1449 |
| Web: tăng/giảm cập nhật ngay PriceBreakdown + tổng | ĐẠT | round 1 `xac-nhan/page.tsx`, `order-summary.tsx:99-116`; current.json:1448 |
| Web: `/ket-qua` và `/ve/[bookingCode]` liệt kê combo | ĐẠT | round 1 `ticket-card.tsx`, `ticket-data.ts`; `ticket.test.tsx`; current.json:1452 |
| Email: mail.ticket có danh sách combo | ĐẠT | `mail-templates.spec.ts:553-575`; `outbox-job.e2e-spec.ts:516-551`; current.json:1453 |
| Soát vé: hiển thị combo cho nhân viên | ĐẠT (chỉ hiển thị) | `checkin.e2e-spec.ts:223-243`; current.json:1454; GAP-037 cho cờ đã phát |
| Kiểm thử: unit + API test luồng tính tiền & cập nhật combo | ĐẠT phần lớn / Minor | pgTAP 073 (31 assertion, DB thật) + unit service; thiếu HTTP e2e cho PUT (M2) |
| Reviewer độc lập + spec validator | ĐẠT | phase-3 round 2 STRICT PASS (dòng 121); báo cáo này |

## Gaps

Không có Blocker. Không có Major trong phạm vi AC chưa được ghi GAP. Không có mâu thuẫn spec nào chưa được ghi nhận. Các mục dưới đều là Minor.

### Minor

- **M1 [DEFERRED — GAP-040, một nửa AC dòng 38].** AC dòng 38 yêu cầu voucher loại ORDER hoặc COMBO "tính toán giảm giá đúng quy định".
  - Nửa ORDER đạt: voucher ORDER giảm trên toàn subtotal (ghế + combo), đúng quy định.
  - Nửa COMBO chưa đạt: migration `20261123120000_concession_combo.sql` không đọc `vouchers.applies_to` (grep 0 kết quả). Voucher loại COMBO hoặc SEAT/TICKET vẫn giảm được tiền combo. Lỗi có từ trước (`apply_voucher_core`), CR-018 mở rộng sang combo.
  - Ghi nhận: GAP-040 (TECHNICAL_REQUIREMENT_GAPS.md:46), SPECIFICATIONS.md:184, current.json:1186.
  - Điều kiện: AC dòng 38 giữ `[ ]` cho phần COMBO, hoặc PO chấp nhận deferral bằng văn bản. Đây là quyết định lớn nhất của round này.
- **M2 [PARTIAL — Minor] Thiếu test HTTP cho `PUT /bookings/:id/combos`.** AC dòng 47 yêu cầu "API test". Có unit service (`booking-combos.spec.ts`, mock Supabase) và pgTAP (đi qua RPC thật), nhưng không có test qua controller/HTTP (grep `combo` trong `apps/api/test`: chỉ có checkin, mail, outbox).
- **M3 [Residual] pgTAP 073 chưa được chạy.** Số assertion khớp `plan(31)`. Cần `supabase test db` hoặc CI để xác nhận pass.
- **M4 [MISMATCH nội bộ] `spec/updates/2026-11-23-concession-combo.md` dòng 28.** Dòng 28 ghi "Component PriceBreakdown: Thêm dòng 'Bắp nước & Combo' khi đơn có combo", mâu thuẫn với dòng 33-34 và current.json:1092. Đề xuất sửa dòng 28 cho khớp dòng 34 (chỉ sửa spec delta, không đổi code).
- **M5 [GAP-038] `SPECIFICATIONS.md:476`.** Ma trận quyền ghi "Quản lý phòng, sơ đồ ghế, suất chiếu, giá, khoá ghế, combo | ... | ✅ rạp mình (Cinema Manager) | ✅ (Admin)". Dòng này vẫn mô tả quản lý combo theo rạp, trong khi R-58 (dòng 163) nói combo MVP là chuỗi chung và Admin/Cinema Manager chưa quản lý combo. Dòng 163 đã tham chiếu GAP-038/039, nên mâu thuẫn được ghi nhận. Ma trận quyền là intent, không sửa trong lượt này.
- **M6 [GAP-038, intent docs] BRD vẫn per-cinema.** BR-CIN-09 (BRD dòng 258), BR-ADM-06 (dòng 341), BR-BKG-11 (dòng 277), roadmap GĐ2 (dòng 671). Đã ghi GAP-038; không sửa intent docs theo code.
- **M7 [GAP-039] Admin không có CRUD combo.** R-58 (b) và spec/updates dòng 7 đã loại khỏi MVP. AC không yêu cầu. Ảnh seed `/images/combos/*.webp` chưa có asset (GAP-039).
- **M8 [MISMATCH test-scope → mã lỗi client] `current.json:1090, 1449, 1450`.** Test-scope dùng mã RPC nội bộ làm mã client. Mapping thực tế ở `booking.service.ts:361-375` và `docs/API_SPEC.md:151` là:
  - `ORDER_NOT_HOLDING` → 410 `HOLD_EXPIRED` (`booking.service.ts:363-364`)
  - `COMBO_NOT_FOUND` → 404 `NOT_FOUND` (`booking.service.ts:369-370`)
  - `INVALID_COMBO_QUANTITY` → 400 `VALIDATION_ERROR` (`booking.service.ts:372-373`)
  
  API_SPEC.md:151 đúng với code. Không có mâu thuẫn với API_SPEC (không tài liệu hoá ORDER_NOT_HOLDING là mã client). Chỉ test-scope sai. Khi tester dùng A3/A4 làm chuẩn, họ sẽ báo bug giả. Đề xuất sửa current.json cho khớp mapping thực tế (không sửa trong lượt này). Ghi chú: test `booking-combos.spec.ts:147` có tên "ORDER_NOT_HOLDING" nhưng expect HOLD_EXPIRED, nên đúng với code.
- **M9 [STALE NOTE] `current.json:1094`.** Mục `mail.ticket.combos` vẫn ghi "Chưa có test mail riêng cho vé có combo." Câu này đã sai sau khi thêm `mail-templates.spec.ts:553-575` và `outbox-job.e2e-spec.ts:516-551`. Đề xuất xoá câu này.

### Ghi nhận không phải lỗi (đã kiểm)
- Edge cases của R-72 (hoàn/huỷ, mốc giá chốt, tồn kho, combo ngừng bán giữa chừng): đã ghi GAP-040 (gộp vào M1), test-scope 1187, 1451. R-72 dòng 184 có điểm chưa rõ về mốc giá chốt, đã được GAP-040 ghi nhận.
- Non-functional (rate limit `PUT /combos`, thời gian cập nhật PriceBreakdown): không có trong AC, không chặn.

## Suggestions
1. Trước khi đóng CR: AC dòng 38 giữ `[ ]` cho phần COMBO, hoặc PO ghi chấp nhận deferral GAP-040 (M1).
2. Sửa `spec/updates/2026-11-23-concession-combo.md` dòng 28 cho khớp dòng 34 (M4).
3. Sửa `spec/test-scope/current.json` dòng 1094 (M9) và các mã lỗi tại dòng 1090, 1449, 1450 cho khớp mapping API (M8).
4. Chạy `supabase test db` (pgTAP 073) trong verify (M3).
5. Bổ sung e2e HTTP cho `PUT /bookings/:id/combos` khi có dịp (M2).
6. PO chốt GAP-038 (per-cinema, kèm dòng 476 và BRD) và GAP-039 (Admin CRUD) qua CR riêng.

## Residual risk / Blocked
- **Blocked:** lệnh Bash `node -e JSON.parse(...)` bị hook `agent-guard` chặn (allowlist reviewer/spec-validator). Không retry, không đổi biến thể.
- **Kiểm JSON bằng mắt (không bằng máy):** đọc các đoạn nối entry (current.json dòng 1086-1097, 1182-1191, 1332-1340, 1444-1458) và các dòng dài (1035, 1090, 1092). Dấu phẩy và dấu ngoặc kép đều đúng, đóng `]` đúng chỗ. Không phát hiện lỗi cú pháp. Vẫn là Residual risk, cần `node -e` hoặc verify command để xác nhận.
- Không chạy test (không phải nhiệm vụ validator). Kết quả dựa trên đọc spec, change doc, gap và source test.
- Code migration/component: không đọc lại đầy đủ trong round này. Dựa vào round 1 cho các mục không đổi, và xác minh lại bằng grep ở các điểm then chốt (cột/FK/lock/mã lỗi migration, `applies_to`, mapping lỗi `booking.service.ts`, test combo).

## Verdict
**✅ PASS.** Không Blocker/Major trong phạm vi AC. Mọi điểm chưa đạt đều đã ghi GAP có chủ đích hoặc là sai lệch Minor trong spec/test-scope/spec-updates, liệt kê ở M1-M9.
