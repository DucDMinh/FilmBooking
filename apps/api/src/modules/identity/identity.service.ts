/**
 * Spike Report: Supabase GoTrue Auto-Linking & Two-Layer Defense Architecture
 * ---------------------------------------------------------------------------
 * 1. Spike Issue (AC-04):
 *    Mặc định, Supabase GoTrue khi nhận luồng OAuth (Google/Facebook) có email trùng
 *    với một user đã tồn tại (đăng ký qua email/mật khẩu) có xu hướng tự động gộp
 *    (auto-link) identity OAuth vào tài khoản đó nếu email đã được nhà cung cấp OAuth xác nhận.
 *    Điều này vi phạm AC-04: "Google a@x.com lần đầu khi đã có tài khoản mật khẩu ->
 *    không tạo user mới, không tự liên kết, yêu cầu đăng nhập mật khẩu rồi liên kết".
 *
 * 2. Giải pháp 2 lớp (Two-Layer Defense):
 *    - Lớp 1 (Database Trigger Guard - trg_guard_identity_insert):
 *      Hook BEFORE INSERT ON auth.identities chặn GoTrue tự động insert identity mới nếu:
 *      (a) User đích đã có mật khẩu hoặc identity 'email' và không có cờ phiên
 *          `app.allow_identity_link = 'true'` -> ném ngoại lệ OAUTH_AUTO_MERGE_BLOCKED (23514).
 *      (b) Email OAuth trùng với tài khoản khác đã có -> ném OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED (23514).
 *      (c) Provider + provider_id đã thuộc user khác (R-23) -> ném OAUTH_IDENTITY_ALREADY_LINKED (23505).
 *      Chỉ RPC chủ động `link_user_identity` (sau khi user đã đăng nhập) mới set cờ phiên cho phép insert.
 *
 *    - Lớp 2 (API Callback Collision Guard - POST /auth/oauth/callback-check):
 *      Trước khi frontend hoàn tất đổi code lấy session, API check_oauth_collision được gọi
 *      để phát hiện xung đột email / identity và trả về mã lỗi CONFLICT_EMAIL hoặc CONFLICT_IDENTITY
 *      cho giao diện hiển thị thông báo hướng dẫn user đăng nhập bằng mật khẩu.
 */

import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type {
  AddPasswordInput,
  IdentityListResponse,
  LinkIdentityInput,
  MissingEmailOAuthInput,
  OAuthCallbackVerifyInput,
} from "@filmbooking/shared/schemas/identity";
import { checkPasswordPolicy, PASSWORD_ISSUE_MESSAGES } from "@filmbooking/shared/password-policy";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import type { AuthUser } from "../../common/auth/decorators";

const emailKey = (email: string): string => createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32);

@Injectable()
export class IdentityService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /**
   * GET /me/identities (R-21)
   * Trả danh sách identities, cờ hasPassword và canUnlink
   */
  async getIdentities(user: AuthUser): Promise<IdentityListResponse> {
    const admin = this.supabase.admin();
    const { data, error } = await admin.rpc("get_user_identities", { p_user_id: user.id });
    if (error) throw error;
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy thông tin định danh");

    return {
      identities: (data.identities ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ""),
        provider: String(row.provider ?? ""),
        providerId: String(row.providerId ?? row.provider_id ?? ""),
        email: (row.email as string | null) ?? null,
        createdAt: (row.createdAt ?? row.created_at ?? null) as string | null,
        lastSignInAt: (row.lastSignInAt ?? row.last_sign_in_at ?? null) as string | null,
      })),
      hasPassword: Boolean(data.hasPassword),
      canUnlink: Boolean(data.canUnlink),
      totalMethods: Number(data.totalMethods ?? 0),
    };
  }

  /**
   * POST /me/identities/link (R-21, R-23)
   * Liên kết phương thức mạng xã hội vào tài khoản hiện tại.
   * Chặn nếu MXH đã thuộc về người dùng khác (R-23).
   */
  async linkIdentity(user: AuthUser, input: LinkIdentityInput): Promise<{ success: boolean; provider: string }> {
    const admin = this.supabase.admin();
    const { error } = await admin.rpc("link_user_identity", {
      p_user_id: user.id,
      p_provider: input.provider,
      p_provider_id: input.providerId,
      p_identity_data: input.identityData ?? {},
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "23505" || msg.includes("IDENTITY_ALREADY_LINKED") || msg.includes("da duoc lien ket")) {
        throw new AppException(ERROR_CODES.CONFLICT, "Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác.", {
          code: "IDENTITY_ALREADY_LINKED",
        });
      }
      throw error;
    }

    return { success: true, provider: input.provider };
  }

  /**
   * DELETE /me/identities/:provider (R-21, AC-05)
   * Huỷ liên kết 1 phương thức. Từ chối nếu là phương thức cuối cùng (AC-05).
   * Từ chối nếu huỷ phương thức 'email'.
   */
  async unlinkIdentity(user: AuthUser, provider: string): Promise<{ success: boolean; unlinkedProvider: string }> {
    const admin = this.supabase.admin();
    const { error } = await admin.rpc("unlink_user_identity", {
      p_user_id: user.id,
      p_provider: provider,
    });

    if (error) {
      const msg = error.message ?? "";
      if (error.code === "22023" || msg.includes("INVALID_OPERATION")) {
        throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Không thể huỷ phương thức email/mật khẩu qua API này.");
      }
      if (error.code === "23514" || msg.includes("LAST_LOGIN_METHOD")) {
        throw new AppException(
          ERROR_CODES.CONFLICT,
          "Không thể huỷ phương thức đăng nhập cuối cùng. Vui lòng thêm mật khẩu hoặc liên kết phương thức khác trước khi huỷ.",
          { code: "LAST_LOGIN_METHOD" },
        );
      }
      if (error.code === "P0002" || msg.includes("NOT_FOUND")) {
        throw new AppException(ERROR_CODES.NOT_FOUND, "Phương thức đăng nhập không tồn tại trên tài khoản của bạn.");
      }
      throw error;
    }

    return { success: true, unlinkedProvider: provider };
  }

  /**
   * POST /me/password (R-22)
   * Đặt mật khẩu lần đầu cho tài khoản OAuth.
   * Từ chối nếu tài khoản đã có mật khẩu (PASSWORD_ALREADY_SET).
   */
  async addPassword(user: AuthUser, input: AddPasswordInput): Promise<{ success: boolean; message: string }> {
    const info = await this.getIdentities(user);
    if (info.hasPassword) {
      throw new AppException(
        ERROR_CODES.CONFLICT,
        "Tài khoản đã có mật khẩu. Vui lòng sử dụng chức năng đổi mật khẩu.",
        { code: "PASSWORD_ALREADY_SET" },
      );
    }

    const issues = checkPasswordPolicy(input.password);
    if (issues.length > 0) {
      const reasons = issues.map((i) => PASSWORD_ISSUE_MESSAGES[i]);
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Mật khẩu không đáp ứng chính sách bảo mật", { reasons });
    }

    const admin = this.supabase.admin();
    const updateRes = await admin.auth.admin.updateUserById(user.id, { password: input.password });
    if (updateRes.error) throw updateRes.error;

    const markRes = await admin.rpc("mark_password_set", { p_user_id: user.id });
    if (markRes.error) throw markRes.error;

    if (user.email) {
      await admin.from("email_outbox").insert({
        kind: "password_set",
        to_email: user.email,
        payload: {
          template: "password_set",
          user_id: user.id,
          message: "Tài khoản của bạn đã được thiết lập mật khẩu thành công.",
        },
        status: "PENDING",
      });
    }

    return { success: true, message: "Thiết lập mật khẩu thành công." };
  }

  /**
   * POST /auth/oauth/missing-email (R-21, #18)
   * Facebook không trả về email.
   * Luôn trả về phản hồi thành công chung để bảo vệ chống dò email.
   */
  async handleMissingEmail(
    input: MissingEmailOAuthInput,
    ip: string | undefined,
  ): Promise<{ status: "CHECK_EMAIL"; message: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const key = emailKey(normalizedEmail);

    await this.rateLimit(`oauth:missing-email:ip:${ip ?? "unknown"}`, 3600, 10);
    await this.rateLimit(`oauth:missing-email:email:${key}`, 3600, 5);

    const admin = this.supabase.admin();
    const disposable = await admin.rpc("is_disposable_email", { p_email: normalizedEmail });
    if (disposable.error) throw disposable.error;
    if (disposable.data === true) {
      throw new AppException(ERROR_CODES.DISPOSABLE_EMAIL, "Email dùng một lần không được chấp nhận");
    }

    const { data: existingUser, error: findError } = await admin
      .from("profiles")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (findError) throw findError;

    if (existingUser) {
      await this.handleExistingEmailCollision(normalizedEmail, existingUser.id, input.provider);
    } else {
      await this.createMissingEmailVerification(normalizedEmail, input);
    }

    return {
      status: "CHECK_EMAIL",
      message: "Vui lòng kiểm tra hộp thư email của bạn để hoàn tất xác thực.",
    };
  }

  private async handleExistingEmailCollision(email: string, userId: string, provider: string): Promise<void> {
    await this.supabase.admin().from("email_outbox").insert({
      kind: "oauth_missing_email_collision",
      to_email: email,
      payload: {
        template: "oauth_missing_email_collision",
        provider,
        user_id: userId,
        message: "Email này đã được sử dụng. Vui lòng đăng nhập bằng mật khẩu rồi vào Hồ sơ để liên kết Facebook.",
      },
      status: "PENDING",
    });
  }

  private async createMissingEmailVerification(email: string, input: MissingEmailOAuthInput): Promise<void> {
    const admin = this.supabase.admin();
    const token = randomUUID();
    await admin.from("oauth_missing_email_requests").insert({
      provider: input.provider,
      provider_access_token: input.providerAccessToken ?? null,
      oauth_state_token: input.oauthStateToken ?? null,
      email,
      verification_token: token,
    });

    await admin.from("email_outbox").insert({
      kind: "oauth_missing_email_verify",
      to_email: email,
      payload: {
        template: "oauth_missing_email_verify",
        provider: input.provider,
        token,
        message: "Vui lòng bấm vào liên kết để xác thực email của bạn trước khi hoàn tất đăng ký bằng Facebook.",
      },
      status: "PENDING",
    });
  }

  /**
   * POST /auth/oauth/callback-check (AC-04 Guard)
   * Kiểm tra va chạm cho user ĐÃ đăng nhập (R-12: không còn public, không dò email người khác).
   * Luôn dùng id từ JWT; bỏ qua authenticatedUserId/email do client gửi để không bật nhánh dò email.
   */
  async checkOAuthCallback(
    user: AuthUser,
    input: OAuthCallbackVerifyInput,
  ): Promise<{ ok: boolean; action: "PROCEED" }> {
    const admin = this.supabase.admin();
    const { data, error } = await admin.rpc("check_oauth_collision", {
      p_provider: input.provider,
      p_provider_id: input.providerId,
      p_email: user.email ?? "",
      p_authenticated_user_id: user.id,
    });

    if (error) throw error;

    if (data?.status === "CONFLICT_IDENTITY" || data?.code === "IDENTITY_ALREADY_LINKED") {
      throw new AppException(ERROR_CODES.CONFLICT, data.message ?? "Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác.", {
        code: "IDENTITY_ALREADY_LINKED",
      });
    }

    if (data?.status === "CONFLICT_EMAIL" || data?.code === "OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED") {
      throw new AppException(ERROR_CODES.CONFLICT, data.message ?? "Email này đã có tài khoản — hãy đăng nhập bằng mật khẩu để liên kết.", {
        code: "OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED",
      });
    }

    return { ok: true, action: "PROCEED" };
  }

  private async rateLimit(key: string, windowSeconds: number, max: number): Promise<void> {
    const { data, error } = await this.supabase.admin().rpc("hit_rate_limit", {
      p_key: key,
      p_window: `${windowSeconds} seconds`,
      p_max: max,
    });
    if (error) throw error;
    if (data !== true) {
      throw new AppException(ERROR_CODES.RATE_LIMITED, "Quá nhiều yêu cầu. Vui lòng thử lại sau.");
    }
  }
}
