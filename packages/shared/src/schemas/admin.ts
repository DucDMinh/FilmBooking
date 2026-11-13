import { z } from "zod";

/**
 * Schemas API quản trị: người dùng & vai trò, gán rạp, cấu hình chuỗi, audit log, voucher
 * (R-17, R-39, R-90, R-105, R-106, R-107, AC-16). Khớp migration core_identity_chain + booking_tables.
 */

const uuidSchema = z.uuid();

// ── Người dùng & gán rạp ───────────────────────────────────────────────────
export const STAFF_ASSIGNMENT_ROLES = ["STAFF", "MANAGER"] as const;
export type StaffAssignmentRole = (typeof STAFF_ASSIGNMENT_ROLES)[number];

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Gán nhân sự vào rạp: chỉ định người bằng userId HOẶC email (đúng một trong hai). */
export const assignStaffSchema = z
  .object({
    userId: uuidSchema.optional(),
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    role: z.enum(STAFF_ASSIGNMENT_ROLES).default("STAFF"),
  })
  .refine((v) => (v.userId === undefined) !== (v.email === undefined), {
    message: "Provide exactly one of userId or email",
  });
export type AssignStaffInput = z.infer<typeof assignStaffSchema>;

export const updateAssignmentSchema = z.object({ role: z.enum(STAFF_ASSIGNMENT_ROLES) });
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const updateUserLockSchema = z.object({ locked: z.boolean() });
export type UpdateUserLockInput = z.infer<typeof updateUserLockSchema>;

export const updateUserAdminRoleSchema = z.object({ isAdmin: z.boolean() });
export type UpdateUserAdminRoleInput = z.infer<typeof updateUserAdminRoleSchema>;

export const userIdParamSchema = uuidSchema;
export const cinemaIdParamSchema = uuidSchema;

export interface StaffAssignmentDto {
  userId: string;
  cinemaId: string;
  role: StaffAssignmentRole;
  email: string | null;
  fullName: string | null;
  createdAt: string;
}

export interface AdminUserDto {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  createdAt: string;
  isAdmin: boolean;
  locked: boolean;
  assignments: { cinemaId: string; role: StaffAssignmentRole }[];
}

export interface PagedDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ── Cấu hình chuỗi (R-106) ─────────────────────────────────────────────────
export const APP_SETTING_KEYS = [
  "seat_hold_minutes_web",
  "default_cleaning_minutes",
  "default_online_cutoff_minutes",
  "no_refund_warning",
  "terms_version",
] as const;
export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];

/** Giá trị theo từng key. Key lạ bị từ chối để Admin không ghi rác/ghi đè key hệ thống khác. */
export const APP_SETTING_VALUE_SCHEMAS: Record<AppSettingKey, z.ZodType<number | string>> = {
  seat_hold_minutes_web: z.number().int().min(1).max(120),
  default_cleaning_minutes: z.number().int().min(0).max(240),
  default_online_cutoff_minutes: z.number().int().min(0).max(1440),
  no_refund_warning: z.string().trim().min(1).max(1000),
  terms_version: z.string().trim().min(1).max(20),
};

export const settingKeyParamSchema = z.enum(APP_SETTING_KEYS);
export const updateSettingSchema = z.object({ value: z.union([z.number(), z.string()]) });
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

export interface AppSettingDto {
  key: string;
  value: number | string;
  description: string | null;
  updatedAt: string;
}

// ── Audit log (R-107) ──────────────────────────────────────────────────────
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const listAuditLogsQuerySchema = z.object({
  cinemaId: uuidSchema.optional(),
  actorId: uuidSchema.optional(),
  tableName: z.string().trim().regex(/^[a-z_]{1,64}$/).optional(),
  action: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export interface AuditLogDto {
  id: number;
  occurredAt: string;
  actorId: string | null;
  cinemaId: string | null;
  tableName: string;
  recordId: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  beforeData: unknown;
  afterData: unknown;
}

// ── Voucher (R-90) ─────────────────────────────────────────────────────────
export const VOUCHER_DISCOUNT_TYPES = ["PERCENT", "FIXED"] as const;
export const VOUCHER_SCOPES = ["TICKET", "COMBO", "ORDER"] as const;

const voucherFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,32}$/, "Code must be 3-32 chars: A-Z, 0-9, _ or -"),
  discountType: z.enum(VOUCHER_DISCOUNT_TYPES),
  discountValue: z.number().int().min(1),
  maxDiscount: z.number().int().min(1).nullable(),
  appliesTo: z.enum(VOUCHER_SCOPES),
  validFrom: isoDateTimeSchema.nullable(),
  validTo: isoDateTimeSchema.nullable(),
  minOrderAmount: z.number().int().min(0),
  totalUsesLimit: z.number().int().min(1).nullable(),
  perUserLimit: z.number().int().min(1).nullable(),
  movieId: uuidSchema.nullable(),
  active: z.boolean(),
};

type VoucherRange = { discountType?: string; discountValue?: number; validFrom?: string | null; validTo?: string | null };

/** Ràng buộc chéo trường (trùng CHECK của bảng vouchers) để trả 400 rõ ràng thay vì lỗi DB. */
function checkVoucherRanges(v: VoucherRange, ctx: z.RefinementCtx): void {
  if (v.discountType === "PERCENT" && v.discountValue !== undefined && v.discountValue > 100) {
    ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percent must be <= 100" });
  }
  if (v.validFrom && v.validTo && Date.parse(v.validTo) <= Date.parse(v.validFrom)) {
    ctx.addIssue({ code: "custom", path: ["validTo"], message: "validTo must be after validFrom" });
  }
}

export const createVoucherSchema = z
  .object({
    code: voucherFields.code,
    discountType: voucherFields.discountType,
    discountValue: voucherFields.discountValue,
    maxDiscount: voucherFields.maxDiscount.default(null),
    appliesTo: voucherFields.appliesTo.default("ORDER"),
    validFrom: voucherFields.validFrom.default(null),
    validTo: voucherFields.validTo.default(null),
    minOrderAmount: voucherFields.minOrderAmount.default(0),
    totalUsesLimit: voucherFields.totalUsesLimit.default(null),
    perUserLimit: voucherFields.perUserLimit.default(null),
    movieId: voucherFields.movieId.default(null),
    active: voucherFields.active.default(true),
  })
  .superRefine(checkVoucherRanges);
export type CreateVoucherInput = z.infer<typeof createVoucherSchema>;

export const updateVoucherSchema = z
  .object({
    code: voucherFields.code,
    discountType: voucherFields.discountType,
    discountValue: voucherFields.discountValue,
    maxDiscount: voucherFields.maxDiscount,
    appliesTo: voucherFields.appliesTo,
    validFrom: voucherFields.validFrom,
    validTo: voucherFields.validTo,
    minOrderAmount: voucherFields.minOrderAmount,
    totalUsesLimit: voucherFields.totalUsesLimit,
    perUserLimit: voucherFields.perUserLimit,
    movieId: voucherFields.movieId,
    active: voucherFields.active,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" })
  .superRefine(checkVoucherRanges);
export type UpdateVoucherInput = z.infer<typeof updateVoucherSchema>;

export const listVouchersQuerySchema = z.object({
  q: z.string().trim().max(50).optional(),
  active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListVouchersQuery = z.infer<typeof listVouchersQuerySchema>;

export const voucherIdParamSchema = uuidSchema;

export interface VoucherDto {
  id: string;
  code: string;
  discountType: (typeof VOUCHER_DISCOUNT_TYPES)[number];
  discountValue: number;
  maxDiscount: number | null;
  appliesTo: (typeof VOUCHER_SCOPES)[number];
  validFrom: string | null;
  validTo: string | null;
  minOrderAmount: number;
  totalUsesLimit: number | null;
  perUserLimit: number | null;
  movieId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
