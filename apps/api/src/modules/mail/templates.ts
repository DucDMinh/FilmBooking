/**
 * Templates email tiếng Việt cho toàn hệ thống CINEMO.
 * Tuân thủ:
 * - R-86 & R-133: Email vé (mã đặt vé, qr_token, tên rạp, địa chỉ rạp, nhắc 'chỉ dùng tại rạp ghi trên vé', 'không huỷ/không hoàn', đến trước 15 phút).
 * - R-11: Cảnh báo khoá đăng nhập (5 lần sai, khoá 15 phút).
 * - R-24: Thông báo liên kết / huỷ liên kết phương thức đăng nhập MXH.
 * - R-78: Tiền về muộn / chênh lệch số tiền cần hướng dẫn liên hệ rạp.
 * - R-109: Huỷ suất chiếu (hướng dẫn liên hệ CSKH rạp, hotline mặc định 1900 0000 để hoàn tiền thủ công; không có đổi suất).
 * - AC-26: Template vé không chứa dữ liệu nhạy cảm ngoài cần thiết; QR là qr_token.
 *
 * Giao diện email-safe: bảng + inline style (Gmail/Outlook không hỗ trợ ổn định flex hoặc <style>),
 * mọi giá trị động đi qua escapeHtml.
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

// ── Thương hiệu CINEMO (đồng bộ với design tokens của web) ──
const BRAND = {
  accent: "#F06D5B",
  onAccent: "#0B0D12",
  header: "#111620",
  pageBg: "#EEF0F4",
  text: "#1B222E",
  muted: "#6B7280",
  line: "#E6E9EF",
  cardBg: "#F7F8FA",
  link: "#C2410C",
};
const FONT_STACK = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

interface LayoutOptions {
  /** Dòng xem trước hiển thị cạnh tiêu đề trong hộp thư (ẩn trong nội dung). */
  preheader?: string;
}

function wrapLayout(title: string, bodyHtml: string, opts: LayoutOptions = {}): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.pageBg};">${escapeHtml(opts.preheader)}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.pageBg}" style="background-color:${BRAND.pageBg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td align="center" bgcolor="${BRAND.header}" style="background-color:${BRAND.header};padding:22px 24px;border-radius:12px 12px 0 0;">
            <span style="font-family:${FONT_STACK};font-size:26px;font-weight:800;letter-spacing:6px;color:${BRAND.accent};">CINEMO</span>
          </td>
        </tr>
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:32px 28px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${BRAND.text};">
${bodyHtml}
          </td>
        </tr>
        <tr>
          <td align="center" bgcolor="${BRAND.cardBg}" style="background-color:${BRAND.cardBg};padding:20px 24px;border-top:1px solid ${BRAND.line};border-radius:0 0 12px 12px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${BRAND.muted};">
            Đây là email tự động từ hệ thống CINEMO. Vui lòng không trả lời trực tiếp email này.<br>
            Tổng đài CSKH hỗ trợ: <strong>${DEFAULT_HOTLINE}</strong> (8:00 - 22:00 hàng ngày)
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function heading(text: string, color: string = BRAND.text): string {
  return `<h2 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:700;color:${color};">${escapeHtml(text)}</h2>`;
}

/** Đoạn văn; `html` là HTML đã được caller escape các giá trị động. */
function paragraph(html: string): string {
  return `<p style="margin:0 0 14px 0;">${html}</p>`;
}

/** Nút CTA dạng bảng (hiển thị tốt cả Outlook), nền accent + chữ tối. */
function button(label: string, url: string): string {
  const href = escapeHtml(url);
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
  <tr>
    <td align="center" bgcolor="${BRAND.accent}" style="background-color:${BRAND.accent};border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT_STACK};font-size:16px;font-weight:700;line-height:1.2;color:${BRAND.onAccent};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Dòng liên kết thuần dự phòng khi nút CTA không bấm được. */
function fallbackLink(url: string, intro: string): string {
  const href = escapeHtml(url);
  return `<p style="margin:0 0 14px 0;font-size:13px;line-height:1.6;color:${BRAND.muted};word-break:break-all;">${intro}<br><a href="${href}" style="color:${BRAND.link};">${href}</a></p>`;
}

interface InfoRow {
  label: string;
  value: string;
  valueColor?: string;
  valueSize?: number;
}

/** Bảng thông tin nhãn/giá trị (thay các `.row` flex). Giá trị được escape tại đây. */
function infoTable(rows: InfoRow[]): string {
  const body = rows
    .map((row, index) => {
      const border = index === rows.length - 1 ? "" : `border-bottom:1px solid ${BRAND.line};`;
      const color = row.valueColor ?? BRAND.text;
      const size = row.valueSize ?? 14;
      return `    <tr>
      <td valign="top" style="padding:9px 0;${border}font-size:14px;color:${BRAND.muted};width:38%;">${escapeHtml(row.label)}</td>
      <td valign="top" align="right" style="padding:9px 0;${border}font-size:${size}px;font-weight:600;color:${color};">${escapeHtml(row.value)}</td>
    </tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cardBg}" style="background-color:${BRAND.cardBg};border:1px solid ${BRAND.line};border-radius:8px;margin:18px 0;">
  <tr>
    <td style="padding:8px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${body}
      </table>
    </td>
  </tr>
</table>`;
}

type NoteKind = "warning" | "danger";

const NOTE_STYLES: Record<NoteKind, { bg: string; border: string; text: string }> = {
  warning: { bg: "#FFF8EB", border: "#F59E0B", text: "#7A4A06" },
  danger: { bg: "#FEF2F2", border: "#DC2626", text: "#991B1B" },
};

/** Hộp lưu ý (thay `.alert-box` / `.danger-box`); `html` do caller dựng, đã escape giá trị động. */
function noteBox(kind: NoteKind, html: string): string {
  const s = NOTE_STYLES[kind];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td bgcolor="${s.bg}" style="background-color:${s.bg};border-left:4px solid ${s.border};padding:14px 16px;font-size:14px;line-height:1.6;color:${s.text};">
${html}
    </td>
  </tr>
</table>`;
}

function bulletList(items: string[], tag: "ul" | "ol" = "ul"): string {
  const lis = items.map((item) => `<li style="margin:0 0 6px 0;">${item}</li>`).join("");
  return `<${tag} style="margin:8px 0 0 0;padding-left:20px;">${lis}</${tag}>`;
}

/** 1. Email vé (TICKET_ISSUED) - R-86, R-133, AC-26 */
export function renderTicketEmail(payload: Record<string, unknown>): RenderedEmail {
  const bookingCode = String(payload.booking_code ?? payload.bookingCode ?? "N/A");
  const qrToken = String(payload.qr_token ?? payload.qrToken ?? "");
  const cinemaName = String(payload.cinema_name ?? payload.cinemaName ?? "Rạp CINEMO");
  const cinemaAddress = payload.cinema_address ? String(payload.cinema_address) : "";
  const hotline = String(payload.hotline ?? DEFAULT_HOTLINE);
  const movieTitle = String(payload.movie_title ?? payload.movieTitle ?? "Phim");
  const ageRating = payload.age_rating ? String(payload.age_rating) : (payload.ageRating ? String(payload.ageRating) : "");
  const roomName = String(payload.room_name ?? payload.roomName ?? "Phòng chiếu");
  const startsAt = formatDateTimeVN(String(payload.showtime_starts_at ?? payload.showtimeStartsAt ?? ""));
  const seats = Array.isArray(payload.seats) ? payload.seats.join(", ") : String(payload.seats ?? "");
  const combos = Array.isArray(payload.combos) ? payload.combos.join(", ") : (payload.combos ? String(payload.combos) : "");
  const totalAmount = formatCurrencyVND(payload.total_amount ?? payload.totalAmount);

  const subject = `[CINEMO] Vé xem phim của bạn - Mã đặt vé: ${bookingCode}`;

  const rows: InfoRow[] = [
    { label: "Phim", value: `${movieTitle}${ageRating ? ` (${ageRating})` : ""}` },
    { label: "Rạp chiếu", value: cinemaName },
  ];
  if (cinemaAddress) rows.push({ label: "Địa chỉ", value: cinemaAddress });
  rows.push(
    { label: "Hotline rạp", value: hotline },
    { label: "Phòng chiếu", value: roomName },
    { label: "Suất chiếu", value: startsAt },
  );
  if (seats) rows.push({ label: "Ghế", value: seats });
  if (combos) rows.push({ label: "Bắp nước", value: combos });
  rows.push({ label: "Tổng thanh toán", value: totalAmount, valueColor: "#059669", valueSize: 16 });

  const qrBlock = qrToken
    ? `<p style="margin:16px 0 0 0;font-size:12px;letter-spacing:1px;color:${BRAND.muted};">MÃ QUÉT SOÁT VÉ (QR TOKEN)</p>
        <p style="margin:6px 0 0 0;"><span style="display:inline-block;padding:10px 14px;background-color:#FFFFFF;border:1px solid ${BRAND.line};border-radius:6px;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;letter-spacing:2px;color:${BRAND.text};">${escapeHtml(qrToken)}</span></p>`
    : "";

  const ticketCode = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cardBg}" style="background-color:${BRAND.cardBg};border:1px solid ${BRAND.line};border-top:4px solid ${BRAND.accent};border-radius:8px;margin:18px 0 0 0;">
  <tr>
    <td align="center" style="padding:20px 18px;">
      <p style="margin:0;font-size:12px;letter-spacing:1px;color:${BRAND.muted};">MÃ ĐẶT VÉ</p>
      <p style="margin:6px 0 0 0;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:2px;color:${BRAND.text};">${escapeHtml(bookingCode)}</p>
      ${qrBlock}
    </td>
  </tr>
</table>`;

  const notes = noteBox(
    "warning",
    `<strong>Lưu ý quan trọng khi xem phim:</strong>
${bulletList([
  `Vui lòng có mặt tại rạp <strong>trước giờ chiếu tối thiểu 15 phút</strong> để làm thủ tục soát vé và nhận combo.`,
  `<strong>Vé chỉ dùng tại rạp ghi trên vé</strong> (<em>${escapeHtml(cinemaName)}</em>). Khách đến nhầm rạp sẽ không thể check-in.`,
  `<strong>Vé không huỷ / không hoàn tiền</strong> dưới bất kỳ hình thức nào sau khi đã thanh toán thành công (R-131, R-133).`,
  `Vui lòng mang theo giấy tờ tuỳ thân chứng minh độ tuổi (CCCD/Thẻ học sinh) đối với các phim có nhãn tuổi (T13, T16, T18).`,
])}`,
  );

  const html = wrapLayout(
    subject,
    `${heading("Xác nhận đặt vé thành công!")}
${paragraph(`Cảm ơn bạn đã đặt vé xem phim tại <strong>${escapeHtml(cinemaName)}</strong>. Dưới đây là thông tin vé của bạn:`)}
${ticketCode}
${infoTable(rows)}
${notes}`,
    { preheader: `Mã đặt vé ${bookingCode} - ${movieTitle} tại ${cinemaName}. Vui lòng đến rạp trước giờ chiếu 15 phút.` },
  );

  const text = `XÁC NHẬN ĐẶT VÉ THÀNH CÔNG - CINEMO
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

  const subject = "[CINEMO] Cảnh báo bảo mật: Tài khoản của bạn bị tạm khoá đăng nhập";

  const html = wrapLayout(
    subject,
    `${heading("Cảnh báo khoá đăng nhập", "#B91C1C")}
${paragraph(`Hệ thống CINEMO phát hiện tài khoản của bạn đã bị <strong>nhập sai mật khẩu 5 lần liên tiếp</strong>.`)}
${noteBox("danger", `Để bảo vệ an toàn cho tài khoản, tính năng đăng nhập bằng mật khẩu đã bị tạm khoá trong <strong>${escapeHtml(String(lockMinutes))} phút</strong> (đến <strong>${escapeHtml(lockedUntil)}</strong>).`)}
${paragraph(`Nếu bạn là người thực hiện, vui lòng chờ hết thời gian tạm khoá hoặc sử dụng tính năng <em>Quên mật khẩu</em> trên ứng dụng/website để thiết lập lại mật khẩu mới.`)}
${paragraph(`Nếu bạn <strong>không</strong> thực hiện các lần đăng nhập này, rất có thể tài khoản của bạn đang bị dò mật khẩu trái phép. Vui lòng đổi mật khẩu ngay sau khi tài khoản được mở khoá để đảm bảo an toàn.`)}`,
    { preheader: `Tài khoản của bạn bị tạm khoá đăng nhập ${lockMinutes} phút do nhập sai mật khẩu 5 lần liên tiếp.` },
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
    ? `[CINEMO] Thông báo huỷ liên kết phương thức đăng nhập ${provider}`
    : `[CINEMO] Thông báo liên kết thành công phương thức đăng nhập ${provider}`;

  const warning = isUnlinked
    ? "Nếu bạn không thực hiện việc huỷ liên kết này, vui lòng đăng nhập vào tài khoản ngay và liên hệ CSKH để kiểm tra an toàn."
    : "Nếu bạn không thực hiện việc liên kết này, vui lòng đăng nhập để gỡ bỏ liên kết và đổi mật khẩu tài khoản ngay lập tức.";

  const html = wrapLayout(
    subject,
    `${heading(isUnlinked ? "Huỷ liên kết tài khoản" : "Liên kết tài khoản thành công")}
${paragraph(`Phương thức đăng nhập <strong>${escapeHtml(provider)}</strong> đã được ${isUnlinked ? "huỷ liên kết khỏi" : "liên kết thành công với"} tài khoản CINEMO của bạn vào lúc <strong>${escapeHtml(time)}</strong>.`)}
${noteBox("warning", escapeHtml(warning))}`,
    { preheader: `Phương thức đăng nhập ${provider} đã được ${isUnlinked ? "huỷ liên kết khỏi" : "liên kết với"} tài khoản của bạn.` },
  );

  const text = `${isUnlinked ? "HUỶ LIÊN KẾT TÀI KHOẢN" : "LIÊN KẾT TÀI KHOẢN THÀNH CÔNG"}
Phương thức đăng nhập ${provider} đã được ${isUnlinked ? "huỷ liên kết khỏi" : "liên kết với"} tài khoản CINEMO vào lúc ${time}.
Nếu bạn không thực hiện việc này, vui lòng liên hệ CSKH hoặc đổi mật khẩu ngay.`;

  return { subject, html, text };
}

/** 4. Tiền về muộn / chênh lệch số tiền cần hướng dẫn liên hệ rạp (LATE_PAYMENT_MANUAL_REVIEW / AMOUNT_MISMATCH_MANUAL_REVIEW) - R-78 */
export function renderLatePaymentEmail(payload: Record<string, unknown>): RenderedEmail {
  const orderId = String(payload.order_id ?? payload.orderId ?? "");
  const bookingCode = String(payload.booking_code ?? payload.bookingCode ?? "");
  const cinemaName = String(payload.cinema_name ?? payload.cinemaName ?? "Rạp CINEMO");
  const movieTitle = String(payload.movie_title ?? payload.movieTitle ?? "Phim");
  const amount = formatCurrencyVND(payload.amount ?? payload.received_amount ?? payload.receivedAmount);
  const transactionRef = String(payload.transaction_ref ?? payload.transactionRef ?? "N/A");
  const reason = String(payload.reason ?? "");
  const hotline = String(payload.hotline ?? DEFAULT_HOTLINE);

  const isAmountMismatch = reason === "AMOUNT_MISMATCH";
  const subject = `[CINEMO] Hướng dẫn xử lý thanh toán đơn hàng ${bookingCode || orderId}`;

  const reasonText = isAmountMismatch
    ? "Số tiền thanh toán nhận được không khớp với tổng tiền đơn hàng."
    : "Thanh toán nhận được sau khi thời gian giữ ghế đã hết hạn và ghế đã được bán cho khách hàng khác.";

  const rows: InfoRow[] = [];
  if (bookingCode) rows.push({ label: "Mã đặt vé", value: bookingCode });
  if (orderId) rows.push({ label: "Mã đơn hàng", value: orderId });
  rows.push(
    { label: "Mã giao dịch", value: transactionRef },
    { label: "Số tiền", value: amount },
    { label: "Rạp chiếu", value: cinemaName },
  );

  const html = wrapLayout(
    subject,
    `${heading("Thông báo cần hỗ trợ đối soát đơn hàng", "#B45309")}
${paragraph(`Chào bạn, hệ thống ghi nhận giao dịch thanh toán cho đơn hàng xem phim <strong>${escapeHtml(movieTitle)}</strong> tại <strong>${escapeHtml(cinemaName)}</strong> của bạn.`)}
${noteBox("danger", `<strong>Lý do đơn hàng chưa thể tự động hoàn tất:</strong><br>
${escapeHtml(reasonText)}`)}
${infoTable(rows)}
${noteBox("warning", `<strong>Hướng dẫn xử lý:</strong><br>
Vui lòng liên hệ với bộ phận CSKH của rạp qua hotline: <strong>${escapeHtml(hotline)}</strong> hoặc đến trực tiếp quầy vé tại <em>${escapeHtml(cinemaName)}</em> để nhân viên hỗ trợ kiểm tra và hoàn tiền thủ công cho bạn.`)}`,
    { preheader: `Đơn hàng ${bookingCode || orderId} cần hỗ trợ đối soát. Vui lòng liên hệ CSKH rạp qua hotline ${hotline}.` },
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
  const cinemaName = String(payload.cinema_name ?? payload.cinemaName ?? "Rạp CINEMO");
  const movieTitle = String(payload.movie_title ?? payload.movieTitle ?? "Phim");
  const roomName = String(payload.room_name ?? payload.roomName ?? "Phòng chiếu");
  const startsAt = formatDateTimeVN(String(payload.showtime_starts_at ?? payload.showtimeStartsAt ?? ""));
  const reason = String(payload.reason ?? "Lý do kỹ thuật / Vận hành");
  const hotline = String(payload.hotline ?? DEFAULT_HOTLINE);

  const subject = `[CINEMO] Thông báo huỷ suất chiếu - Mã đặt vé: ${bookingCode}`;

  const rows: InfoRow[] = [
    { label: "Mã đặt vé", value: bookingCode },
    { label: "Phim", value: movieTitle },
    { label: "Rạp", value: cinemaName },
    { label: "Phòng", value: roomName },
    { label: "Suất chiếu dự kiến", value: startsAt },
    { label: "Lý do huỷ", value: reason, valueColor: "#B91C1C" },
  ];

  const html = wrapLayout(
    subject,
    `${heading("Thông báo huỷ suất chiếu", "#B91C1C")}
${paragraph("Rất tiếc, CINEMO xin thông báo suất chiếu bạn đã đặt vé buộc phải huỷ do sự cố bất khả kháng:")}
${infoTable(rows)}
${noteBox("warning", `<strong>Hướng dẫn nhận hoàn tiền thủ công (R-109):</strong><br>
Quý khách vui lòng liên hệ với bộ phận CSKH của rạp qua hotline: <strong>${escapeHtml(hotline)}</strong> (hoặc đến trực tiếp quầy vé tại <em>${escapeHtml(cinemaName)}</em>) để nhân viên hỗ trợ hoàn tiền vé thủ công.<br>
<span style="display:block;margin-top:6px;font-size:13px;color:${BRAND.muted};">* Lưu ý: Hệ thống hiện không hỗ trợ đổi sang suất chiếu khác, rạp sẽ thực hiện hoàn trả tiền vé trực tiếp cho quý khách.</span>`)}`,
    { preheader: `Suất chiếu ${movieTitle} tại ${cinemaName} đã bị huỷ. Liên hệ CSKH rạp ${hotline} để được hoàn tiền thủ công.` },
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

  const subject = "[CINEMO] Thiết lập mật khẩu tài khoản";

  const html = wrapLayout(
    subject,
    `${heading("Thiết lập mật khẩu tài khoản")}
${paragraph("Chào bạn,")}
${paragraph(escapeHtml(message || "Hệ thống CINEMO nhận được yêu cầu thiết lập mật khẩu cho tài khoản của bạn. Vui lòng bấm vào nút bên dưới để tạo mật khẩu mới:"))}
${button("Thiết lập mật khẩu", setPasswordUrl)}
${noteBox("warning", `<strong>Lưu ý bảo mật:</strong>
${bulletList([
  "Liên kết thiết lập mật khẩu chỉ có hiệu lực trong thời gian quy định và chỉ dùng được một lần.",
  "Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email và kiểm tra lại bảo mật tài khoản.",
  "Tuyệt đối không chia sẻ liên kết này cho bất kỳ ai khác.",
])}`)}
${fallbackLink(setPasswordUrl, "Nếu nút bấm phía trên không hoạt động, bạn có thể sao chép liên kết sau vào trình duyệt:")}`,
    { preheader: "Bấm vào nút để thiết lập mật khẩu cho tài khoản CINEMO của bạn." },
  );

  const text = `THIẾT LẬP MẬT KHẨU TÀI KHOẢN - CINEMO

Chào bạn,
${message || "Hệ thống CINEMO nhận được yêu cầu thiết lập mật khẩu cho tài khoản của bạn."}

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

  const subject = "[CINEMO] Phát hiện liên kết tài khoản trùng email";

  const html = wrapLayout(
    subject,
    `${heading("Phát hiện liên kết tài khoản trùng email", "#B45309")}
${paragraph("Chào bạn,")}
${paragraph(`Hệ thống CINEMO phát hiện bạn vừa sử dụng phương thức đăng nhập <strong>${escapeHtml(provider)}</strong> với địa chỉ email đã được đăng ký cho một tài khoản trước đó trên CINEMO.`)}
${noteBox("warning", `<strong>Hướng dẫn liên kết an toàn:</strong><br>
Để bảo vệ an toàn cho tài khoản và tránh trùng lặp dữ liệu:
${bulletList([
  "Vui lòng đăng nhập vào CINEMO bằng phương thức cũ (email/mật khẩu hoặc nhà cung cấp đã liên kết trước đó).",
  "Sau khi đăng nhập thành công, truy cập vào mục <strong>Hồ sơ / Cài đặt tài khoản</strong>.",
  `Tại phần <em>Phương thức đăng nhập</em>, bấm chọn <strong>Liên kết ${escapeHtml(provider)}</strong> để hoàn tất đồng bộ.`,
], "ol")}`)}
${button("Đăng nhập để liên kết tài khoản", loginUrl)}
${fallbackLink(profileUrl, "Bạn cũng có thể vào trực tiếp trang quản lý hồ sơ tại:")}`,
    { preheader: `Email của bạn đã có tài khoản CINEMO. Đăng nhập bằng phương thức cũ rồi liên kết ${provider}.` },
  );

  const text = `PHÁT HIỆN LIÊN KẾT TÀI KHOẢN TRÙNG EMAIL - CINEMO

Chào bạn,
Hệ thống phát hiện bạn vừa đăng nhập bằng ${provider} với email đã tồn tại trên CINEMO.

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

  const subject = "[CINEMO] Xác thực email bổ sung";

  const html = wrapLayout(
    subject,
    `${heading("Xác thực email bổ sung")}
${paragraph("Chào bạn,")}
${paragraph(escapeHtml(message || `Bạn vừa đăng nhập CINEMO bằng ${provider}. Để hoàn tất đăng ký tài khoản, vui lòng xác thực địa chỉ email này bằng cách nhấn vào nút bên dưới:`))}
${button("Xác thực email", verifyUrl)}
${noteBox("warning", `<strong>Lưu ý quan trọng:</strong>
${bulletList([
  "Liên kết xác thực chỉ có hiệu lực một lần trong vòng 15 phút.",
  `Sau khi xác thực, tài khoản ${escapeHtml(provider)} sẽ được liên kết chính thức với email này.`,
  "Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.",
])}`)}
${fallbackLink(verifyUrl, "Nếu nút bấm phía trên không hoạt động, bạn có thể sao chép liên kết sau vào trình duyệt:")}`,
    { preheader: "Bấm vào nút để xác thực email và hoàn tất đăng nhập CINEMO (hiệu lực 15 phút)." },
  );

  const text = `XÁC THỰC EMAIL BỔ SUNG - CINEMO

Chào bạn,
${message || `Bạn vừa đăng nhập CINEMO bằng ${provider}.`}

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
