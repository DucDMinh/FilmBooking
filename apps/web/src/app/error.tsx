"use client";

import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error); // no-op khi chưa init (thiếu DSN)
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="font-display text-display font-heavy text-danger-text tabular" aria-hidden="true">
        500
      </p>
      <h1 className="text-h1 font-bold uppercase">Đã có lỗi xảy ra</h1>
      <p className="text-body text-fg-secondary">
        Hệ thống gặp sự cố ngoài ý muốn. Bạn có thể thử lại hoặc quay về trang chủ.
      </p>
      <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button onClick={() => retry()}>Thử lại</Button>
        <Button asChild variant="secondary">
          <Link href="/">Về trang chủ</Link>
        </Button>
      </div>
    </main>
  );
}
