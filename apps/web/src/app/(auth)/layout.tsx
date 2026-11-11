import Link from "next/link";
import type { ReactNode } from "react";

// Bố cục auth (design-spec "Nhóm Auth"): mobile = card full-width gutter 16; desktop = nền hero + card 440.
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top_left,var(--color-brand-soft),var(--color-bg)_60%)]">
      <header className="mx-auto w-full max-w-7xl px-4 py-4 md:px-6">
        <Link
          href="/"
          aria-label="CINEMO – Trang chủ"
          className="inline-flex min-h-11 items-center rounded-sm text-2xl font-heavy tracking-wide text-brand"
        >
          CINEMO
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 md:items-center">
        <div className="w-full max-w-md rounded-hero border border-border-subtle bg-surface p-5 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
