import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOTLINE,
  extractTicketQrToken,
  renderCinemaStatusNoticeEmail,
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
  CINEMA_STATUS_NOTICE: {
    cinema_name: "CINEMO Hà Nội",
    cinema_code: "HN01",
    cinema_address: "54 Liễu Giai, Ba Đình, Hà Nội",
    target_status: "CLOSED",
    effective_at: "2026-11-25T03:00:00Z",
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

describe("mail vé: khối QR dạng ảnh, MỘT QR cho cả đơn (R-86, order-level-qr)", () => {
  const ticket = PAYLOADS.TICKET_ISSUED!;
  const manySeats = { ...ticket, seats: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"] };

  it("có cid -> nhúng <img src=cid:...> kèm alt, câu 'Một mã QR cho cả đơn', vẫn giữ qr_token dạng chữ", () => {
    const { html, text } = renderTemplate("TICKET_ISSUED", ticket, { qrImageCid: "ticket-qr" });

    expect(html).toContain('<img src="cid:ticket-qr"');
    expect(html).toContain('alt="Mã QR vé"');
    expect(html).toContain("Một mã QR cho cả đơn");
    expect(html).toContain("không cần mã từng ghế");
    expect(html).toContain("qr-token-xyz-789");
    expect(text).toContain("QR Token: qr-token-xyz-789");
  });

  it("đơn nhiều ghế -> đúng 1 ảnh, liệt kê TOÀN BỘ ghế, không có câu per-ticket", () => {
    const { html, text } = renderTemplate("TICKET_ISSUED", manySeats, { qrImageCid: "ticket-qr" });

    expect(html.match(/<img src="cid:/g)).toHaveLength(1);
    expect(html).toContain("A1, A2, A3, A4, A5, A6, A7, A8");
    expect(text).toContain("A1, A2, A3, A4, A5, A6, A7, A8");
    expect(html).not.toContain("Mỗi ghế có một mã QR riêng");
    expect(text.match(/QR Token:/g)).toHaveLength(1);
  });

  it("không có cid -> chỉ chữ token dự phòng, không <img src=cid:", () => {
    const { html } = renderTemplate("TICKET_ISSUED", ticket);

    expect(html).not.toContain('<img src="cid:');
    expect(html).toContain("qr-token-xyz-789");
  });

  it("payload không có token -> không render ảnh", () => {
    const { html } = renderTicketEmail({ booking_code: "X" }, { qrImageCid: "ticket-qr" });

    expect(html).not.toContain("<img");
  });

  it("escape cid (giá trị ngoài ý muốn không thoát được thuộc tính)", () => {
    const { html } = renderTicketEmail(ticket, { qrImageCid: 'x"><script>' });

    expect(html).not.toContain("<script>");
  });

  it("payload.tickets (định dạng per-ticket cũ) bị bỏ qua: chỉ qr_token của đơn được dùng", () => {
    const { html } = renderTicketEmail({ ...ticket, tickets: [{ seat_label: "A1", qr_token: "token-cu-per-ticket" }] });

    expect(html).not.toContain("token-cu-per-ticket");
    expect(html).toContain("qr-token-xyz-789");
  });

  describe("extractTicketQrToken", () => {
    it("qr_token / qrToken (TICKET_ISSUED và TICKET, không phân biệt hoa thường)", () => {
      expect(extractTicketQrToken("TICKET_ISSUED", { qr_token: "abc" })).toBe("abc");
      expect(extractTicketQrToken("ticket", { qrToken: "def" })).toBe("def");
      expect(extractTicketQrToken(" TICKET ", { qr_token: "ghi" })).toBe("ghi");
    });

    it("rỗng cho kind khác hoặc thiếu token", () => {
      expect(extractTicketQrToken("PASSWORD_SET", { qr_token: "abc" })).toBe("");
      expect(extractTicketQrToken("TICKET_ISSUED", {})).toBe("");
      expect(extractTicketQrToken("TICKET_ISSUED", { qr_token: "" })).toBe("");
    });
  });
});

describe("mail thông báo đổi trạng thái rạp (R-136, AC-27)", () => {
  const base = {
    cinema_name: "CINEMO Hà Nội",
    cinema_code: "HN01",
    cinema_address: "54 Liễu Giai, Ba Đình, Hà Nội",
    hotline: "1900 1234",
    // 03:00 UTC = 10:00 giờ VN cùng ngày 25/11/2026
    effective_at: "2026-11-25T03:00:00Z",
  };
  const REFUND_DEADLINE = "CINEMO sẽ không giải quyết hoàn tiền";

  const render = (extra: Record<string, unknown>) =>
    renderTemplate("CINEMA_STATUS_NOTICE", { ...base, ...extra });

  describe("CLOSED", () => {
    const { subject, html, text } = render({ target_status: "CLOSED", current_status: "OPEN" });

    it("subject + tiêu đề + câu chính thức đóng cửa", () => {
      expect(subject).toBe("[CINEMO] Thông báo: Rạp CINEMO Hà Nội sẽ đóng cửa từ ngày 25/11/2026");
      expect(html).toContain("Thông báo đóng cửa rạp");
      expect(html).toContain("Kính gửi quý khách,");
      expect(html).toContain("chính thức đóng cửa kể từ ngày");
      expect(text).toContain("chính thức đóng cửa kể từ ngày 25/11/2026");
    });

    it("bảng thông tin: rạp, địa chỉ, ngày đóng cửa, hotline", () => {
      expect(html).toContain("54 Liễu Giai, Ba Đình, Hà Nội");
      expect(html).toContain("Ngày đóng cửa");
      expect(html).toContain("1900 1234");
      expect(text).toContain("Hotline: 1900 1234");
    });

    it("noteBox hoàn tiền: hạn chót = ngày hiệu lực, đến quầy vé, sau hạn không giải quyết", () => {
      for (const out of [html, text]) {
        expect(out).toContain("trước ngày 25/11/2026");
        expect(out).toContain("quầy vé");
        expect(out).toContain(REFUND_DEADLINE);
        // Hiệu lực rơi giữa ngày: suất trong chính ngày hiệu lực cũng bị huỷ nên phải nêu "từ ngày X trở đi"
        expect(out).toContain("từ ngày 25/11/2026 trở đi");
        expect(out).not.toContain("sau ngày 25/11/2026");
      }
      expect(html).toContain("các rạp khác vẫn hoạt động bình thường");
    });

    it("gọi tên khách khi có customer_name", () => {
      const named = render({ target_status: "CLOSED", customer_name: "Nguyễn Văn A" });
      expect(named.html).toContain("Kính gửi Nguyễn Văn A,");
    });
  });

  describe("TEMP_CLOSED", () => {
    const { subject, html, text } = render({ target_status: "TEMP_CLOSED" });

    it("tạm ngừng hoạt động, thời gian mở lại thông báo sau, vẫn có noteBox hoàn tiền", () => {
      expect(subject).toBe("[CINEMO] Thông báo: Rạp CINEMO Hà Nội sẽ tạm ngừng hoạt động từ ngày 25/11/2026");
      expect(html).toContain("tạm ngừng hoạt động kể từ ngày");
      expect(html).toContain("thời gian mở lại sẽ được thông báo sau");
      expect(html).toContain(REFUND_DEADLINE);
      expect(text).toContain("trước ngày 25/11/2026");
    });
  });

  describe("COMING_SOON", () => {
    const { subject, html } = render({ target_status: "COMING_SOON" });

    it("chuyển sang sắp khai trương, ngừng nhận đặt vé, có noteBox hoàn tiền", () => {
      expect(subject).toBe("[CINEMO] Thông báo: Rạp CINEMO Hà Nội sẽ chuyển sang sắp khai trương từ ngày 25/11/2026");
      expect(html).toContain("sắp khai trương");
      expect(html).toContain("tạm ngừng nhận đặt vé kể từ ngày");
      expect(html).toContain(REFUND_DEADLINE);
    });
  });

  describe("OPEN", () => {
    const { subject, html, text } = render({ target_status: "OPEN", current_status: "TEMP_CLOSED" });

    it("báo ngày mở cửa, mời xem lịch chiếu, KHÔNG có noteBox hoàn tiền", () => {
      expect(subject).toBe("[CINEMO] Thông báo: Rạp CINEMO Hà Nội sẽ mở cửa từ ngày 25/11/2026");
      expect(html).toContain("nhận đặt vé");
      expect(html).toContain("lịch chiếu");
      expect(html).toContain("Ngày mở cửa");
      for (const out of [html, text]) {
        expect(out).not.toContain(REFUND_DEADLINE);
        expect(out).not.toContain("quầy vé");
      }
    });

    it("nút dẫn tới trang rạp theo mã rạp", () => {
      const withOrigin = render({ target_status: "OPEN", web_origin: ORIGIN });
      expect(withOrigin.html).toContain(`href="${ORIGIN}/rap/HN01"`);
    });
  });

  describe("schedule_cancelled (đính chính huỷ lịch)", () => {
    describe("rạp đang OPEN (hoặc payload thiếu current_status): vẫn hoạt động bình thường", () => {
      for (const target of ["CLOSED", "TEMP_CLOSED", "COMING_SOON"]) {
        for (const current of ["OPEN", undefined]) {
          it(`${target} bị huỷ, current=${current ?? "(thiếu)"}`, () => {
            const { subject, html, text } = render({
              target_status: target,
              current_status: current,
              schedule_cancelled: true,
            });
            expect(subject).toBe("[CINEMO] Đính chính: Rạp CINEMO Hà Nội vẫn hoạt động bình thường");
            for (const out of [html, text]) {
              expect(out).toContain("đã được huỷ");
              expect(out).toContain("không cần đến rạp hoàn tiền");
              expect(out).toContain("xin lỗi");
              expect(out).not.toContain(REFUND_DEADLINE);
            }
          });
        }
      }

      it("nêu đúng việc bị huỷ theo target", () => {
        const closed = render({ target_status: "CLOSED", current_status: "OPEN", schedule_cancelled: true });
        expect(closed.text).toContain("đóng cửa từ ngày 25/11/2026");
        const temp = render({ target_status: "TEMP_CLOSED", current_status: "OPEN", schedule_cancelled: true });
        expect(temp.text).toContain("tạm ngừng hoạt động từ ngày 25/11/2026");
      });
    });

    describe("rạp đang KHÔNG hoạt động: không được nói 'vẫn hoạt động bình thường'", () => {
      const NOT_OPERATING_SUBJECT = "[CINEMO] Đính chính: Thông báo về rạp CINEMO Hà Nội đã được huỷ";

      function expectNoFalseClaims(out: string): void {
        expect(out).not.toContain("vẫn hoạt động bình thường");
        expect(out).not.toContain("tiếp tục hoạt động như bình thường");
        expect(out).not.toContain("không cần đến rạp hoàn tiền");
        expect(out).not.toContain(REFUND_DEADLINE);
        expect(out).toContain("đã được huỷ");
        expect(out).toContain("giữ nguyên trạng thái hiện tại");
        expect(out).toContain("xin lỗi");
      }

      it("TEMP_CLOSED -> OPEN bị huỷ: rạp vẫn tạm đóng, ngày mở cửa dự kiến không còn áp dụng", () => {
        const { subject, html, text } = render({
          target_status: "OPEN",
          current_status: "TEMP_CLOSED",
          schedule_cancelled: true,
        });
        expect(subject).toBe(NOT_OPERATING_SUBJECT);
        for (const out of [html, text]) {
          expectNoFalseClaims(out);
          expect(out).toContain("đang tạm đóng cửa");
          expect(out).toContain("mở cửa từ ngày 25/11/2026 đã được huỷ");
          expect(out).toContain("Ngày mở cửa dự kiến không còn áp dụng");
        }
      });

      it("COMING_SOON -> OPEN bị huỷ: rạp vẫn sắp khai trương", () => {
        const { subject, html, text } = render({
          target_status: "OPEN",
          current_status: "COMING_SOON",
          schedule_cancelled: true,
        });
        expect(subject).toBe(NOT_OPERATING_SUBJECT);
        for (const out of [html, text]) {
          expectNoFalseClaims(out);
          expect(out).toContain("đang ở trạng thái sắp khai trương");
          expect(out).toContain("Ngày mở cửa dự kiến không còn áp dụng");
        }
      });

      it("TEMP_CLOSED -> CLOSED bị huỷ: rạp vẫn tạm đóng, không nhắc ngày mở cửa", () => {
        const { subject, html, text } = render({
          target_status: "CLOSED",
          current_status: "TEMP_CLOSED",
          schedule_cancelled: true,
        });
        expect(subject).toBe(NOT_OPERATING_SUBJECT);
        for (const out of [html, text]) {
          expectNoFalseClaims(out);
          expect(out).toContain("đang tạm đóng cửa");
          expect(out).toContain("đóng cửa từ ngày 25/11/2026 đã được huỷ");
          expect(out).not.toContain("Ngày mở cửa dự kiến");
        }
      });

      it("CLOSED -> OPEN bị huỷ: rạp vẫn đã đóng cửa", () => {
        const { html, text } = render({
          target_status: "OPEN",
          current_status: "CLOSED",
          schedule_cancelled: true,
        });
        for (const out of [html, text]) {
          expectNoFalseClaims(out);
          expect(out).toContain("đã đóng cửa");
        }
      });
    });

    it("OPEN -> CLOSED bị huỷ: rạp vẫn hoạt động (current OPEN)", () => {
      const { subject, text } = render({
        target_status: "CLOSED",
        current_status: "open",
        schedule_cancelled: true,
      });
      expect(subject).toBe("[CINEMO] Đính chính: Rạp CINEMO Hà Nội vẫn hoạt động bình thường");
      expect(text).toContain("đóng cửa từ ngày 25/11/2026 đã được huỷ");
    });
  });

  describe("target không nhận diện được", () => {
    it("dùng mẫu chung, không ném lỗi, không noteBox hoàn tiền", () => {
      for (const target of ["WHATEVER", undefined]) {
        const { subject, html, text } = render({ target_status: target });
        expect(subject).toBe("[CINEMO] Thông báo: Rạp CINEMO Hà Nội thay đổi trạng thái hoạt động");
        expect(html).toContain("thay đổi trạng thái hoạt động");
        expect(html).not.toContain(REFUND_DEADLINE);
        expect(text).not.toContain(REFUND_DEADLINE);
      }
    });
  });

  describe("định dạng ngày theo giờ Việt Nam", () => {
    it("23:30 UTC ngày 24 = 06:30 ngày 25 giờ VN -> 25/11/2026", () => {
      const { subject, html, text } = render({ target_status: "CLOSED", effective_at: "2026-11-24T23:30:00Z" });
      expect(subject).toContain("25/11/2026");
      for (const out of [html, text]) {
        expect(out).toContain("trước ngày 25/11/2026");
        expect(out).not.toContain("24/11/2026");
      }
    });

    it("17:00 UTC ngày 25 = 00:00 ngày 26 giờ VN -> 26/11/2026, cả hạn chót trong noteBox và dòng ngày đóng cửa", () => {
      const { subject, html, text } = render({ target_status: "CLOSED", effective_at: "2026-11-25T17:00:00Z" });
      expect(subject).toContain("26/11/2026");
      for (const out of [html, text]) {
        expect(out).toContain("trước ngày 26/11/2026");
        expect(out).toContain("từ ngày 26/11/2026 trở đi");
        expect(out).not.toContain("25/11/2026");
      }
      expect(text).toContain("Ngày đóng cửa: 26/11/2026");
    });
  });

  describe("hotline + payload camelCase + router", () => {
    it("thiếu hotline -> dùng hotline mặc định trong bản text", () => {
      const { text } = renderCinemaStatusNoticeEmail({
        cinema_name: "R",
        target_status: "CLOSED",
        effective_at: "2026-11-25T03:00:00Z",
      });
      expect(text).toContain(`Hotline: ${DEFAULT_HOTLINE}`);
    });

    it("chấp nhận camelCase", () => {
      const { subject, html } = renderTemplate("CINEMA_STATUS_NOTICE", {
        cinemaName: "CINEMO Huế",
        cinemaCode: "HUE1",
        targetStatus: "closed",
        effectiveAt: "2026-11-25T03:00:00Z",
        customerName: "Lan",
        scheduleCancelled: false,
      });
      expect(subject).toBe("[CINEMO] Thông báo: Rạp CINEMO Huế sẽ đóng cửa từ ngày 25/11/2026");
      expect(html).toContain("Kính gửi Lan,");
    });

    it("kind không phân biệt hoa thường và khoảng trắng", () => {
      const payload = { ...base, target_status: "CLOSED" };
      const expected = renderTemplate("CINEMA_STATUS_NOTICE", payload).subject;
      expect(renderTemplate("cinema_status_notice", payload).subject).toBe(expected);
      expect(renderTemplate("  Cinema_Status_Notice ", payload).subject).toBe(expected);
    });
  });

  describe("escape HTML", () => {
    it("tên rạp, địa chỉ, tên khách chứa mã độc không lọt ra html", () => {
      const { html } = renderTemplate("CINEMA_STATUS_NOTICE", {
        cinema_name: "<script>alert(1)</script>",
        cinema_code: '"><img src=x>',
        cinema_address: "<img src=x onerror=alert(3)>",
        customer_name: "<b>Hacker</b>",
        target_status: "CLOSED",
        effective_at: "2026-11-25T03:00:00Z",
      });
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<b>Hacker</b>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("OPEN: cinema_code độc hại được encode + escape trong href nút 'Xem lịch chiếu'", () => {
      const code = 'x"><img src=x onerror=alert(1)>';
      const { html } = renderTemplate("CINEMA_STATUS_NOTICE", {
        ...base,
        cinema_code: code,
        target_status: "OPEN",
        web_origin: ORIGIN,
      });
      expect(html).toContain("Xem lịch chiếu");
      expect(html).not.toContain("<img");
      expect(html).toContain(`href="${ORIGIN}/rap/${encodeURIComponent(code)}"`);
    });
  });

  describe("subject một dòng", () => {
    it("tên rạp chứa CR/LF không làm subject xuống dòng", () => {
      const { subject } = render({ cinema_name: "CINEMO\r\nBcc: x@evil.test", target_status: "CLOSED" });
      expect(subject).not.toMatch(/[\r\n]/);
      expect(subject).toContain("CINEMO Bcc: x@evil.test");
      const correction = render({
        cinema_name: "CINEMO\nHà Nội",
        target_status: "CLOSED",
        current_status: "OPEN",
        schedule_cancelled: true,
      });
      expect(correction.subject).not.toMatch(/[\r\n]/);
    });
  });
});
