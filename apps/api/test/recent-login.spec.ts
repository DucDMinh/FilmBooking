import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_TOLERANCE_SECONDS,
  RECENT_LOGIN_MAX_AGE_SECONDS,
  isRecentLogin,
} from "../src/common/auth/recent-login";

const NOW = 1_800_000_000;

describe("isRecentLogin", () => {
  it("is false when authTime is null (fail-closed)", () => {
    expect(isRecentLogin(null, RECENT_LOGIN_MAX_AGE_SECONDS, NOW)).toBe(false);
  });

  it("is true for a recent login and exactly at the threshold", () => {
    expect(isRecentLogin(NOW - 30, RECENT_LOGIN_MAX_AGE_SECONDS, NOW)).toBe(true);
    expect(isRecentLogin(NOW - RECENT_LOGIN_MAX_AGE_SECONDS, RECENT_LOGIN_MAX_AGE_SECONDS, NOW)).toBe(true);
  });

  it("is false one second past the threshold", () => {
    expect(isRecentLogin(NOW - RECENT_LOGIN_MAX_AGE_SECONDS - 1, RECENT_LOGIN_MAX_AGE_SECONDS, NOW)).toBe(false);
  });

  it("accepts a future authTime within clock skew and rejects beyond it", () => {
    expect(isRecentLogin(NOW + CLOCK_SKEW_TOLERANCE_SECONDS, RECENT_LOGIN_MAX_AGE_SECONDS, NOW)).toBe(true);
    expect(isRecentLogin(NOW + CLOCK_SKEW_TOLERANCE_SECONDS + 1, RECENT_LOGIN_MAX_AGE_SECONDS, NOW)).toBe(false);
  });

  it("honours a custom threshold and defaults to the shared one", () => {
    expect(isRecentLogin(NOW - 100, 60, NOW)).toBe(false);
    expect(isRecentLogin(Date.now() / 1000 - 10)).toBe(true);
  });
});
