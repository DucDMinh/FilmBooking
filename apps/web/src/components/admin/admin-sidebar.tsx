"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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

import { isNavItemActive, type AdminNavItem } from "./nav-config";

export function formatNavHref(href: string, cinemaParam: string | null, isExternal?: boolean): string {
  if (isExternal || !cinemaParam || !href.startsWith("/admin")) {
    return href;
  }
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}cinema=${encodeURIComponent(cinemaParam)}`;
}

function NavList({ items, onNavigate }: Readonly<{ items: readonly AdminNavItem[]; onNavigate?: () => void }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cinemaParam = searchParams.get("cinema");

  return (
    <nav aria-label="Điều hướng quản trị">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = !item.external && isNavItemActive(item.href, pathname);
          const targetHref = formatNavHref(item.href, cinemaParam, item.external);
          return (
            <li key={item.href}>
              <Link
                href={targetHref}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center rounded-sm px-3 text-body-sm font-semibold transition-colors outline-hidden",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-chrome",
                  active
                    ? "border-l-[3px] border-l-brand bg-sidebar-accent font-bold text-fg"
                    : "text-fg-secondary hover:bg-surface-elevated/60 hover:text-fg",
                )}
              >
                <span>{item.label}</span>
                {item.external && (
                  <span aria-hidden="true" className="ml-auto text-caption text-fg-muted">
                    ↗
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Sidebar cố định 250px từ md; dưới md dùng AdminMobileNav (Sheet) đặt trong topbar. */
export function AdminSidebar({ items }: Readonly<{ items: readonly AdminNavItem[] }>) {
  return (
    <aside className="hidden w-[250px] shrink-0 border-r border-border bg-chrome p-3 md:block">
      <NavList items={items} />
    </aside>
  );
}

export function AdminMobileNav({ items }: Readonly<{ items: readonly AdminNavItem[] }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Mở menu quản trị"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-chrome p-0">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>Quản trị</SheetTitle>
            <SheetDescription className="sr-only">Điều hướng khu vực quản trị</SheetDescription>
          </SheetHeader>
          <div className="p-3">
            <NavList items={items} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
