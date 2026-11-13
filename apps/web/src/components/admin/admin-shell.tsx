"use client";

import type { ReactNode } from "react";

import { AdminMobileNav, AdminSidebar } from "./admin-sidebar";
import { CinemaScopeSwitcher } from "./cinema-scope-switcher";
import { navItemsForRole, type AdminRole } from "./nav-config";
import { useAdminScope, type ScopeCinema } from "./use-admin-scope";

interface AdminShellProps {
  role: AdminRole;
  /** Rạp mà người dùng được chọn làm phạm vi (Admin: tất cả; Manager/Staff: rạp được gán). */
  cinemas: readonly ScopeCinema[];
  children: ReactNode;
}

/** Khung /admin: sidebar 250 + topbar 72 với bộ chọn phạm vi rạp (design-spec D4). */
export function AdminShell({ role, cinemas, children }: Readonly<AdminShellProps>) {
  const canSeeAll = role === "ADMIN";
  const items = navItemsForRole(role);
  const { scope, setScope } = useAdminScope(cinemas, canSeeAll);

  return (
    <div className="flex min-h-dvh bg-background">
      <AdminSidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-chrome px-4 md:h-18 md:px-6">
          <AdminMobileNav items={items} />
          <span className="text-h3 font-heavy tracking-wide text-brand">CINEMO</span>
          <div className="ml-auto">
            <CinemaScopeSwitcher
              cinemas={cinemas}
              canSeeAll={canSeeAll}
              scope={scope}
              onScopeChange={setScope}
            />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
