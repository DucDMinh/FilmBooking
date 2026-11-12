# Bug layer34-review · phase-1-task-04 — K2 liên kết MXH không có bằng chứng sở hữu (hướng a)

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-api.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: chỉ liên kết qua luồng OAuth chuẩn Supabase linkIdentity; server KHÔNG nhận providerId/identityData từ client (bỏ khỏi DTO identity.service.ts:77-97).
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: builder PASS round 2 (đã sửa F-1/F-3/F-4 của review round 1; chờ reviewer) — chưa commit

## Root cause
`POST /me/identities/link` -> `IdentityService.linkIdentity` -> RPC `link_user_identity` (service_role) chèn thẳng `auth.identities` với `provider_id`/`identity_data` do client khai và bật cờ `app.allow_identity_link=true` nên trigger `guard_identity_insert` (AC-04) bị vô hiệu. Không có bước chứng minh sở hữu tài khoản MXH (OAuth) -> user bất kỳ gắn MXH của nạn nhân (chưa liên kết) vào tài khoản mình.

## Fix (hướng a, user đã chốt)
- Xoá endpoint `POST /me/identities/link`, `IdentityService.linkIdentity`, `linkIdentityInputSchema`/`LinkIdentityInput` (shared). Giữ GET/DELETE identities, `me/password`, `callback-check`, `missing-email`.
- Migration mới `supabase/migrations/20261112090000_drop_client_identity_link.sql`: `DROP FUNCTION link_user_identity(uuid,text,text,jsonb)`.
- Test: e2e thay describe link bằng test 404; pgTAP mới `049_drop_client_identity_link.test.sql`; cập nhật 045 (R-23 và insert hợp lệ qua insert trực tiếp mô phỏng GoTrue), 046 (bỏ 5 assertion link, plan 26->21), 048 (bỏ khỏi allowlist). `database.types.ts` regen (-3 dòng).

## Repro Verification
- Original repro: user A đăng nhập, gọi `POST /me/identities/link {provider:"google", providerId:<id MXH của nạn nhân>}`.
- Expected: không thể gắn MXH không chứng minh sở hữu.
- Actual before fix: HTTP 200, identity được tạo (e2e `expected 200 to be 404`); pgTAP 049: `Failed 2/4` (hàm vẫn tồn tại).
- Actual after fix: HTTP 404, không enqueue email/identity; pgTAP 049 4/4 ok.
- Evidence: `vitest identity.e2e-spec` đỏ (1 failed/19 passed) -> xanh; `supabase test db` 049 đỏ -> toàn bộ PASS (18 files, 668 tests); `pnpm test` api 210, web 93, shared 14, scripts 16 đều pass; lint + typecheck sạch.
- Status: PASS

## Doc impact
`docs/API_SPEC.md` (bỏ endpoint, thêm hướng dẫn Layer 5), `docs/ERD.md` (bỏ link_user_identity, ghi migration 20261112090000). `docs/DESIGN.md` không có mục auth/identity -> no doc impact.

## Hướng dẫn Layer 5 (web)
Gọi `supabase.auth.linkIdentity({ provider: "google"|"facebook", options:{ redirectTo } })` (GoTrue tự OAuth rồi mới tạo identity). Sau callback: gọi `POST /auth/oauth/callback-check` (nếu dùng) và `GET /me/identities` để refresh. `supabase/config.toml [auth] enable_manual_linking = true` đã bật sẵn ở local; PHẢI bật tương ứng trên dashboard staging/prod. Web hiện chưa có UI link (grep apps/web: 0 kết quả).

## Residual risk
1. BLOCKER cho Layer 5 (không phải lỗ hổng): trigger `guard_identity_insert` chặn mọi identity OAuth chèn cho user đã có mật khẩu/identity email khi thiếu cờ `app.allow_identity_link` (GoTrue không đặt cờ này). Hệ quả: `linkIdentity` hợp lệ của user có mật khẩu rất có thể bị 23514 OAUTH_AUTO_MERGE_BLOCKED; trigger không phân biệt được manual-link với auto-merge cùng user_id (đây là M-05, ghi nhận không sửa ở task này). Chưa kiểm chứng end-to-end với GoTrue thật (cần provider OAuth). Cần quyết định thiết kế riêng (vd tắt auto-link email phía GoTrue + nới trigger cho flow manual-link đã xác thực).
2. Đã gỡ khả năng liên kết qua API -> không còn email `identity_linked` từ RPC; email vẫn do trigger `on_identity_change` gửi khi GoTrue chèn.
3. Không đổi `config.toml` (enable_manual_linking đã true) -> không cần restart stack. Staging/prod cần xác nhận cấu hình tương ứng.

## Gap F-2 (HIGH, cần chốt thiết kế trước Layer 5)
(Nguồn: review round 1, `.context/review-reports/bug-layer34-review-phase-1-task-04-round-1-review.md`. KHÔNG implement trong task này.)
- Vấn đề: hướng (a) + trigger `guard_identity_insert` (`20261111040500_identity_hooks.sql:100-108`) => user có mật khẩu/identity `email` KHÔNG liên kết được MXH (23514 OAUTH_AUTO_MERGE_BLOCKED). Trigger chỉ thấy (user_id, provider, provider_id, identity_data) nên không phân biệt manual `linkIdentity` với auto-merge theo email. Cờ `app.allow_identity_link` chỉ do RPC đã DROP đặt. Phạm vi gồm cả user OAuth-only đã đặt mật khẩu qua R-22 (`mark_password_set` tạo identity email).
- Spec bị chặn: R-20 (`SPECIFICATIONS.md:102`), AC-04 (`:367`), R-21 (`:103`), NFR-17 (`:357`, cần test tự động "liên kết tài khoản"). Liên quan M-05 (`independent-review-layer-3-4-api.md:93-99`).
- Chưa kiểm chứng với GoTrue thật. Test 045 đã ghim hiện trạng (AC-04 insert vào user có mật khẩu = 23514) để thiết kế mới buộc phải cập nhật có chủ đích.
- Đề xuất (cần change-request/task riêng): (1) bảng `identity_link_intents(user_id, provider, nonce, expires_at, consumed_at)`, RLS bật, không grant client; (2) `POST /me/identities/link-intent {provider}` (JWT + fresh-auth, M-04) ghi intent TTL 5-10 phút rồi web gọi `supabase.auth.linkIdentity`; (3) trigger: OAuth insert vào user đã tồn tại chỉ qua nếu có intent khớp (user_id, provider) chưa hết hạn/chưa dùng, consume cùng giao dịch, còn lại chặn bất kể có mật khẩu hay không (đóng M-05); signup OAuth user mới giữ luật R-23/email-collision; (4) bằng chứng sở hữu vẫn từ GoTrue OAuth nên không mở lại K2; (5) test pgTAP: có intent/hết hạn/đã dùng/sai provider/không intent + smoke test GoTrue local.
