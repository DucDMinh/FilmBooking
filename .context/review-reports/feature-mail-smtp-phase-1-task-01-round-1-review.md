Agent: reviewer

# Review: feature-mail-smtp, phase-1-task-01, round 1

- Task: `tasks/feature-mail-smtp/phase-1-task-01.md` (MODIFY: `MailService` chuyển từ Resend SDK sang SMTP/nodemailer)
- Ngày: 2026-11-17
- Phạm vi bỏ qua theo brief: `supabase/config.toml` (thay đổi của user), hunk `"start": "node --env-file=../../.env.local ..."` trong `apps/api/package.json`, `tasks/bug-register-email/`.

## Review level
**STRICT**

## Reason
Task nằm ngay ranh giới NORMAL/STRICT. Tôi nâng lên STRICT vì ba lý do:
- task xử lý secret (`SMTP_PASS`) và phải đảm bảo log/lỗi không làm lộ nó;
- task thay dependency ở module dùng chung: mọi email trong `email_outbox` đều đi qua `MailService`;
- task đổi schema env (`config/env.ts`), là phần mà mọi lần khởi động API đều đọc.

Không có thay đổi DB/migration hay auth/RBAC.

## Blast radius
- Mọi email giao dịch trong outbox: vé, khoá tài khoản, huỷ suất, password_set, OAuth và các loại khác. Tất cả đi qua `MailService.sendEmail` → `JobsService.processEmailOutbox` (`apps/api/src/modules/jobs/jobs.controller.ts:205`).
- Env API: thêm `SMTP_HOST/PORT/USER/PASS/FROM` (đều optional), bỏ `RESEND_API_KEY`. Zod `object` không strict, nên env cũ còn `RESEND_API_KEY` vẫn parse được và không làm vỡ lúc khởi động.
- Token DI: `RESEND_CLIENT` đổi thành `MAIL_TRANSPORT`. Tất cả các chỗ override trong test đã được cập nhật: `outbox-job.e2e-spec.ts`, `integration/helpers/app-harness.ts`.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, web, api) |
| `pnpm lint` | PASS (shared, api `src test`, web) |
| `pnpm test` | PASS: shared 31/31; api 26 file / 496 test; web 46 file / 570 test; scripts node --test 31/31 |
| `pnpm --filter @filmbooking/api test` | Bị agent-guard chặn (không có trong allowlist). Đã thay bằng `pnpm test` ở trên, lệnh này bao trùm cả api |
| `pnpm build` | Không chạy theo brief (để không ghi đè `apps/api/dist`). Đã kiểm tra tương thích bằng cách đọc cấu hình, xem mục 4 |
| aislop / oxlint / ocr | skip: không nằm trong allowlist verify, repo chưa cấu hình oxlint, chưa cài ocr |

## Kiểm tra chi tiết

### 1. Đúng spec task: PASS
- `apps/api/src` không còn import `resend`. Grep chỉ còn `resendConfirmation`, `resend-email`, `ResendEmailResultDto`, `auth.resend` (không liên quan) và comment nhắc Resend như một nhà cung cấp SMTP.
- `mail.transport.ts:12-24`, hàm `createMailTransport`, khớp spec:
  - trả `null` khi thiếu `SMTP_HOST`;
  - port mặc định 465 (`SMTPS_PORT`, hằng có tên, không phải magic number);
  - `secure` chỉ bật khi port 465;
  - có `auth` khi có `SMTP_USER`;
  - timeout 10s/10s/20s.
- `mail.service.ts:44-87`:
  - không có transport: env test trả mock id, env khác throw `SMTP is not configured (SMTP_HOST)`;
  - lỗi `sendMail` bị bọc thành `SMTP send failed: <msg>`;
  - `rejected.length > 0` thì throw;
  - thiếu `messageId` thì throw;
  - from theo thứ tự `options.from` > `SMTP_FROM` > `FilmBooking <SMTP_USER>` > `FilmBooking <no-reply@filmbooking.local>`.
- Nhánh outbox retry giữ nguyên: `jobs.controller.ts:227-245` ghi `last_error = error.message`. Message mới không chứa secret.
- `MailModule` provide/export `MAIL_TRANSPORT`. `MailTransport` là interface tối thiểu, và typecheck xác nhận nodemailer `Transporter` gán được vào interface này.

### 2. Bảo mật / PII: PASS
- Log lỗi chỉ in `options.to` và `error.message`; không log cấu hình SMTP hay `SMTP_PASS`. Việc log email người nhận là hành vi đã có từ trước, không phải hồi quy.
- `cause: error` gắn vào Error nhưng không bị log hay ghi DB. Chỉ `.message` được lưu.
- `.env.example`, README, docs, test và decisions không chứa secret hay địa chỉ email thật. Grep `daod1278` không có kết quả. Các mẫu `u@gmail.com` và `secret-pass` trong test là giá trị giả.
- `docs/dev-setup.md` dặn rõ không commit tài khoản cá nhân vào `config.toml`, và đặt `SMTP_PASS` trong `supabase/.env` (đã git ignore).

### 3. Test: PASS
- `git diff` của `outbox-job.e2e-spec.ts`, `app-harness.ts` và `cancel-showtime.int-spec.ts` chỉ đổi tên mock/biến/chuỗi mô tả. Mọi `expect` được giữ nguyên (số lần gọi, `to`, `html`, PENDING/SENT/FAILED, attempts, `last_error`). Không assertion nào bị xoá hay nới.
- Mock `{ messageId }` / `mockRejectedValue(Error)` khớp contract thật của nodemailer `sendMail` (resolve `SentMessageInfo{messageId, rejected, ...}`; reject khi lỗi kết nối/auth).
- Thử bẻ hành vi bằng cách đọc logic (`mail-service.spec.ts`). Mỗi thay đổi sau đều làm test đỏ:
  - bỏ nhánh `null`: test dòng 29;
  - `secure` luôn `true`: test dòng 54;
  - bỏ `auth` hoặc timeout: test dòng 34;
  - đảo thứ tự from: test dòng 87;
  - bỏ check `rejected`: test dòng 112;
  - bỏ check `messageId`: test dòng 119;
  - bỏ nhánh mock khi env test hoặc throw sai message: test dòng 126/134.
- `sendOutboxEmail` được test theo hướng render rồi gửi, không phải mock tautology.

### 4. Tương thích build (SWC → CommonJS): PASS (đọc cấu hình)
- `scripts/build.mjs` dùng SWC `module: commonjs`, nên `import { createTransport } from "nodemailer"` được biên dịch thành `require("nodemailer").createTransport`.
- nodemailer 10.6.0 có `"type": "module"` nhưng khai báo `exports["."].require = ./dist/cjs/nodemailer.js`. File `dist/cjs/package.json` có `{"type":"commonjs"}`, và `dist/cjs/nodemailer.js:39` có `exports.createTransport = createTransport`. Vì vậy `require` từ bản CJS chạy được.
- `@types/nodemailer@8.0.2` export `createTransport` (`index.d.ts:45+`). `pnpm typecheck` đã xanh.
- `pnpm-lock.yaml` không còn `resend`, đã có `nodemailer@10.6.0` và `@types/nodemailer@8.0.2`.

### 5. Docs: PASS, kèm 1 finding LOW
- `DESIGN.md`, `API_SPEC.md` và gap register đã cập nhật đúng as-built. Intent docs (`SPECIFICATIONS.md`, `docs/BRD.md`, `docs/specs/*`) không bị sửa.
- Lệnh `curl -X POST http://localhost:3001/jobs/send-emails -H "x-job-secret: <JOB_SECRET>"` đúng: cổng mặc định 3001 (`env.ts:27`), header `x-job-secret` (README).
- Hướng dẫn Supabase Auth SMTP đúng cách cấu hình (`pass = "env(SMTP_PASS)"`, host/port/user/admin_email/sender_name, `pnpm db:stop && pnpm db:start`, Mailpit `:54324`). Riêng câu về `env()` bị lệch, xem finding F1.

### 6. Tham chiếu Resend còn sót
Các chỗ còn sót được liệt kê ở F2–F4, đều mức LOW.

## Findings
| ID | Severity | Vị trí | Mô tả |
|---|---|---|---|
| F1 | LOW | `docs/dev-setup.md:36` | Câu "chỉ trường `pass` hỗ trợ `env()`, các trường khác phải là giá trị literal" mâu thuẫn với chính repo: `supabase/config.toml:352,363` dùng `client_id = "env(...)"`, và `:449-455` dùng `s3_host`/`s3_region` = `env(...)`. Hướng dẫn vẫn an toàn (literal thì luôn đúng), nhưng câu này không chính xác. Dispatcher đã yêu cầu câu này trong spec task, nên tôi không coi là lỗi của builder. Đề xuất đổi thành "nên để secret (`pass`) qua `env()`" |
| F2 | LOW | `README.md:3` | Phần giới thiệu vẫn ghi "email Resend". As-built nên ghi "email SMTP (nodemailer)" |
| F3 | LOW | `.context/project-config.md:164` | `env.required` vẫn liệt kê `RESEND_API_KEY` (config do brainstorm ghi; dispatcher nên reconcile) |
| F4 | LOW | `.github/workflows/ci.yml:46`, `.github/workflows/e2e.yml:24` | Còn `RESEND_API_KEY: ci-placeholder`: biến thừa, vô hại, builder đã ghi vào Residual |
| F5 | INFO | `apps/api/test/mail-service.spec.ts:109` | `rejects.not.toThrow(/secret-pass/)` là bảo đảm yếu (code không bao giờ đưa pass vào message). Không có test spy logger để chứng minh không log `SMTP_PASS`. Đã kiểm bằng đọc code: không có đường log nào chứa pass |
| F6 | INFO | `mail.transport.ts:19` | Có `SMTP_PASS` nhưng thiếu `SMTP_USER` thì `auth` bị bỏ qua mà không báo gì. Chấp nhận được với demo; lỗi sẽ lộ ra khi gửi (server từ chối) và vào `last_error` |

Không có finding CRITICAL, HIGH hay MAJOR. Không có scope drift: `cancel-showtime.int-spec.ts` không nằm trong danh sách file của task, nhưng thay đổi chỉ là đổi chuỗi mô tả, truy được về task.

## Residual risk
- Chưa gửi mail thật qua Gmail/Resend (không dùng mạng). User tự kiểm sau khi điền App Password.
- Chưa có ràng buộc `SMTP_*` ở production (scan #5, ngoài phạm vi).

## Verdict
**STRICT PASS**: các finding LOW/INFO có thể xử lý trong lần reconcile docs/config, không chặn commit.
