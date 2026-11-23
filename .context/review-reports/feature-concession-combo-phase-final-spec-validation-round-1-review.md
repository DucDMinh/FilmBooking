# Spec Validation Report — feature/concession-combo (CR-018) — final, round 1

Agent: spec-validator
**Entry Mode:** full_docs
**Scope:** spec delta 3.7.0 (CR-018, MODIFY, kích hoạt R-58 / R-69 / R-100, liên quan R-70 / R-72 / R-86 / R-133)
**Sources validated against:**
- `spec/changes/2026-11-23-concession-combo.md` (acceptance)
- `spec/updates/2026-11-23-concession-combo.md`
- `SPECIFICATIONS.md` (dòng 2, 163, 181-184, 208, 232, 535)
- `spec/CHANGELOG.md` (dòng 30: 3.7.0)
- `spec/test-scope/current.json` (header + specRefs dòng 7-73)
- `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` (GAP-037, dòng 43)
- `docs/BRD.md` (BR-CIN-09 dòng 258, BR-BKG-11 dòng 277, BR-ADM-05/06 dòng 340-341, BR-CHK-04 dòng 328, roadmap dòng 671)
- Code: `supabase/migrations/20261123120000_concession_combo.sql`, `supabase/migrations/20261112080000_function_privileges_hardening.sql` (apply_voucher_core), `apps/api/src/modules/booking/*`, `apps/api/src/modules/checkin/checkin.service.ts`, `apps/api/src/modules/jobs/jobs.controller.ts`, `apps/api/src/modules/mail/templates.ts`, `packages/shared/src/schemas/booking.ts`, `apps/web/src/components/booking/*`, `apps/web/src/components/ticket/ticket-card.tsx`, `apps/web/src/components/staff/checkin-result.tsx`, `apps/web/src/app/(public)/dat-ve/don/[id]/*`
- Không đọc lại 2 report reviewer phase-3 round 1/2 chi tiết; đã dùng GAP-037 (nguồn ghi nhận từ reviewer round 2) làm căn cứ.

## Verdict: ❌ FAIL

Lý do: có ❌ (4 mục) và có 1 HIGH conflict (BRD per-cinema vs spec/code chain-wide). Theo `.agent/spec-validator.md` FAIL khi có ❌ hoặc HIGH conflict.

Lưu ý: verdict FAIL này là về **spec/traceability/scope**, không phải về việc code chạy sai. Các phần tính tiền cốt lõi (sync, limit 20, snapshot giá, email, soát vé) đã có hiện thực và đúng với spec delta.

## Feature Coverage Matrix

| # | Requirement | Source | Status | Note (cite) |
|---|---|---|---|---|
| 1 | R-58 danh mục combo dùng chung, hiển thị + bán kèm | SPECIFICATIONS.md:163; spec/updates §1 | ✅ | Bảng `combos` + seed 4 combo: migration 20261123120000 dòng 5-15, 219-231; `GET /combos`: booking.controller.ts:111-113 |
| 2 | R-58 "Admin định nghĩa danh mục combo" (CRUD) | SPECIFICATIONS.md:163; BRD BR-ADM-05 dòng 340 | ❌ | Không có endpoint/UI admin quản lý combo. Chỉ seed SQL. Grep `combo` trong apps/web/src/app/admin: không có trang combo. Không có GAP nào ghi việc này |
| 3 | R-58 "mỗi rạp bật/tắt combo và đặt giá riêng" (phần thân R-58) | SPECIFICATIONS.md:163 (thân + ngoặc vuông); BRD BR-CIN-09 dòng 258, BR-ADM-06 dòng 341, BR-BKG-11 dòng 277, roadmap dòng 671 | ❌ (HIGH conflict) | Bảng `combos` không có `cinema_id`; hiện thực chuỗi-chung (migration dòng 4 ghi rõ "toàn chuỗi"). Spec delta 3.7.0 thu hẹp "dùng chung chuỗi rạp" nhưng thân R-58 vẫn còn cụm per-cinema, và BRD vẫn ghi per-cinema (MVP-M) còn roadmap ghi "Combo theo rạp" là GĐ2. Không có GAP ghi nhận |
| 4 | R-69 chọn combo tại màn xác nhận, ảnh/tên/mô tả/đơn giá, cập nhật tổng | SPECIFICATIONS.md:181; change doc acceptance dòng 39-41 | ✅ | `apps/web/src/components/booking/concession-selector.tsx` (ComboCard, ComboThumbnail, QuantityStepper, useQuantityUpdate ~dòng 137-155); gắn tại `dat-ve/don/[id]/xac-nhan/page.tsx` (ConcessionSelector, PriceBreakdown) |
| 5 | R-69 "Combo nhận tại quầy đúng rạp bằng QR của vé" | SPECIFICATIONS.md:181; BRD BR-BKG-11 dòng 277 | ❌ | Luồng nhận combo tách khỏi soát vé chưa có; đã ghi GAP-037 (TECHNICAL_REQUIREMENT_GAPS.md:43, open P2). Xem Gap G-02 |
| 6 | R-100 đánh dấu/xác nhận trả bắp nước khi soát vé | SPECIFICATIONS.md:232 (thân: "kiểm tra và xác nhận trả bắp nước"); BRD BR-CHK-04 dòng 328 (đánh dấu riêng đã nhận combo) | ⚠️ | Chỉ **hiển thị** combo khi soát: `checkin.service.ts:114, 123-133`; `apps/web/src/components/staff/checkin-result.tsx` có combo. Chưa có cờ "đã phát" (GAP-037). Spec delta 3.7.0 và change doc chỉ yêu cầu hiển thị nhưng thân R-100 vẫn hứa "xác nhận trả" → wording hứa quá |
| 7 | R-70 màn tóm tắt: danh sách combo + số tiền combo | SPECIFICATIONS.md:182; spec/updates §3 | ✅ | `apps/web/src/components/booking/order-summary.tsx:99-116` (liệt kê `name × quantity` + totalPrice). Nhãn "Bắp nước & Combo" thực tế nằm ở header selector `concession-selector.tsx:175`, không phải dòng PriceBreakdown → ⚠️ nhỏ, xem G-07 |
| 8 | R-72 tổng = vé + combo − voucher; giá chốt server | SPECIFICATIONS.md:184; migration dòng 150-193 | ✅ | `sync_order_combos`: subtotal = sum(order_seats) + sum(order_combos) (dòng 151-159), total = subtotal − discount (dòng 193); snapshot `combo_name`, `unit_price` lúc sync (dòng 131-145); khoá đơn `for update`, `HOLD_EXPIRED` khi hết hạn (dòng 82-105) |
| 9 | Giới hạn số lượng 20 | change doc / spec delta §2 (validator task) | ✅ | Schema `packages/shared/src/schemas/booking.ts:174-181` (max 20); RPC migration dòng 117-120 (`INVALID_COMBO_QUANTITY`); UI stepper `concession-selector.tsx:100` (`>= MAX_COMBO_QUANTITY`); test `packages/shared/src/__tests__/concession-schema.test.ts` |
| 10 | Voucher loại ORDER/COMBO tính giảm đúng quy định; TICKET-only không giảm combo | change doc acceptance dòng 38; spec R-90 (applies_to vé/combo/cả đơn) | ❌ | `sync_order_combos` tính discount trên **toàn subtotal** (migration dòng 167-179), không đọc `vouchers.applies_to`. `apply_voucher_core` (20261112080000 dòng 138-181) cũng chỉ dùng `subtotal_amount`. Grep `applies_to` trong migrations: chỉ có định nghĩa cột (20261111030100 dòng 46), không có RPC nào đọc. Xem G-03 |
| 11 | Đơn chuyển total = subtotal − voucher khi gỡ voucher do min_order | change doc §Yêu cầu 2 | ✅ | Migration dòng 180-188 (RELEASED voucher_redemptions, gỡ voucher_id) |
| 12 | Email vé có combo | SPECIFICATIONS.md:208 (R-86), spec/updates §2 | ✅ | `templates.ts:283, 299, 343` (dòng "Bắp nước"/"Combo"); `jobs.controller.ts:59-61, 125-139` enrich từ `order_combos`. Test có combo: KHÔNG tìm thấy trong `apps/api/test` cho mail (chỉ checkin.e2e-spec). Xem G-05 |
| 13 | Trang kết quả + xem vé có combo | SPECIFICATIONS.md:208, 232; spec/updates §3 | ✅ | `ket-qua/page.tsx` import `TicketDetail` từ `ticket-card.tsx`; `ve/[bookingCode]/page.tsx` import `TicketDetail`; `ticket-card.tsx`, `ticket-data.ts` có combo |
| 14 | Màn soát vé hiển thị combo | SPECIFICATIONS.md:232; spec/updates §3 | ✅ | `checkin.service.ts:114` load combos khi soát thành công; `checkin-result.tsx`, test `checkin-result.test.tsx`; `checkin.e2e-spec.ts` có combo |
| 15 | Acceptance: unit + API test luồng tính tiền & cập nhật combo | change doc dòng 46-48 | ⚠️ | Có `apps/api/src/modules/booking/__tests__/booking-combos.spec.ts` (mock supabase, không chạy DB thật). Không có test SQL cho `sync_order_combos` trong `supabase/tests/`, không có e2e/integration cho `PUT /bookings/:id/combos`. Xem G-04 |
| 16 | Seed demo 3-4 combo | change doc dòng 33 | ✅ | Migration dòng 218-231 (4 combo: Solo, Couple, Bắp phô mai, Nước ngọt) |
| 17 | Spec version / CHANGELOG / updates | spec/updates; CHANGELOG dòng 30; SPECIFICATIONS.md dòng 2 | ✅ | spec_version 3.7.0 khớp; CHANGELOG 3.7.0 scopeVersion 37 |
| 18 | test-scope phản ánh combo (scopeVersion 37) | change doc dòng 44-48 (test-scope), spec/updates §Scope sinh | ❌ | `current.json` header đã 3.7.0/scope 37 nhưng **không có entry nào `[scope v37 / concession]`** (grep "concession|CR-018|scope v37": 0 kết quả liên quan). specRefs (dòng 7-73) **không có** R-58, R-69, R-72, R-100, R-86. Xem G-01 |
| 19 | GAP-037 ghi đúng gap R-100 | docs/changes/TECHNICAL_REQUIREMENT_GAPS.md:43 | ⚠️ | Ghi đúng nguyên nhân (a)/(b) và hướng xử lý, status open P2. Nhưng GAP không được tham chiếu từ SPECIFICATIONS.md (R-100 / R-69 vẫn hứa). Và GAP không ghi việc R-58 per-cinema và việc thiếu admin CRUD combo (G-06) |
| 20 | Spec delta chạm R-70, R-86, R-133 | spec/updates §Requirements | ✅ | Đã liệt kê; hiện thực đủ ở email và ticket (dòng 12-14 ở trên) |

## Cross-Document Conflicts

| Conflict | Source A | Source B | Impact |
|---|---|---|---|
| Phạm vi combo: chuỗi chung hay theo rạp | SPECIFICATIONS.md:163 (R-58 thân: "mỗi rạp bật/tắt combo và có thể đặt giá riêng") + spec/updates §Requirements (thu hẹp: "dùng chung chuỗi rạp") | BRD BR-CIN-09 (dòng 258), BR-ADM-06 (dòng 341, M), BR-BKG-11 (dòng 277: "chỉ hiển thị combo đang bật tại rạp của suất"), roadmap GĐ2 "Combo bắp nước theo rạp" (dòng 671) | **HIGH** — spec thân R-58 mâu thuẫn với chính bracket trong cùng dòng; BRD chưa cập nhật. Code theo chuỗi chung. Cần PO quyết: (a) chốt chuỗi chung cho MVP và đổi intent qua CR riêng cập nhật BRD BR-CIN-09/BR-ADM-06/BR-BKG-11, hoặc (b) giữ per-cinema và mở việc schema `cinema_id`. Validator không tự resolve, không sửa BRD |
| Nhận combo tại quầy (R-100/R-69) | SPECIFICATIONS.md:181, 232 + BRD BR-CHK-04 (dòng 328) | Code: chỉ hiển thị, không đánh dấu đã phát (GAP-037) | MEDIUM (đã ghi gap, nhưng spec chưa phản ánh, xem G-02) |

## Gaps

### ❌ / Blocker-Major

- **[G-01][MISSING — Major] test-scope scope 37 không phản ánh combo.** Requirement: change doc dòng 44-48 + spec/updates "Scope sinh" (scopeVersion 37). Source: `spec/test-scope/current.json` (specRefs dòng 7-73 không có R-58/R-69/R-72/R-100; không có entry `scope v37`). Task liên quan: bước spec-publisher của CR-018 (`.agent/spec-publish.md`). Hành động: chạy lại spec-publisher để sinh entry combo cho scope 37 và bổ sung R-58, R-69, R-72, R-100 vào specRefs.

- **[G-02][MISSING — Major] R-69/R-100 "nhận combo tại quầy đúng rạp bằng QR".** Requirement: SPECIFICATIONS.md:181, 232; BRD BR-BKG-11, BR-CHK-04. Source code: chưa có cờ đã phát / màn nhận tách khỏi soát vé (GAP-037, open P2; ví dụ kịch bản: khách soát vé trước ở cửa rồi ra quầy bắp nước → quầy không thấy combo). Task liên quan: phase-3 task-03 (reviewer round 2, m6/m-F). Đã có gap ghi nhận, nên đây là **deferral có chủ đích**, cần PO chấp nhận rõ hoặc mở CR riêng. Nếu chấp nhận deferral, phải sửa wording (xem G-08).

- **[G-03][MISSING — Major] Voucher `applies_to` không được tôn trọng cho combo.** Requirement: change doc dòng 38 ("nếu voucher loại ORDER hoặc COMBO: tính đúng quy định"), SPECIFICATIONS.md R-90 (áp dụng cho vé / combo / cả đơn). Source: `supabase/migrations/20261123120000_concession_combo.sql:159-191` (discount trên toàn subtotal); `20261112080000_function_privileges_hardening.sql:138-181` (apply_voucher_core không đọc applies_to). Hệ quả: voucher loại TICKET vẫn giảm được tiền combo. Lưu ý: lỗi có từ trước (apply_voucher không đọc applies_to), CR-018 nhân rộng ra combo. Task liên quan: sync_order_combos + apply_voucher_core. Cần: thêm lọc theo applies_to trong sync và apply, hoặc ghi rõ đây là gap đã biết nếu PO chấp nhận.

- **[G-04][PARTIAL — Major] Thiếu API/integration test cho luồng tính tiền & cập nhật combo.** Requirement: change doc dòng 46-48 ("API test cho luồng tính tiền và cập nhật combo"). Source: chỉ `booking-combos.spec.ts` (mock supabase, không đi qua RPC thật); không có `supabase/tests/*combo*.test.sql`; không có e2e `PUT /bookings/:id/combos`. Hành động: thêm pgTAP cho `sync_order_combos` (tổng tiền, limit 20, HOLD_EXPIRED, gỡ voucher khi dưới min) hoặc e2e/integration.

- **[G-06][MISSING — Major] Admin không quản lý được danh mục combo.** Requirement: SPECIFICATIONS.md:163 (R-58 "Admin định nghĩa danh mục combo chung"); BRD BR-ADM-05 (dòng 340). Source: không có endpoint admin combos trong `apps/api/src/modules/admin`, không có trang admin combo trong `apps/web/src/app/admin`. Combo chỉ có qua seed/SQL. Không có GAP ghi nhận và change doc không nêu → cần PO quyết: defer (ghi GAP + CR riêng) hoặc bổ sung.

- **[G-07 — đưa vào HIGH conflict đã nêu ở trên]** Phạm vi theo rạp (R-58/BRD). Cần PO chốt trước khi đóng CR; đây là FAIL trigger.

### ⚠️ Minor / Ambiguous

- **[G-05][PARTIAL — Minor] Email có combo nhưng không có test mail combo.** Source: `templates.ts:283-299, 343`; `jobs.controller.ts:125-139`; không thấy test mail vé có combo trong `apps/api/test`.
- **[G-08][Ambiguous — Major wording] R-100 hứa "xác nhận trả bắp nước" nhưng 3.7.0 chỉ triển khai hiển thị.** Source: SPECIFICATIONS.md:232 (thân R-100) và BR-CHK-04 (dòng 328) vs spec/updates §Requirements (chỉ "hiển thị"). Hệ quả: spec đang hứa quá (over-promise) so với hiện thực; GAP-037 có ghi nhận nhưng spec không tham chiếu. Đề xuất (không tự sửa): hoặc ghi "MVP: hiển thị combo; đánh dấu đã phát → GAP-037 (GĐ sau)" ngay trong R-100 và R-69, hoặc mở CR để hiện thực.
- **[G-09][Minor] Nhãn "Bắp nước & Combo" không phải dòng PriceBreakdown.** Spec/updates §3 yêu cầu dòng "Bắp nước & Combo" trong PriceBreakdown; hiện PriceBreakdown liệt kê từng combo `name × quantity` (`order-summary.tsx:110-116`), nhãn nằm ở `concession-selector.tsx:175`. Chấp nhận được về nội dung; cần đồng bộ wording spec hoặc UI.
- **[G-10][Ambiguous] Edge cases spec chưa nói:**
  - Hoàn tiền / huỷ đơn có combo: spec không nói combo có hoàn khi suất bị huỷ (R-110 / AC-25 hoàn "tổng tiền" nên có khả năng bao gồm combo) — cần ghi rõ.
  - Combo bị tắt (`is_active=false`) sau khi đơn đã chọn combo nhưng chưa thanh toán: spec không quy định.
  - Giá combo đổi trong lúc giữ chỗ: R-72 chốt giá "tại thời điểm giữ ghế", nhưng code snapshot giá tại lần sync combo (có thể sau giữ ghế). Spec cần làm rõ mốc chốt cho combo.
  - Tồn kho combo: spec không quy định (có thể chấp nhận vô hạn cho MVP — ghi rõ).
- **[G-11][Non-functional — Minor] Không có NFR/ghi chú về hiệu năng/đồng thời cho `sync_order_combos`** (khoá `orders` for update đã có; chỉ cần ghi nhận). Không phải FAIL trigger.

## Missing Edge Cases
- Hoàn/huỷ đơn có combo (G-10).
- Combo ngừng bán sau khi đã chọn (G-10).
- Mốc giá chốt cho combo so với R-72 (G-10).
- Gỡ voucher khi combo làm dưới min_order — code có xử lý (migration dòng 180-188) nhưng spec không ghi.

## Non-functional Gaps
- Không có spec về số lần gọi `PUT /bookings/:id/combos` (rate limit) — spec không yêu cầu; ghi là suggestion.
- Không có NFR về thời gian cập nhật PriceBreakdown sau khi bấm +/- (change doc không yêu cầu). Suggestion.

## Suggestions
1. Chạy lại spec-publisher để sinh scope 37 có entry combo và specRefs đủ R-58/R-69/R-72/R-100 (G-01).
2. Bổ sung test SQL/integration cho sync_order_combos (G-04).
3. Quyết định PO về per-cinema (HIGH conflict) và admin CRUD combo (G-06); nếu defer, ghi GAP + CR riêng; không sửa BRD cho khớp code.
4. Quyết định PO về applies_to voucher cho combo (G-03).
5. Sửa wording R-69/R-100 trong SPECIFICATIONS.md để phản ánh đúng MVP (hiển thị) và trỏ GAP-037 (G-02, G-08). Đây là thay đổi spec → đi qua CR, validator không tự sửa.
6. Ghi rõ hoàn/huỷ combo và mốc giá chốt (G-10).

## Đối chiếu với change doc (phần chưa hoàn thành)
- Acceptance "API test cho luồng tính tiền và cập nhật combo" — PARTIAL (G-04).
- Acceptance "Áp dụng voucher loại ORDER/COMBO" — PARTIAL (G-03).
- Acceptance "Email & soát vé hiển thị combo" — ĐÃ có; thiếu test mail (G-05).
- Acceptance "Màn kết quả & xem vé" — ĐÃ có qua TicketDetail.
- Acceptance "Section chọn combo + stepper + cập nhật PriceBreakdown" — ĐÃ có (`concession-selector.tsx`, `xac-nhan/page.tsx`).
- Acceptance "Migration bảng combos/order_combos + seed" — ĐÃ có (migration 20261123120000).

## Verdict Reasoning
- FAIL triggers hit: ❌ ≥1 (G-01, G-03, G-06 và R-58 per-cinema) và HIGH conflict (phạm vi theo rạp: spec thân R-58 + BRD BR-CIN-09/BR-ADM-06 vs code chuỗi chung).
- ⚠️ đếm: G-02 đã ghi gap (deferral có ghi nhận), G-05, G-08, G-09, G-10 — ≥3 ⚠️ cũng đủ điều kiện FAIL.
- Không sửa intent docs (BRD/PRD) và không sửa code/spec trong lượt này.

## Residual risk / Blocked
- `graphify query` chưa chạy được: lệnh Bash bị hook `agent-guard` chặn vì có pipe/chuỗi lệnh; không retry biến thể (theo Tool Loop Guard). Đã dùng Grep/Read trực tiếp trên đường dẫn đã xác định.
- Không chạy test (không phải nhiệm vụ của validator); kết quả chỉ dựa trên đọc source và nội dung spec/gap.
- Report reviewer phase-3 round 1/2 chỉ dùng qua GAP-037 và change doc, không đọc chi tiết từng finding.

## Verdict: ❌ FAIL
Trả về builder/loop: G-01, G-03, G-04, G-06 (❌/PARTIAL Major) và quyết định PO cho HIGH conflict (per-cinema) và G-02/G-08 (wording R-69/R-100).
