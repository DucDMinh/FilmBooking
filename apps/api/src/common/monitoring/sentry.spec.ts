import * as Sentry from "@sentry/nestjs";
import { afterAll, describe, expect, it } from "vitest";
import { initSentry, isSentryEnabled, reportAlert, scrubEvent } from "./sentry";

describe("sentry monitoring", () => {
  afterAll(async () => {
    await Sentry.close();
  });

  it("tắt hẳn khi thiếu DSN: không init, helper là no-op", () => {
    expect(initSentry(undefined)).toBe(false);
    expect(isSentryEnabled()).toBe(false);
    expect(() => reportAlert({ alert: "email_failed", message: "x" })).not.toThrow();
  });

  it("scrub email/SĐT khỏi event", () => {
    const event = scrubEvent({
      type: undefined,
      message: "lỗi gửi cho a.b@example.com sdt 0912 345 678",
      user: { email: "a@b.com", id: "u1" },
      extra: { to_email: "a@b.com", note: "gọi +84 912345678" },
      request: { data: { email: "a@b.com" }, headers: { authorization: "Bearer x" } },
    });
    const json = JSON.stringify(event);
    expect(json).not.toMatch(/example\.com|a@b\.com|0912|912345678|Bearer/);
    expect(event.user).toBeUndefined();
  });

  it("alert đi qua transport với tag cinema_id + fingerprint, không PII", async () => {
    const sent: string[] = [];
    initSentry("https://key@o0.ingest.sentry.io/1", {
      defaultIntegrations: false,
      integrations: [],
      transport: () => ({
        send: async (envelope) => {
          sent.push(JSON.stringify(envelope));
          return {};
        },
        flush: async () => true,
      }),
    });
    reportAlert({
      alert: "email_failed",
      message: "Email FAILED user@example.com",
      cinemaId: "cinema-1",
      extra: { outboxId: "o1" },
    });
    await Sentry.flush(2000);
    const payload = sent.join("\n");
    expect(payload).toContain('"cinema_id":"cinema-1"');
    expect(payload).toContain('"alert":"email_failed"');
    expect(payload).not.toContain("user@example.com");
  });
});
