import { z } from "zod";

/** Email chuẩn hoá (trim + lowercase) để so khớp không phân biệt hoa thường (R-01/R-12). */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Chỉ kiểm hình dạng; luật mật khẩu (R-02) kiểm ở server bằng `checkPasswordPolicy` để trả 422 kèm lý do. */
const newPasswordField = z.string().min(1).max(256);
const captchaTokenField = z.string().min(1).max(2048).optional();

// Object mặc định của zod BỎ QUA khoá lạ (vd `role`) -> không có đường tự gán vai trò (R-17).
export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordField,
  fullName: z.string().trim().min(1).max(120).optional(),
  acceptTerms: z.boolean(),
  /** Phiên bản điều khoản user đã thấy; lệch bản hiện hành -> CONSENT_REQUIRED. */
  termsVersion: z.string().trim().min(1).max(32).optional(),
  captchaToken: captchaTokenField,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  /** Bắt buộc sau 3 lần sai liên tiếp (R-07). */
  captchaToken: captchaTokenField,
});

export const resendConfirmationSchema = z.object({ email: emailSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema, captchaToken: captchaTokenField });

export const resetPasswordSchema = z.object({
  /** access_token của phiên khôi phục do link email tạo ra. */
  accessToken: z.string().min(1).max(4096),
  newPassword: newPasswordField,
});

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type ResendConfirmationInput = z.output<typeof resendConfirmationSchema>;
export type ForgotPasswordInput = z.output<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number | null;
  tokenType: string;
  user: { id: string; email: string | null };
}

/** Phản hồi trung tính (R-12): giống nhau dù email có tồn tại hay không. */
export interface AuthNeutralResponse {
  status: "CHECK_EMAIL";
}
