import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="text-display font-heavy text-brand tabular" aria-hidden="true">
        404
      </p>
      <h1 className="text-h1 font-bold">Không tìm thấy trang</h1>
      <p className="text-body text-fg-secondary">
        Trang bạn tìm không tồn tại hoặc đã được di chuyển. Vui lòng kiểm tra lại đường dẫn.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Về trang chủ</Link>
      </Button>
    </main>
  );
}
