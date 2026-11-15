import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { scrubEvent, sentryDsn } from "./sentry-config";

describe("sentry-config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("thiếu/rỗng DSN -> undefined (tắt hẳn)", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "  ");
    expect(sentryDsn()).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://k@o0.ingest.sentry.io/1");
    expect(sentryDsn()).toBe("https://k@o0.ingest.sentry.io/1");
  });

  it("beforeSend xóa email/SĐT, giữ tag cinema_id", () => {
    const event = {
      message: "lỗi với a.b@example.com / 0912.345.678",
      tags: { cinema_id: "c-1" },
      user: { email: "a@b.com" },
      extra: { phone: "0912345678", note: "+84 912 345 678" },
      request: { cookies: { s: "x" }, data: "email=a@b.com" },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(JSON.stringify(out)).not.toMatch(/example\.com|a@b\.com|0912|912 345|Cookie/);
    expect(out.tags).toEqual({ cinema_id: "c-1" });
    expect(out.user).toBeUndefined();
  });
});
