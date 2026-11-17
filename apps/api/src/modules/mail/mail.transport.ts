import { createTransport } from "nodemailer";
import type { Env } from "../../config/env";
import type { MailTransport } from "./mail.service";

/** Cổng SMTPS (TLS ngay khi kết nối): Gmail, Resend, SES đều hỗ trợ. Cổng khác (587/25) dùng STARTTLS. */
const SMTPS_PORT = 465;

/**
 * Tạo transport SMTP từ env; `null` khi chưa đặt SMTP_HOST (MailService sẽ mock ở test, báo lỗi ở môi trường khác).
 * Timeout ngắn để job `/jobs/send-emails` không treo khi máy chủ SMTP không phản hồi.
 */
export function createMailTransport(env: Env): MailTransport | null {
  if (!env.SMTP_HOST) return null;
  const port = env.SMTP_PORT ?? SMTPS_PORT;
  return createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === SMTPS_PORT,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
