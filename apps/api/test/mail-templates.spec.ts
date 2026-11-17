import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOTLINE,
  extractTicketQrs,
  renderTemplate,
  renderTicketEmail,
} from "../src/modules/mail/templates";

const ORIGIN = "https://cinemo.example.com";

// Payload tối thiểu hợp lệ cho mỗi kind mà renderTemplate hỗ trợ.
const PAYLOADS: Record<string, Record<string, unknown>> = {
  TICKET_ISSUED: {
    booking_code: "HN01-ABC123",
    qr_token: "qr-token-xyz-789",
    cinema_name: "CINEMO Hà Nội",
    cinema_address: "54 Liễu Giai, Ba Đình, Hà Nội",
    movie_title: "Dune 2",
    room_name: "Phòng 1",
    showtime_starts_at: "2026-11-20T19:30:00Z",
    seats: ["A1", "A2"],
    total_amount: 180000,
  },
  ACCOUNT_LOCKED_ALERT: { lockMinutes: 15, lockedUntil: "2026-11-13T12:00:00Z" },
  IDENTITY_LINKED: { provider: "google" },
  IDENTITY_UNLINKED: { provider: "facebook" },
  LATE_PAYMENT_MANUAL_REVIEW: {
    booking_code: "HN01-LATE",
    cinema_name: "CINEMO Đà Nẵng",
    movie_title: "Kungfu Panda",
    amount: 100000,
    transaction_ref: "PAYOS-9999",
    reason: "LATE_PAYMENT",
  },
  AMOUNT_MISMATCH_MANUAL_REVIEW: {
    booking_code: "HN01-MIS",
    cinema_name: "CINEMO Đà Nẵng",
    movie_title: "Kungfu Panda",
    amount: 90000,
    transaction_ref: "PAYOS-8888",
    reason: "AMOUNT_MISMATCH",
  },
  SHOWTIME_CANCELLED: {
    booking_code: "HN01-CANCEL",
    cinema_name: "CINEMO Hải Phòng",
    movie_title: "Dune",
    room_name: "Phòng VIP",
    showtime_starts_at: "2026-11-22T20:00:00Z",
    reason: "Bảo trì rạp",
  },
  PASSWORD_SET: { token: "pwd-token-1", web_origin: ORIGIN },
  OAUTH_MISSING_EMAIL_COLLISION: { provider: "facebook", web_origin: ORIGIN },
  OAUTH_MISSING_EMAIL_VERIFY: { provider: "facebook", token: "verify-1", web_origin: ORIGIN },
};

describe("mail templates: bố cục email-safe + thương hiệu CINEMO", () => {
  for (const [kind, payload] of Object.entries(PAYLOADS)) {
    describe(kind, () => {
      const rendered = renderTemplate(kind, payload);

      it("subject bắt đầu bằng [CINEMO], không còn tên cũ", () => {
        expect(rendered.subject.startsWith("[CINEMO]")).toBe(true);
        expect(rendered.subject).not.toContain("FilmBooking");
      });

      it("html không dựa vào <style> hay flex, có lang=vi + wordmark CINEMO + accent", () => {
        expect(rendered.html).not.toContain("<style");
        expect(rendered.html).not.toContain("display:flex");
        expect(rendered.html).not.toContain("display: flex");
        expect(rendered.html).toContain('lang="vi"');
        expect(rendered.html).toContain("CINEMO");
        expect(rendered.html).toContain("#F06D5B");
        expect(rendered.html).toContain("#111620");
        expect(rendered.html).toContain(DEFAULT_HOTLINE);
      });

      it("không còn tên FilmBooking trong html/text (trừ dữ liệu động)", () => {
        expect(rendered.html).not.toContain("FilmBooking");
        expect(rendered.text).not.toContain("FilmBooking");
        expect(rendered.text).not.toContain("FILMBOOKING");
      });
    });
  }

  it("html có preheader ẩn", () => {
    const { html } = renderTemplate("TICKET_ISSUED", PAYLOADS.TICKET_ISSUED!);
    expect(html).toContain("display:none");
    expect(html).toContain("max-height:0");
  });

  it("mail có nút CTA dùng màu accent và chữ tối, kèm link dự phòng dạng text", () => {
    const { html } = renderTemplate("PASSWORD_SET", PAYLOADS.PASSWORD_SET!);
    const url = `${ORIGIN}/auth/set-password?token=pwd-token-1`;
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("background-color:#F06D5B");
    expect(html).toContain("color:#0B0D12");
    // link thuần hiển thị lại làm fallback khi nút không bấm được
    expect(html.split(url).length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe("mail vé (R-86, R-133, AC-26)", () => {
  const rendered = renderTemplate("TICKET_ISSUED", PAYLOADS.TICKET_ISSUED!);

  it("html + text chứa mã đặt vé, qr_token, rạp, địa chỉ, ghế, tổng tiền VND", () => {
    for (const out of [rendered.html, rendered.text]) {
      expect(out).toContain("HN01-ABC123");
      expect(out).toContain("qr-token-xyz-789");
      expect(out).toContain("CINEMO Hà Nội");
      expect(out).toContain("54 Liễu Giai, Ba Đình, Hà Nội");
      expect(out).toContain("A1, A2");
      expect(out).toContain("180.000 đ");
      expect(out).toContain("15 phút");
      expect(out).toContain("không huỷ");
    }
  });

  it("giữ các câu bắt buộc trong html", () => {
    expect(rendered.html).toContain("Vé chỉ dùng tại rạp ghi trên vé");
    expect(rendered.html).toContain("Vé không huỷ / không hoàn tiền");
    expect(rendered.html).toContain("giấy tờ tuỳ thân");
  });

  it("không có dữ liệu nhạy cảm (AC-26)", () => {
    expect(rendered.html).not.toContain("password");
    expect(rendered.html).not.toContain("access_token");
    expect(rendered.html).not.toContain("refresh_token");
  });
});

describe("mail: escape giá trị động", () => {
  it("không để lọt <script> hoặc dấu nháy thô từ tên phim/rạp", () => {
    const { html } = renderTicketEmail({
      booking_code: "X-1",
      qr_token: "<script>alert(2)</script>",
      cinema_name: 'Rạp "Evil" <script>alert(1)</script>',
      cinema_address: "<img src=x onerror=alert(3)>",
      movie_title: "<script>alert(1)</script>",
      seats: ["A1"],
      total_amount: 1000,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;Evil&quot;");
  });

  it("escape URL trong href của nút CTA", () => {
    const { html } = renderTemplate("PASSWORD_SET", { url: 'https://x.test/a?b="><script>1</script>' });
    expect(html).not.toContain("<script>");
  });

  it("escape preheader/tiêu đề từ giá trị động", () => {
    const { html } = renderTemplate("SHOWTIME_CANCELLED", {
      booking_code: "<b>X</b>",
      cinema_name: "R",
      movie_title: "P",
      room_name: "1",
      showtime_starts_at: "2026-11-22T20:00:00Z",
    });
    expect(html).not.toContain("<b>X</b>");
  });
});

describe("mail vé: khối QR dạng ảnh, mỗi ghế một QR (R-86, bug ticket-email-qr)", () => {
  const ticket = PAYLOADS.TICKET_ISSUED!;
  const multiTicket = {
    ...ticket,
    qr_token: undefined,
    tickets: [
      { seat_label: "A5", qr_token: "token-seat-a5" },
      { seat_label: "A6", qr_token: "token-seat-a6" },
      { seat_label: "A7", qr_token: "token-seat-a7" },
    ],
  };

  it("1 vé có cid -> nhúng <img src=cid:...> kèm alt, vẫn giữ qr_token dạng chữ", () => {
    const { html, text } = renderTemplate("TICKET_ISSUED", ticket, { qrImageCids: ["ticket-qr-1"] });

    expect(html).toContain('<img src="cid:ticket-qr-1"');
    expect(html).toContain('alt="Mã QR vé"');
    expect(html).toContain("Đưa mã này cho nhân viên soát vé tại rạp");
    expect(html).not.toContain("Mỗi ghế có một mã QR riêng");
    expect(html).toContain("qr-token-xyz-789");
    expect(text).toContain("qr-token-xyz-789");
  });

  it("không có cid -> như cũ: chỉ chữ, không <img src=cid:", () => {
    const { html } = renderTemplate("TICKET_ISSUED", ticket);

    expect(html).not.toContain('<img src="cid:');
    expect(html).toContain("qr-token-xyz-789");
  });

  it("payload không có token -> không render ảnh", () => {
    const { html } = renderTicketEmail({ booking_code: "X" }, { qrImageCids: ["ticket-qr-1"] });

    expect(html).not.toContain("<img");
  });

  it("escape cid (giá trị ngoài ý muốn không thoát được thuộc tính)", () => {
    const { html } = renderTicketEmail(ticket, { qrImageCids: ['x"><script>'] });

    expect(html).not.toContain("<script>");
  });

  it("N vé -> N ảnh theo đúng thứ tự, nhãn ghế, câu 'mỗi ghế một mã QR', text liệt kê từng token", () => {
    const { html, text } = renderTicketEmail(multiTicket, {
      qrImageCids: ["ticket-qr-1", "ticket-qr-2", "ticket-qr-3"],
    });

    expect(html.match(/<img src="cid:ticket-qr-\d"/g)).toEqual([
      '<img src="cid:ticket-qr-1"',
      '<img src="cid:ticket-qr-2"',
      '<img src="cid:ticket-qr-3"',
    ]);
    const order = ["Ghế A5", "cid:ticket-qr-1", "token-seat-a5", "Ghế A6", "cid:ticket-qr-2", "token-seat-a6", "Ghế A7"];
    const positions = order.map((needle) => html.indexOf(needle));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("Mỗi ghế có một mã QR riêng");
    expect(text).toContain("Ghế A5: token-seat-a5");
    expect(text).toContain("Ghế A6: token-seat-a6");
    expect(text).toContain("Ghế A7: token-seat-a7");
  });

  it("vé không có cid (lỗi/vượt trần) -> chỉ chữ cho vé đó, các vé khác vẫn có ảnh", () => {
    const { html } = renderTicketEmail(multiTicket, { qrImageCids: ["ticket-qr-1", null, "ticket-qr-3"] });

    expect(html.match(/<img src="cid:/g)).toHaveLength(2);
    expect(html).not.toContain("cid:ticket-qr-2");
    expect(html).toContain("token-seat-a6");
  });

  describe("extractTicketQrs", () => {
    it("qr_token / qrToken đơn lẻ -> 1 vé không nhãn (TICKET_ISSUED và TICKET, không phân biệt hoa thường)", () => {
      expect(extractTicketQrs("TICKET_ISSUED", { qr_token: "abc" })).toEqual([{ token: "abc" }]);
      expect(extractTicketQrs("ticket", { qrToken: "def" })).toEqual([{ token: "def" }]);
      expect(extractTicketQrs(" TICKET ", { qr_token: "ghi" })).toEqual([{ token: "ghi" }]);
    });

    it("payload.tickets -> giữ thứ tự, đọc seat_label/seatLabel và qr_token/qrToken, bỏ mục thiếu token", () => {
      const tickets = [
        { seat_label: "A2", qr_token: "t2" },
        { seatLabel: "A10", qrToken: "t10" },
        { seat_label: "A11", qr_token: "" },
        { qr_token: "t-no-label" },
        "rác",
        null,
      ];

      expect(extractTicketQrs("TICKET_ISSUED", { tickets, qr_token: "bi-bo-qua" })).toEqual([
        { seatLabel: "A2", token: "t2" },
        { seatLabel: "A10", token: "t10" },
        { token: "t-no-label" },
      ]);
    });

    it("tickets rỗng/không hợp lệ -> rơi về qr_token đơn lẻ", () => {
      expect(extractTicketQrs("TICKET_ISSUED", { tickets: [], qr_token: "abc" })).toEqual([{ token: "abc" }]);
    });

    it("rỗng cho kind khác hoặc thiếu token", () => {
      expect(extractTicketQrs("PASSWORD_SET", { qr_token: "abc" })).toEqual([]);
      expect(extractTicketQrs("TICKET_ISSUED", {})).toEqual([]);
      expect(extractTicketQrs("TICKET_ISSUED", { qr_token: "" })).toEqual([]);
    });
  });
});
