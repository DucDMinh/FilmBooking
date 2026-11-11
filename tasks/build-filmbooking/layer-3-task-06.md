# Task 06: API auth mở rộng: đăng ký (Turnstile, rate limit, chặn email dùng 1 lần), đăng nhập qua server (khoá 5 lần), gửi lại xác nhận, quên mật khẩu

## Layer
3

## Type
build (initial)

## Requirements
- R-xx: R-01, R-02, R-03, R-04, R-06, R-07, R-08, R-09, R-11, R-12, R-13, R-17
- AC-xx: AC-02, AC-03

## Description
**Chốt contract:** đăng nhập email/mật khẩu đi qua `POST /auth/login` của Nest (Nest kiểm lockout → gọi Supabase signInWithPassword → ghi thất bại → trả session cho web set cookie) để đếm được lần sai (R-11). `POST /auth/register`: Turnstile, rate limit IP/email, chặn domain disposable, chính sách mật khẩu, bắt buộc đồng ý điều khoản (lưu consent + phiên bản), email trùng không phân biệt hoa thường; phản hồi **không tiết lộ email tồn tại** (R-12). `POST /auth/resend-confirmation` (60s cooldown + trần/ngày). `POST /auth/forgot-password` phản hồi trung tính. Không có đường tự đăng ký vai trò nhân sự (R-17).

## Dependencies
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] AC-03: sai 5 lần → lần 6 đúng mật khẩu trong 15' vẫn 423 `ACCOUNT_LOCKED` + enqueue email cảnh báo chủ tài khoản vào email_outbox.
- [ ] AC-02 (server): gọi resend 2 lần trong 60s → lần 2 bị 429 `RATE_LIMITED` kèm `retryAfter`, không gửi thêm.
- [ ] Đăng ký `A@x.com` khi đã có `a@x.com` → cùng phản hồi như thành công ('kiểm tra email'), không tạo user mới.
- [ ] Domain disposable → 422 `DISPOSABLE_EMAIL`; Turnstile sai → 400 `CAPTCHA_FAILED`; mật khẩu yếu → 422 với lý do.
- [ ] Body register có trường role → bị bỏ qua/400; user mới luôn là CUSTOMER.
- [ ] (quyết định user, G5 = C) Đặt lại mật khẩu: giữ `otp_expiry=86400`; khi hoàn tất đặt lại, server (Nest) kiểm thời điểm gửi link khôi phục (`auth.users.recovery_sent_at` qua admin API) ≤ 1 giờ, quá hạn → từ chối (mã lỗi rõ + hướng dẫn gửi lại); link xác nhận email vẫn 24h (R-04). Test cả hai biên (59 phút OK, 61 phút từ chối).
- [ ] (quyết định user, G6) Chấp nhận rủi ro đăng nhập/recover gọi thẳng GoTrue (bỏ qua lockout/rate limit/Turnstile) cho bản demo: KHÔNG làm biện pháp chặn thêm, nhưng ghi rõ trong comment đầu `auth-ext.service.ts` + docs/dev-setup.md (mục "Rủi ro đã chấp nhận"). Đường chuẩn qua Nest vẫn áp dụng đủ R-07/R-08/R-11.
- [ ] Tạo user bằng Admin API `createUser` với `app_metadata.created_via='nest'` (hook layer 2 yêu cầu); KHÔNG dùng `inviteUserByEmail`/`generateLink({type:'signup'})`; tài khoản nhân sự tạo với `email_confirm:true`. Rate limit IP đọc từ `req.ip` (trust proxy) — ghi giới hạn: qua proxy Next IP là của server Next (follow-up layer 5 truyền IP khách).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/auth-ext/auth-ext.module.ts`
- `apps/api/src/modules/auth-ext/auth-ext.controller.ts`
- `apps/api/src/modules/auth-ext/auth-ext.service.ts`
- `apps/api/src/modules/auth-ext/turnstile.service.ts`
- `packages/shared/src/schemas/auth.ts`
- `packages/shared/src/password-policy.ts`
- `apps/api/test/auth-ext.e2e-spec.ts`
- `docs/dev-setup.md`

## Notes
password-policy.ts dùng chung web+api. Supabase gửi email xác nhận qua SMTP (config layer 0).
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
- Email xác nhận/đặt lại do Supabase Auth gửi (SMTP cấu hình ở Dashboard/Mailpit local); chưa gửi email thật ở task này. Test dùng mock Supabase Admin + Turnstile mock (không cần DB thật trừ khi AC yêu cầu; nếu cần DB dùng khoá `.worktrees/.dblock`).
