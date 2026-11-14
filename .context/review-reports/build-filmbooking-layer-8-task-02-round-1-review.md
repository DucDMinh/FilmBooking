# Review: build-filmbooking layer-8 task-02 (round 1)

Agent: reviewer

- Task: `tasks/build-filmbooking/layer-8-task-02.md`. Phạm vi: test phân quyền theo rạp và dữ liệu khách (RLS + Nest guard); AC-13, AC-16, AC-17; pgTAP kiểm mọi bảng public có RLS.
- Worktree: `E:/FilmBooking/.worktrees/layer-8__task-02` (branch `wt/layer-8__task-02`, chưa commit).
- Diff: thêm mới `apps/api/test/integration/rls-scope.int-spec.ts` (28 ca) và `supabase/tests/090_rls_matrix.test.sql` (46 ca); task file chỉ đổi phần tích AC/DoD.

## Review level
**STRICT**

## Reason
Task chạm auth/RBAC và cách ly theo rạp (tenant isolation), có cả RLS lẫn guard API. Đây là risk đỏ. Task chỉ viết test, nên câu hỏi chính là: test có thật sự chứng minh quyền bị chặn, hay xanh vì lý do khác?

## Blast radius
- Không đổi source hay migration. Chỉ thêm 2 file test và sửa task file. Đúng danh sách "Files to Create/Modify".
- Rủi ro chính là tin tưởng sai: test xanh giả sẽ che hồi quy quyền ở các route refund, resolve-manual-review và export CSV đơn affected.
- Dữ liệu dùng chung trên Supabase local:
  - int-spec ghi theo `RunScope` (mã rạp `IT<runId>…`, user prefix `it_<runId>_`) và dọn bằng `cleanupScope` trong `afterAll`. Hai lần chạy đều không lỗi cleanup.
  - pgTAP chạy trong `begin … rollback`. Các hàm `tap_*` tạo trong transaction nên rollback cùng.

## Verify commands + result
| Lệnh (chạy trong worktree) | Kết quả |
|---|---|
| `cd apps/api && pnpm test:int rls-scope` (lần 1) | PASS 28/28, 7.3s |
| `cd apps/api && pnpm test:int rls-scope.int-spec` (lần 2) | PASS 28/28, 7.4s (không flaky qua 2 lần) |
| `pnpm db:test supabase/tests/090_rls_matrix.test.sql` | PASS 46/46. Script `db:test` = `supabase test db`, cùng CLI với `pnpm exec supabase test db` (hook không cho reviewer gọi `pnpm exec`) |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm db:test` toàn bộ | skip: theo brief, DB dùng chung đang nhiễu, dispatcher chạy sau merge |
| aislop / oxlint / ocr | skip: oxlint chưa cấu hình, ocr chưa cài; task chỉ có test |

## Findings

### MAJOR-1: ca refund đơn rạp B xanh giả, không chạm tới kiểm tra rạp
`apps/api/test/integration/rls-scope.int-spec.ts:233-238`

- Body gửi `{ amount: 100000, reference: "VIB123" }`.
- Schema `recordRefundSchema` (`packages/shared/src/schemas/cancellation.ts:61-65`) bắt buộc `refundedAmount` và `refundReference`.
- `Unprocessable422Pipe` (`apps/api/src/modules/cancellation/cancellation.controller.ts:53-68`) vì vậy trả **422 VALIDATION_ERROR** trước khi vào service. Nhánh kiểm tra rạp `FORBIDDEN_CINEMA` ở `cancellation.service.ts:397` không bao giờ chạy.
- Assertion chỉ đòi "4xx bất kỳ", nên nếu xoá hẳn kiểm tra rạp trong source thì test vẫn xanh.

Sửa: gửi `{ refundedAmount: 100000, refundReference: "VIB123" }` và assert `403` + `error.code === "FORBIDDEN_CINEMA"`. Service kiểm tra rạp trước kiểm tra trạng thái, nên kết quả này là xác định.

### MAJOR-2: ca resolve-manual-review đơn rạp B có assertion lỏng, che được hồi quy quyền
`rls-scope.int-spec.ts:208-213`

- Body hợp lệ (`CONFIRM_SALE` thuộc `MANUAL_REVIEW_ACTIONS`), nên hiện tại có lẽ trả 403.
- Nhưng đơn B đang ở trạng thái `paid`. Nếu ai đó bỏ hoặc đảo thứ tự kiểm tra rạp trong `validateManualReviewAccess` (`apps/api/src/modules/orders/orders.service.ts:280-286`), API sẽ trả **409 CONFLICT** ("không ở trạng thái cần xem xét") và test vẫn xanh.

Sửa: assert `403` + `FORBIDDEN_CINEMA`. Tốt hơn nữa thì cho đơn B ở trạng thái `needs_manual_review` để kiểm tra rạp là lý do duy nhất có thể từ chối.

### MAJOR-3: ca xuất CSV đơn affected rạp B không kiểm được gì
`rls-scope.int-spec.ts:231-232`

- Fixture rạp B chỉ có đơn `status: "paid"` (`:64-78`).
- `listAffectedOrders` chỉ lấy đơn `affected`/`refunded_manual` (`cancellation.service.ts:241`). Vì vậy CSV không thể chứa `b.bookingCode`, dù có kiểm tra rạp hay không.
- Status code cũng không được kiểm.
- Thực tế `resolvePermittedCinemas` ném `FORBIDDEN_CINEMA` với `cinemaId` lạ (`cancellation.service.ts:693-699`), nhưng test không chứng minh điều đó.

Sửa: assert `403` + `FORBIDDEN_CINEMA`. Nếu muốn kiểm nội dung, tạo thêm 1 đơn `affected` ở rạp B.

> Ba MAJOR trên là đúng loại "assertion lỏng che lỗ hổng quyền" mà brief yêu cầu soi. Đường API của mục "đơn affected / hoàn tiền" trong ma trận §5.3 chưa được chứng minh. pgTAP không phủ được đường Nest này.

### MINOR
1. **Ca 0 dòng qua JWT thiếu đối chứng dương ở vài bảng** (`rls-scope.int-spec.ts:300-307`, `:361-366`).
   - Khi khối này chạy, rạp B chưa có `affected_order_actions` và `checkin_logs`; các lần quét của AC-13 chạy sau.
   - `cinema_settings` và `showtime_seat_states` của rạp B có thể cũng rỗng.
   - `updateSettings` không được kiểm lại bằng service role.
   - Hệ quả: 0 dòng ở đây không chứng minh RLS. pgTAP 090 đã seed các bảng này cho cả 2 rạp và chứng minh hành vi, nên mục này không chặn PASS.
   - Nên thêm bước dùng admin xác nhận dữ liệu B có thật trước khi kết luận.
2. **`090_rls_matrix.test.sql:146`** (`audit_logs` HN02 = 0): không có đối chứng là đã có dòng audit HN02 trong fixture, nên có thể là kiểm tra rỗng.
3. **`090:158-159`**: `throws_ok(..., null, null)` chấp nhận lỗi bất kỳ. Nên pin errcode nếu xác định được.
4. **Ca ghi bị chặn trong int-spec chỉ assert `error not null`, không pin mã lỗi** (`rls-scope.int-spec.ts:339, :344, :356, :385, :420`).
   - Lỗi ràng buộc khác cũng làm các ca này xanh.
   - Chấp nhận được vì pgTAP 090 pin `42501` cho cùng các thao tác. Nên pin `42501` cho chặt.
5. **`rls-scope.int-spec.ts:216-225`** (tìm đơn theo mã đặt vé): service luôn trả 200 rỗng khi không có `cinemaId` (`orders.service.ts:87-88`). Nên pin `200` + `items: []` và thêm đối chứng dương là tìm thấy mã của rạp A.
6. **`rls-scope.int-spec.ts:471`**: tiêu đề nói "rạp B không đọc được log vé rạp A", nhưng không có truy vấn nào bằng JWT rạp B. Chỉ có kiểm tra bằng admin.
7. **Báo cáo qua JWT trực tiếp**: task này không có ca nào. Đã phủ một phần ở `044_checkin_reports.test.sql:334-345` (Manager HN01 đọc `v_report_revenue_daily` HN02 trả 0, RPC bị chặn) và `:517-537` (Staff). Không chặn PASS; nên bổ sung 3 view còn lại cho Manager.
8. **`rls-scope.int-spec.ts:96`**: `order_code` dựa trên giây, trong khi cột có ràng buộc unique toàn cục. Hai lần chạy bắt đầu trong cùng 1 giây có thể va nhau. Nên suy ra từ `runId`.
9. **Kích thước**: file 506 dòng, `seedCinema` khoảng 64 dòng, vượt hướng dẫn 300 dòng/file và 50 dòng/hàm. Chỉ ghi nhận (file test).

### Điểm sạch
- **pgTAP cấu trúc** (`090:46-50`):
  - Truy vấn `pg_class` với `relkind in ('r','p') and not relrowsecurity` ở schema `public` bắt được cả partition, chặt hơn quy ước `relkind = 'r'` trong 010/020/031.
  - Thêm kiểm tra bảng RLS không có policy thì không được GRANT SELECT, và không có policy ghi cho anon/PUBLIC.
  - Có đối chứng dương: Manager/Staff HN01 thấy 1 đơn HN01; khách A thấy đúng 1 đơn và 1 vé của mình.
- **AC-13**:
  - Có ca quét bằng token và bằng mã đặt vé.
  - Có kiểm tra không lộ PII, email, mã đặt vé, token, id vé và id đơn, và vé không bị đánh dấu đã dùng.
  - Gọi thẳng RPC `checkin_ticket` bằng JWT trả `42501`.
- **AC-17**: có đối chứng dương (khách A thấy đơn và vé của mình). Ca ghi bị chặn được kiểm lại bằng service role (`:421-422`).
- **AC-16 ghi qua JWT**: kiểm lại bằng service role cho suất, đơn và khoá ghế (`:369-374`).
- **Không tìm thấy lỗ hổng quyền thật trong source**: refund, resolve, export và search đều kiểm rạp đúng. Lỗi chỉ nằm ở test không chứng minh được điều đó.

## Verdict
**FAIL**

Phải sửa tối thiểu cho round 2:
- MAJOR-1: sửa field body refund, assert 403 `FORBIDDEN_CINEMA`.
- MAJOR-2: assert 403 `FORBIDDEN_CINEMA` cho resolve-manual-review.
- MAJOR-3: assert 403 `FORBIDDEN_CINEMA` cho export CSV.

Các MINOR nên sửa cùng nếu rẻ (đặc biệt MINOR-1, -4, -5).
