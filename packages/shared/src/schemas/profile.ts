import { z } from "zod";

/** R-28: ảnh đại diện chỉ nhận JPG/PNG/WebP, tối đa 2 MB (khớp giới hạn bucket `avatars`). */
export const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

/** SĐT Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx (10 số, đầu số 3/5/7/8/9). */
const VN_PHONE = /^(?:0|\+84)[35789]\d{8}$/;

const phone = z
  .string()
  .trim()
  .regex(VN_PHONE, "Invalid phone number")
  .transform((value) => (value.startsWith("+84") ? `0${value.slice(3)}` : value));

const dateOfBirth = z.iso
  .date()
  .refine((value) => value <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future")
  .refine((value) => value >= "1900-01-01", "Invalid date of birth");

/** PATCH /me/profile. `strict`: không chấp nhận id/email/... lạ trong body. */
export const updateProfileSchema = z
  .strictObject({
    fullName: z.string().trim().min(1).max(100),
    phone: phone.nullable(),
    dateOfBirth: dateOfBirth.nullable(),
    gender: z.enum(GENDERS).nullable(),
    avatarUrl: z.url().max(500).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No fields to update");
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changeEmailSchema = z.strictObject({ newEmail: z.email().max(254) });
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const avatarUploadSchema = z.strictObject({
  contentType: z.enum(AVATAR_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
});
export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>;

/** R-30: email khuyến mãi opt-in. */
export const updatePreferencesSchema = z.strictObject({ marketingOptIn: z.boolean() });
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const cinemaIdParamSchema = z.uuid();

export const updateProvinceSchema = z.strictObject({ provinceId: z.uuid().nullable() });
export type UpdateProvinceInput = z.infer<typeof updateProvinceSchema>;

/**
 * DELETE /me (R-29). `password` bắt buộc với tài khoản có đăng nhập bằng mật khẩu;
 * tài khoản chỉ OAuth phải vừa đăng nhập lại (token mới). `acknowledgeTicketLoss`: đã đọc cảnh báo vé chưa dùng mất hiệu lực.
 */
export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1).max(200).optional(),
  acknowledgeTicketLoss: z.literal(true),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
