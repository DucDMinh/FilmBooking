import { describe, expect, it } from "vitest";
import { DEFAULT_HOTLINE, renderTemplate, renderTicketEmail } from "../src/modules/mail/templates";

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
