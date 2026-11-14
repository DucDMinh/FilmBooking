# Review: build-filmbooking layer-8 task-02 (round 2)

Agent: reviewer

- Task: `tasks/build-filmbooking/layer-8-task-02.md` (AC-13, AC-16, AC-17; pgTAP mọi bảng public có RLS).
- Worktree: `E:/FilmBooking/.worktrees/layer-8__task-02`, chưa commit.
- Đầu vào: report round 1 (`build-filmbooking-layer-8-task-02-round-1-review.md`, FAIL với 3 MAJOR).

## Review level
**STRICT**

## Reason
Task kiểm auth/RBAC và cách ly theo rạp, là risk đỏ. Round này xác nhận 3 MAJOR của round 1 đã đóng thật, nghĩa là mỗi ca chỉ xanh khi kiểm tra rạp trong source còn hoạt động, và phần sửa không tạo flaky hay rò dữ liệu.

## Blast radius
- Vẫn chỉ có 2 file test mới cộng task file (`git status --short`: `M tasks/...task-02.md`, `?? rls-scope.int-spec.ts`, `?? 090_rls_matrix.test.sql`). Không đụng source hay migration.
- Dữ liệu mới trong round 2 là 1 đơn `needs_manual_review` của rạp B. Đơn gắn suất rạp B nên `cleanupScope` dọn theo `cinema_id`; hai lần chạy không lỗi `afterAll`.

## Verify commands + result
| Lệnh (chạy trong worktree) | Kết quả |
|---|---|
| `cd apps/api && pnpm test:int rls-scope` | PASS 29/29, 7.5s |
| `cd apps/api && pnpm test:int rls-scope.int-spec` (lần 2) | PASS 29/29, 6.8s |
| `pnpm db:test supabase/tests/090_rls_matrix.test.sql` | PASS 46/46. Script `db:test` = `supabase test db` |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm db:test` toàn bộ, oxlint, ocr | skip, cùng lý do round 1 |

## Đóng MAJOR của round 1

### MAJOR-1 (refund đơn rạp B): ĐÃ ĐÓNG
`rls-scope.int-spec.ts:266-273`

- Body đã đúng schema (`refundedAmount`, `refundReference`), nên request đi qua `Unprocessable422Pipe`.
- Test assert `403` + `FORBIDDEN_CINEMA`, rồi dùng service role kiểm `affected_order_actions` của đơn B vẫn rỗng.
- Phản chứng: đơn B đang `paid`. Nếu bỏ kiểm tra rạp ở `cancellation.service.ts:397`, service trả 409 CONFLICT ở `:411`, và test sẽ đỏ. Ca này chỉ xanh khi kiểm tra rạp còn hoạt động.

### MAJOR-2 (resolve-manual-review): ĐÃ ĐÓNG
`rls-scope.int-spec.ts:210-241`

- Đơn rạp B được tạo ở trạng thái `needs_manual_review`.
- Test assert `403` + `FORBIDDEN_CINEMA` ở cả `/orders/:id/...` lẫn `/admin/orders/:id/...`, rồi dùng service role kiểm đơn vẫn `needs_manual_review` và `manual_review_resolved_at = null`.
- Phản chứng: nếu bỏ kiểm tra rạp ở `orders.service.ts:281-282`, kiểm tra trạng thái sẽ cho qua và RPC chạy bằng JWT người gọi. Kết quả khi đó hoặc là `FORBIDDEN` (khác mã lỗi), hoặc là đơn bị đổi trạng thái. Cả hai trường hợp đều làm test đỏ.

### MAJOR-3 (export CSV): ĐÃ ĐÓNG
`rls-scope.int-spec.ts:262-264`

- Test assert `403` + `FORBIDDEN_CINEMA`, khớp với `resolvePermittedCinemas` (`cancellation.service.ts:693-699`).
- Nếu bỏ nhánh này, API trả 200 và test đỏ.

### Còn assertion "4xx bất kỳ" ở ca sai rạp không?
- Không còn. Mọi ca rạp A gọi dữ liệu rạp B đều dùng `forbiddenCinema` (403 + `FORBIDDEN_CINEMA`).
- `PATCH /admin/cinemas/:id/status` (`:283-287`) chỉ assert 403. Route này chỉ dành cho Admin nên 403 `FORBIDDEN` theo vai trò là đúng.
- Ca còn lỏng duy nhất là `/bookings/:id` (`:460-466`, `not 200 && < 500`). Ca này thuộc AC-17 (khách với khách), không phải sai rạp. Ca vẫn kiểm không lộ mã đặt vé hay PII, và service kiểm `order.user_id !== user.id` (`booking.service.ts:112`). Ghi MINOR.

### Các MINOR của round 1 đã sửa
- MINOR-4: pin `42501` ở `:374, :379, :391, :420, :455`.
- MINOR-5: pin `200` + `items: []`, có đối chứng dương tìm thấy đơn A (`:249-255`).
- MINOR-6: tiêu đề ca checkin_logs đã khớp nội dung (`:506`).
- MINOR-8: `order_code` lấy theo `runId` (`:96`).

## Findings (round 2)

### MAJOR
Không có.

### MINOR
1. **`090_rls_matrix.test.sql:158-159` pin `23514` nhưng vì lý do không liên quan RLS.**
   - Fixture `:121-123` đã ghi `EXCHANGED` cho đơn HN02. Trigger `affected_order_actions_apply` (migration `20261111030100_booking_tables.sql:527-537`) chuyển đơn sang `exchanged`.
   - Vì vậy `affected_order_actions_validate` (`:521-522`) ném `23514` "chỉ cho đơn affected" với bất kỳ ai, kể cả Manager HN02.
   - Ca này không chứng minh policy `affected_order_actions_insert` (`:663-667`). Comment "trigger validate không thấy đơn qua RLS" cũng sai, vì trigger là SECURITY DEFINER.
   - Không chặn PASS: policy đã được chứng minh đúng cách ở `031_booking_rls.test.sql:258-260` (Staff HN01 ghi cho đơn affected HN02 trả `42501`). Phía API refund giờ cũng đã chứng minh được.
   - Nên sửa: dùng một đơn HN02 `affected` chưa có action và expect `42501`, hoặc bỏ ca này.
2. **Flaky xác suất thấp ở `rls-scope.int-spec.ts:221`.**
   - `booking_code` của đơn review là `runId` đảo ngược, trong khi cột có ràng buộc `unique`.
   - Nếu `runId` là palindrome (xác suất khoảng 1/4096), mã trùng `b.bookingCode` và ca này đỏ.
   - Nên đổi sang một suffix khác hẳn, ví dụ thay 1 ký tự cố định.
3. **Vẫn còn từ round 1 (MINOR-1/2/7):** vài ca 0 dòng qua JWT trực tiếp thiếu đối chứng dương (`affected_order_actions`, `checkin_logs`, `cinema_settings`, `showtime_seat_states` của rạp B lúc chạy), và `audit_logs` ở `090:146`. Đã được pgTAP 090/044 bù, không chặn.
4. **`/bookings/:id` assertion lỏng** (`:460-466`): như ghi ở trên. Nên pin `404` hoặc `403`.
5. **Kích thước:** file 541 dòng, vượt hướng dẫn 300 dòng/file. Ghi nhận cho file test.

## Verdict
**STRICT PASS**

- Ba MAJOR của round 1 đã đóng thật: các ca chỉ xanh khi kiểm tra rạp trong source còn hoạt động.
- Không còn assertion "4xx bất kỳ" ở ca sai rạp.
- 2 lần chạy int-test ổn định, cleanup sạch, pgTAP tự rollback.
- Không tìm thấy lỗ hổng quyền ở source.
- MINOR-1 (090:158) và MINOR-2 (palindrome) nên sửa ở lần chạm sau; không chặn commit.
