/**
 * Templates email tiếng Việt cho toàn hệ thống FilmBooking.
 * Tuân thủ:
 * - R-86 & R-133: Email vé (mã đặt vé, qr_token, tên rạp, địa chỉ rạp, nhắc 'chỉ dùng tại rạp ghi trên vé', 'không huỷ/không hoàn', đến trước 15 phút).
 * - R-11: Cảnh báo khoá đăng nhập (5 lần sai, khoá 15 phút).
 * - R-24: Thông báo liên kết / huỷ liên kết phương thức đăng nhập MXH.
 * - R-78: Tiền về muộn / chênh lệch số tiền cần hướng dẫn liên hệ rạp.
 * - R-109: Huỷ suất chiếu (hướng dẫn liên hệ CSKH rạp, hotline mặc định 1900 0000 để hoàn tiền thủ công; không có đổi suất).
 * - AC-26: Template vé không chứa dữ liệu nhạy cảm ngoài cần thiết; QR là qr_token.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const DEFAULT_HOTLINE = "1900 0000";
export const DEFAULT_WEB_ORIGIN = "https://filmbooking.vn";

/** Giải quyết Web Origin an toàn cho các liên kết hành động trong email */
export function resolveOrigin(payload: Record<string, unknown>): string {
  if (typeof payload.web_origin === "string" && payload.web_origin.trim()) {
    return payload.web_origin.trim().replace(/\/+$/, "");
  }
  if (typeof payload.webOrigin === "string" && payload.webOrigin.trim()) {
    return payload.webOrigin.trim().replace(/\/+$/, "");
  }
  if (typeof process !== "undefined" && process.env?.WEB_ORIGIN) {
    const first = process.env.WEB_ORIGIN.split(",")[0]?.trim();
    if (first) return first.replace(/\/+$/, "");
  }
  return DEFAULT_WEB_ORIGIN;
}

/** Format tiền tệ VND không có phần thập phân theo NFR-15. */
export function formatCurrencyVND(amount: unknown): string {
  if (amount === undefined || amount === null || amount === "") return "0 đ";
  const num = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(num)) return `${String(amount)} đ`;
  return `${new Intl.NumberFormat("vi-VN").format(num)} đ`;
}

/** Format thời gian hiển thị Asia/Ho_Chi_Minh theo NFR-15. */
export function formatDateTimeVN(dateStr: unknown): string {
  if (!dateStr) return "";
  const d = new Date(String(dateStr));
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wrapLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f7; color: #333333; margin: 0; padding: 20px; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .header { background: #111827; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
    .content { padding: 32px 24px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 13px; font-weight: 600; background: #fee2e2; color: #b91c1c; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 18px; margin: 18px 0; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e5e7eb; }
    .row:last-child { border-bottom: none; }
    .label { color: #6b7280; font-size: 14px; }
    .value { font-weight: 600; font-size: 14px; text-align: right; }
    .alert-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; margin: 20px 0; border-radius: 0 4px 4px 0; font-size: 14px; color: #92400e; }
    .danger-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; margin: 20px 0; border-radius: 0 4px 4px 0; font-size: 14px; color: #991b1b; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 16px 0; text-align: center; }
    .qr-text { font-family: monospace; font-size: 16px; letter-spacing: 2px; padding: 10px; background: #f3f4f6; display: inline-block; border-radius: 4px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>FilmBooking</h1>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Đây là email tự động từ hệ thống FilmBooking. Vui lòng không trả lời trực tiếp email này.</p>
      <p>Tổng đài CSKH hỗ trợ: ${DEFAULT_HOTLINE} (8:00 - 22:00 hàng ngày)</p>
    </div>
  </div>
</body>
</html>`;
}

/** 1. Email vé (TICKET_ISSUED) - R-86, R-133, AC-26 */
export function renderTicketEmail(payload: Record<string, unknown>): RenderedEmail {
  const bookingCode = String(payload.booking_code ?? payload.bookingCode ?? "N/A");
  const qrToken = String(payload.qr_token ?? payload.qrToken ?? "");
  const cinemaName = String(payload.cinema_name ?? payload.cinemaName ?? "Rạp FilmBooking");
  const cinemaAddress = payload.cinema_address ? String(payload.cinema_address) : "";
  const hotline = String(payload.hotline ?? DEFAULT_HOTLINE);
  const movieTitle = String(payload.movie_title ?? payload.movieTitle ?? "Phim");
  const ageRating = payload.age_rating ? String(payload.age_rating) : (payload.ageRating ? String(payload.ageRating) : "");
  const roomName = String(payload.room_name ?? payload.roomName ?? "Phòng chiếu");
  const startsAt = formatDateTimeVN(String(payload.showtime_starts_at ?? payload.showtimeStartsAt ?? ""));
  const seats = Array.isArray(payload.seats) ? payload.seats.join(", ") : String(payload.seats ?? "");
  const combos = Array.isArray(payload.combos) ? payload.combos.join(", ") : (payload.combos ? String(payload.combos) : "");
  const totalAmount = formatCurrencyVND(payload.total_amount ?? payload.totalAmount);

  const subject = `[FilmBooking] Vé xem phim của bạn - Mã đặt vé: ${bookingCode}`;

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#111827;">Xác nhận đặt vé thành công!</h2>
    <p>Cảm ơn bạn đã đặt vé xem phim tại <strong>${escapeHtml(cinemaName)}</strong>. Dưới đây là thông tin vé của bạn:</p>

    <div class="card">
      <div style="text-align:center; margin-bottom:16px;">
        <span class="label">MÃ ĐẶT VÉ</span><br>
        <span style="font-size:24px; font-weight:800; color:#2563eb; letter-spacing:1px;">${escapeHtml(bookingCode)}</span>
      </div>

      ${qrToken ? `
      <div style="text-align:center; margin-bottom:16px;">
        <span class="label">MÃ QUÉT SOÁT VÉ (QR TOKEN)</span><br>
        <span class="qr-text">${escapeHtml(qrToken)}</span>
      </div>` : ""}

      <div class="row"><span class="label">Phim</span><span class="value">${escapeHtml(movieTitle)} ${ageRating ? `(${escapeHtml(ageRating)})` : ""}</span></div>
      <div class="row"><span class="label">Rạp chiếu</span><span class="value">${escapeHtml(cinemaName)}</span></div>
      ${cinemaAddress ? `<div class="row"><span class="label">Địa chỉ</span><span class="value">${escapeHtml(cinemaAddress)}</span></div>` : ""}
      <div class="row"><span class="label">Hotline rạp</span><span class="value">${escapeHtml(hotline)}</span></div>
      <div class="row"><span class="label">Phòng chiếu</span><span class="value">${escapeHtml(roomName)}</span></div>
      <div class="row"><span class="label">Suất chiếu</span><span class="value">${escapeHtml(startsAt)}</span></div>
      ${seats ? `<div class="row"><span class="label">Ghế</span><span class="value">${escapeHtml(seats)}</span></div>` : ""}
      ${combos ? `<div class="row"><span class="label">Bắp nước</span><span class="value">${escapeHtml(combos)}</span></div>` : ""}
      <div class="row"><span class="label">Tổng thanh toán</span><span class="value" style="color:#059669; font-size:16px;">${escapeHtml(totalAmount)}</span></div>
    </div>

    <div class="alert-box">
      <strong>Lưu ý quan trọng khi xem phim:</strong>
      <ul style="margin:8px 0 0 0; padding-left:20px;">
        <li>Vui lòng có mặt tại rạp <strong>trước giờ chiếu tối thiểu 15 phút</strong> để làm thủ tục soát vé và nhận combo.</li>
        <li><strong>Vé chỉ dùng tại rạp ghi trên vé</strong> (<em>${escapeHtml(cinemaName)}</em>). Khách đến nhầm rạp sẽ không thể check-in.</li>
        <li><strong>Vé không huỷ / không hoàn tiền</strong> dưới bất kỳ hình thức nào sau khi đã thanh toán thành công (R-131, R-133).</li>
        <li>Vui lòng mang theo giấy tờ tuỳ thân chứng minh độ tuổi (CCCD/Thẻ học sinh) đối với các phim có nhãn tuổi (T13, T16, T18).</li>
      </ul>
    </div>
    `,
  );

  const text = `XÁC NHẬN ĐẶT VÉ THÀNH CÔNG - FILMBOOKING
Mã đặt vé: ${bookingCode}
${qrToken ? `QR Token: ${qrToken}\n` : ""}
Phim: ${movieTitle} ${ageRating ? `(${ageRating})` : ""}
Rạp chiếu: ${cinemaName}
${cinemaAddress ? `Địa chỉ: ${cinemaAddress}\n` : ""}Hotline: ${hotline}
Phòng: ${roomName}
Suất chiếu: ${startsAt}
${seats ? `Ghế: ${seats}\n` : ""}${combos ? `Combo: ${combos}\n` : ""}Tổng tiền: ${totalAmount}

LƯU Ý QUAN TRỌNG (R-133):
- Vui lòng có mặt tại rạp trước giờ chiếu tối thiểu 15 phút.
- Vé chỉ dùng tại rạp ghi trên vé (${cinemaName}).
- Vé không huỷ / không hoàn tiền dưới bất kỳ hình thức nào.
- Vui lòng xuất trình giấy tờ tuỳ thân với phim có giới hạn độ tuổi.`;

  return { subject, html, text };
}

/** 2. Cảnh báo khoá đăng nhập (ACCOUNT_LOCKED_ALERT) - R-11 */
export function renderAccountLockedAlertEmail(payload: Record<string, unknown>): RenderedEmail {
  const lockMinutes = Number(payload.lockMinutes ?? 15);
  const lockedUntil = payload.lockedUntil ? formatDateTimeVN(String(payload.lockedUntil)) : `${lockMinutes} phút`;

  const subject = "[FilmBooking] Cảnh báo bảo mật: Tài khoản của bạn bị tạm khoá đăng nhập";

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#b91c1c;">Cảnh báo khoá đăng nhập</h2>
    <p>Hệ thống FilmBooking phát hiện tài khoản của bạn đã bị <strong>nhập sai mật khẩu 5 lần liên tiếp</strong>.</p>
    
    <div class="danger-box">
      Để bảo vệ an toàn cho tài khoản, tính năng đăng nhập bằng mật khẩu đã bị tạm khoá trong <strong>${lockMinutes} phút</strong> (đến <strong>${escapeHtml(lockedUntil)}</strong>).
    </div>

    <p>Nếu bạn là người thực hiện, vui lòng chờ hết thời gian tạm khoá hoặc sử dụng tính năng <em>Quên mật khẩu</em> trên ứng dụng/website để thiết lập lại mật khẩu mới.</p>
    <p>Nếu bạn <strong>không</strong> thực hiện các lần đăng nhập này, rất có thể tài khoản của bạn đang bị dò mật khẩu trái phép. Vui lòng đổi mật khẩu ngay sau khi tài khoản được mở khoá để đảm bảo an toàn.</p>
    `,
  );

  const text = `CẢNH BÁO BẢO MẬT: TÀI KHOẢN BỊ TẠM KHOÁ ĐĂNG NHẬP
Hệ thống phát hiện tài khoản đã bị nhập sai mật khẩu 5 lần liên tiếp.
Tính năng đăng nhập bằng mật khẩu tạm khoá trong ${lockMinutes} phút (đến ${lockedUntil}).

Nếu bạn không thực hiện các lần đăng nhập này, vui lòng đổi mật khẩu ngay sau khi mở khoá để bảo vệ tài khoản.`;

  return { subject, html, text };
}

/** 3. Thông báo liên kết / huỷ liên kết MXH (identity_linked / identity_unlinked) - R-24 */
export function renderIdentityChangeEmail(payload: Record<string, unknown>, isUnlinked: boolean): RenderedEmail {
  const provider = String(payload.provider ?? "mạng xã hội").toUpperCase();
  const time = formatDateTimeVN(new Date().toISOString());

  const subject = isUnlinked
    ? `[FilmBooking] Thông báo huỷ liên kết phương thức đăng nhập ${provider}`
    : `[FilmBooking] Thông báo liên kết thành công phương thức đăng nhập ${provider}`;

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#111827;">${isUnlinked ? "Huỷ liên kết tài khoản" : "Liên kết tài khoản thành công"}</h2>
    <p>Phương thức đăng nhập <strong>${escapeHtml(provider)}</strong> đã được ${isUnlinked ? "huỷ liên kết khỏi" : "liên kết thành công với"} tài khoản FilmBooking của bạn vào lúc <strong>${escapeHtml(time)}</strong>.</p>

    <div class="alert-box">
      ${isUnlinked
        ? "Nếu bạn không thực hiện việc huỷ liên kết này, vui lòng đăng nhập vào tài khoản ngay và liên hệ CSKH để kiểm tra an toàn."
        : "Nếu bạn không thực hiện việc liên kết này, vui lòng đăng nhập để gỡ bỏ liên kết và đổi mật khẩu tài khoản ngay lập tức."}
    </div>
    `,
  );

  const text = `${isUnlinked ? "HUỶ LIÊN KẾT TÀI KHOẢN" : "LIÊN KẾT TÀI KHOẢN THÀNH CÔNG"}
Phương thức đăng nhập ${provider} đã được ${isUnlinked ? "huỷ liên kết khỏi" : "liên kết với"} tài khoản FilmBooking vào lúc ${time}.
Nếu bạn không thực hiện việc này, vui lòng liên hệ CSKH hoặc đổi mật khẩu ngay.`;

  return { subject, html, text };
}

/** 4. Tiền về muộn / chênh lệch số tiền cần hướng dẫn liên hệ rạp (LATE_PAYMENT_MANUAL_REVIEW / AMOUNT_MISMATCH_MANUAL_REVIEW) - R-78 */
export function renderLatePaymentEmail(payload: Record<string, unknown>): RenderedEmail {
  const orderId = String(payload.order_id ?? payload.orderId ?? "");
  const bookingCode = String(payload.booking_code ?? payload.bookingCode ?? "");
  const cinemaName = String(payload.cinema_name ?? payload.cinemaName ?? "Rạp FilmBooking");
  const movieTitle = String(payload.movie_title ?? payload.movieTitle ?? "Phim");
  const amount = formatCurrencyVND(payload.amount ?? payload.received_amount ?? payload.receivedAmount);
  const transactionRef = String(payload.transaction_ref ?? payload.transactionRef ?? "N/A");
  const reason = String(payload.reason ?? "");
  const hotline = String(payload.hotline ?? DEFAULT_HOTLINE);

  const isAmountMismatch = reason === "AMOUNT_MISMATCH";
  const subject = `[FilmBooking] Hướng dẫn xử lý thanh toán đơn hàng ${bookingCode || orderId}`;

  const reasonText = isAmountMismatch
    ? "Số tiền thanh toán nhận được không khớp với tổng tiền đơn hàng."
    : "Thanh toán nhận được sau khi thời gian giữ ghế đã hết hạn và ghế đã được bán cho khách hàng khác.";

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#d97706;">Thông báo cần hỗ trợ đối soát đơn hàng</h2>
    <p>Chào bạn, hệ thống ghi nhận giao dịch thanh toán cho đơn hàng xem phim <strong>${escapeHtml(movieTitle)}</strong> tại <strong>${escapeHtml(cinemaName)}</strong> của bạn.</p>

    <div class="danger-box">
      <strong>Lý do đơn hàng chưa thể tự động hoàn tất:</strong><br>
      ${escapeHtml(reasonText)}
    </div>

    <div class="card">
      ${bookingCode ? `<div class="row"><span class="label">Mã đặt vé</span><span class="value">${escapeHtml(bookingCode)}</span></div>` : ""}
      ${orderId ? `<div class="row"><span class="label">Mã đơn hàng</span><span class="value">${escapeHtml(orderId)}</span></div>` : ""}
      <div class="row"><span class="label">Mã giao dịch</span><span class="value">${escapeHtml(transactionRef)}</span></div>
      <div class="row"><span class="label">Số tiền</span><span class="value">${escapeHtml(amount)}</span></div>
      <div class="row"><span class="label">Rạp chiếu</span><span class="value">${escapeHtml(cinemaName)}</span></div>
    </div>

    <div class="alert-box">
      <strong>Hướng dẫn xử lý:</strong><br>
      Vui lòng liên hệ với bộ phận CSKH của rạp qua hotline: <strong>${escapeHtml(hotline)}</strong> hoặc đến trực tiếp quầy vé tại <em>${escapeHtml(cinemaName)}</em> để nhân viên hỗ trợ kiểm tra và hoàn tiền thủ công cho bạn.
    </div>
    `,
  );

  const text = `HƯỚNG DẪN XỬ LÝ THANH TOÁN ĐƠN HÀNG ${bookingCode || orderId}
Lý do: ${reasonText}
Mã giao dịch: ${transactionRef}
Số tiền: ${amount}
Rạp: ${cinemaName}
Hướng dẫn: Vui lòng liên hệ hotline ${hotline} hoặc đến quầy vé rạp để được hỗ trợ hoàn tiền thủ công.`;

  return { subject, html, text };
}

/** 5. Huỷ suất chiếu (showtime_cancelled) - R-109 (Scope change: chỉ hoàn tiền thủ công, không có đổi suất) */
export function renderShowtimeCancelledEmail(payload: Record<string, unknown>): RenderedEmail {
  const bookingCode = String(payload.booking_code ?? payload.bookingCode ?? "N/A");
  const cinemaName = String(payload.cinema_name ?? payload.cinemaName ?? "Rạp FilmBooking");
  const movieTitle = String(payload.movie_title ?? payload.movieTitle ?? "Phim");
  const roomName = String(payload.room_name ?? payload.roomName ?? "Phòng chiếu");
  const startsAt = formatDateTimeVN(String(payload.showtime_starts_at ?? payload.showtimeStartsAt ?? ""));
  const reason = String(payload.reason ?? "Lý do kỹ thuật / Vận hành");
  const hotline = String(payload.hotline ?? DEFAULT_HOTLINE);

  const subject = `[FilmBooking] Thông báo huỷ suất chiếu - Mã đặt vé: ${bookingCode}`;

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#b91c1c;">Thông báo huỷ suất chiếu</h2>
    <p>Rất tiếc, FilmBooking xin thông báo suất chiếu bạn đã đặt vé buộc phải huỷ do sự cố bất khả kháng:</p>

    <div class="card">
      <div class="row"><span class="label">Mã đặt vé</span><span class="value">${escapeHtml(bookingCode)}</span></div>
      <div class="row"><span class="label">Phim</span><span class="value">${escapeHtml(movieTitle)}</span></div>
      <div class="row"><span class="label">Rạp</span><span class="value">${escapeHtml(cinemaName)}</span></div>
      <div class="row"><span class="label">Phòng</span><span class="value">${escapeHtml(roomName)}</span></div>
      <div class="row"><span class="label">Suất chiếu dự kiến</span><span class="value">${escapeHtml(startsAt)}</span></div>
      <div class="row"><span class="label">Lý do huỷ</span><span class="value" style="color:#b91c1c;">${escapeHtml(reason)}</span></div>
    </div>

    <div class="alert-box">
      <strong>Hướng dẫn nhận hoàn tiền thủ công (R-109):</strong><br>
      Quý khách vui lòng liên hệ với bộ phận CSKH của rạp qua hotline: <strong>${escapeHtml(hotline)}</strong> (hoặc đến trực tiếp quầy vé tại <em>${escapeHtml(cinemaName)}</em>) để nhân viên hỗ trợ hoàn tiền vé thủ công.<br>
      <small style="color:#6b7280; display:block; margin-top:6px;">* Lưu ý: Hệ thống hiện không hỗ trợ đổi sang suất chiếu khác, rạp sẽ thực hiện hoàn trả tiền vé trực tiếp cho quý khách.</small>
    </div>
    `,
  );

  const text = `THÔNG BÁO HUỶ SUẤT CHIẾU - MÃ ĐẶT VÉ: ${bookingCode}
Phim: ${movieTitle}
Rạp: ${cinemaName}
Suất chiếu: ${startsAt}
Lý do huỷ: ${reason}

HƯỚNG DẪN HOÀN TIỀN (R-109):
Quý khách vui lòng liên hệ CSKH qua hotline: ${hotline} (hoặc quầy vé tại rạp) để được hỗ trợ hoàn tiền vé thủ công.
(Lưu ý: Hệ thống không hỗ trợ đổi sang suất chiếu khác, chỉ hoàn tiền thủ công).`;

  return { subject, html, text };
}

/** 6. Thiết lập mật khẩu tài khoản (password_set) - R-22 */
export function renderPasswordSetEmail(payload: Record<string, unknown>): RenderedEmail {
  const origin = resolveOrigin(payload);
  const token = payload.token ? String(payload.token) : "";
  const setPasswordUrl = payload.url
    ? String(payload.url)
    : token
      ? `${origin}/auth/set-password?token=${encodeURIComponent(token)}`
      : `${origin}/auth/set-password`;
  const message = payload.message ? String(payload.message) : "";

  const subject = "[FilmBooking] Thiết lập mật khẩu tài khoản";

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#111827;">Thiết lập mật khẩu tài khoản</h2>
    <p>Chào bạn,</p>
    <p>${escapeHtml(message || "Hệ thống FilmBooking nhận được yêu cầu thiết lập mật khẩu cho tài khoản của bạn. Vui lòng bấm vào nút bên dưới để tạo mật khẩu mới:")}</p>

    <div style="text-align:center; margin: 28px 0;">
      <a href="${escapeHtml(setPasswordUrl)}" class="btn">Thiết lập mật khẩu</a>
    </div>

    <div class="alert-box">
      <strong>Lưu ý bảo mật:</strong>
      <ul style="margin:8px 0 0 0; padding-left:20px;">
        <li>Liên kết thiết lập mật khẩu chỉ có hiệu lực trong thời gian quy định và chỉ dùng được một lần.</li>
        <li>Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email và kiểm tra lại bảo mật tài khoản.</li>
        <li>Tuyệt đối không chia sẻ liên kết này cho bất kỳ ai khác.</li>
      </ul>
    </div>

    <p style="word-break: break-all; font-size: 13px; color: #6b7280; margin-top:20px;">
      Nếu nút bấm phía trên không hoạt động, bạn có thể sao chép liên kết sau vào trình duyệt:<br>
      <a href="${escapeHtml(setPasswordUrl)}" style="color:#2563eb;">${escapeHtml(setPasswordUrl)}</a>
    </p>
    `,
  );

  const text = `THIẾT LẬP MẬT KHẨU TÀI KHOẢN - FILMBOOKING

Chào bạn,
${message || "Hệ thống FilmBooking nhận được yêu cầu thiết lập mật khẩu cho tài khoản của bạn."}

Vui lòng truy cập liên kết sau để thiết lập mật khẩu:
${setPasswordUrl}

Lưu ý:
- Liên kết chỉ sử dụng được một lần và có thời hạn.
- Tuyệt đối không chia sẻ liên kết này cho bất kỳ ai khác.
- Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.`;

  return { subject, html, text };
}

/** 7. Phát hiện liên kết tài khoản trùng email (oauth_missing_email_collision) - R-21 */
export function renderOAuthMissingEmailCollisionEmail(payload: Record<string, unknown>): RenderedEmail {
  const origin = resolveOrigin(payload);
  const provider = String(payload.provider ?? "mạng xã hội").toUpperCase();
  const loginUrl = payload.url ? String(payload.url) : `${origin}/auth/login?redirect=/me/profile`;
  const profileUrl = `${origin}/me/profile`;

  const subject = "[FilmBooking] Phát hiện liên kết tài khoản trùng email";

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#d97706;">Phát hiện liên kết tài khoản trùng email</h2>
    <p>Chào bạn,</p>
    <p>Hệ thống FilmBooking phát hiện bạn vừa sử dụng phương thức đăng nhập <strong>${escapeHtml(provider)}</strong> với địa chỉ email đã được đăng ký cho một tài khoản trước đó trên FilmBooking.</p>

    <div class="alert-box">
      <strong>Hướng dẫn liên kết an toàn:</strong><br>
      Để bảo vệ an toàn cho tài khoản và tránh trùng lặp dữ liệu:
      <ol style="margin:8px 0 0 0; padding-left:20px;">
        <li>Vui lòng đăng nhập vào FilmBooking bằng phương thức cũ (email/mật khẩu hoặc nhà cung cấp đã liên kết trước đó).</li>
        <li>Sau khi đăng nhập thành công, truy cập vào mục <strong>Hồ sơ / Cài đặt tài khoản</strong>.</li>
        <li>Tại phần <em>Phương thức đăng nhập</em>, bấm chọn <strong>Liên kết ${escapeHtml(provider)}</strong> để hoàn tất đồng bộ.</li>
      </ol>
    </div>

    <div style="text-align:center; margin: 28px 0;">
      <a href="${escapeHtml(loginUrl)}" class="btn">Đăng nhập để liên kết tài khoản</a>
    </div>

    <p style="word-break: break-all; font-size: 13px; color: #6b7280; margin-top:20px;">
      Bạn cũng có thể vào trực tiếp trang quản lý hồ sơ tại:<br>
      <a href="${escapeHtml(profileUrl)}" style="color:#2563eb;">${escapeHtml(profileUrl)}</a>
    </p>
    `,
  );

  const text = `PHÁT HIỆN LIÊN KẾT TÀI KHOẢN TRÙNG EMAIL - FILMBOOKING

Chào bạn,
Hệ thống phát hiện bạn vừa đăng nhập bằng ${provider} với email đã tồn tại trên FilmBooking.

Hướng dẫn liên kết an toàn:
1. Đăng nhập bằng phương thức cũ (mật khẩu hoặc mạng xã hội đã đăng ký ban đầu).
2. Vào mục Hồ sơ / Cài đặt tài khoản (${profileUrl}).
3. Chọn "Liên kết ${provider}" để đồng bộ tài khoản.

Đăng nhập ngay tại: ${loginUrl}`;

  return { subject, html, text };
}

/** 8. Xác thực email bổ sung (oauth_missing_email_verify) - R-21, #18 */
export function renderOAuthMissingEmailVerifyEmail(payload: Record<string, unknown>): RenderedEmail {
  const origin = resolveOrigin(payload);
  const provider = String(payload.provider ?? "mạng xã hội").toUpperCase();
  const token = payload.token ? String(payload.token) : "";
  const verifyUrl = payload.url
    ? String(payload.url)
    : `${origin}/auth/oauth/verify-email?token=${encodeURIComponent(token)}`;
  const message = payload.message ? String(payload.message) : "";

  const subject = "[FilmBooking] Xác thực email bổ sung";

  const html = wrapLayout(
    subject,
    `
    <h2 style="margin-top:0; color:#111827;">Xác thực email bổ sung</h2>
    <p>Chào bạn,</p>
    <p>${escapeHtml(message || `Bạn vừa đăng nhập FilmBooking bằng ${provider}. Để hoàn tất đăng ký tài khoản, vui lòng xác thực địa chỉ email này bằng cách nhấn vào nút bên dưới:`)}</p>

    <div style="text-align:center; margin: 28px 0;">
      <a href="${escapeHtml(verifyUrl)}" class="btn">Xác thực email</a>
    </div>

    <div class="alert-box">
      <strong>Lưu ý quan trọng:</strong>
      <ul style="margin:8px 0 0 0; padding-left:20px;">
        <li>Liên kết xác thực chỉ có hiệu lực một lần trong vòng 15 phút.</li>
        <li>Sau khi xác thực, tài khoản ${escapeHtml(provider)} sẽ được liên kết chính thức với email này.</li>
        <li>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</li>
      </ul>
    </div>

    <p style="word-break: break-all; font-size: 13px; color: #6b7280; margin-top:20px;">
      Nếu nút bấm phía trên không hoạt động, bạn có thể sao chép liên kết sau vào trình duyệt:<br>
      <a href="${escapeHtml(verifyUrl)}" style="color:#2563eb;">${escapeHtml(verifyUrl)}</a>
    </p>
    `,
  );

  const text = `XÁC THỰC EMAIL BỔ SUNG - FILMBOOKING

Chào bạn,
${message || `Bạn vừa đăng nhập FilmBooking bằng ${provider}.`}

Vui lòng truy cập liên kết sau để xác thực địa chỉ email:
${verifyUrl}

Lưu ý:
- Liên kết xác thực chỉ có hiệu lực trong 15 phút.
- Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.`;

  return { subject, html, text };
}

/** Router chọn template theo kind của outbox */
export function renderTemplate(kind: string, payload: Record<string, unknown>): RenderedEmail {
  const normalizedKind = kind.toUpperCase().trim();

  switch (normalizedKind) {
    case "TICKET_ISSUED":
    case "TICKET":
      return renderTicketEmail(payload);

    case "ACCOUNT_LOCKED_ALERT":
    case "ACCOUNT_LOCKED":
      return renderAccountLockedAlertEmail(payload);

    case "IDENTITY_LINKED":
      return renderIdentityChangeEmail(payload, false);

    case "IDENTITY_UNLINKED":
      return renderIdentityChangeEmail(payload, true);

    case "LATE_PAYMENT_MANUAL_REVIEW":
    case "AMOUNT_MISMATCH_MANUAL_REVIEW":
    case "LATE_PAYMENT":
      return renderLatePaymentEmail(payload);

    case "SHOWTIME_CANCELLED":
      return renderShowtimeCancelledEmail(payload);

    case "PASSWORD_SET":
      return renderPasswordSetEmail(payload);

    case "OAUTH_MISSING_EMAIL_COLLISION":
      return renderOAuthMissingEmailCollisionEmail(payload);

    case "OAUTH_MISSING_EMAIL_VERIFY":
      return renderOAuthMissingEmailVerifyEmail(payload);

    default:
      throw new Error(`UNKNOWN_KIND: Không hỗ trợ template cho kind '${kind}'`);
  }
}
