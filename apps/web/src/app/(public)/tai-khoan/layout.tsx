"use client";

import { Bell, Heart, Shield, Ticket, User as UserIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface AccountProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

const ACCOUNT_NAV = [
  { href: "/tai-khoan", label: "Thông tin cá nhân", icon: UserIcon, exact: true },
  { href: "/tai-khoan/rap-yeu-thich", label: "Rạp yêu thích", icon: Heart },
  { href: "/tai-khoan/thong-bao", label: "Thông báo & email", icon: Bell },
  { href: "/tai-khoan/bao-mat", label: "Bảo mật & liên kết", icon: Shield },
  { href: "/ve", label: "Vé của tôi", icon: Ticket },
] as const;

/**
 * Layout trang tài khoản người dùng (design-spec §15, Màn 15).
 * Desktop: Sidebar 280px + nội dung chính.
 * Mobile: Danh sách điều hướng dạng Tabs cuộn ngang.
 */
export default function AccountLayout({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      try {
        const data = await apiFetch<AccountProfile>("/me/profile");
        if (mounted) setProfile(data);
      } catch {
        // Lỗi lấy profile thì hiển thị fallback
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const isLinkActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const getInitials = (fullName?: string | null, email?: string | null): string => {
    const text = fullName?.trim() || email?.split("@")[0] || "";
    if (!text) return "KH";
    const parts = text.split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 1) return first.slice(0, 2).toUpperCase();
    return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-h1 font-heavy tracking-tight text-fg">Tài khoản của tôi</h1>
        <p className="mt-1 text-body-sm text-fg-secondary">
          Quản lý thông tin cá nhân, rạp yêu thích và cài đặt thông báo tài khoản.
        </p>
      </div>

      {/* Điều hướng trên mobile: thanh tabs cuộn ngang */}
      <nav
        aria-label="Điều hướng tài khoản di động"
        className="flex items-center gap-2 overflow-x-auto pb-2 lg:hidden"
      >
        {ACCOUNT_NAV.map((item) => {
          const active = isLinkActive(item.href, "exact" in item && item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-body-sm font-semibold transition-colors",
                active
                  ? "bg-brand text-fg-on-brand shadow-sm"
                  : "border border-border bg-surface text-fg-secondary hover:bg-surface-elevated hover:text-fg",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Sidebar Desktop: 280px */}
        <aside
          aria-label="Menu tài khoản"
          className="hidden w-72 shrink-0 flex-col gap-4 lg:flex"
        >
          {/* Card thông tin user */}
          <Card className="border-border-subtle bg-surface p-5">
            {loading ? (
              <div className="flex items-center gap-3">
                <Skeleton className="size-14 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-full border border-border bg-surface-elevated">
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.full_name ?? "Ảnh đại diện"}
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-body font-bold text-fg-secondary">
                      {getInitials(profile?.full_name, profile?.email)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-bold text-fg">
                    {profile?.full_name || "Khách hàng CINEMO"}
                  </p>
                  <p className="truncate text-small text-fg-muted">
                    {profile?.email || "Chưa có email"}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Menu dọc */}
          <nav
            aria-label="Menu tài khoản máy tính"
            className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface p-2"
          >
            {ACCOUNT_NAV.map((item) => {
              const active = isLinkActive(item.href, "exact" in item && item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3.5 py-2.5 text-body-sm font-medium transition-colors",
                    active
                      ? "border-l-3 border-brand bg-sidebar-active font-semibold text-fg"
                      : "text-fg-secondary hover:bg-surface-elevated hover:text-fg",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active ? "text-brand" : "text-fg-muted")}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Nội dung trang con */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
