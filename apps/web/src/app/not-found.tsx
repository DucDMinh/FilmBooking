import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    // Nền lưới là lớp trang trí tuyệt đối (mask radial) nên nằm ngoài <main> và phủ cả màn hình.
    <div className="relative isolate min-h-dvh">
      <div className="grid-bg" aria-hidden="true" />
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <p className="font-display text-display font-heavy text-brand tabular" aria-hidden="true">
          404
        </p>
        <h1 className="text-h1 font-bold uppercase">Không tìm thấy trang</h1>
        <p className="text-body text-fg-secondary">
          Trang bạn tìm không tồn tại hoặc đã được di chuyển. Vui lòng kiểm tra lại đường dẫn.
        </p>
        <Button asChild className="mt-2">
          <Link href="/">Về trang chủ</Link>
        </Button>
      </main>
    </div>
  );
}
