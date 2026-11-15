import type { ErrorEvent } from "@sentry/nextjs";

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// SĐT VN: 0xxxxxxxxx hoặc +84xxxxxxxxx (cho phép dấu cách/chấm/gạch giữa các nhóm số).
const PHONE_PATTERN = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/g;
const SENSITIVE_KEYS = /email|phone|sdt|password|token|authorization|cookie|signature|secret|api[-_]?key/i;
const REDACTED = "[Filtered]";

/** Đệ quy: khóa nhạy cảm bị thay hẳn; chuỗi còn lại bị xóa email/SĐT nhúng trong text. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.replace(EMAIL_PATTERN, "[email]").replace(PHONE_PATTERN, "[phone]");
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? REDACTED : scrubValue(item, depth + 1)]),
  );
}

/** beforeSend dùng chung cho browser + server: xóa PII, không bao giờ drop event. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed = scrubValue({ ...event, user: undefined }) as ErrorEvent;
  if (scrubbed.request) {
    delete scrubbed.request.cookies;
    delete scrubbed.request.data;
    delete scrubbed.request.headers;
  }
  return scrubbed;
}

/** DSN dùng chung server + browser; thiếu -> undefined -> không init (tắt hẳn). */
export function sentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;
}
