import { z } from "zod";

/**
 * Enums & schemas bảng giá 2 cấp + ngày lễ + báo giá (R-52, R-53, R-57, R-72, AC-15).
 * Khớp 100% migration 20261111030000_pricing.sql.
 */

export const PRICE_SCOPES = ["CHAIN", "CINEMA", "SHOWTIME"] as const;
export type PriceScope = (typeof PRICE_SCOPES)[number];

export const PRICE_DAY_TYPES = ["NORMAL", "WEEKEND", "HOLIDAY"] as const;
export type PriceDayType = (typeof PRICE_DAY_TYPES)[number];

export const PRICE_TIME_BANDS = ["BEFORE_17", "AFTER_17"] as const;
export type PriceTimeBand = (typeof PRICE_TIME_BANDS)[number];

export const SEAT_PRICING_TYPES = ["NORMAL", "VIP", "SWEETBOX"] as const;
export type SeatPricingType = (typeof SEAT_PRICING_TYPES)[number];

export const SCREEN_FORMAT_PRICING = ["2D", "3D"] as const;
export type ScreenFormatPricing = (typeof SCREEN_FORMAT_PRICING)[number];

export const priceScopeSchema = z.enum(PRICE_SCOPES);
export const priceDayTypeSchema = z.enum(PRICE_DAY_TYPES);
export const priceTimeBandSchema = z.enum(PRICE_TIME_BANDS);
export const seatPricingTypeSchema = z.enum(SEAT_PRICING_TYPES);
export const screenFormatPricingSchema = z.enum(SCREEN_FORMAT_PRICING);

export const holidayDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// ── Holidays ────────────────────────────────────────────────────────────────
export const createHolidaySchema = z.object({
  holidayDate: holidayDateSchema,
  name: z.string().trim().min(1, "Name is required").max(200, "Name too long"),
});
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;

export interface HolidayDto {
  holidayDate: string;
  name: string;
  createdAt: string;
}

// ── Price Rules ─────────────────────────────────────────────────────────────
/** Giá VND: số nguyên >= 0 */
export const priceAmountSchema = z
  .number()
  .int("Amount must be an integer")
  .min(0, "Amount must be greater than or equal to 0");

export const createPriceRuleSchema = z
  .object({
    scope: priceScopeSchema,
    cinemaId: z.string().uuid("Invalid cinema UUID").nullable().optional(),
    showtimeId: z.string().uuid("Invalid showtime UUID").nullable().optional(),
    seatType: seatPricingTypeSchema,
    format: screenFormatPricingSchema.nullable().optional(),
    dayType: priceDayTypeSchema.nullable().optional(),
    timeBand: priceTimeBandSchema.nullable().optional(),
    amount: priceAmountSchema,
  })
  .superRefine((data, ctx) => {
    if (data.scope === "CHAIN") {
      if (data.cinemaId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cinemaId must be null for CHAIN scope",
          path: ["cinemaId"],
        });
      }
      if (data.showtimeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "showtimeId must be null for CHAIN scope",
          path: ["showtimeId"],
        });
      }
      if (!data.format) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "format is required for CHAIN scope",
          path: ["format"],
        });
      }
      if (!data.dayType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dayType is required for CHAIN scope",
          path: ["dayType"],
        });
      }
      if (!data.timeBand) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timeBand is required for CHAIN scope",
          path: ["timeBand"],
        });
      }
    } else if (data.scope === "CINEMA") {
      if (!data.cinemaId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cinemaId is required for CINEMA scope",
          path: ["cinemaId"],
        });
      }
      if (data.showtimeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "showtimeId must be null for CINEMA scope",
          path: ["showtimeId"],
        });
      }
      if (!data.format) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "format is required for CINEMA scope",
          path: ["format"],
        });
      }
      if (!data.dayType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dayType is required for CINEMA scope",
          path: ["dayType"],
        });
      }
      if (!data.timeBand) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timeBand is required for CINEMA scope",
          path: ["timeBand"],
        });
      }
    } else if (data.scope === "SHOWTIME") {
      if (!data.showtimeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "showtimeId is required for SHOWTIME scope",
          path: ["showtimeId"],
        });
      }
      if (data.format) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "format must be null for SHOWTIME scope",
          path: ["format"],
        });
      }
      if (data.dayType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dayType must be null for SHOWTIME scope",
          path: ["dayType"],
        });
      }
      if (data.timeBand) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timeBand must be null for SHOWTIME scope",
          path: ["timeBand"],
        });
      }
    }
  });
export type CreatePriceRuleInput = z.infer<typeof createPriceRuleSchema>;

export const updatePriceRuleSchema = z.object({
  amount: priceAmountSchema,
});
export type UpdatePriceRuleInput = z.infer<typeof updatePriceRuleSchema>;

export const listPriceRulesQuerySchema = z.object({
  scope: priceScopeSchema.optional(),
  cinemaId: z.string().uuid().optional(),
  showtimeId: z.string().uuid().optional(),
});
export type ListPriceRulesQuery = z.infer<typeof listPriceRulesQuerySchema>;

export interface PriceRuleDto {
  id: string;
  scope: PriceScope;
  cinemaId: string | null;
  showtimeId: string | null;
  seatType: SeatPricingType;
  format: ScreenFormatPricing | null;
  dayType: PriceDayType | null;
  timeBand: PriceTimeBand | null;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Báo giá suất chiếu & ghế ────────────────────────────────────────────────
export const quoteSeatsBodySchema = z.object({
  seatIds: z.array(z.string().uuid()).min(1, "At least one seat is required"),
});
export type QuoteSeatsBody = z.infer<typeof quoteSeatsBodySchema>;

export interface ShowtimeSeatPriceItem {
  seatType: SeatPricingType;
  amount: number | null;
}

export interface ShowtimePricesDto {
  showtimeId: string;
  cinemaId: string;
  format: string;
  dayType: PriceDayType;
  timeBand: PriceTimeBand;
  prices: ShowtimeSeatPriceItem[];
  bySeatType: Record<SeatPricingType, number | null>;
}

export interface SeatQuoteItemDto {
  seatId: string;
  seatType: SeatPricingType;
  seatCount: number;
  amount: number;
}
