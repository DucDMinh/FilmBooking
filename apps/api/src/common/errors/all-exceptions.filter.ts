import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from "@filmbooking/shared";
import { AppException } from "./app-exception";

const INTERNAL_MESSAGE = "Internal server error";

/** Lỗi HTTP "trần" (NotFoundException, Throttler...) -> mã lỗi catalog. 4xx khác coi là dữ liệu không hợp lệ. */
const STATUS_TO_CODE = new Map<number, ErrorCode>([
  [400, ERROR_CODES.VALIDATION_ERROR],
  [401, ERROR_CODES.UNAUTHENTICATED],
  [403, ERROR_CODES.FORBIDDEN],
  [404, ERROR_CODES.NOT_FOUND],
  [409, ERROR_CODES.CONFLICT],
  [429, ERROR_CODES.RATE_LIMITED],
]);

interface ErrorResponse {
  status: number;
  body: ApiErrorBody;
}

/** Lỗi do middleware Express/body-parser ném (http-errors): có `status` 4xx và `expose`. */
function isExposedClientError(exception: unknown): exception is { status: number; message: string } {
  if (typeof exception !== "object" || exception === null) return false;
  const candidate = exception as { status?: unknown; expose?: unknown };
  return (
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status < 500 &&
    candidate.expose === true
  );
}

function clientError(status: number, message: string, details?: Record<string, unknown>): ErrorResponse {
  const code = STATUS_TO_CODE.get(status) ?? ERROR_CODES.VALIDATION_ERROR;
  return { status, body: { error: { code, message, ...(details ? { details } : {}) } } };
}

function fromHttpException(exception: HttpException): ErrorResponse {
  const payload = exception.getResponse();
  const rawMessage = typeof payload === "string" ? payload : (payload as { message?: unknown }).message;
  if (Array.isArray(rawMessage)) {
    return clientError(exception.getStatus(), "Request failed", { messages: rawMessage });
  }
  return clientError(exception.getStatus(), typeof rawMessage === "string" ? rawMessage : exception.message);
}

/** Bắt MỌI exception và trả đúng một dạng `{ error: { code, message, details? } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = this.toResponse(exception);
    const response = host.switchToHttp().getResponse();
    this.adapterHost.httpAdapter.reply(response, body, status);
  }

  private toResponse(exception: unknown): ErrorResponse {
    if (exception instanceof AppException) {
      return { status: exception.getStatus(), body: exception.getResponse() as ApiErrorBody };
    }
    if (exception instanceof HttpException && exception.getStatus() < 500) {
      return fromHttpException(exception);
    }
    if (isExposedClientError(exception)) {
      return clientError(exception.status, exception.message);
    }
    // Mọi thứ còn lại là lỗi server: log đầy đủ ở server, client chỉ nhận thông điệp chung (không stack, không chi tiết).
    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: ERROR_CODES.INTERNAL_ERROR, message: INTERNAL_MESSAGE } },
    };
  }
}
