import * as Sentry from "@sentry/nestjs";
import type { ErrorEvent, NodeOptions } from "@sentry/nestjs";

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// SĐT VN: 0xxxxxxxxx hoặc +84xxxxxxxxx (có thể có dấu cách/chấm/gạch giữa các nhóm số).
const PHONE_PATTERN = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/g;
const SENSITIVE_KEYS = /email|phone|sdt|password|token|authorization|cookie|signature|secret|api[-_]?key/i;
const REDACTED = "[Filtered]";

function scrubString(value: string): string {
  return value.replace(EMAIL_PATTERN, "[email]").replace(PHONE_PATTERN, "[phone]");
}

/** Đệ quy: khóa nhạy cảm bị thay hẳn; chuỗi còn lại bị xóa email/SĐT nhúng trong text. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? REDACTED : scrubValue(item, depth + 1)]),
  );
}

/** beforeSend: xóa PII khỏi event trước khi rời process. Không bao giờ trả null (không nuốt lỗi). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed = scrubValue({ ...event, user: undefined }) as ErrorEvent;
  if (scrubbed.request) {
    delete scrubbed.request.cookies;
    delete scrubbed.request.data;
    delete scrubbed.request.headers;
  }
  return scrubbed;
}

let enabled = false;

export function isSentryEnabled(): boolean {
  return enabled;
}

/** Không có DSN -> không init gì cả (tắt hẳn: không hook, không log, không gửi mạng). */
export function initSentry(dsn: string | undefined, overrides: Partial<NodeOptions> = {}): boolean {
  enabled = Boolean(dsn);
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    ...overrides,
  });
  return true;
}

export type AlertName = "webhook_invalid_signature" | "hold_error" | "email_failed";

interface AlertInput {
  alert: AlertName;
  message: string;
  cinemaId?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Sự kiện cảnh báo (NFR-14). Rule Sentry lọc theo tag `alert` (xem task file layer-8-task-06).
 * fingerprint cố định theo alert để Sentry gom thành 1 issue và đếm tần suất.
 */
export function reportAlert({ alert, message, cinemaId, extra }: AlertInput): void {
  if (!enabled) return;
  Sentry.captureMessage(message, {
    level: "error",
    fingerprint: ["alert", alert],
    tags: { alert, ...(cinemaId ? { cinema_id: cinemaId } : {}) },
    extra,
  });
}

/** Lỗi 5xx không mong đợi; gắn tag cinema_id khi request mang cinemaId. */
export function captureServerError(exception: unknown, cinemaId?: string): void {
  if (!enabled) return;
  Sentry.captureException(exception, { tags: cinemaId ? { cinema_id: cinemaId } : undefined });
}
