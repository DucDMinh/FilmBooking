import jsQR from "jsqr";
import { createTransport } from "nodemailer";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "../src/config/env";
import { MailService, type MailTransport } from "../src/modules/mail/mail.service";

// orders.qr_token thật: encode(gen_random_bytes(16), 'hex') -> 32 ký tự hex (supabase/migrations/20261117120000_order_level_qr.sql).
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

/** Payload sau enrich: đơn NHIỀU ghế nhưng chỉ MỘT qr_token của đơn (jobs.controller enrichTicketPayload). */
function orderPayload(token: string, seatCount = 8): Record<string, unknown> {
  return {
    ...BASE_PAYLOAD,
    seats: Array.from({ length: seatCount }, (_, i) => `A${i + 1}`),
    qr_token: token,
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

describe("MailService.sendOutboxEmail: mail vé có MỘT ảnh QR của đơn (R-86, order-level-qr)", () => {
  it("payload chỉ có qr_token -> 1 PNG inline cid ticket-qr, filename ve-qr.png, HTML tham chiếu cid đó", async () => {
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", {
      ...BASE_PAYLOAD,
      qr_token: TOKENS[0],
    });

    const options = sentOptions(transport);
    expect(options.attachments).toHaveLength(1);
    const [attachment] = options.attachments!;
    expect(attachment).toMatchObject({ cid: "ticket-qr", contentType: "image/png", filename: "ve-qr.png" });
    expect([...attachment!.content.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(options.html).toContain('<img src="cid:ticket-qr"');
    expect(decodeQrPng(attachment!.content)).toBe(TOKENS[0]);
  });

  it.each(TOKENS)("giải mã PNG ra đúng nguyên chuỗi qr_token của đơn %s (staff quét được)", async (token) => {
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", orderPayload(token));

    expect(decodeQrPng(sentOptions(transport).attachments![0]!.content)).toBe(token);
  });

  it("đơn 8 ghế -> ĐÚNG 1 attachment, giải mã == token đơn, HTML liệt kê đủ 8 ghế và 1 <img cid>", async () => {
    const transport = recordingTransport();

    const { rendered } = await new MailService(env, transport).sendOutboxEmail(
      "khach@example.com",
      "TICKET_ISSUED",
      orderPayload(TOKENS[0]!, 8),
    );

    const options = sentOptions(transport);
    expect(options.attachments).toHaveLength(1);
    expect(options.attachments![0]!.cid).toBe("ticket-qr");
    expect(decodeQrPng(options.attachments![0]!.content)).toBe(TOKENS[0]);
    expect(countMatches(options.html, /<img src="cid:/g)).toBe(1);
    expect(options.html).toContain("A1, A2, A3, A4, A5, A6, A7, A8");
    expect(options.html).toContain("Một mã QR cho cả đơn");
    expect(options.html).not.toContain("Mỗi ghế có một mã QR riêng");
    expect(rendered.text).toContain(`QR Token: ${TOKENS[0]}`);
  });

  it("payload cũ per-ticket (có tickets[]) không tạo thêm ảnh: chỉ 1 ảnh theo qr_token của đơn", async () => {
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", {
      ...orderPayload(TOKENS[0]!, 3),
      tickets: TOKENS.map((token, i) => ({ seat_label: `A${i + 1}`, qr_token: token })),
    });

    const options = sentOptions(transport);
    expect(options.attachments).toHaveLength(1);
    expect(decodeQrPng(options.attachments![0]!.content)).toBe(TOKENS[0]);
  });

  it("kind khác vé -> không đính kèm gì", async () => {
    const transport = recordingTransport();

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "PASSWORD_SET", { token: "t" });

    expect(sentOptions(transport).attachments).toBeUndefined();
  });

  it("thiếu token -> không tạo ảnh, vẫn gửi", async () => {
    const transport = recordingTransport();
    const toBuffer = vi.spyOn(QRCode, "toBuffer");

    await new MailService(env, transport).sendOutboxEmail("khach@example.com", "TICKET_ISSUED", BASE_PAYLOAD);

    expect(toBuffer).not.toHaveBeenCalled();
    expect(sentOptions(transport).attachments).toBeUndefined();
    expect(sentOptions(transport).html).not.toContain('<img src="cid:');
  });

  it("lỗi tạo ảnh -> vẫn gửi bản chỉ chữ (có token dự phòng), không attachments, không throw, không log token", async () => {
    vi.spyOn(QRCode, "toBuffer").mockRejectedValue(new Error("canvas exploded"));
    const transport = recordingTransport();
    const service = new MailService(env, transport);
    const warn = vi.spyOn(service["logger"], "warn").mockImplementation(() => undefined);

    const { id } = await service.sendOutboxEmail("khach@example.com", "TICKET_ISSUED", orderPayload(TOKENS[1]!));

    expect(id).toBe("<smtp-qr@host>");
    const options = sentOptions(transport);
    expect(options.attachments).toBeUndefined();
    expect(options.html).not.toContain('<img src="cid:');
    expect(options.html).toContain(TOKENS[1]);
    expect(warn).toHaveBeenCalledTimes(1);
    for (const token of TOKENS) expect(String(warn.mock.calls[0]![0])).not.toContain(token);
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

  it("thư vé đơn nhiều ghế có đúng 1 part image/png Content-ID <ticket-qr> inline, HTML tham chiếu cid", async () => {
    const rawMime = await buildRawMime(orderPayload(TOKENS[0]!, 8));

    expect(rawMime).toMatch(/Content-Type: multipart\/related/i);
    expect(countMatches(rawMime, /Content-Type: image\/png/gi)).toBe(1);
    expect(countMatches(rawMime, /Content-ID: </gi)).toBe(1);
    expect(rawMime).toMatch(/Content-ID: <ticket-qr>/i);
    expect(rawMime).toMatch(/Content-Disposition: inline/i);
    expect(rawMime).toContain("cid:ticket-qr");
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
