import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import { createHash, timingSafeEqual } from "node:crypto";
import { ENV, type Env } from "../../config/env";
import { AppException } from "../errors/app-exception";

// Băm SHA-256 trước khi so để hai buffer luôn cùng độ dài (timingSafeEqual yêu cầu) và không lộ độ dài secret.
const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Bảo vệ /jobs bằng header `x-job-secret`. Chưa cấu hình JOB_SECRET -> luôn 401 (fail-closed). */
@Injectable()
export class JobSecretGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const headers = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>().headers;
    const header = headers["x-job-secret"];
    const provided = typeof header === "string" ? header : "";
    const expected = this.env.JOB_SECRET;
    if (!expected || !provided || !timingSafeEqual(digest(provided), digest(expected))) {
      throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Invalid job secret");
    }
    return true;
  }
}
