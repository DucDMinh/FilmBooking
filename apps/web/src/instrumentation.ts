import * as Sentry from "@sentry/nextjs";

import { scrubEvent, sentryDsn } from "@/lib/monitoring/sentry-config";

export function register(): void {
  const dsn = sentryDsn();
  if (!dsn) return; // tắt hẳn khi thiếu DSN
  Sentry.init({ dsn, tracesSampleRate: 0, beforeSend: scrubEvent });
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (sentryDsn()) Sentry.captureRequestError(...args);
};
