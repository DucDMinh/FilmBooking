"use client";

import { Menu, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// "Khuyến mãi" ẩn ở MVP (D8).
export const NAV_ITEMS = [
  { href: "/phim", label: "Phim" },
  { href: "/rap", label: "Rạp" },
  { href: "/lich-chieu", label: "Lịch chiếu" },
] as const;

export interface HeaderUser {
  displayName: string;
}

/**
 * Header khách (design-spec §5.1): desktop 72px, mobile 56px, sticky.
 * `user` do layout cấp (phiên Supabase nối ở layer 5); chưa có → hiện nút "Đăng nhập".
 */
export function SiteHeader({ user }: Readonly<{ user?: HeaderUser | null }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const accountHref = user ? "/tai-khoan" : "/dang-nhap";
  const isActive =(href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const linkClass = (href: string) =>
    cn(
      "inline-flex min-h-11 items-center rounded-sm px-3 text-body-sm font-semibold transition-colors hover:text-fg",
      isActive(href) ? "text-fg" : "text-fg-secondary",
    );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-chrome">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 md:h-18 md:px-6">
        <Link
          href="/"
          aria-label="CINEMO – Trang chủ"
          className="inline-flex min-h-11 items-center rounded-sm text-2xl font-heavy tracking-wide text-brand"
        >
          CINEMO
        </Link>

        <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={linkClass(item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Button asChild variant="secondary" className="hidden md:inline-flex">
              <Link href="/tai-khoan">
                <User aria-hidden="true" />
                {user.displayName}
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" className="hidden md:inline-flex">
              <Link href="/dang-nhap">Đăng nhập</Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Mở menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 bg-chrome">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription className="sr-only">Điều hướng chính của CINEMO</SheetDescription>
          </SheetHeader>
          <nav aria-label="Điều hướng di động" className="flex flex-col gap-1 px-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={cn(linkClass(item.href), "text-body")}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={accountHref}
              aria-current={isActive(accountHref) ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className={cn(linkClass(accountHref), "text-body")}
            >
              {user ? "Tài khoản" : "Đăng nhập"}
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
