import { HttpException } from "@nestjs/common";
import { ERROR_HTTP_STATUS, type ApiErrorBody, type ErrorCode } from "@filmbooking/shared";

/**
 * Lỗi nghiệp vụ có mã ổn định. HTTP status lấy từ catalog `ERROR_HTTP_STATUS`
 * nên service chỉ cần chọn code, không tự chọn status.
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string = code, details?: Record<string, unknown>) {
    const body: ApiErrorBody = {
      error: { code, message, ...(details ? { details } : {}) },
    };
    super(body, ERROR_HTTP_STATUS[code]);
    this.code = code;
    this.details = details;
  }
}
