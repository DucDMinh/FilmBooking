import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTransport } from "nodemailer";
import { parseEnv, type Env } from "../src/config/env";
import { MailService, type MailTransport } from "../src/modules/mail/mail.service";
import { createMailTransport } from "../src/modules/mail/mail.transport";

vi.mock("nodemailer", () => ({ createTransport: vi.fn() }));

const baseEnv = {
  WEB_ORIGIN: "https://filmbooking.example.com",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: "jwt-secret-for-test-jwt-secret-1234",
};

function envWith(extra: Record<string, string>): Env {
  return parseEnv({ ...baseEnv, ...extra });
}

describe("createMailTransport", () => {
  const createTransportMock = vi.mocked(createTransport);

  beforeEach(() => {
    createTransportMock.mockReset();
    createTransportMock.mockReturnValue({ sendMail: vi.fn() } as never);
  });

  it("trả null khi thiếu SMTP_HOST (không tạo transport)", () => {
    expect(createMailTransport(envWith({ SMTP_USER: "u@gmail.com", SMTP_PASS: "pw" }))).toBeNull();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("mặc định cổng 465 -> secure: true, có auth và timeout", () => {
    const transport = createMailTransport(
      envWith({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "u@gmail.com", SMTP_PASS: "app-pass" }),
    );

    expect(transport).not.toBeNull();
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: "u@gmail.com", pass: "app-pass" },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    );
  });

  it("cổng 587 -> secure: false", () => {
    createMailTransport(envWith({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "587" }));

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false }),
    );
  });

  it("không có SMTP_USER -> không truyền auth", () => {
    createMailTransport(envWith({ SMTP_HOST: "localhost", SMTP_PORT: "1025" }));

    const options = createTransportMock.mock.calls[0]![0] as { auth?: unknown };
    expect(options.auth).toBeUndefined();
  });
});

describe("MailService.sendEmail", () => {
  const mail = { to: "khach@example.com", subject: "Chủ đề", html: "<p>Xin chào</p>", text: "Xin chào" };

  function transportMock(result: Awaited<ReturnType<MailTransport["sendMail"]>> = { messageId: "<smtp-1@host>" }) {
    return { sendMail: vi.fn().mockResolvedValue(result) } satisfies MailTransport;
  }

  it("gọi sendMail đúng from/to/subject/html/text và trả id = messageId", async () => {
    const transport = transportMock();
    const service = new MailService(envWith({ SMTP_FROM: "CINEMO <ve@cinemo.vn>" }), transport);

    const result = await service.sendEmail(mail);

    expect(result).toEqual({ id: "<smtp-1@host>" });
    expect(transport.sendMail).toHaveBeenCalledWith({ from: "CINEMO <ve@cinemo.vn>", ...mail });
  });

  it("from: options.from > SMTP_FROM > SMTP_USER > mặc định", async () => {
    const sendFrom = async (extra: Record<string, string>, from?: string) => {
      const transport = transportMock();
      await new MailService(envWith(extra), transport).sendEmail({ ...mail, from });
      return transport.sendMail.mock.calls[0]![0].from;
    };

    expect(await sendFrom({ SMTP_FROM: "A <a@x.vn>", SMTP_USER: "u@gmail.com" }, "Tuỳ chỉnh <t@x.vn>")).toBe(
      "Tuỳ chỉnh <t@x.vn>",
    );
    expect(await sendFrom({ SMTP_FROM: "A <a@x.vn>", SMTP_USER: "u@gmail.com" })).toBe("A <a@x.vn>");
    expect(await sendFrom({ SMTP_USER: "u@gmail.com" })).toBe("FilmBooking <u@gmail.com>");
    expect(await sendFrom({})).toBe("FilmBooking <no-reply@filmbooking.local>");
  });

  it("lỗi SMTP -> throw 'SMTP send failed' kèm lý do", async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT")) };
    const service = new MailService(envWith({ SMTP_HOST: "smtp.gmail.com", SMTP_PASS: "secret-pass" }), transport);

    const failure = service.sendEmail(mail);

    await expect(failure).rejects.toThrow("SMTP send failed: connect ETIMEDOUT");
    await expect(failure).rejects.not.toThrow(/secret-pass/);
  });

  it("rejected chứa người nhận -> throw", async () => {
    const transport = transportMock({ messageId: "<smtp-2@host>", rejected: ["khach@example.com"] });
    const service = new MailService(envWith({}), transport);

    await expect(service.sendEmail(mail)).rejects.toThrow(/SMTP send failed.*rejected/);
  });

  it("không có messageId -> throw", async () => {
    const transport = transportMock({ messageId: "" });
    const service = new MailService(envWith({}), transport);

    await expect(service.sendEmail(mail)).rejects.toThrow(/missing message ID/);
  });

  it("không có transport: NODE_ENV=test -> trả id mock", async () => {
    const service = new MailService(envWith({ NODE_ENV: "test" }), null);

    const result = await service.sendEmail(mail);

    expect(result.id).toMatch(/^mock-email-/);
  });

  it.each(["development", "production"])("không có transport: NODE_ENV=%s -> throw SMTP is not configured", async (nodeEnv) => {
    const extra: Record<string, string> =
      nodeEnv === "production"
        ? { NODE_ENV: nodeEnv, PAYOS_CLIENT_ID: "c", PAYOS_API_KEY: "k", PAYOS_CHECKSUM_KEY: "s" }
        : { NODE_ENV: nodeEnv };
    const service = new MailService(envWith(extra), null);

    await expect(service.sendEmail(mail)).rejects.toThrow("SMTP is not configured (SMTP_HOST)");
  });
});

describe("MailService.sendOutboxEmail", () => {
  it("render template ACCOUNT_LOCKED_ALERT rồi gửi qua transport", async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({ messageId: "<smtp-3@host>" }) };
    const service = new MailService(envWith({ SMTP_FROM: "CINEMO <ve@cinemo.vn>" }), transport);

    const { id, rendered } = await service.sendOutboxEmail("khach@example.com", "ACCOUNT_LOCKED_ALERT", {
      lockedUntil: "2026-11-17T10:00:00.000Z",
    });

    expect(id).toBe("<smtp-3@host>");
    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: "CINEMO <ve@cinemo.vn>",
      to: "khach@example.com",
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  });
});
