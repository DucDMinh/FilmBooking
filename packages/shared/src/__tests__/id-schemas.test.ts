import { describe, expect, it } from "vitest";
import { cinemaIdParamSchema as adminCinemaIdParamSchema, assignStaffSchema, userIdParamSchema, voucherIdParamSchema } from "../schemas/admin";
import { holdSeatsSchema, uuidSchema as bookingUuidSchema } from "../schemas/booking";
import { cancelShowtimesSchema, listAffectedOrdersQuerySchema, previewCancelShowtimesSchema } from "../schemas/cancellation";
import { scanTicketSchema } from "../schemas/checkin";
import { uuidSchema as cinemaOpsUuidSchema } from "../schemas/cinema-ops";
import { searchOrdersQuerySchema, uuidSchema as ordersUuidSchema } from "../schemas/orders";
import { createPriceRuleSchema, listPriceRulesQuerySchema, quoteSeatsBodySchema } from "../schemas/pricing";
import { cinemaIdParamSchema as profileCinemaIdParamSchema, updateProvinceSchema } from "../schemas/profile";
import { movieShowtimeReportQuerySchema, revenueReportQuerySchema } from "../schemas/report";

// ID seed (supabase/seed.sql) đặt tay, không đúng version/variant RFC 4122 -> chỉ cần dạng GUID 8-4-4-4-12.
const SEED_ID = "20000000-0000-0000-0000-000000000002";
// Suất demo Live (seed.sql mục 8.1) cũng ID đặt tay, non-RFC.
const SHOWTIME_SEED_ID = "50000000-0000-0000-0000-000000000001";
const RFC_V4_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

describe("ID params/body chấp nhận GUID kiểu seed, vẫn từ chối rác", () => {
  const idSchemas = {
    "cinema-ops uuidSchema": cinemaOpsUuidSchema,
    "admin cinemaIdParamSchema": adminCinemaIdParamSchema,
    "admin userIdParamSchema": userIdParamSchema,
    "admin voucherIdParamSchema": voucherIdParamSchema,
    "profile cinemaIdParamSchema": profileCinemaIdParamSchema,
    "orders uuidSchema": ordersUuidSchema,
    "booking uuidSchema (seatmap :id)": bookingUuidSchema,
  };

  for (const [name, schema] of Object.entries(idSchemas)) {
    it(`${name}: ID seed + UUID chuẩn parse OK, chuỗi rác bị từ chối`, () => {
      expect(schema.safeParse(SEED_ID).success).toBe(true);
      expect(schema.safeParse(RFC_V4_ID).success).toBe(true);
      expect(schema.safeParse("abc").success).toBe(false);
      expect(schema.safeParse("").success).toBe(false);
      expect(schema.safeParse("20000000-0000-0000-0000-00000000000").success).toBe(false);
    });
  }

  it("assignStaffSchema.userId nhận ID seed", () => {
    expect(assignStaffSchema.safeParse({ userId: SEED_ID }).success).toBe(true);
    expect(assignStaffSchema.safeParse({ userId: "abc" }).success).toBe(false);
  });

  it("scanTicketSchema.cinemaId nhận ID seed", () => {
    expect(scanTicketSchema.safeParse({ cinemaId: SEED_ID, token: "t" }).success).toBe(true);
    expect(scanTicketSchema.safeParse({ cinemaId: "abc", token: "t" }).success).toBe(false);
  });

  it("updateProvinceSchema.provinceId nhận ID seed và null", () => {
    expect(updateProvinceSchema.safeParse({ provinceId: SEED_ID }).success).toBe(true);
    expect(updateProvinceSchema.safeParse({ provinceId: null }).success).toBe(true);
    expect(updateProvinceSchema.safeParse({ provinceId: "abc" }).success).toBe(false);
  });

  // Rạp/phim seed (20000000-…/40000000-…) đi qua bộ lọc query của orders, report, pricing, cancellation.
  it("bộ lọc cinemaId/movieId (orders, report, pricing, cancellation) nhận ID seed", () => {
    expect(searchOrdersQuerySchema.safeParse({ cinemaId: SEED_ID }).success).toBe(true);
    expect(revenueReportQuerySchema.safeParse({ cinemaId: SEED_ID }).success).toBe(true);
    expect(movieShowtimeReportQuerySchema.safeParse({ cinemaId: SEED_ID, movieId: SEED_ID }).success).toBe(true);
    expect(listPriceRulesQuerySchema.safeParse({ cinemaId: SEED_ID }).success).toBe(true);
    expect(listAffectedOrdersQuerySchema.safeParse({ cinemaId: SEED_ID }).success).toBe(true);
    expect(searchOrdersQuerySchema.safeParse({ cinemaId: "abc" }).success).toBe(false);
    expect(listPriceRulesQuerySchema.safeParse({ cinemaId: "abc" }).success).toBe(false);
    expect(listAffectedOrdersQuerySchema.safeParse({ cinemaId: "abc" }).success).toBe(false);
  });

  it("createPriceRuleSchema.cinemaId nhận ID seed", () => {
    const base = { scope: "CINEMA", cinemaId: SEED_ID, seatType: "STANDARD", amount: 90000 };
    const result = createPriceRuleSchema.safeParse(base);
    expect(result.error?.issues.some((i) => i.path.join(".") === "cinemaId")).toBeFalsy();
  });

  describe("showtimeId kiểu seed (50000000-…) đi qua booking, cancellation, pricing", () => {
    it("holdSeatsSchema: showtimeId + seatIds nhận ID seed, rác bị từ chối", () => {
      expect(holdSeatsSchema.safeParse({ showtimeId: SHOWTIME_SEED_ID, seatIds: [RFC_V4_ID] }).success).toBe(true);
      expect(holdSeatsSchema.safeParse({ showtimeId: "abc", seatIds: [RFC_V4_ID] }).success).toBe(false);
    });

    it("preview/cancel showtimes nhận showtimeIds seed", () => {
      expect(previewCancelShowtimesSchema.safeParse({ showtimeIds: [SHOWTIME_SEED_ID] }).success).toBe(true);
      expect(cancelShowtimesSchema.safeParse({ showtimeIds: [SHOWTIME_SEED_ID], reason: "x" }).success).toBe(true);
      expect(previewCancelShowtimesSchema.safeParse({ showtimeIds: ["abc"] }).success).toBe(false);
    });

    it("listAffectedOrders + listPriceRules lọc theo showtimeId seed", () => {
      expect(listAffectedOrdersQuerySchema.safeParse({ showtimeId: SHOWTIME_SEED_ID }).success).toBe(true);
      expect(listPriceRulesQuerySchema.safeParse({ showtimeId: SHOWTIME_SEED_ID }).success).toBe(true);
      expect(listPriceRulesQuerySchema.safeParse({ showtimeId: "abc" }).success).toBe(false);
    });

    it("createPriceRuleSchema scope SHOWTIME nhận showtimeId seed; quoteSeats nhận seatIds GUID", () => {
      const result = createPriceRuleSchema.safeParse({ scope: "SHOWTIME", showtimeId: SHOWTIME_SEED_ID, seatType: "STANDARD", amount: 90000 });
      expect(result.error?.issues.some((i) => i.path.join(".") === "showtimeId")).toBeFalsy();
      expect(quoteSeatsBodySchema.safeParse({ seatIds: [SEED_ID] }).success).toBe(true);
      expect(quoteSeatsBodySchema.safeParse({ seatIds: ["abc"] }).success).toBe(false);
    });

    it("searchOrders lọc theo showtimeId seed", () => {
      expect(searchOrdersQuerySchema.safeParse({ showtimeId: SHOWTIME_SEED_ID }).success).toBe(true);
    });
  });
});
