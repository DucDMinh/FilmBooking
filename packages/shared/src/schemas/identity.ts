import { z } from "zod";
import { emailSchema } from "./auth";
import { checkPasswordPolicy, PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES } from "../password-policy";

export const identityProviderSchema = z.enum(["google", "facebook", "email"]);
export type IdentityProvider = z.infer<typeof identityProviderSchema>;

export const unlinkProviderSchema = z.enum(["google", "facebook"]);
export type UnlinkProvider = z.infer<typeof unlinkProviderSchema>;

export const unlinkIdentityParamSchema = z.object({
  provider: unlinkProviderSchema,
});
export type UnlinkIdentityParam = z.infer<typeof unlinkIdentityParamSchema>;

export const userIdentitySchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerId: z.string(),
  email: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  lastSignInAt: z.string().nullable().optional(),
});
export type UserIdentity = z.infer<typeof userIdentitySchema>;

export const identityListResponseSchema = z.object({
  identities: z.array(userIdentitySchema),
  hasPassword: z.boolean(),
  canUnlink: z.boolean(),
  totalMethods: z.number().int().nonnegative().optional(),
});
export type IdentityListResponse = z.infer<typeof identityListResponseSchema>;

export const addPasswordInputSchema = z.object({
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`)
    .max(PASSWORD_MAX_BYTES, `Mật khẩu không được dài quá ${PASSWORD_MAX_BYTES} ký tự`)
    .refine((val: string) => checkPasswordPolicy(val).length === 0, {
      message: "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và chữ số",
    }),
});
export type AddPasswordInput = z.infer<typeof addPasswordInputSchema>;

export const missingEmailOAuthInputSchema = z.object({
  provider: z.literal("facebook"),
  providerAccessToken: z.string().trim().min(1).max(4096).optional(),
  oauthStateToken: z.string().trim().min(1).max(4096).optional(),
  email: emailSchema,
});
export type MissingEmailOAuthInput = z.infer<typeof missingEmailOAuthInputSchema>;

export const oauthCallbackVerifyInputSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  providerId: z.string().trim().min(1).max(255),
  email: emailSchema,
  authenticatedUserId: z.string().uuid().optional(),
});
export type OAuthCallbackVerifyInput = z.infer<typeof oauthCallbackVerifyInputSchema>;
