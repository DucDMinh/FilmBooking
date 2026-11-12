Agent: reviewer

# Review: bug-layer34-review phase-1 task-06, round 1 (K5: rate limit voucher R-95)

- **Review level:** STRICT
- **Reason:** đổi schema/migration (hàm SECURITY DEFINER mới + thay thân `apply_voucher`), đổi hợp đồng RPC (raise -> jsonb `{ok,error_code}`), cơ chế chống dò mã (security), ACL hàm.
- **Blast radius:** `public.apply_voucher` (caller tương lai: API voucher), `public.apply_voucher_core` (mới), bảng `rate_limit_buckets` (key `voucher_apply:*`), `packages/shared/src/database.types.ts` (generated), `docs/ERD.md`. Hiện không có caller nào trong `apps/api`, `apps/web`, `packages/shared` (grep `apply_voucher` chỉ ra types). Không pgTAP file nào khác gọi `apply_voucher`.
- **Diff:** `supabase/migrations/20261112070000_voucher_rate_limit_fix.sql` (mới), `supabase/tests/042_voucher.test.sql`, `packages/shared/src/database.types.ts`, `docs/ERD.md`, task file.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (supabase test db, local stack) | PASS: 16 files / 625 tests, 042 = ok (migration mới đã được áp: assert `has_function_privilege(...apply_voucher_core...)` chạy được) |
| `pnpm test` | PASS: shared 14, api 211, web 93, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip: diff chỉ là SQL + types generated + docs; không chạy được lệnh ngoài allowlist (guard chặn `ls`/glob timeout), không xác minh được có config oxlint/ocr |
| AI-friendly web gate | N/A (không public-facing) |

Xanh hết nhưng không đủ để PASS, xem F1.

## Kiểm tra cơ chế (xác nhận đúng)

1. **Bộ đếm bền khi lỗi nghiệp vụ.** `hit_rate_limit` (`20261111030010_security_ops_hardening.sql:56-62`) chỉ UPSERT rồi `return v_hits <= p_max`. Nó KHÔNG raise khi vượt ngưỡng; chỉ raise 22023 khi tham số sai, mà key/window/max của wrapper luôn hợp lệ. Wrapper gọi nó ngoài khối EXCEPTION (`20261112070000:218-221`). Vượt ngưỡng thì trả jsonb, không raise, nên lượt thứ 11 trở đi cũng được commit. Core chạy trong `BEGIN..EXCEPTION` (`:223-234`). P0001 mã nghiệp vụ chỉ rollback subtransaction, phần tăng bucket ở ngoài vẫn còn. Assert `hits = 11` (`042:467-471`) chứng minh điều này. Trên code cũ assert này không thể đạt.
2. **Không lách bằng FORBIDDEN/lỗi lạ.** FORBIDDEN 42501 (`:61-67`) nằm TRƯỚC lookup voucher (`:88`). Lời gọi FORBIDDEN bị rollback cả bộ đếm, nhưng không trả về thông tin gì về mã. Mọi kết quả phụ thuộc mã (INVALID/EXPIRED/NOT_APPLICABLE/MIN_NOT_MET/EXHAUSTED/USER_LIMIT) đều là P0001 chữ hoa nên đều được đếm. Sau lookup không có nhánh nào mà kẻ tấn công có thể chủ động gây lỗi non-P0001 tùy theo mã. Trigger trên `orders`/`voucher_redemptions` (`orders_guard_transition`, `set_updated_at`, `audit_row_change`, `orders_voucher_status_sync`) đều raise 23514 hoặc không raise, nên không có P0001 nào bị nuốt thành `ok:false`.
3. **Regex `^[A-Z][A-Z0-9_]*$`.** Chỉ bắt SQLSTATE P0001; lỗi hệ thống Postgres không dùng P0001. Message có khoảng trắng/chữ thường/tiếng Việt thì không khớp và bị `raise;` lại nguyên trạng. Không có đường rò message DB mới; `error_code` chỉ là token.
4. **Ngưỡng.** R-95 (`SPECIFICATIONS.md:219`): "Tối đa 10 lần nhập/phút/khách". Code dùng `interval '1 minute', 10`, key theo `auth.uid()`. Đúng spec. Spec dòng 24 xác nhận không có guest checkout.
5. **apply_voucher_core ACL.** `revoke all ... from public, anon, authenticated, service_role` (`:190`) phủ cả default privileges của Supabase. Có `SECURITY DEFINER` + `search_path = ''`. Test `042:112-117` xác nhận. `auth.uid()`/`is_admin()` trong core đọc GUC JWT nên vẫn đúng khi gọi lồng qua wrapper DEFINER.
6. **ACL apply_voucher** không đổi (`create or replace` giữ ACL; grant authenticated/service_role từ `20261111040200:320-321`). Phần này thuộc K7, chỉ ghi nhận.
7. **Test 042:** bỏ bơm sẵn bucket. 10 lần mã sai thật (`:446-451`) cho 10 lần VOUCHER_INVALID; lần 11 với `TRYRATE` (voucher hợp lệ, active, không ràng buộc, `042:96`) bị RATE_LIMITED (`:455-459`); đơn không bị gắn voucher (`:462-465`); bucket = 11. Các assert đổi từ `throws_ok` sang `->>'error_code'` dùng đúng mã của core. FORBIDDEN vẫn `throws_ok '42501'` (`:397-402`).

## Findings

### F1. [MAJOR, chặn PASS] Assert nhánh thành công đã thành vô nghĩa sau khi đổi hợp đồng: false-confidence
- Trước đây `apply_voucher` raise khi lỗi, nên `lives_ok(...)` chứng minh được lần áp thành công. Sau fix, mọi lỗi nghiệp vụ (kể cả RATE_LIMITED) đều trả jsonb bình thường, nên `lives_ok` PASS cả khi kết quả là `{ok:false}`. Builder đổi các assert nhánh lỗi nhưng để nguyên các `lives_ok` nhánh thành công:
  - `supabase/tests/042_voucher.test.sql:387-390` ("Cust3 chưa dùng mã PERUSER1 nên áp thành công"): **không có assert trạng thái nào phía sau**. Mục đích của test là chứng minh per_user_limit chỉ tính theo đúng khách (khách khác vẫn áp được), và giờ nó không kiểm gì nữa. Nếu per_user_limit đếm nhầm user, hoặc cust3 bị RATE_LIMITED, test vẫn xanh.
  - `:124-127`, `:204-207`, `:299-302`, `:324-327`, `:358-361`: may còn được assert trạng thái/hệ quả phía sau bù lại (discount_amount, EXHAUSTED, CONSUMED, USER_LIMIT_REACHED). Tuy vậy bản thân các assert này đã rỗng nghĩa, và tên test ("... thành công") hiện sai sự thật.
- Ngoài ra, cả file không có assert nào kiểm field mới `ok` (`true` khi thành công, `false` khi lỗi), dù đây chính là hợp đồng mới mà migration (`:17`) yêu cầu caller dựa vào.
- **Sửa:** thay các `lives_ok(apply_voucher...)` nhánh thành công bằng `is((select public.apply_voucher(...)->>'ok'), 'true', ...)`. Tối thiểu bắt buộc ở `:387-390`, kèm một assert trạng thái (vd `voucher_id` của đơn 55 = id PERUSER1). Thêm ít nhất 1 assert `->>'ok' = 'false'` ở một nhánh lỗi.

### F2. [MINOR, residual] Key bucket khi `auth.uid()` null với đơn không có user
- `20261112070000:218`: `coalesce(v_uid, v_order_uid, p_order_id, 'anonymous')`. Với đơn có user (web), key theo khách, đúng R-95. Với đơn `user_id` null (POS; spec dòng 24 không có guest web), key theo từng đơn, nên mỗi đơn mới có thêm 10 lượt. R-95 là "/khách", POS không phải khách, nên không chặn. Khi làm endpoint voucher qua service_role: API phải tự kiểm quyền sở hữu đơn trước khi gọi RPC (nếu không, một kẻ biết order_id của nạn nhân có thể đốt bucket của nạn nhân) và cân nhắc thêm key IP/thiết bị. Ghi vào residual risk của task, kèm test cho nhánh key uid-null (hiện chưa có).

### F3. [MINOR, có từ trước, ghi gap] Lệch danh mục mã lỗi DB và shared
- DB trả `VOUCHER_INVALID`, `VOUCHER_MIN_NOT_MET`, `VOUCHER_NOT_APPLICABLE`, `VOUCHER_ALREADY_APPLIED`, `VOUCHER_USER_LIMIT_REACHED`, `ORDER_NOT_HOLDING`, `ORDER_EXPIRED`. Còn `packages/shared/src/errors.ts:31-36,75-80` và `apps/web/src/lib/api/error-messages.ts:30-35` dùng `VOUCHER_NOT_FOUND`, `VOUCHER_MIN_ORDER`, `VOUCHER_NOT_APPLICABLE_SHOWTIME/_CINEMA`. Lệch này có từ Layer 4, nhưng giờ `error_code` thành hợp đồng chính thức nên cần ghi gap để endpoint voucher ánh xạ đúng. Không chặn task này.

### F4. [MINOR] Thiếu test nhánh `raise;` cho P0001 không khớp regex
- `20261112070000:230-232` không có test (khó dựng vì core không có nhánh đó). Chấp nhận được; chỉ ghi nhận.

### F5. [INFO] `database.types.ts:993` liệt kê `apply_voucher_core`
- Đây là types sinh tự động; client gọi sẽ nhận 42501. Không ai được wire vào hàm này. Không cần sửa.

### F6. [INFO] AI-readable
- `apply_voucher_core` khoảng 150 dòng (>50), nhưng là bê nguyên logic cũ sang hàm mới, không phải code mới. Tính 1 indicator, dưới ngưỡng FAIL. Comment đầu migration giải thích WHY, tốt. ERD đã cập nhật; `docs/API_SPEC.md` ghi "no doc impact" là hợp lý vì chưa có endpoint.

### Surgical diff
- Mọi dòng đều phục vụ K5, không có refactor ngoài phạm vi. Migration chỉ thêm mới, không sửa migration đã apply. Repro Verification: có bằng chứng đỏ/xanh; assert `hits = 11` là bằng chứng kiểm chứng được.

## Verdict: FAIL

Cơ chế fix đúng và an toàn: bộ đếm bền, không lách được bằng FORBIDDEN/lỗi lạ, regex không nuốt lỗi hệ thống, ngưỡng đúng R-95, core khoá ACL đầy đủ. Lý do FAIL là **F1**: đổi hợp đồng raise -> jsonb khiến các assert `lives_ok` nhánh thành công thành false-confidence, nhất là `042_voucher.test.sql:387-390` (không còn kiểm gì), và không có assert nào cho field `ok`. Sửa nhỏ, chỉ trong file test, rồi chạy lại `pnpm db:test`. F2/F3 ghi residual/gap, không chặn.
