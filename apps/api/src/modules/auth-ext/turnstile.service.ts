import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

/** Xác minh token Cloudflare Turnstile (R-07). Fail-closed: thiếu secret/token/lỗi mạng -> false. */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    const secret = this.env.TURNSTILE_SECRET_KEY;
    if (!token) return false;
    if (!secret) {
      this.logger.error("TURNSTILE_SECRET_KEY is not configured; rejecting captcha");
      return false;
    }
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set("remoteip", remoteIp);
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    } catch (error) {
      this.logger.warn(`Turnstile verification failed: ${error instanceof Error ? error.message : "unknown"}`);
      return false;
    }
  }
}
