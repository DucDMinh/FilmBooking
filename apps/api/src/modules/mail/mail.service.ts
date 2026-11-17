import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import QRCode from "qrcode";
import { ENV, type Env } from "../../config/env";
import { extractTicketQrToken, renderTemplate, type RenderedEmail } from "./templates";

/** Injection token cho transport gửi mail (SMTP); cho phép mock linh hoạt trong test. */
export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

/** Ảnh đính kèm inline (nodemailer: `cid` -> HTML tham chiếu bằng `<img src="cid:...">`). */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
}

/** Phần tối thiểu của nodemailer Transporter mà MailService dùng, để test không phụ thuộc nodemailer. */
export interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: MailAttachment[];
  }): Promise<{ messageId: string; rejected?: unknown[] }>;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  attachments?: MailAttachment[];
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
        ...(options.attachments ? { attachments: options.attachments } : {}),
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
   * Mail vé kèm MỘT ảnh QR (PNG inline) của cả đơn để staff quét; tạo ảnh lỗi thì mail chỉ có chữ qr_token.
   */
  async sendOutboxEmail(
    to: string,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; rendered: RenderedEmail }> {
    const token = extractTicketQrToken(kind, payload);
    const qrImage = token ? await this.buildOrderQrAttachment(token) : null;
    const rendered = renderTemplate(kind, payload, qrImage ? { qrImageCid: qrImage.cid } : {});

    const result = await this.sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...(qrImage ? { attachments: [qrImage] } : {}),
    });
    return { id: result.id, rendered };
  }

  /**
   * PNG của QR đơn = nguyên chuỗi orders.qr_token, mức sửa lỗi M (khớp trang vé web và máy quét staff).
   * Content-ID `ticket-qr`: Gmail/Outlook chặn `data:` URI nên dùng đính kèm inline.
   * Trả null khi tạo ảnh lỗi; KHÔNG log token (credential vào rạp).
   */
  private async buildOrderQrAttachment(token: string): Promise<MailAttachment | null> {
    try {
      const content = await QRCode.toBuffer(token, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 440,
      });
      return { filename: "ve-qr.png", content, cid: "ticket-qr", contentType: "image/png" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(`Không tạo được ảnh QR của đơn trong mail vé, chỉ gửi chữ: ${msg}`);
      return null;
    }
  }
}
