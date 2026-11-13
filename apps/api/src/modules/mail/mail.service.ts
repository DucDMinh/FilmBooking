import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Resend } from "resend";
import { ENV, type Env } from "../../config/env";
import { renderTemplate, type RenderedEmail } from "./templates";

/** Injection token cho Resend instance (cho phép mock linh hoạt trong test). */
export const RESEND_CLIENT = Symbol("RESEND_CLIENT");

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
  private readonly defaultFrom = "FilmBooking <onboarding@resend.dev>";

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() @Inject(RESEND_CLIENT) private readonly resend?: Resend | null,
  ) {}

  /**
   * Gửi email trực tiếp qua Resend API.
   * Ném Error nếu gửi thất bại hoặc chưa cấu hình Resend (để outbox worker ghi nhận last_error và retry).
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const from = options.from ?? this.defaultFrom;

    if (!this.resend) {
      if (this.env.NODE_ENV === "test") {
        this.logger.debug(`[TEST] Mock sendEmail to=${options.to} subject="${options.subject}"`);
        return { id: `mock-email-${Date.now()}` };
      }
      throw new Error("Resend API key is not configured");
    }

    const { data, error } = await this.resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      const msg = error.message || "Unknown Resend error";
      this.logger.error(`Failed to send email to ${options.to}: ${msg}`);
      throw new Error(`Resend send failed: ${msg}`);
    }

    if (!data?.id) {
      throw new Error("Resend returned no error but missing message ID");
    }

    this.logger.log(`Email sent successfully to ${options.to} (id: ${data.id})`);
    return { id: data.id };
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
