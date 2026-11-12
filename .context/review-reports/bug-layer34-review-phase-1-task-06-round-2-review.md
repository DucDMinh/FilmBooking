Agent: reviewer

# Review: bug-layer34-review phase-1 task-06, round 2 (K5: rate limit voucher R-95)

- **Review level:** STRICT
- **Reason:** migration/schema (hàm SECURITY DEFINER mới + thay thân `apply_voucher`), đổi hợp đồng RPC (raise -> jsonb `{ok,error_code}`), cơ chế chống dò mã (security).
- **Blast radius:** `public.apply_voucher`, `public.apply_voucher_core`, `rate_limit_buckets` (key `voucher_apply:*`), `packages/shared/src/database.types.ts` (generated), `docs/ERD.md`. Không có caller trong apps/api, apps/web. Round 2 chỉ đổi `supabase/tests/042_voucher.test.sql` và task file.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS: 16 files / 628 tests (625 + 3 assert mới của 042), 042 = ok |
| `pnpm test` | PASS: shared 14, api 211, web 93, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip: round 2 chỉ đổi SQL test, không đụng TS/JS; lệnh không nằm trong allowlist |
| AI-friendly web gate | N/A (không public-facing) |

## Xác minh các finding round 1

### F1 (MAJOR round 1): đã đóng
- Grep `apply_voucher` trên toàn bộ `supabase/tests`: chỉ có trong `042_voucher.test.sql`, và không còn `lives_ok(...apply_voucher...)` nào. `lives_ok` duy nhất còn lại (`:170`) là `remove_voucher`. Hàm này không đổi hợp đồng nên lives_ok vẫn đúng nghĩa, và có 4 assert trạng thái theo sau (`:177-198`).
- Các ca thành công đều assert `->>'ok' = 'true'`: `:124-128`, `:205-209`, `:307-311`, `:333-337`, `:368-372`, `:398-402`.
- Ca Cust3 PERUSER1 đơn 55: `ok = 'true'` (`:398-402`), kèm `voucher_id = ...0013` (id PERUSER1, khớp fixture `:90`) ở `:405-409`.
- Nhánh lỗi có `ok = 'false'` (`:244-248`, NOSUCHCODE), ngay sau assert `error_code = 'VOUCHER_INVALID'` (`:238-242`).
- Hai `throws_ok` còn lại đúng hợp đồng mới: FORBIDDEN 42501 vẫn raise (`:416-421`), `remove_voucher` 42501 (`:423-428`).

### F4: đã đóng, test có ý nghĩa
- `:495-512`: đơn 59 (user null, gọi dưới owner) + trigger tạm `tap_boom_trg` BEFORE UPDATE trên `orders`, chỉ áp cho id 59. Trigger ném P0001 với message `'loi la khong phai ma nghiep vu'`. Với MINUS30K, core đi qua mọi kiểm tra rồi tới `update public.orders` (`migration:168-173`), trigger nổ, wrapper bắt P0001, regex không khớp, nên `raise;` (`migration:230-232`).
- Không phải tautology: `throws_ok` so khớp cả SQLSTATE lẫn message chính xác. Nếu wrapper nuốt mọi P0001 thì kết quả là jsonb, không có exception, và test FAIL. Message chỉ có thể đến từ trigger tạm.
- Không rò rỉ: file chạy trong `begin;` (`:19`) ... `rollback;` (`:518`). DDL Postgres có tính giao dịch nên function và trigger bị rollback cùng. Có bằng chứng thực nghiệm: `create function public.tap_boom` (`:502`) KHÔNG dùng `or replace`. Lần chạy `pnpm db:test` của tôi (sau các lần chạy của Builder) vẫn PASS, nghĩa là function không còn sót trên DB local.

### F2/F3: đã ghi
- Task file `tasks/bug-layer34-review/phase-1-task-06.md:21-23` ghi F2 (key bucket khi uid null, endpoint service_role phải kiểm quyền sở hữu đơn, cân nhắc key IP) và F3 (lệch danh mục mã lỗi DB với `packages/shared/src/errors.ts`, `apps/web/src/lib/api/error-messages.ts`).

### Plan pgTAP
- `plan(44)` (`:20`). Tôi đếm tay được 44 assert: existence 4, phần 2: 5, phần 3: 1, phần 4: 5, phần 5: 3, phần 6: 3, phần 7: 2, phần 8: 1, phần 9: 1, phần 10: 6, phần 11: 4, phần 12: 4, phần 13: 4, phần 14: 1. Số này khớp với tổng 628 = 625 + 3.

### Migration không đổi
- Đọc lại `supabase/migrations/20261112070000_voucher_rate_limit_fix.sql`. Mọi điểm round 1 đã duyệt vẫn nằm đúng dòng và giữ nguyên nội dung: FORBIDDEN trước lookup (`:61-67`, `:88`), `revoke all` core (`:190`), key bucket (`:218`), `hit_rate_limit` ngoài khối EXCEPTION (`:219-221`), BEGIN..EXCEPTION + regex + `raise;` (`:223-234`). Không có thay đổi mới.

## Findings mới

Không có finding chặn.
- [INFO] `042_voucher.test.sql:502-505` tạo trigger trên `public.orders` trong transaction test, nên giữ khoá ACCESS EXCLUSIVE tới hết file. Runner hiện chạy file tuần tự nên không ảnh hưởng. Chỉ ghi nhận.
- [INFO] ACL `apply_voucher` (grant `authenticated`) thuộc K7, không xét ở đây.

## Surgical diff
- Round 2 chỉ sửa file test và task file, và mọi dòng đều trace về F1/F4. Repro Verification có bằng chứng đỏ/xanh (đổi mã MINUS30K -> NOPE làm 3 assert FAIL), Status PASS.

## Verdict: STRICT PASS

F1 đã đóng: các assert thành công kiểm `ok='true'` + trạng thái, có assert `ok='false'`. F4 có test thật, rollback sạch. F2/F3 đã ghi residual. Migration không đổi so với bản đã duyệt. Toàn bộ verify xanh.
