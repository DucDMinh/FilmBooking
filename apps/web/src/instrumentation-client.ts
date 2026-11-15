import * as Sentry from "@sentry/nextjs";

import { scrubEvent, sentryDsn } from "@/lib/monitoring/sentry-config";

const dsn = sentryDsn();

// Thiếu DSN -> không init: không hook, không log, không gửi mạng.
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0, beforeSend: scrubEvent });
}

export const onRouterTransitionStart = dsn ? Sentry.captureRouterTransitionStart : undefined;
