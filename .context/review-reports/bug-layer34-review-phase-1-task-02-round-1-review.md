Agent: reviewer

# Review — bug-layer34-review · phase-1-task-02 (K1) + phase-1-task-03 (K3) · round 1

- Review level: **STRICT**
- Reason: auth/RBAC trên RPC SECURITY DEFINER thao tác `auth.identities` (chiếm tài khoản), migration mới, đổi API contract (`/auth/oauth/callback-check` từ Public sang JWT), account enumeration (R-12).
- Blast radius: `supabase/migrations/20261112050000_identity_rpc_hardening.sql` (5 RPC identity + helper mới), `IdentityModule` (controller/service; module CHƯA được import vào `apps/api/src/app.module.ts` nên lộ thật trước fix là qua PostgREST), pgTAP 045/046, e2e identity, `docs/API_SPEC.md`, `docs/ERD.md`, `packages/shared/src/database.types.ts`. `apps/web` không gọi các RPC/endpoint này (grep xác nhận).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (= `supabase test db`, DB local đã reset) | PASS — 15 file, 592 test (566 cũ + 26 của 046), gồm 045 + 046 ok |
| `pnpm test` | PASS — shared 14, api 211 (14 file), web 89, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `npx supabase test db` / psql qua docker exec | agent-guard chặn (không trong allowlist), nên chạy `pnpm db:test` thay thế. Không đọc được ACL lúc chạy bằng psql. |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, không có trong allowlist / chưa cài |
| AI-friendly web | N/A (không phải task web public) |

## Kiểm tra theo câu hỏi của caller

1. **Revoke / default privileges.** Supabase cấp sẵn EXECUTE cho anon/authenticated khi hàm được tạo. Migration revoke helper ngay sau khi tạo (`20261112050000:41`), nên các grant mặc định bị gỡ. `CREATE OR REPLACE` giữ ACL cũ (gồm grant `authenticated` ở `040500:346,393,441,477` và `anon, authenticated` ở `:284`), và các ACL này bị revoke tường minh ở `:217-221`. Sau đó chỉ grant cho `service_role` (`:223-227`). Chữ ký hàm khớp `040500`. pgTAP 046 xác nhận lúc chạy: anon/authenticated không có quyền với 5 hàm và bị 42501 khi gọi thật.
2. **Helper fail-closed.** `auth.uid()` null mà role khác `service_role` thì raise 42501. Có uid thì chỉ được thao tác trên chính mình (`:30-37`). Bỏ nhánh `is_admin()` là hợp lý. `auth.role()` và `auth.uid()` lấy từ `request.jwt.claims`, mà PostgREST dựng claims từ JWT đã xác minh chữ ký. Muốn giả `role=service_role` phải có JWT secret. Không migration nào gọi `set_config` với tên GUC động (grep `set_config(<biến>,` → 0 kết quả). GRANT là lớp chặn chính, kiểm tra trong thân hàm là lớp phòng thủ thứ hai.
3. **Còn hàm SECURITY DEFINER nào bị sót?** `guard_identity_insert` và `on_identity_change` trả kiểu `trigger` nên không gọi qua RPC được. `hit_rate_limit` và `is_disposable_email` đã revoke từ trước (`20261111020100_security_ops.sql:254-258`). Bảng `oauth_missing_email_requests` đã revoke anon/authenticated (`040500:61`). Không thấy hàm nào bị sót.
4. **Dùng `supabase.admin()` (service_role) có vô hiệu kiểm tra "chính mình" không?** Có: với service_role thì DB tin `p_user_id`. Vì vậy tầng API phải tự ràng buộc, và mọi đường gọi đều lấy `p_user_id = user.id` từ JWT: get `identity.service.ts:53`, link `:80`, unlink `:107`, mark_password_set `:157`, collision `:270` (`p_authenticated_user_id: user.id`, `p_email: user.email`). Client không truyền được user id nào khác vào.
5. **Callback-check.** Bỏ `@Public` (`identity.controller.ts:69`), nên AuthGuard toàn cục trả 401. Service bỏ qua `email`/`authenticatedUserId` do client gửi. Vì `p_authenticated_user_id` luôn khác null, nhánh CONFLICT_EMAIL trong `check_oauth_collision` (`040500:262`) không còn đường nào chạm tới qua API. Oracle dò email đã đóng cả ở API lẫn ở PostgREST.
6. **Test.**
   - 046 có case âm thật: has_function_privilege, gọi thật dưới anon/authenticated, owner không claims, sub=A gọi lên B. Có cả case dương: service_role, sub tự gọi chính mình. Không phải tautology.
   - 045 thêm claims `service_role` một lần ở `:76`. 045 không có test ownership/phân quyền nào (grep `request.jwt|tap_as|set role` chỉ ra đúng dòng 76), nên claims này không che lỗi nào. 045 chỉ chạy thân hàm, case âm nằm ở 046.
   - Mock e2e `check_oauth_collision` (`identity.e2e-spec.ts:304-307`) đòi `has_password`, trong khi DB không đòi, tức là lệch DB thật. Nhưng nhánh này giờ không còn đường nào chạm tới (luôn có authenticatedUserId), nên không gây sai lệch cho các test hiện tại.
7. **Docs.** API_SPEC dòng IdentityModule khớp code (callback-check yêu cầu JWT, missing-email là Public). ERD ghi đúng migration hardening. `database.types.ts` chỉ thêm `assert_identity_rpc_caller`, hợp lệ với schema đã sinh.

## Findings

### CRITICAL
- Không có.

### MAJOR
- Không có.

### MINOR
1. **Thiếu test ACL cho helper.** 046 không assert `has_function_privilege('anon'|'authenticated', 'public.assert_identity_rpc_caller(uuid)', 'execute') = false`. Không đọc được ACL lúc chạy vì psql bị chặn. Text migration (`20261112050000:41`) rõ ràng, và helper chỉ trả void hoặc raise, không lộ dữ liệu. Đề xuất thêm 2 assert.
2. **046 §4 chưa phủ hết case sub=A→B** (`046:104-107`): mới có get và link, chưa có `unlink_user_identity` và `mark_password_set`. Helper dùng chung nên rủi ro thấp.
3. **Contract input lệch hành vi.** `packages/shared/src/schemas/identity.ts:63-64` vẫn bắt buộc `email` và nhận `authenticatedUserId`, nhưng server bỏ qua cả hai (`identity.service.ts:269-270`). `docs/API_SPEC.md:50` chưa ghi điều này. Nên nới thành optional hoặc ghi rõ "bị bỏ qua".
4. **Comment spike đã lỗi thời.** `identity.service.ts:20-23` vẫn mô tả Lớp 2 là kiểm tra trước đăng nhập, trả CONFLICT_EMAIL. Nhánh CONFLICT_EMAIL (`:281-285`) giờ không còn đường nào chạm tới (dead code).
5. **AC-04 không còn thông báo trước đăng nhập ở tầng API.** Lõi bảo mật của AC-04 vẫn được giữ: trigger `guard_identity_insert` chặn auto-merge, test ở `045:152-157`. Phần "yêu cầu đăng nhập mật khẩu" ở UX (SPECIFICATIONS.md:367) giờ phải do web Layer 5 tự dịch lỗi GoTrue/trigger. Task-03 đã ghi residual risk, nhưng repo không có gap register. Nên ghi vào brief Layer 5 (web OAuth callback) để không mất yêu cầu. Nhánh email-collision khác user của trigger (`040500:110-122`) chưa có pgTAP; lỗi này có từ trước, không thuộc diff.
6. **`search_path` giữ `public, auth, pg_temp`**, chưa đổi sang `''` như báo cáo gốc khuyến nghị (`independent-review-layer-3-4-db.md:47`). Không khai thác được: hàm có sẵn được tìm trong pg_catalog trước, và mọi tham chiếu bảng đều ghi rõ schema. Ghi nhận đây là điểm lệch khuyến nghị.
7. Helper nội bộ nằm ở schema `public` đang được expose, nên xuất hiện trong `database.types.ts`. Vô hại vì đã revoke.

### Ngoài phạm vi (residual, không tính cho task này)
- **K2:** `linkIdentity` vẫn nhận `providerId`/`identityData` do client tự khai (`identity.service.ts:79-84`), là task riêng.
- **M-01:** `hasPassword` vẫn tính cả identity `email`. Việc revoke đã chặn đường gọi trực tiếp qua PostgREST, nhưng logic vẫn còn.
- **M-02:** race khi unlink. `unlink_user_identity` được viết lại nhưng vẫn chưa khoá dòng.
- Cảnh báo duplicate seed trong residual risk của task-02 đã hết: lần chạy này pgTAP 592/592 PASS.

## Verdict

**STRICT PASS.** K1 đóng: anon/authenticated mất EXECUTE trên 5 hàm, và thân hàm fail-closed khi `auth.uid()` null. K3 đóng: endpoint yêu cầu JWT, không nhận email/user id từ client, và RPC chỉ cho service_role. Các MINOR ở trên không chặn, nên xử lý khi chạm lại module.
