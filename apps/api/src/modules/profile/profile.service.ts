import { HttpException, Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type { AvatarUploadInput, DeleteAccountInput, UpdateProfileInput } from "@filmbooking/shared/schemas/profile";
import { randomUUID } from "node:crypto";
import { decodeJwt } from "jose";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import type { AuthUser } from "../../common/auth/decorators";
import { ENV, type Env } from "../../config/env";

const PROFILE_COLUMNS =
  "id, email, full_name, phone, date_of_birth, gender, avatar_url, marketing_opt_in, province_id, created_at, updated_at";
const AVATAR_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** Tài khoản chỉ OAuth: token phải được cấp trong ngần này giây mới coi là "vừa đăng nhập lại". */
const RECENT_LOGIN_SECONDS = 5 * 60;
const FK_VIOLATION = "23503";

/** 422 theo acceptance criteria (ZodValidationPipe mặc định trả 400); filter map về VALIDATION_ERROR. */
export function unprocessable(message: string): HttpException {
  return new HttpException(message, 422);
}

/** Theo R-26..R-31, R-35: mọi thao tác dữ liệu của khách đi qua `forUser(jwt)` nên RLS chặn sửa hồ sơ người khác. */
@Injectable()
export class ProfileService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async getProfile(user: AuthUser) {
    const db = this.supabase.forUser(user.jwt);
    const [profile, favorites] = await Promise.all([
      db.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle(),
      db.from("favorite_cinemas").select("cinema_id").eq("user_id", user.id),
    ]);
    if (profile.error) throw profile.error;
    if (favorites.error) throw favorites.error;
    if (!profile.data) throw new AppException(ERROR_CODES.NOT_FOUND, "Profile not found");
    return { ...profile.data, favorite_cinema_ids: (favorites.data ?? []).map((row) => row.cinema_id as string) };
  }

  updateProfile(user: AuthUser, input: UpdateProfileInput) {
    const patch: Record<string, unknown> = {};
    if (input.fullName !== undefined) patch.full_name = input.fullName;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.dateOfBirth !== undefined) patch.date_of_birth = input.dateOfBirth;
    if (input.gender !== undefined) patch.gender = input.gender;
    if (input.avatarUrl !== undefined) {
      if (input.avatarUrl !== null) this.assertOwnAvatarUrl(user.id, input.avatarUrl);
      patch.avatar_url = input.avatarUrl;
    }
    return this.updateOwnProfile(user, patch);
  }

  updatePreferences(user: AuthUser, marketingOptIn: boolean) {
    return this.updateOwnProfile(user, { marketing_opt_in: marketingOptIn });
  }

  async updateProvince(user: AuthUser, provinceId: string | null) {
    try {
      return await this.updateOwnProfile(user, { province_id: provinceId });
    } catch (error) {
      if ((error as { code?: string }).code === FK_VIOLATION) {
        throw new AppException(ERROR_CODES.NOT_FOUND, "Province not found");
      }
      throw error;
    }
  }

  async addFavorite(user: AuthUser, cinemaId: string) {
    const { error } = await this.supabase
      .forUser(user.jwt)
      .from("favorite_cinemas")
      .upsert({ user_id: user.id, cinema_id: cinemaId }, { onConflict: "user_id,cinema_id", ignoreDuplicates: true });
    if (error?.code === FK_VIOLATION) throw new AppException(ERROR_CODES.NOT_FOUND, "Cinema not found");
    if (error) throw error;
    return { cinemaId, favorite: true };
  }

  async removeFavorite(user: AuthUser, cinemaId: string) {
    const { error } = await this.supabase
      .forUser(user.jwt)
      .from("favorite_cinemas")
      .delete()
      .eq("user_id", user.id)
      .eq("cinema_id", cinemaId);
    if (error) throw error;
    return { cinemaId, favorite: false };
  }

  /**
   * R-27: Supabase gửi link xác nhận tới email mới; email chỉ đổi sau khi xác nhận (và báo email cũ
   * khi project bật "Secure email change"). Gọi GoTrue `PUT /auth/v1/user` bằng JWT của chính user.
   */
  async requestEmailChange(user: AuthUser, newEmail: string) {
    const normalized = newEmail.trim().toLowerCase();
    if (normalized === user.email?.toLowerCase()) {
      throw new AppException(ERROR_CODES.CONFLICT, "New email equals current email");
    }
    const disposable = await this.supabase.admin().rpc("is_disposable_email", { p_email: normalized });
    if (disposable.error) throw disposable.error;
    if (disposable.data === true) throw new AppException(ERROR_CODES.DISPOSABLE_EMAIL, "Disposable email is not allowed");

    const response = await fetch(`${this.env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: this.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${user.jwt}`,
      },
      body: JSON.stringify({ email: normalized }),
    });
    if (response.status === 422 || response.status === 409) {
      throw new AppException(ERROR_CODES.CONFLICT, "Email cannot be used");
    }
    if (!response.ok) throw new Error(`GoTrue email change failed with status ${response.status}`);
    return { pendingEmail: normalized };
  }

  /** R-28: loại/kích thước đã kiểm ở schema; cấp signed upload URL vào thư mục `<uid>/` của bucket `avatars`. */
  async createAvatarUpload(user: AuthUser, input: AvatarUploadInput) {
    const extension = AVATAR_EXTENSIONS[input.contentType];
    const path = `${user.id}/${randomUUID()}.${extension}`;
    const storage = this.supabase.forUser(user.jwt).storage.from("avatars");
    const signed = await storage.createSignedUploadUrl(path);
    if (signed.error) throw signed.error;
    const publicUrl = storage.getPublicUrl(path).data.publicUrl;
    return { path, token: signed.data.token, signedUrl: signed.data.signedUrl, publicUrl };
  }

  /**
   * R-29: xác nhận lại danh tính -> ẩn danh hoá profile -> xoá dữ liệu gắn tài khoản (rạp yêu thích, vai trò, ảnh)
   * -> soft-delete user trong auth (không đăng nhập lại được). Đơn hàng giữ nguyên (không PII).
   * Idempotent về mặt thao tác: lỗi giữa chừng thì gọi lại.
   */
  async deleteAccount(user: AuthUser, input: DeleteAccountInput) {
    await this.assertReauthenticated(user, input.password);
    const admin = this.supabase.admin();

    const anonymized = await admin
      .from("profiles")
      .update({
        email: null,
        full_name: null,
        phone: null,
        date_of_birth: null,
        gender: null,
        avatar_url: null,
        marketing_opt_in: false,
        province_id: null,
      })
      .eq("id", user.id);
    if (anonymized.error) throw anonymized.error;

    for (const table of ["favorite_cinemas", "staff_assignments", "user_roles"] as const) {
      const { error } = await admin.from(table).delete().eq("user_id", user.id);
      if (error) throw error;
    }
    // R-29: giữ nguyên bản ghi đơn hàng/vé cho kế toán rạp nhưng phải xoá sạch PII (user_id, contact_email, contact_phone)
    // vì deleteUser(id, true) là soft-delete nên FK ON DELETE SET NULL không tự kích hoạt.
    const ordersScrubbed = await admin
      .from("orders")
      .update({ user_id: null, contact_email: null, contact_phone: null })
      .eq("user_id", user.id);
    if (ordersScrubbed.error && ordersScrubbed.error.code !== "42P01" && ordersScrubbed.error.code !== "PGRST205") {
      throw ordersScrubbed.error;
    }
    await this.removeAvatarFiles(user.id);

    const removed = await admin.auth.admin.deleteUser(user.id, true);
    if (removed.error) throw removed.error;
    return { deleted: true };
  }

  private async updateOwnProfile(user: AuthUser, patch: Record<string, unknown>) {
    const { data, error } = await this.supabase
      .forUser(user.jwt)
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Profile not found");
    return data;
  }

  /** Chỉ nhận URL public của chính thư mục `<uid>/` trong bucket avatars của project (https; http chỉ ngoài production). */
  private assertOwnAvatarUrl(userId: string, avatarUrl: string): void {
    const base = new URL(this.env.SUPABASE_URL);
    let candidate: URL;
    try {
      candidate = new URL(avatarUrl);
    } catch {
      throw unprocessable("Invalid avatar URL");
    }
    const schemeOk =
      candidate.protocol === "https:" || (candidate.protocol === "http:" && this.env.NODE_ENV !== "production");
    const prefix = `/storage/v1/object/public/avatars/${userId}/`;
    if (!schemeOk || candidate.origin !== base.origin || !candidate.pathname.startsWith(prefix)) {
      throw unprocessable("Avatar URL must point to your own avatar in project storage");
    }
  }

  private async assertReauthenticated(user: AuthUser, password: string | undefined): Promise<void> {
    const { data, error } = await this.supabase.admin().auth.admin.getUserById(user.id);
    if (error) throw error;
    const hasPassword = (data.user?.identities ?? []).some((identity) => identity.provider === "email");
    if (hasPassword) {
      if (!password || !user.email) throw new AppException(ERROR_CODES.FORBIDDEN, "Password confirmation required");
      const attempt = await this.supabase.forUser(user.jwt).auth.signInWithPassword({ email: user.email, password });
      if (attempt.error || attempt.data.user?.id !== user.id) {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Password confirmation failed");
      }
      return;
    }
    // OAuth-only: không có mật khẩu để hỏi -> yêu cầu token vừa cấp (đăng nhập lại qua nhà cung cấp).
    const issuedAt = decodeJwt(user.jwt).iat ?? 0;
    if (Date.now() / 1000 - issuedAt > RECENT_LOGIN_SECONDS) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Please sign in again before deleting your account");
    }
  }

  private async removeAvatarFiles(userId: string): Promise<void> {
    const storage = this.supabase.admin().storage.from("avatars");
    const listed = await storage.list(userId);
    if (listed.error) throw listed.error;
    const paths = (listed.data ?? []).map((file) => `${userId}/${file.name}`);
    if (paths.length === 0) return;
    const removed = await storage.remove(paths);
    if (removed.error) throw removed.error;
  }
}
