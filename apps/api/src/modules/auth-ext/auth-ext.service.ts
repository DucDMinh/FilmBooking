/**
 * Auth mở rộng chạy trên Nest: đăng ký / đăng nhập / gửi lại xác nhận / quên + đặt lại mật khẩu.
 * Đây là đường CHUẨN áp dụng đủ Turnstile (R-07), rate limit (R-08), khoá 5 lần (R-11), chặn disposable (R-09).
 *
 * RỦI RO ĐÃ CHẤP NHẬN (quyết định G6, bản demo): client vẫn gọi thẳng GoTrue được bằng anon key
 * (signInWithPassword, recover/resetPasswordForEmail) nên đường đó BỎ QUA lockout / rate limit /
 * Turnstile của Nest. Signup trực tiếp đã bị hook `before_user_created` chặn. KHÔNG thêm biện pháp
 * chặn ở task này; xem docs/dev-setup.md mục "Rủi ro đã chấp nhận".
 *
 * Ràng buộc với GoTrue: user tạo bằng Admin API `createUser` kèm `app_metadata.created_via='nest'`
 * (hook yêu cầu); KHÔNG dùng inviteUserByEmail / generateLink({type:'signup'}). Email xác nhận gửi bằng
 * `auth.resend({type:'signup'})`.
 */
import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ERROR_CODES } from "@filmbooking/shared";
import type {
  AuthNeutralResponse,
  AuthSessionResponse,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendConfirmationInput,
  ResetPasswordInput,
} from "@filmbooking/shared/schemas/auth";
import { PASSWORD_ISSUE_MESSAGES, checkPasswordPolicy } from "@filmbooking/shared/password-policy";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { AppException } from "../../common/errors/app-exception";
import { TurnstileService } from "./turnstile.service";

/** Client GoTrue dùng ANON key, không lưu phiên: dùng cho signIn / resend / recover. */
export const SUPABASE_ANON_CLIENT = Symbol("SUPABASE_ANON_CLIENT");

const HOUR = 3600;
const LOCK_MINUTES = 15;
const CAPTCHA_AFTER_FAILURES = 3;
/** Link khôi phục chỉ hợp lệ 1 giờ (R-13) dù otp_expiry của GoTrue là 24h (quyết định G5 = C). */
const RECOVERY_MAX_AGE_MS = HOUR * 1000;
const NEUTRAL: AuthNeutralResponse = { status: "CHECK_EMAIL" };

/** 422 + lý do cụ thể; catalog chỉ có VALIDATION_ERROR=400 nên ghi đè status. */
class WeakPasswordException extends AppException {
  constructor(reasons: string[]) {
    super(ERROR_CODES.VALIDATION_ERROR, "Mật khẩu không đáp ứng chính sách", { reasons });
  }
  override getStatus(): number {
    return 422;
  }
}

interface LoginFailureRow {
  is_locked: boolean;
  locked_until: string | null;
  failed_count: number;
}

const emailKey = (email: string): string => createHash("sha256").update(email).digest("hex").slice(0, 32);
const errorCode = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;
const errorStatus = (error: unknown): number | undefined => (error as { status?: number } | null)?.status;

@Injectable()
export class AuthExtService {
  private readonly logger = new Logger(AuthExtService.name);

  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
    @Inject(SUPABASE_ANON_CLIENT) private readonly anon: SupabaseClient,
  ) {}

  async register(input: RegisterInput, ip: string | undefined): Promise<AuthNeutralResponse> {
    await this.rateLimit(`register:ip:${ip ?? "unknown"}`, HOUR, 5);
    await this.requireCaptcha(input.captchaToken, ip);
    const termsVersion = await this.requireConsent(input);
    this.requireStrongPassword(input.password);
    const admin = this.supabase.admin();
    const disposable = await admin.rpc("is_disposable_email", { p_email: input.email });
    if (disposable.error) throw disposable.error;
    if (disposable.data === true) {
      throw new AppException(ERROR_CODES.DISPOSABLE_EMAIL, "Email dùng một lần không được chấp nhận");
    }

    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
      app_metadata: { created_via: "nest" },
      user_metadata: input.fullName ? { full_name: input.fullName } : {},
    });
    if (created.error) {
      // R-12: email đã tồn tại -> cùng phản hồi như thành công, không tạo user mới, không gửi mail.
      if (errorCode(created.error) === "email_exists") return NEUTRAL;
      throw created.error;
    }
    await this.recordConsentOrRollback(created.data.user.id, termsVersion);
    await this.sendConfirmation(input.email);
    return NEUTRAL;
  }

  async login(input: LoginInput, ip: string | undefined): Promise<AuthSessionResponse> {
    await this.rateLimit(`login:ip:${ip ?? "unknown"}`, 60, 10);
    const admin = this.supabase.admin();
    const locked = await admin.rpc("is_login_locked", { p_email: input.email });
    if (locked.error) throw locked.error;
    if (locked.data === true) throw this.lockedError();

    const captchaRequired = (await this.failedCount(input.email)) >= CAPTCHA_AFTER_FAILURES;
    if (captchaRequired && !(await this.turnstile.verify(input.captchaToken, ip))) {
      throw new AppException(ERROR_CODES.CAPTCHA_FAILED, "Vui lòng xác minh CAPTCHA", { captchaRequired: true });
    }

    const { data, error } = await this.anon.auth.signInWithPassword({ email: input.email, password: input.password });
    if (!error && data.session) {
      await admin.rpc("clear_login_failures", { p_email: input.email });
      const { session, user } = data;
      return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in,
        expiresAt: session.expires_at ?? null,
        tokenType: session.token_type,
        user: { id: user.id, email: user.email ?? null },
      };
    }
    if (errorCode(error) === "email_not_confirmed") {
      throw new AppException(ERROR_CODES.EMAIL_NOT_CONFIRMED, "Vui lòng xác nhận email trước khi đăng nhập");
    }
    const status = errorStatus(error);
    if (!status || status >= 500) throw error ?? new Error("signInWithPassword returned no session");
    return this.rejectBadCredentials(input.email);
  }

  async resendConfirmation(input: ResendConfirmationInput, ip: string | undefined): Promise<AuthNeutralResponse> {
    await this.rateLimit(`resend:ip:${ip ?? "unknown"}`, HOUR, 20);
    const key = emailKey(input.email);
    await this.rateLimit(`resend:cooldown:${key}`, 60, 1); // R-06: cách nhau tối thiểu 60 giây
    await this.rateLimit(`resend:hour:${key}`, HOUR, 5); // R-06: tối đa 5 lần/giờ
    await this.sendConfirmation(input.email);
    return NEUTRAL;
  }

  async forgotPassword(input: ForgotPasswordInput, ip: string | undefined): Promise<AuthNeutralResponse> {
    await this.rateLimit(`forgot:ip:${ip ?? "unknown"}`, HOUR, 10);
    await this.requireCaptcha(input.captchaToken, ip);
    await this.rateLimit(`forgot:email:${emailKey(input.email)}`, HOUR, 5);
    const { error } = await this.anon.auth.resetPasswordForEmail(input.email);
    // R-12: lỗi từ GoTrue (email không tồn tại, SMTP...) không được lộ ra client.
    if (error) this.logger.warn(`resetPasswordForEmail failed: ${error.message}`);
    return NEUTRAL;
  }

  async resetPassword(input: ResetPasswordInput, ip: string | undefined): Promise<{ status: "PASSWORD_UPDATED" }> {
    await this.rateLimit(`reset:ip:${ip ?? "unknown"}`, HOUR, 10);
    this.requireStrongPassword(input.newPassword);
    const auth = this.supabase.admin().auth;
    const caller = await auth.getUser(input.accessToken);
    if (caller.error || !caller.data.user) {
      throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Phiên khôi phục không hợp lệ hoặc đã hết hạn");
    }
    const userId = caller.data.user.id;
    // recovery_sent_at là nguồn tin cậy (admin API), không lấy từ JWT/claim do client kiểm soát.
    const record = await auth.admin.getUserById(userId);
    if (record.error || !record.data.user) throw record.error ?? new Error("user not found");
    const sentAt = Date.parse(record.data.user.recovery_sent_at ?? "");
    if (Number.isNaN(sentAt) || Date.now() - sentAt > RECOVERY_MAX_AGE_MS) {
      throw new AppException(
        ERROR_CODES.UNAUTHENTICATED,
        "Liên kết đặt lại mật khẩu đã hết hạn (quá 1 giờ). Vui lòng yêu cầu gửi lại.",
        {
          reason: "RECOVERY_LINK_EXPIRED",
          action: "Gửi lại email đặt lại mật khẩu (POST /auth/forgot-password)",
        },
      );
    }
    const updated = await auth.admin.updateUserById(userId, { password: input.newPassword });
    if (updated.error) throw updated.error;
    // R-13: đăng xuất mọi phiên khác. Phiên khôi phục hiện tại được giữ.
    const signOut = await auth.admin.signOut(input.accessToken, "others");
    if (signOut.error) this.logger.warn(`signOut(others) failed: ${signOut.error.message}`);
    return { status: "PASSWORD_UPDATED" };
  }

  /**
   * Tạo tài khoản nhân sự (R-17): KHÔNG có endpoint công khai; chỉ module admin đã kiểm quyền mới gọi.
   * `email_confirm: true` vì nhân sự do Admin/Manager tạo, không qua email xác nhận.
   */
  async createStaffAccount(email: string, password: string): Promise<{ userId: string }> {
    this.requireStrongPassword(password);
    const created = await this.supabase.admin().auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      app_metadata: { created_via: "nest" },
    });
    if (created.error) throw created.error;
    return { userId: created.data.user.id };
  }

  private async rejectBadCredentials(email: string): Promise<never> {
    const admin = this.supabase.admin();
    const failure = await admin.rpc("register_login_failure", { p_email: email });
    if (failure.error) throw failure.error;
    const row = (failure.data as LoginFailureRow[] | null)?.[0];
    if (row?.is_locked) {
      // Chuyển trạng thái sang khoá: báo chủ tài khoản (R-11). Lỗi enqueue không được làm hỏng phản hồi.
      const outbox = await admin.from("email_outbox").insert({
        kind: "ACCOUNT_LOCKED_ALERT",
        to_email: email,
        payload: { lockedUntil: row.locked_until, lockMinutes: LOCK_MINUTES },
      });
      if (outbox.error) this.logger.error(`enqueue lock alert failed: ${outbox.error.message}`);
      throw this.lockedError();
    }
    throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Email hoặc mật khẩu không đúng", {
      captchaRequired: (row?.failed_count ?? 0) >= CAPTCHA_AFTER_FAILURES,
    });
  }

  private lockedError(): AppException {
    return new AppException(
      ERROR_CODES.ACCOUNT_LOCKED,
      `Đăng nhập bị khoá ${LOCK_MINUTES} phút do nhập sai mật khẩu nhiều lần`,
      { lockMinutes: LOCK_MINUTES },
    );
  }

  private async failedCount(email: string): Promise<number> {
    const { data, error } = await this.supabase
      .admin()
      .from("login_attempts")
      .select("failed_count")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    return (data as { failed_count: number } | null)?.failed_count ?? 0;
  }

  private async requireCaptcha(token: string | undefined, ip: string | undefined): Promise<void> {
    if (!(await this.turnstile.verify(token, ip))) {
      throw new AppException(ERROR_CODES.CAPTCHA_FAILED, "Xác minh CAPTCHA không thành công");
    }
  }

  private requireStrongPassword(password: string): void {
    const issues = checkPasswordPolicy(password);
    if (issues.length > 0) throw new WeakPasswordException(issues.map((issue) => PASSWORD_ISSUE_MESSAGES[issue]));
  }

  /** R-03: phải tick đồng ý và đúng phiên bản hiện hành. Trả về phiên bản để lưu consent. */
  private async requireConsent(input: RegisterInput): Promise<string> {
    if (!input.acceptTerms) {
      throw new AppException(ERROR_CODES.CONSENT_REQUIRED, "Bạn phải đồng ý Điều khoản sử dụng và Chính sách bảo mật");
    }
    const { data, error } = await this.supabase
      .admin()
      .from("app_settings")
      .select("value")
      .eq("key", "terms_version")
      .maybeSingle();
    const current = (data as { value?: unknown } | null)?.value;
    if (error || typeof current !== "string") throw error ?? new Error("app_settings.terms_version missing");
    if (input.termsVersion && input.termsVersion !== current) {
      throw new AppException(ERROR_CODES.CONSENT_REQUIRED, "Điều khoản đã được cập nhật, vui lòng đọc và đồng ý lại", {
        currentVersion: current,
      });
    }
    return current;
  }

  private async recordConsentOrRollback(userId: string, version: string): Promise<void> {
    const admin = this.supabase.admin();
    const { error } = await admin.from("consents").insert([
      { user_id: userId, consent_type: "TERMS_OF_SERVICE", version, metadata: { source: "register" } },
      { user_id: userId, consent_type: "PRIVACY_POLICY", version, metadata: { source: "register" } },
    ]);
    if (!error) return;
    // Không để lại user thiếu bằng chứng đồng ý.
    const rollback = await admin.auth.admin.deleteUser(userId);
    if (rollback.error) this.logger.error(`rollback deleteUser failed for ${userId}: ${rollback.error.message}`);
    throw error;
  }

  /** Gửi (lại) email xác nhận. Lỗi GoTrue chỉ log để không lộ email tồn tại (R-12). */
  private async sendConfirmation(email: string): Promise<void> {
    const { error } = await this.anon.auth.resend({ type: "signup", email });
    if (error) this.logger.warn(`confirmation email failed: ${error.message}`);
  }

  /** hit_rate_limit: true = còn lượt. Quá ngưỡng -> 429 kèm `retryAfter` (giây). */
  private async rateLimit(key: string, windowSeconds: number, max: number): Promise<void> {
    const admin = this.supabase.admin();
    const hit = await admin.rpc("hit_rate_limit", { p_key: key, p_window: `${windowSeconds} seconds`, p_max: max });
    if (hit.error) throw hit.error;
    if (hit.data !== false) return;
    const bucket = await admin.from("rate_limit_buckets").select("window_start").eq("key", key).maybeSingle();
    const start = Date.parse((bucket.data as { window_start?: string } | null)?.window_start ?? "");
    const remaining = Number.isNaN(start) ? windowSeconds : windowSeconds - Math.floor((Date.now() - start) / 1000);
    throw new AppException(ERROR_CODES.RATE_LIMITED, "Thao tác quá nhanh, vui lòng thử lại sau", {
      retryAfter: Math.min(windowSeconds, Math.max(1, remaining)),
    });
  }
}
