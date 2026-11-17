import jsQR from "jsqr";
import { createTransport } from "nodemailer";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "../src/config/env";
import { MailService, MAX_TICKET_QR_IMAGES, type MailTransport } from "../src/modules/mail/mail.service";

// qr_token thật: encode(gen_random_bytes(16), 'hex') -> 32 ký tự hex (supabase/migrations/...booking_tables.sql).
const TOKENS = [
  "3f9a1c7e5b2d4086a1c3e5f7092b4d6a",
  "00000000000000000000000000000000",
  "ffffffffffffffffffffffffffffffff",
];

const env = parseEnv({
  WEB_ORIGIN: "https://filmbooking.example.com",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: "jwt-secret-for-test-jwt-secret-1234",
  SMTP_FROM: "CINEMO <ve@cinemo.vn>",
});

const BASE_PAYLOAD = {
  booking_code: "HN01-ABC123",
  cinema_name: "CINEMO Hà Nội",
  movie_title: "Dune 2",
  room_name: "Phòng 1",
  showtime_starts_at: "2026-11-20T19:30:00Z",
  total_amount: 180000,
};

/** Payload sau enrich: mỗi ghế một vé với qr_token riêng (jobs.controller enrichTicketPayload). */
function multiTicketPayload(tokens: string[]): Record<string, unknown> {
  const labels = tokens.map((_, i) => `A${i + 1}`);
  return {
    ...BASE_PAYLOAD,
    seats: labels,
    tickets: tokens.map((token, i) => ({ seat_label: labels[i], qr_token: token })),
  };
}

/** Giải mã PNG bằng bộ giải QR độc lập với bộ sinh: chính là việc máy quét của staff làm. */
function decodeQrPng(png: Buffer): string | null {
  const { width, height, data } = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(data), width, height)?.data ?? null;
}

type SendMailOptions = Parameters<MailTransport["sendMail"]>[0];

function recordingTransport() {
  return { sendMail: vi.fn<MailTransport["sendMail"]>().mockResolvedValue({ messageId: "<smtp-qr@host>" }) };
}

function sentOptions(transport: ReturnType<typeof recordingTransport>): SendMailOptions {
  return transport.sendMail.mock.calls[0]![0];
}

function countMatches(haystack: string, pattern: RegExp): number {
  return haystack.match(pattern)?.length ?? 0;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MailService.sendOutboxEmail: vé có ảnh QR (R-86)", () => {
  it("payload cũ chỉ có qr_token đơn lẻ -> 1 PNG inline cid ticket-qr-1 và HTML tham chiếu cid đó", async () => {
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", {
      ...BASE_PAYLOAD,
      qr_token: TOKENS[0],
    });

    const options = sentOptions(transport);
    expect(options.attachments).toHaveLength(1);
    const [attachment] = options.attachments!;
    expect(attachment).toMatchObject({ cid: "ticket-qr-1", contentType: "image/png", filename: "ve-qr-1.png" });
    expect([...attachment!.content.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(options.html).toContain('<img src="cid:ticket-qr-1"');
    expect(decodeQrPng(attachment!.content)).toBe(TOKENS[0]);
  });

  it.each(TOKENS)("giải mã PNG ra đúng nguyên chuỗi qr_token %s (staff quét được)", async (token) => {
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail(
      "khach@example.com",
      "TICKET_ISSUED",
      multiTicketPayload([token]),
    );

    expect(decodeQrPng(sentOptions(transport).attachments![0]!.content)).toBe(token);
  });

  it("đơn N ghế -> N attachment cid duy nhất, mỗi PNG giải mã ra ĐÚNG token của vé đó, HTML đúng thứ tự ghế", async () => {
    const transport = recordingTransport();

    const { rendered } = await new MailService(env, transport).sendOutboxEmail(
      "khach@example.com",
      "TICKET_ISSUED",
      multiTicketPayload(TOKENS),
    );

    const options = sentOptions(transport);
    const attachments = options.attachments!;
    expect(attachments.map((a) => a.cid)).toEqual(["ticket-qr-1", "ticket-qr-2", "ticket-qr-3"]);
    expect(new Set(attachments.map((a) => a.filename)).size).toBe(3);
    expect(attachments.map((a) => decodeQrPng(a.content))).toEqual(TOKENS);

    expect(countMatches(options.html, /<img src="cid:ticket-qr-\d"/g)).toBe(3);
    const positions = ["Ghế A1", "cid:ticket-qr-1", "Ghế A2", "cid:ticket-qr-2", "Ghế A3", "cid:ticket-qr-3"].map(
      (needle) => options.html.indexOf(needle),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(options.html).toContain("Mỗi ghế có một mã QR riêng");
    TOKENS.forEach((token, i) => expect(rendered.text).toContain(`Ghế A${i + 1}: ${token}`));
  });

  it("kind khác vé -> không đính kèm gì", async () => {
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "PASSWORD_SET", { token: "t" });

    expect(sentOptions(transport).attachments).toBeUndefined();
  });

  it("vé không có token -> không tạo ảnh, vẫn gửi", async () => {
    const transport = recordingTransport();
    const toBuffer = vi.spyOn(QRCode, "toBuffer");

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", BASE_PAYLOAD);

    expect(toBuffer).not.toHaveBeenCalled();
    expect(sentOptions(transport).attachments).toBeUndefined();
    expect(sentOptions(transport).html).not.toContain('<img src="cid:');
  });

  it("một vé lỗi tạo ảnh -> vẫn gửi, vé đó chỉ có chữ, các vé khác vẫn có ảnh, không log token", async () => {
    const originalToBuffer = QRCode.toBuffer.bind(QRCode) as (text: string, opts: object) => Promise<Buffer>;
    const failingToken = TOKENS[1]!;
    vi.spyOn(QRCode, "toBuffer").mockImplementation(((text: string, opts: object) =>
      text === failingToken ? Promise.reject(new Error("canvas exploded")) : originalToBuffer(text, opts)) as never);
    const transport = recordingTransport();
    const service = new MailService(env, transport);
    const warn = vi.spyOn(service["logger"], "warn").mockImplementation(() => undefined);

    const { id } = await service.sendOutboxEmail("khach@example.com", "TICKET_ISSUED", multiTicketPayload(TOKENS));

    expect(id).toBe("<smtp-qr@host>");
    const options = sentOptions(transport);
    expect(options.attachments!.map((a) => a.cid)).toEqual(["ticket-qr-1", "ticket-qr-3"]);
    expect(options.attachments!.map((a) => decodeQrPng(a.content))).toEqual([TOKENS[0], TOKENS[2]]);
    expect(countMatches(options.html, /<img src="cid:/g)).toBe(2);
    expect(options.html).not.toContain("cid:ticket-qr-2");
    expect(options.html).toContain(failingToken);
    expect(warn).toHaveBeenCalledTimes(1);
    for (const token of TOKENS) expect(String(warn.mock.calls[0]![0])).not.toContain(token);
  });

  it("mọi vé lỗi tạo ảnh -> gửi bản chỉ chữ, không attachments, không throw", async () => {
    vi.spyOn(QRCode, "toBuffer").mockRejectedValue(new Error("canvas exploded"));
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", multiTicketPayload(TOKENS));

    const options = sentOptions(transport);
    expect(options.attachments).toBeUndefined();
    expect(options.html).not.toContain('<img src="cid:');
    for (const token of TOKENS) expect(options.html).toContain(token);
  });

  it(`vượt trần ${MAX_TICKET_QR_IMAGES} ảnh/mail -> vé còn lại chỉ có chữ token`, async () => {
    const tokens = Array.from({ length: MAX_TICKET_QR_IMAGES + 2 }, (_, i) => i.toString(16).padStart(32, "0"));
    const transport = recordingTransport();
    const toBuffer = vi.spyOn(QRCode, "toBuffer");

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", multiTicketPayload(tokens));

    const options = sentOptions(transport);
    expect(toBuffer).toHaveBeenCalledTimes(MAX_TICKET_QR_IMAGES);
    expect(options.attachments).toHaveLength(MAX_TICKET_QR_IMAGES);
    expect(countMatches(options.html, /<img src="cid:/g)).toBe(MAX_TICKET_QR_IMAGES);
    for (const token of tokens) expect(options.html).toContain(token);
  });
});

describe("MIME thật (nodemailer streamTransport, không mạng)", () => {
  async function buildRawMime(payload: Record<string, unknown>): Promise<string> {
    const smtpStandIn = createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    let rawMime = "";
    const transport: MailTransport = {
      sendMail: async (options) => {
        const info = await smtpStandIn.sendMail(options);
        rawMime = (info.message as Buffer).toString("utf8");
        return { messageId: info.messageId };
      },
    };
    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", payload);
    return rawMime;
  }

  it("thư vé 1 ghế có part image/png Content-ID <ticket-qr-1> inline, HTML tham chiếu cid", async () => {
    const rawMime = await buildRawMime(multiTicketPayload([TOKENS[0]!]));

    expect(rawMime).toMatch(/Content-Type: multipart\/related/i);
    expect(rawMime).toMatch(/Content-Type: image\/png/i);
    expect(rawMime).toMatch(/Content-ID: <ticket-qr-1>/i);
    expect(rawMime).toMatch(/Content-Disposition: inline/i);
    expect(rawMime).toContain("cid:ticket-qr-1");
  });

  it("thư vé 2 ghế có 2 part image/png với 2 Content-ID khác nhau", async () => {
    const rawMime = await buildRawMime(multiTicketPayload([TOKENS[0]!, TOKENS[1]!]));

    expect(countMatches(rawMime, /Content-Type: image\/png/gi)).toBe(2);
    expect(rawMime).toMatch(/Content-ID: <ticket-qr-1>/i);
    expect(rawMime).toMatch(/Content-ID: <ticket-qr-2>/i);
    expect(rawMime).toContain("cid:ticket-qr-1");
    expect(rawMime).toContain("cid:ticket-qr-2");
  });
});

describe("bộ sinh QR khớp web (level M, nguyên chuỗi token)", () => {
  it("ảnh PNG cấu hình như mail giải mã được ra chính token", async () => {
    const png = await QRCode.toBuffer(TOKENS[0]!, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 440,
    });

    expect(decodeQrPng(png)).toBe(TOKENS[0]);
  });
});
