# builder · feature/custom-mail-templates · phase-1-task-02

- Đã làm: tạo 6 template mail Supabase Auth (`supabase/templates/*.html`), test tĩnh `apps/api/test/auth-email-templates.spec.ts`, thêm đoạn "Template mail Auth" vào `docs/dev-setup.md`.
- TDD: test đỏ (ENOENT thiếu file) -> tạo template -> 31 test xanh.
- Verify: api typecheck/lint sạch; vitest toàn api 565/565 PASS (lần chạy đầu có 35 fail do file task-01 đang sửa dở, chạy lại thì xanh).
- Còn dở: primary thêm 6 khối `[auth.email.template.*]` vào config.toml và restart supabase để verify thật qua Mailpit.
