# builder - feature custom-mail-templates phase-1-task-01
- Viết lại apps/api/src/modules/mail/templates.ts: wrapLayout bảng 600px + inline style, header #111620 wordmark CINEMO #F06D5B, preheader ẩn, footer hotline; helper heading/paragraph/button/fallbackLink/infoTable/noteBox/bulletList. Subject [CINEMO]; text đổi tên thương hiệu.
- Test mới apps/api/test/mail-templates.spec.ts (đỏ 32 fail trước, xanh sau). Sửa 3 assert subject trong outbox-job.e2e-spec.ts.
- Verify: tsc OK, eslint OK, vitest api 28 files / 565 tests PASS.
- Mẫu vé: C:\Users\DUCDAO~1\AppData\Local\Temp\cinemo-ticket-sample.html
