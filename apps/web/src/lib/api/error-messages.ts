import { ERROR_CODES, type ErrorCode } from "@filmbooking/shared/errors";

/** Thông điệp chung khi gặp mã lỗi chưa biết / lỗi mạng. */
export const GENERIC_ERROR_MESSAGE = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";

/** Nguồn duy nhất map mã lỗi API -> tiếng Việt. `Record<ErrorCode,…>` ép phủ toàn bộ catalog. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.",
  UNAUTHENTICATED: "Vui lòng đăng nhập để tiếp tục.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  FORBIDDEN_CINEMA: "Bạn không có quyền với rạp này.",
  NOT_FOUND: "Không tìm thấy dữ liệu yêu cầu.",
  CONFLICT: "Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.",
  RATE_LIMITED: "Bạn thử quá nhiều lần, vui lòng đợi một lúc rồi thử lại.",
  INTERNAL_ERROR: GENERIC_ERROR_MESSAGE,
  EMAIL_NOT_CONFIRMED: "Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.",
  ACCOUNT_LOCKED:
    "Đăng nhập bằng mật khẩu tạm khoá 15 phút do nhập sai nhiều lần. Bạn có thể đặt lại mật khẩu hoặc dùng Google/Facebook.",
  DISPOSABLE_EMAIL: "Vui lòng dùng email thật, không dùng email tạm thời.",
  CAPTCHA_FAILED: "Xác minh không thành công. Vui lòng thử lại.",
  SEAT_TAKEN: "Ghế vừa có người giữ. Vui lòng chọn ghế khác.",
  ORPHAN_SEAT: "Lựa chọn để lại ghế trống lẻ loi. Vui lòng chọn lại ghế.",
  SALES_CLOSED: "Suất chiếu này đã đóng bán vé.",
  HOLD_LIMIT: "Bạn đã chọn tối đa số ghế cho phép.",
  HOLD_EXISTS: "Bạn đang giữ ghế ở một đơn khác. Vui lòng hoàn tất hoặc huỷ đơn đó trước.",
  HOLD_EXPIRED: "Thời gian giữ ghế đã hết. Vui lòng chọn ghế lại.",
  SHOWTIME_CANCELLED: "Suất chiếu này đã bị huỷ.",
  AGE_RESTRICTED: "Phim không phù hợp với độ tuổi của bạn.",
  CONSENT_REQUIRED: "Vui lòng xác nhận đồng ý các điều khoản để tiếp tục.",
  VOUCHER_NOT_FOUND: "Mã giảm giá không tồn tại.",
  VOUCHER_EXPIRED: "Mã giảm giá đã hết hạn.",
  VOUCHER_EXHAUSTED: "Mã giảm giá đã hết lượt sử dụng.",
  VOUCHER_MIN_ORDER: "Đơn hàng chưa đạt giá trị tối thiểu để dùng mã này.",
  VOUCHER_NOT_APPLICABLE_SHOWTIME: "Mã giảm giá không áp dụng cho suất chiếu này.",
  VOUCHER_NOT_APPLICABLE_CINEMA: "Mã giảm giá không áp dụng cho rạp này.",
  PAYMENT_SIGNATURE_INVALID: "Giao dịch thanh toán không hợp lệ.",
  PAYMENT_AMOUNT_MISMATCH: "Số tiền thanh toán không khớp với đơn hàng.",
  WRONG_CINEMA: "Vé này thuộc rạp khác.",
  TICKET_USED: "Vé đã được sử dụng.",
  TICKET_NOT_FOUND: "Không tìm thấy vé.",
  TICKET_NOT_PAID: "Vé chưa được thanh toán.",
  CHECKIN_OUTSIDE_WINDOW: "Chưa đến hoặc đã quá thời gian soát vé của suất chiếu.",
  POS_KEY_INVALID: "Khoá tích hợp POS không hợp lệ.",
  JOB_SECRET_INVALID: "Khoá tác vụ nền không hợp lệ.",
};

export function isKnownErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && Object.hasOwn(ERROR_CODES, code);
}

export function messageForErrorCode(code: unknown): string {
  return isKnownErrorCode(code) ? ERROR_MESSAGES[code] : GENERIC_ERROR_MESSAGE;
}
