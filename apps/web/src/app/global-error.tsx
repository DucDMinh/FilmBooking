"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "./globals.css";

// global-error thay thế cả root layout nên phải tự khai báo <html>/<body>. Không nạp next/font ở đây: font-* trong
// globals.css có fallback system-ui nên trang vẫn đọc được khi root layout hỏng.

// Next 16.4 truyền cả `retry` (re-fetch + render lại) lẫn `reset`; docs khuyến nghị `retry`.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error); // no-op khi chưa init (thiếu DSN)
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
          <p className="font-display text-display font-heavy text-danger-text tabular" aria-hidden="true">
            500
          </p>
          <h1 className="text-h1 font-bold uppercase">Đã có lỗi xảy ra</h1>
          <p className="text-body text-fg-secondary">
            Hệ thống gặp sự cố ngoài ý muốn. Vui lòng thử lại sau ít phút.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="btn-primary mt-2 inline-flex h-11.5 items-center justify-center px-6 font-heading text-body-sm font-bold uppercase tracking-btn transition-colors hover:bg-brand-hover outline-hidden"
          >
            Thử lại
          </button>
          {/* Root layout hỏng nên không dùng next/link/Button; <a> thường để tải lại hẳn trang. */}
          <a href="/" className="inline-flex min-h-11 items-center text-body-sm text-link underline-offset-4 hover:underline">
            Về trang chủ
          </a>
        </main>
      </body>
    </html>
  );
}
