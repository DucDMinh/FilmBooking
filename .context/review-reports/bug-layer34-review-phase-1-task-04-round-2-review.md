Agent: reviewer

# Review: bug-layer34-review · phase-1 · task-04 · round 2 (vòng cuối) — K2 liên kết MXH không bằng chứng sở hữu (hướng a)

- Review level: **STRICT**
- Reason: auth/identity, DB migration (DROP FUNCTION), API contract (gỡ endpoint), shared schema `@filmbooking/shared` + `database.types.ts`.
- Blast radius: không đổi so với round 1 — `IdentityModule` (controller/service), `packages/shared` (schemas/identity, database.types), +1 migration `20261112090000_drop_client_identity_link.sql`, pgTAP 045/046/048/049, docs API_SPEC/ERD, task file. Web chưa có UI liên kết.
- Verdict: **STRICT PASS**

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — 18 files, 668 tests (045, 046, 048, 049 ok) |
| `pnpm test` | PASS — shared 14, api 210 (14 files), web 93, scripts 16 |
| `pnpm lint` | PASS (shared/api/web) |
| `pnpm typecheck` | PASS (shared/api/web) |
| oxlint | skip, oxlint not configured |
| aislop | skip, không có trong allowlist verify |
| ocr | skip, ocr not installed |
| AI-friendly web | N/A (task nội bộ API/DB) |

## Xác minh các finding round 1

### F-1 (MAJOR) — ĐÃ SỬA
- Grep `allow_identity_link` trên `supabase/tests`: chỉ còn `045:13/73` và `046:42/53`. Cả 4 dòng là **fixture seed có sẵn từ trước** (không nằm trong diff), đặt cờ `true` khi seed rồi trả về `false` trước mọi assertion. Đối chiếu trigger `guard_identity_insert` (`20261111040500_identity_hooks.sql:81-108`): các insert fixture (identity `email` bị bỏ qua ở dòng 81-83; identity OAuth chỉ chèn cho user không mật khẩu, không có identity `email`) đều qua được dù không có cờ. Vậy cờ ở fixture thừa nhưng không ảnh hưởng ý nghĩa assertion nào (xem N-1).
- Test liên kết hợp lệ (`045:165-171`): insert trực tiếp `facebook/fb_new_444` cho a002 (OAuth-only, `encrypted_password` null, lúc này chưa có identity `email` vì `mark_password_set` chạy sau ở dòng 209), **không có cờ** (cờ = `false` từ dòng 73). Khớp đúng đường GoTrue `linkIdentity` chạy được trên DB thật.
- R-24 (`045:174-178`): lọc `to_email = 'user_oauth@test.local'` (email a002) + `kind = 'identity_linked'` + `payload->>'provider' = 'facebook'` => đúng user, đúng provider; loại trừ email do fixture google của a002 sinh ra. Đếm = 1.
- AC-04 (`045:152-163`): có comment "KNOWN GAP F-2" nêu rõ trigger chặn cả manual link hợp lệ của user có mật khẩu/identity email, và buộc cập nhật có chủ đích khi thiết kế link-intent vào. Đạt.
- R-23 (`045:143-150`): insert trực tiếp, kiểm nhánh 23505 dòng 86-94. Đạt.

### F-3 (MINOR) — ĐÃ SỬA
- `docs/API_SPEC.md:50`: "(#18)." đã có dấu chấm tách khỏi câu "Liên kết MXH (K2)". Có mục **"Hiện trạng/giới hạn (Gap F-2)"** nêu rõ 23514 `OAUTH_AUTO_MERGE_BLOCKED` cho user có mật khẩu hoặc identity `email` (kể cả user OAuth đã đặt mật khẩu qua R-22), chỉ user OAuth-only chưa đặt mật khẩu liên kết được. Khớp DB thật.

### F-4 (NIT) — ĐÃ SỬA
- `046:56` "(8 test)" = 8 assertion `ok(not has_function_privilege…)` dòng 58-65 + 1 test service_role (dòng 68-73, comment "(1 test)", "cả 4 hàm"). `046:76` "(4 test)" = 4 `throws_ok` 42501 dòng 85-88. `plan(21)` khớp, db:test PASS.

### Task file — Gap F-2
- `tasks/bug-layer34-review/phase-1-task-04.md` mục "Gap F-2": có spec refs (R-20 `SPECIFICATIONS.md:102`, AC-04 `:367`, R-21 `:103`, NFR-17 `:357`, M-05), trigger (`20261111040500_identity_hooks.sql:100-108`), phạm vi (gồm user đã đặt mật khẩu qua R-22), thiết kế đề xuất 5 bước (bảng intent, endpoint link-intent + fresh-auth, trigger consume intent, không mở lại K2, test). Ghi rõ "KHÔNG implement trong task này". Đạt.
- Không có code/migration nào implement F-2 (diff không đụng trigger, không có bảng/endpoint mới). Đạt.

## Kiểm phạm vi diff (toàn bộ `git diff` + file untracked của task)
- Tracked: 11 file như round 1 (controller, service, e2e, API_SPEC, ERD, database.types, schemas/identity, 045, 046, 048, task file). Untracked thuộc task: migration `20261112090000`, test 049. Thay đổi round 2 chỉ ở 045 (section 3), 046 (comment), API_SPEC dòng 50, task file — đều trace về F-1/F-3/F-4/F-2.
- Phần TS/migration/049 giữ nguyên nội dung đã đạt ở round 1 (kiểm 1: không còn đường client tự khai identity; DROP đúng chữ ký `(uuid,text,text,jsonb)`; e2e 404 + không enqueue email).
- Không có drive-by refactor. Bỏ qua `tasks/bug-full-project/` theo yêu cầu.

## Findings

Không còn finding chặn PASS.

### N-1 [NIT — không chặn] Cờ `app.allow_identity_link` thừa ở fixture có sẵn
- `supabase/tests/045_identity_hooks.test.sql:13,73`, `supabase/tests/046_identity_rpc_privileges.test.sql:42,53`. Có từ trước diff này, fixture qua được trigger mà không cần cờ. Không làm sai assertion nào vì cờ đã về `false` trước phần kiểm. Có thể gỡ khi làm F-2 (thiết kế link-intent sẽ bỏ hẳn cờ này) để tránh người đọc hiểu nhầm GoTrue có đặt cờ.

### F-2 [HIGH — gap thiết kế đã ghi nhận, không FAIL task này]
- Vẫn còn nguyên: user có mật khẩu / identity `email` không liên kết được MXH (23514). Đã ghi trong task file, API_SPEC, ghim bằng test 045 AC-04. Cần change-request/task riêng chốt thiết kế **trước Layer 5**; cần smoke test GoTrue thật.

## Repro Verification
- Task file: before (HTTP 200; 049 Failed 2/4) -> after (HTTP 404; 049 4/4), Status PASS, bằng automated test. Tôi xác nhận after: e2e + 049 PASS trong lần chạy này.

## Kết luận
**STRICT PASS** — F-1 (MAJOR) đã sửa đúng: test liên kết hợp lệ dùng user OAuth-only không mật khẩu, không cờ; R-24 kiểm đúng user/provider; AC-04 ghim KNOWN GAP F-2. F-3, F-4 đã sửa. Toàn bộ verify xanh. Còn F-2 là gap thiết kế đã ghi nhận, phải chốt trước Layer 5.
