Agent: reviewer

# Review: bug-layer34-review · phase-1 · task-04 · round 1 (K2: liên kết MXH không bằng chứng sở hữu, hướng a)

- Review level: **STRICT**
- Reason: auth/identity (liên kết phương thức đăng nhập), DB migration (DROP FUNCTION), API contract (gỡ endpoint), shared schema `@filmbooking/shared` + `database.types.ts`.
- Blast radius: `IdentityModule` (controller/service), `packages/shared` (schema identity, database types), `supabase/migrations` (+1 migration), pgTAP 045/046/048/049, docs API_SPEC/ERD. Web chưa có UI liên kết (grep `apps/web`: 0 kết quả) nên không có client vỡ.
- Verdict: **FAIL** (1 finding MAJOR: false-confidence test ở 045; phần fix bảo mật bản thân thì đúng).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — 18 files, 668 tests (045, 046, 048, 049 đều ok) |
| `pnpm test` | PASS — shared 14, api 210, web 93, scripts 16 |
| `pnpm lint` | PASS (shared/api/web sạch) |
| `pnpm typecheck` | PASS (shared/api/web) |
| oxlint | skip, oxlint not configured (không có trong package.json / allowlist) |
| aislop | skip, không có trong allowlist verify |
| ocr | skip, ocr not installed |
| AI-friendly web | N/A (task nội bộ API/DB) |

## Kiểm 1 — Không còn đường client tự khai identity

- Grep `link_user_identity|linkIdentityInput|LinkIdentityInput|identities/link` trên apps/packages/supabase: chỉ còn trong migration cũ đã apply (`20261111040500`, `20261112050000` — đúng, không được sửa), comment, migration DROP, test 049 và test e2e 404. Không còn caller TS.
- Grep `into auth.identities` / `allow_identity_link`: chỉ còn `mark_password_set` (`20261112050000_identity_rpc_hardening.sql:195-206`) chèn provider `email` với `provider_id = p_user_id` do server tự sinh (không lấy từ client) — OK.
- `POST /auth/oauth/missing-email` (`identity.service.ts:154-227`) chỉ lưu `provider_access_token`/`oauth_state_token` vào `oauth_missing_email_requests`; không có consumer nào biến dữ liệu này thành identity (grep chỉ 2 file). `callback-check` (`identity.service.ts:234-261`) chỉ đọc qua `check_oauth_collision`. `createUser` ở `auth-ext.service.ts:85,197` không nhận provider data từ client. => Không còn đường tạo identity từ dữ liệu client khai.
- DROP `public.link_user_identity(uuid, text, text, jsonb)` đúng chữ ký duy nhất (cả 2 migration cũ đều tạo đúng chữ ký này). plpgsql không tạo dependency, đã grep: không trigger/hàm nào gọi. 049 `hasnt_function` theo tên bao trùm mọi overload. `database.types.ts` bỏ đúng 3 dòng.
- Kết luận kiểm 1: **ĐẠT**. Lỗ hổng K2 (gắn MXH của nạn nhân qua providerId tự khai) đã đóng.

## Kiểm 2 — Test sửa đổi 045/046/048

- 046 plan 26 -> 21: 5 assertion bị bỏ đều nhắm hàm đã DROP (grant anon/authenticated, service_role, gọi anon 42501, gọi null-uid 42501, sub=A link vào B). Sự vắng mặt của hàm được 049 bao. Không giảm độ phủ bảo mật cho 4 hàm còn lại. **OK.**
- 048: bỏ khỏi allowlist là đúng (hàm không còn).
- 045 R-23 (dòng 144-150): đổi từ RPC sang insert trực tiếp vẫn kiểm đúng nhánh trigger `guard_identity_insert` dòng 86-94 (23505). Ý nghĩa giữ nguyên, thậm chí sát GoTrue hơn. **OK.**
- 045 AC-04 throws_ok (dòng 153-159): giữ nguyên. **OK.**
- 045 positive link + R-24 (dòng 161-176): **có vấn đề** — xem F-1.

## Findings

### F-1 [MAJOR — FAIL] False-confidence test: "GoTrue chèn identity hợp lệ (linkIdentity) thành công" bịa cờ mà GoTrue không bao giờ đặt
- File: `supabase/tests/045_identity_hooks.test.sql:161-176`.
- Test `set local app.allow_identity_link = 'true'` rồi chèn identity facebook cho user a001 **có mật khẩu**, đặt tên "GoTrue chèn identity hợp lệ (linkIdentity) thành công". Sau diff này, **không còn code nào đặt cờ đó cho provider OAuth**: `mark_password_set` chỉ đặt cho provider `email` (mà trigger bỏ qua `email` ở dòng 81-83). GoTrue không đặt được cờ phiên tuỳ ý. Trên DB thật, đúng insert này từ GoTrue sẽ ném `23514 OAUTH_AUTO_MERGE_BLOCKED` (`20261111040500_identity_hooks.sql:105-108`).
- Assertion R-24 `identity_linked` (dòng 172-176) phụ thuộc vào chính insert bịa đó.
- Hậu quả: suite xanh khẳng định một luồng production đang **không chạy được** (chính là blocker ở F-2). Comment "xem Residual risk" không đổi điều assertion khẳng định. Theo luật adversarial review, mock/test bịa hành vi khác DB thật => FAIL.
- Sửa (rẻ): (a) chuyển test liên kết hợp lệ + R-24 sang user **chỉ OAuth, không mật khẩu, không cờ** (đường thực sự hoạt động; vd thêm 1 user OAuth-only hoặc dùng a003 sau khi đã unlink, provider_id mới, `identity_data` không có email trùng user khác); (b) bỏ `set local app.allow_identity_link` ở dòng 163/169; (c) khuyến nghị đổi tên/ghi rõ assertion AC-04 dòng 153-159 rằng nó **cũng** chặn liên kết thủ công hợp lệ của user có mật khẩu (pin known-gap F-2) để khi thiết kế mới vào, test này buộc phải đổi có chủ đích.

### F-2 [HIGH — không FAIL task này, nhưng PHẢI quyết định thiết kế trước Layer 5] Hướng (a) + trigger hiện có => user có mật khẩu KHÔNG THỂ liên kết MXH
- Phân loại theo yêu cầu: **(i) chặn chức năng spec yêu cầu**, không phải "đúng spec".
  - `SPECIFICATIONS.md:102` R-20 (câu 2): "Khách đăng nhập tài khoản cũ thành công → liên kết MXH vào tài khoản cũ."
  - `SPECIFICATIONS.md:367` AC-04 (vế T): "yêu cầu đăng nhập mật khẩu rồi liên kết Google vào tài khoản cũ."
  - `SPECIFICATIONS.md:103` R-21: nút **Liên kết** ở Hồ sơ → Bảo mật & liên kết.
  - `SPECIFICATIONS.md:357` NFR-17: bắt buộc test tự động "liên kết tài khoản" (R-20, R-21) — hiện không còn test nào cho luồng hợp lệ của user có mật khẩu (sau khi sửa F-1 sẽ thấy rõ).
- Cơ chế: `guard_identity_insert` (`20261111040500_identity_hooks.sql:100-108`) chặn mọi identity OAuth chèn vào user có `encrypted_password` hoặc identity `email` khi thiếu `app.allow_identity_link='true'`. Trigger chỉ thấy row (user_id, provider, provider_id, identity_data) — **không phân biệt được** manual-link (GoTrue `linkIdentity`) với auto-merge theo email (cùng `user_id` đích). Đường duy nhất từng đặt cờ (RPC đã DROP) không còn.
- Phạm vi rộng hơn builder mô tả: không chỉ user đăng ký bằng mật khẩu, mà **mọi user OAuth-only từng đặt mật khẩu qua R-22** (`POST /me/password` -> `mark_password_set` tạo identity `email`) cũng vĩnh viễn không liên kết thêm được provider nào.
- Không phải lỗi có từ trước theo nghĩa hành vi: trước diff, liên kết chạy được (qua RPC không an toàn). Diff này (theo hướng user đã chốt) làm lộ ra blocker. Builder đã ghi rõ ở Residual risk #1 của task file => không FAIL vì điểm này, nhưng mức độ là **blocker chức năng MVP cho Layer 5** và liên quan trực tiếp M-05 (`independent-review-layer-3-4-api.md:93-99`).
- Chưa kiểm chứng end-to-end với GoTrue thật (không có OAuth provider ở local) — cả kết luận chặn lẫn đề xuất dưới đây đều cần smoke test GoTrue.
- Đề xuất thiết kế (đóng cả F-2 và M-05), cần change-request/task riêng trước Layer 5:
  1. Bảng `identity_link_intents(user_id, provider, nonce, expires_at, consumed_at)` (RLS bật, không grant client).
  2. Endpoint `POST /me/identities/link-intent {provider}` (JWT + fresh-auth: `amr` timestamp gần, xem M-04) ghi intent TTL ngắn (vd 5-10 phút), rồi web gọi `supabase.auth.linkIdentity`.
  3. Trigger: OAuth insert vào user **đã tồn tại** (có bất kỳ identity nào) chỉ cho qua nếu có intent khớp (user_id, provider) chưa hết hạn/chưa dùng, và consume intent trong cùng giao dịch; còn lại coi là auto-merge => chặn, **bất kể có mật khẩu hay không** (đóng M-05). Insert cho user mới (signup OAuth lần đầu) giữ luật R-23/email-collision hiện có.
  4. Bằng chứng sở hữu vẫn đến từ GoTrue OAuth (provider_id không do client khai) => không mở lại K2.
  5. Test: pgTAP cho có intent / hết hạn / đã dùng / sai provider / không intent; smoke test GoTrue local.

### F-3 [MINOR] Docs as-built mô tả liên kết như đang hoạt động
- `docs/API_SPEC.md:50`: ghi web gọi `supabase.auth.linkIdentity` "GoTrue xác thực OAuth rồi mới tạo identity" nhưng không nêu hiện user có mật khẩu sẽ nhận 23514 (F-2). As-built nên ghi rõ giới hạn hiện tại. Ngoài ra thiếu dấu ngăn cách sau "(#18)" trước "Liên kết MXH (K2)" (câu dính liền).
- Không có `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` (thư mục không tồn tại) => không có gap register để cập nhật; khuyến nghị ghi F-2 vào backlog/change doc.
- Phần hướng dẫn Layer 5 (task file dòng 29-30, API_SPEC): `enable_manual_linking = true` đã có ở `supabase/config.toml:185`; nhắc bật trên dashboard staging/prod là đúng.

### F-4 [NIT] Comment đếm test cũ trong 046
- `supabase/tests/046_identity_rpc_privileges.test.sql:56` "(10 test)" nay là 8; header mục 2 "(5 test)" nay là 4. Chỉ comment.

## Surgical diff / code quality
- Mọi dòng trace về K2; không drive-by refactor. Migration additive mới, không sửa migration đã apply. Comment header `identity.service.ts:18-19` cập nhật đúng.
- e2e mới (`apps/api/test/identity.e2e-spec.ts:561-574`) kiểm 404 + không enqueue email — hợp lý cho route đã gỡ (Nest trả 404 cho route không tồn tại). Mock fake RPC `link_user_identity` đã gỡ đồng bộ.
- AI-readable: không thấy indicator mới.

## Repro Verification
- Task file ghi before (200 / 049 Failed 2/4) -> after (404 / 049 4/4) bằng automated test; tôi xác nhận after: e2e + 049 PASS. Đạt yêu cầu bug repro closure.

## Kết luận
**FAIL** — chỉ vì F-1 (false-confidence test 045:161-176). Fix bảo mật K2 bản thân đúng và đủ (kiểm 1, 2 đạt; docs đạt với ghi chú F-3). Builder sửa F-1 (bắt buộc), F-3/F-4 (khuyến nghị) rồi review round 2. F-2 phải được đưa lên user/change-request để chốt thiết kế trước khi bắt đầu Layer 5.
