# Bug layer34-review · phase-2-task-07 — F-2: link-intent cho liên kết MXH thủ công (đóng luôn M-05)

- Classification / Risk: BUG (chặn chức năng spec) · severity=high · review level expected=STRICT (auth/identity)
- Nguồn: `.context/review-reports/bug-layer34-review-phase-1-task-04-round-1-review.md` (F-2), task phase-1-task-04 mục "Gap F-2".
- Spec: R-20 (SPECIFICATIONS.md:102), R-21 (:103), AC-04 (:367), NFR-17 (:357), M-05.
- Thiết kế đề xuất (chờ user duyệt chi tiết):
  1. Bảng `identity_link_intents(user_id, provider, expires_at, consumed_at)`; RLS khoá, chỉ service_role.
  2. `POST /me/identities/link-intent {provider}`: JWT + yêu cầu đăng nhập gần đây (re-auth), TTL ngắn; trả 204.
  3. Web gọi link-intent rồi `supabase.auth.linkIdentity({provider})`.
  4. Trigger `guard_identity_insert`: identity OAuth chèn vào user ĐÃ tồn tại chỉ được qua khi có intent khớp (user_id, provider), còn hạn, chưa dùng → đánh dấu consumed. Không có intent → coi là auto-merge → chặn, bất kể user có mật khẩu hay không (đóng M-05).
  5. pgTAP + e2e + smoke với GoTrue local; sửa test 045 "KNOWN GAP F-2"; gỡ cờ allow_identity_link thừa trong fixture 045/046 (N-1).
- Status: pending
- Quyết định user (2026-11-12T04:25:22Z): TTL link-intent 10 phút; BẮT BUỘC re-auth gần đây (đăng nhập trong ≤ 5 phút, kiểm qua claim auth_time/iat của phiên đăng nhập thật — không dựa iat của token refresh).
