import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";
import { renderTemplate, type RenderedEmail } from "./templates";

/** Injection token cho transport gửi mail (SMTP); cho phép mock linh hoạt trong test. */
export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

/** Phần tối thiểu của nodemailer Transporter mà MailService dùng, để test không phụ thuộc nodemailer. */
export interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ messageId: string; rejected?: unknown[] }>;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendEmailResult {
  id: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() @Inject(MAIL_TRANSPORT) private readonly transport?: MailTransport | null,
  ) {}

  /**
   * Gửi email qua SMTP (cấu hình bằng SMTP_* trong env).
   * Ném Error nếu gửi thất bại hoặc chưa cấu hình SMTP (để outbox worker ghi nhận last_error và retry).
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!this.transport) {
      if (this.env.NODE_ENV === "test") {
        this.logger.debug(`[TEST] Mock sendEmail to=${options.to} subject="${options.subject}"`);
        return { id: `mock-email-${Date.now()}` };
      }
      throw new Error("SMTP is not configured (SMTP_HOST)");
    }

    let info: Awaited<ReturnType<MailTransport["sendMail"]>>;
    try {
      info = await this.transport.sendMail({
        from: options.from ?? this.resolveFrom(),
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    } catch (error) {
      // Chỉ log lý do lỗi; không bao giờ log cấu hình SMTP (có SMTP_PASS).
      const msg = error instanceof Error ? error.message : "Unknown SMTP error";
      this.logger.error(`Failed to send email to ${options.to}: ${msg}`);
      throw new Error(`SMTP send failed: ${msg}`, { cause: error });
    }

    if (info.rejected?.length) {
      this.logger.error(`SMTP rejected recipient ${options.to}`);
      throw new Error(`SMTP send failed: recipient rejected (${options.to})`);
    }

    if (!info.messageId) {
      throw new Error("SMTP returned no error but missing message ID");
    }

    this.logger.log(`Email sent successfully to ${options.to} (id: ${info.messageId})`);
    return { id: info.messageId };
  }

  /** Gmail ghi đè from thành chính tài khoản đăng nhập; Resend/SES cần from thuộc domain đã xác minh. */
  private resolveFrom(): string {
    if (this.env.SMTP_FROM) return this.env.SMTP_FROM;
    if (this.env.SMTP_USER) return `FilmBooking <${this.env.SMTP_USER}>`;
    return "FilmBooking <no-reply@filmbooking.local>";
  }

  /**
   * Render template từ kind + payload và gửi email.
   */
  async sendOutboxEmail(
    to: string,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; rendered: RenderedEmail }> {
    const rendered = renderTemplate(kind, payload);
    const result = await this.sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    return { id: result.id, rendered };
  }
}
