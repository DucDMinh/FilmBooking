import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Không có quyền truy cập",
  robots: { index: false },
};

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="text-display font-heavy text-warning tabular" aria-hidden="true">
        403
      </p>
      <h1 className="text-h1 font-bold">Bạn không có quyền truy cập trang này</h1>
      <p className="text-body text-fg-secondary">
        Tài khoản của bạn chưa được cấp quyền xem nội dung này. Nếu cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Về trang chủ</Link>
      </Button>
    </main>
  );
}
