import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ORDER_STATUSES,
  VN_TIMEZONE,
  assertVnd,
  formatVnd,
  isVnEveningSlot,
  isVnWeekend,
  percentOfVnd,
  sumVnd,
  toVnParts,
  vnLocalToUtc,
} from "../index";

describe("money (VND)", () => {
  it("formats integer VND with dot grouping and ₫ suffix", () => {
    expect(formatVnd(120000)).toBe("120.000 ₫");
    expect(formatVnd(0)).toBe("0 ₫");
    expect(formatVnd(999)).toBe("999 ₫");
    expect(formatVnd(1234567)).toBe("1.234.567 ₫");
    expect(formatVnd(-50000)).toBe("-50.000 ₫");
  });

  it("never emits a decimal part", () => {
    for (const amount of [0, 1, 99, 1000, 120000, 12345678]) {
      expect(formatVnd(amount)).toMatch(/^-?\d{1,3}(\.\d{3})* ₫$/);
    }
  });

  it("rejects non-integer, NaN, Infinity and unsafe integers", () => {
    expect(() => formatVnd(120000.5)).toThrow(RangeError);
    expect(() => assertVnd(Number.NaN)).toThrow(RangeError);
    expect(() => assertVnd(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => assertVnd(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("sums integer amounts and floors percentages (optionally capped)", () => {
    expect(sumVnd([100000, 20000, 5000])).toBe(125000);
    expect(sumVnd([])).toBe(0);
    expect(percentOfVnd(99999, 10)).toBe(9999);
    expect(percentOfVnd(500000, 50, 100000)).toBe(100000);
    expect(Number.isInteger(percentOfVnd(33333, 33))).toBe(true);
  });

  it("rejects out-of-range percentages", () => {
    expect(() => percentOfVnd(100000, 101)).toThrow(RangeError);
    expect(() => percentOfVnd(100000, -1)).toThrow(RangeError);
  });
});

describe("time (Asia/Ho_Chi_Minh <-> UTC)", () => {
  it("uses the Vietnam timezone id", () => {
    expect(VN_TIMEZONE).toBe("Asia/Ho_Chi_Minh");
  });

  it("converts 17:00 VN local to 10:00Z and back", () => {
    const utc = vnLocalToUtc("2026-11-14", "17:00");
    expect(utc.toISOString()).toBe("2026-11-14T10:00:00.000Z");
    expect(toVnParts(utc)).toMatchObject({ year: 2026, month: 11, day: 14, hour: 17, minute: 0 });
  });

  it("rolls the VN date across UTC midnight", () => {
    const utc = vnLocalToUtc("2026-11-14", "02:30");
    expect(utc.toISOString()).toBe("2026-11-13T19:30:00.000Z");
    expect(toVnParts(utc)).toMatchObject({ day: 14, hour: 2, minute: 30 });
  });

  it("rejects malformed local date/time", () => {
    expect(() => vnLocalToUtc("2026-13-40", "17:00")).toThrow(RangeError);
    expect(() => vnLocalToUtc("2026-02-30", "17:00")).toThrow(RangeError);
    expect(() => vnLocalToUtc("2026-11-14", "25:00")).toThrow(RangeError);
    expect(() => vnLocalToUtc("2026-11-14", "17:60")).toThrow(RangeError);
    expect(() => vnLocalToUtc("14/11/2026", "17:00")).toThrow(RangeError);
  });

  it("treats 17:00 as the evening (sau 17h) price slot and 16:59 as before", () => {
    expect(isVnEveningSlot(vnLocalToUtc("2026-11-11", "17:00"))).toBe(true);
    expect(isVnEveningSlot(vnLocalToUtc("2026-11-11", "16:59"))).toBe(false);
  });

  it("detects weekend by VN weekday, not UTC weekday", () => {
    // Sat 2026-11-14 01:00 VN is still Friday 18:00Z in UTC.
    expect(isVnWeekend(vnLocalToUtc("2026-11-14", "01:00"))).toBe(true);
    // Mon 2026-11-16 03:00 VN is Sunday 20:00Z in UTC.
    expect(isVnWeekend(vnLocalToUtc("2026-11-16", "03:00"))).toBe(false);
    expect(isVnWeekend(vnLocalToUtc("2026-11-11", "12:00"))).toBe(false);
  });
});

describe("shared catalogs", () => {
  it("has an HTTP status for every error code", () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it("keeps the required stable error codes", () => {
    const codes: string[] = Object.values(ERROR_CODES);
    for (const code of [
      "SEAT_TAKEN",
      "ORPHAN_SEAT",
      "SALES_CLOSED",
      "HOLD_LIMIT",
      "HOLD_EXISTS",
      "EMAIL_NOT_CONFIRMED",
      "ACCOUNT_LOCKED",
      "RATE_LIMITED",
      "DISPOSABLE_EMAIL",
      "CAPTCHA_FAILED",
      "VOUCHER_NOT_FOUND",
      "VOUCHER_EXPIRED",
      "VOUCHER_EXHAUSTED",
      "VOUCHER_MIN_ORDER",
      "VOUCHER_NOT_APPLICABLE_SHOWTIME",
      "VOUCHER_NOT_APPLICABLE_CINEMA",
      "WRONG_CINEMA",
      "TICKET_USED",
      "SHOWTIME_CANCELLED",
      "POS_KEY_INVALID",
      "FORBIDDEN_CINEMA",
      "VALIDATION_ERROR",
    ]) {
      expect(codes).toContain(code);
    }
  });

  it("lists the order lifecycle statuses of spec section 8.5", () => {
    expect([...ORDER_STATUSES].sort()).toEqual(
      [
        "affected",
        "cancelled",
        "checked_in",
        "exchanged",
        "expired",
        "holding",
        "needs_manual_review",
        "paid",
        "pending_payment",
        "refunded_manual",
      ].sort(),
    );
  });
});
