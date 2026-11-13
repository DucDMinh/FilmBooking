import { Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import { createLinkIntentInputSchema, type CreateLinkIntentInput } from "@filmbooking/shared/schemas/identity";
import type { MeResponse } from "@filmbooking/shared/schemas/me";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SupabaseService } from "../../common/supabase/supabase.service";

/** Re-auth gần đây để tạo link-intent: phiên phải đăng nhập thật trong vòng 5 phút (quyết định user). */
const REAUTH_MAX_AGE_SECONDS = 5 * 60;
/** Thời hạn link-intent: 10 phút (quyết định user; trùng default `expires_at` của bảng). */
const LINK_INTENT_TTL_MS = 10 * 60 * 1000;

@Controller("me")
export class MeController {
  constructor(
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
  ) {}

  /** Hồ sơ + vai trò + rạp được gán. Không log `request.user` (chứa JWT thô). */
  @Get()
  async me(@Req() request: AuthenticatedRequest): Promise<MeResponse> {
    const [access, emailConfirmed] = await Promise.all([
      this.access.loadForRequest(request),
      this.access.isEmailConfirmed(request),
    ]);
    return {
      id: request.user.id,
      email: request.user.email,
      emailConfirmed,
      isAdmin: access.isAdmin,
      cinemas: [...access.cinemaRoles].map(([cinemaId, role]) => ({ cinemaId, role })),
    };
  }

  /**
   * Tạo link-intent cho liên kết MXH thủ công (R-20, AC-04, M-05).
   * Bắt buộc người dùng đã re-auth gần đây (≤ REAUTH_MAX_AGE_SECONDS, tính từ amr của phiên).
   * TTL của intent là 10 phút.
   */
  @Post("identities/link-intent")
  @HttpCode(204)
  async createLinkIntent(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createLinkIntentInputSchema)) body: CreateLinkIntentInput,
  ): Promise<void> {
    const user = request.user;
    const nowSec = Math.floor(Date.now() / 1000);
    // authTime null (JWT không có amr hợp lệ) -> fail-closed.
    if (user.authTime === null || nowSec - user.authTime > REAUTH_MAX_AGE_SECONDS) {
      throw new AppException(ERROR_CODES.REAUTH_REQUIRED, "Vui lòng đăng nhập lại để liên kết tài khoản");
    }

    const expiresAt = new Date(Date.now() + LINK_INTENT_TTL_MS).toISOString();
    const { error } = await this.supabase.admin().from("identity_link_intents").insert({
      user_id: user.id,
      provider: body.provider,
      expires_at: expiresAt,
    });

    if (error) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, "Không thể tạo yêu cầu liên kết tài khoản");
    }
  }
}
