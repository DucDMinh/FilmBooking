# Builder summary — feature-confirm-email-auto-login phase-1-task-01

Đã làm:
- Mới `apps/web/src/app/auth/confirm/route.ts` (GET, verifyOtp type signup, redirect theo `resolvePostLoginTarget`, mọi lỗi -> `/xac-nhan-email?status=expired`) + test 20 case.
- `supabase/templates/confirmation.html`: 3 chỗ `{{ .ConfirmationURL }}` -> `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup&amp;next=/`.
- `apps/api/test/auth-email-templates.spec.ts`: thêm `.TokenHash`, cập nhật rule confirmation, 2 test mới.
- `docs/dev-setup.md` (1 đoạn), `.context/decisions.md` (append).
- `proxy.ts` không cần đổi (/auth/confirm không thuộc PROTECTED_PREFIXES).

Còn dở: primary verify thật trên stack local (GoTrue nhận `type=signup` + token_hash từ `auth.users.confirmation_token`).
