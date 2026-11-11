"use client";

import { Inter } from "next/font/google";
import { useEffect } from "react";

import "./globals.css";

// global-error thay thế cả root layout nên phải tự khai báo <html>/<body> và nạp lại font.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

// Next 16.4 truyền cả `retry` (re-fetch + render lại) lẫn `reset`; docs khuyến nghị `retry`.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi" className={inter.variable}>
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
          <p className="text-display font-heavy text-danger tabular" aria-hidden="true">
            500
          </p>
          <h1 className="text-h1 font-bold">Đã có lỗi xảy ra</h1>
          <p className="text-body text-fg-secondary">
            Hệ thống gặp sự cố ngoài ý muốn. Vui lòng thử lại sau ít phút.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-hidden"
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
