# Review: bug-refund-method-required · phase-1-task-01 · round 1

Agent: reviewer

- Review level: **STRICT**
- Reason: migration DB (cột mới + CHECK NOT VALID + GRANT cột), dữ liệu hoàn tiền (payment/refund), DTO `AffectedOrderDto`/`RecordRefundResultDto`/`OrderDetailDto` dùng ở nhiều màn, CSV export.
- Blast radius: `affected_order_actions` (bảng + RLS insert của Staff/Manager), `POST /{admin/affected-orders|affected-orders|orders}/:orderId/refund`, `GET /admin/affected-orders[/:id]`, `GET /admin/affected-orders/export` (CSV), `GET` chi tiết đơn admin (`affectedAction`), web: form ghi hoàn tiền, chi tiết/danh sách đơn bị ảnh hưởng, chi tiết đơn admin.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | PASS: shared 39/39, api 679/679 (29 file), web 669/669 (53 file), scripts node --test 31/31 |
| `pnpm db:test` | 070_refund_method_required **ok** (14/14). 13 file cũ đỏ vì DB local bẩn (`provinces_name_key` "Hà Nội", `price_rules_chain_key`) ngay ở dòng fixture trước phần sửa: 010, 020, 030, **031**, 033, 040, 041, 042, 043, **044**, 050, 063, 090. Lỗi có sẵn, không do diff này, nhưng 031/044 vì vậy **không kiểm được độc lập** |
| int-spec DB thật (`cancel-showtime`, `rls-scope`) | không chạy lại (bị `skipIf(!supabaseEnv)` trong `pnpm test`; không có lệnh riêng trong allowlist). Chỉ có lời builder báo 45/45 |
| `aislop scan --changes --json` | skip, aislop chưa cài (`command not found`) |
| `npx oxlint` | skip, repo chưa có cấu hình oxlint |
| `ocr review --format json` | không kết luận được: provider LLM trả 429 quota cho mọi nhóm, không có finding. Không chặn |

## Cross-boundary check (DB thật ↔ code ↔ mock)

- Cột/bảng: `affected_order_actions` (`20261111030100_booking_tables.sql:224-237`) + migration mới `refund_method text` CHECK 4 giá trị, `refunded_at date`. Service ghi `refund_method`/`refunded_at` (`cancellation.service.ts:452-453`), đọc thêm 2 cột (`:721`), map `refundedAt ← refunded_at`, `processedAt ← created_at` (`:764-766`). `orders.service.ts:137` dùng `select("*")` bằng client `admin()` (service_role), không vướng GRANT cột. Khớp.
- Ghi bằng `.admin()` (service_role) nên đường API không cần GRANT; GRANT cột `insert (refund_method, refunded_at)` cho `authenticated` cần cho đường RLS trực tiếp (quyết định #6) và đã có pgTAP 070 #10 kiểm chứng. Không có RPC SECURITY DEFINER nào insert vào bảng này (`resolve_manual_review` ghi rõ "không insert affected_order_actions", `20261113170000:8`), nên không cần grant cho RPC.
- Mọi đường ghi `REFUNDED_MANUAL`: chỉ có `cancellation.service.ts:446` (đã thêm 2 cột) và test SQL 031/044/070 (đã thêm). Seed `supabase/seed.sql`, `scripts/seed-demo*.mjs`, `scripts/seed-orders-demo*.mjs`: không insert bảng này. `e2e/support/data.ts:370` chỉ xoá. Không còn đường nào sẽ vỡ vì CHECK mới.
- Mã lỗi: thiếu/sai trường bị chặn ở `Unprocessable422Pipe(recordRefundSchema)` (`cancellation.controller.ts:226`, áp cho cả 3 route alias) nên trả 422 `VALIDATION_ERROR`, khớp code cũ và API_SPEC. Nếu lọt xuống DB, 23514 rơi vào `AppException(VALIDATION_ERROR)` (`:459`), cùng mã.
- Mock e2e (`cancellation.e2e-spec.ts`): ca mới bị chặn ở tầng zod trước DB, nên FakeDb không phải giả lập CHECK. Hành vi CHECK thật có pgTAP 070 (ca 4-6, 9, 14) phủ. Không phải false-confidence.

## Migration

- Không phải `HIGH_RISK_MIGRATION`: không DROP, không đổi kiểu, không SET NOT NULL, không backfill/UPDATE. CHECK đầy đủ là `NOT VALID` nên không quét dữ liệu cũ. Dòng `REFUNDED_MANUAL` cũ giữ `null` và vẫn đọc được (pgTAP 070 #12-13).
- Bảng không có luồng UPDATE (GRANT chỉ select/insert; API không update), nên dòng cũ không bao giờ bị CHECK chặn.
- Rollback ghi trong header đúng (drop 2 constraint + 2 cột; quyền cột mất theo cột).
- Không idempotent (không `if not exists`): bình thường với migration versioned chỉ chạy 1 lần.

## Findings

### MAJOR-1 (chặn PASS, sửa nhanh): task bug thiếu `Repro Verification`
- `tasks/bug-refund-method-required/phase-1-task-01.md`: cả file 16 dòng, không có mục `## Repro Verification`, Status còn `in_progress`. `.agent/workflows/state-commit.md:82` bắt buộc "Bug task phải có `Repro Verification`". Luật reviewer: bug task không có repro evidence kiểm chứng được thì Verdict bắt buộc **FAIL (unverifiable)**. Task cùng loại trước đó (`tasks/bug-admin-self-lock-last-admin-guard/phase-1-task-01.md:16`) có đủ mục này.
- Bằng chứng tự động thật ra đã đủ, tôi đã chạy và xác nhận chúng không phải tautology:
  - `packages/shared/src/__tests__/cancellation-refund.test.ts`: "thiếu refundMethod/refundedAt → lỗi" sẽ đỏ với schema cũ, vì zod cũ bỏ qua key lạ và chấp nhận payload.
  - `cancellation.e2e-spec.ts` các ca R-110: trước fix sẽ trả 201.
  - pgTAP 070.
  - Web test "chưa chọn phương thức".
- Cách sửa: builder thêm mục `## Repro Verification` gồm Original repro (POST refund chỉ với số tiền + mã GD → 201, không có phương thức/ngày), Expected (422), Actual before, Actual after, Evidence (tên test + lệnh + kết quả: shared 39, api 679, web 669, pgTAP 070 14/14, int-spec 45/45), Status PASS. Thêm luôn ghi chú lệch 400→422 (MINOR-4). Không cần sửa code.

### MINOR-1: ô ngày không có `max`
- `apps/web/src/components/admin/affected-resolution-form.tsx:164-173`: `<TextField type="date">` không đặt `max={vnTodayIsoDate()}`, nên date picker cho chọn ngày tương lai. Zod phía client vẫn chặn và hiện lỗi dưới ô, nên không hỏng dữ liệu, chỉ là UX.

### MINOR-2: không có cận dưới cho ngày hoàn
- `packages/shared/src/schemas/cancellation.ts` (`refundedAt`): chấp nhận cả `0001-01-01` hoặc ngày trước khi tạo đơn. Task ghi "không trước ngày tạo đơn nếu hợp lý", tức là tuỳ chọn. Dự án demo nên không chặn.

### MINOR-3: header migration nói chưa đủ chính xác
- `supabase/migrations/20261120100000_refund_method_required.sql:23-26`: `affected_order_actions_refund_method_ck` **không** NOT VALID, nên vẫn quét bảng dưới ACCESS EXCLUSIVE khi thêm. Thực tế vô hại (cột vừa thêm, toàn null, bảng nhỏ), nhưng header ngụ ý không quét gì. Không cần sửa migration. Chỉ ghi nhận cho đúng.

### MINOR-4: task ghi mã lỗi lệch code
- Task (dòng 8) ghi "thiếu/sai → 400 `VALIDATION_ERROR`", trong khi code cũ/mới và `docs/API_SPEC.md` đều trả **422**. Builder giữ 422 là đúng (AC-25 và test cũ dùng 422). Nên sửa câu trong task hoặc ghi chú vào Repro Verification. `resolve-manual-review` trả 400 là endpoint khác, ngoài phạm vi.

### NIT-1: `refundMethodLabel` dùng toán tử `in`
- `packages/shared/src/schemas/cancellation.ts` `refundMethodLabel`: `method in REFUND_METHOD_LABEL` cũng đúng với khoá prototype (`"constructor"`, `"toString"`). Hiện không khai thác được, vì giá trị chỉ đến từ DB đã có CHECK 4 giá trị. Nên dùng `Object.hasOwn`.

### NIT-2: select phương thức thiếu `required`/`aria-required`
- `affected-resolution-form.tsx:146-162`: `<select>` không có `required`/`aria-required`. Nhãn có dấu `*` nhưng chỉ `aria-hidden`. Form dùng `noValidate` và lỗi hiện qua `role="alert"` + `aria-invalid`/`aria-describedby`, nên a11y cơ bản vẫn ổn.

### INFO
- Nghĩa của `refundedAt` đổi từ `created_at` (timestamp) sang ngày người nhập (`YYYY-MM-DD`). Đã rà mọi consumer:
  - Web (`affected-order-detail.tsx:105`, `affected-orders-list.tsx:258`, `order-detail.tsx:204`) đều dùng `formatRefundDate` bằng regex, không qua `Date` nên không lệch múi giờ, và hiện "Chưa ghi" cho dòng cũ (null).
  - CSV chuyển cột "Thời gian xử lý" sang `processedAt`.
  - `e2e/` không có consumer nào.
  - Trước đây web cũng không hiển thị `refundedAt`, nên việc `processedAt` không render ở web không làm mất thông tin.
- CSV:
  - 2 cột mới chèn giữa "Số tiền hoàn (VNĐ)" và "Mã GD ngân hàng"; header và giá trị thẳng hàng (`affected-csv.ts:62-110`).
  - Vẫn qua `escapeCsvField` (chống `= + - @ \t \r`, quote `, " \n \r`), giữ BOM.
  - Giá trị mới là nhãn cố định hoặc ngày đã validate, nên không có vector injection.
  - Không tìm thấy consumer nào parse theo vị trí cột (chỉ con người mở bằng Excel).
- Validate:
  - `z.iso.date()` từ chối `2026-02-30`, `14/11/2026`, chuỗi rỗng.
  - Mốc tương lai dùng `vnTodayIsoDate` (UTC+7 qua `toVnParts`) nên biên nửa đêm đúng giờ VN: so sánh `<=` theo chuỗi `YYYY-MM-DD`, hôm nay hợp lệ, ngày mai bị chặn. Form để qua đêm thì giá trị mặc định thành hôm qua, vẫn hợp lệ.
  - `refundReference` vẫn bắt buộc.
  - Phân quyền (403 rạp khác), 409 trùng/không ở `affected`: không đổi, có test.
- Docs: `docs/API_SPEC.md` (body, 422, 403, 409, DTO, CSV, null cho bản ghi cũ) và `docs/ERD.md` (cột, CHECK NOT VALID, migration 20261120100000) chính xác so với code.
- 031/044 chỉ thêm 2 cột vào insert hợp lệ, hợp lý. Không chạy được vì DB bẩn, đây là residual risk. Thay đổi cùng dạng với 070, mà 070 đã chạy PASS.
- `packages/shared/src/database.types.ts` sửa tay, khớp migration (Row/Insert/Update).
- File ≤300 dòng, hàm mới ngắn, không drive-by refactor. AI-readable: không có indicator đáng kể.

## Residual risk
- pgTAP 031/044 và int-spec DB thật chưa được reviewer chạy lại độc lập (DB local bẩn / thiếu lệnh trong allowlist).
- aislop chưa cài, ocr hết quota provider.

## Verdict: **FAIL**

Lý do duy nhất là MAJOR-1: bug task chưa có `Repro Verification`, cổng quy trình bắt buộc. Code, migration, test, CSV và docs không có lỗi chức năng. Round 2 chỉ cần builder bổ sung mục Repro Verification vào task file (có thể kèm MINOR-1/NIT nếu muốn). Không cần đổi code. Khi mục đó có đủ evidence nêu trên, tôi kỳ vọng STRICT PASS.
