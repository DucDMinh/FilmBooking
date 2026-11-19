"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { SignOutButton } from "@/components/common/sign-out-button";
import { Badge } from "@/components/ui/badge";

import { AdminMobileNav, AdminSidebar } from "./admin-sidebar";
import { CinemaSelector, type ScopeCinemaWithStatus } from "./cinema-selector";
import { navItemsForRole, type AdminRole } from "./nav-config";
import { useAdminScope, type ScopeCinema } from "./use-admin-scope";

interface AdminShellProps {
  role: AdminRole;
  /** Rạp mà người dùng được chọn làm phạm vi (Admin: tất cả; Manager/Staff: rạp được gán). */
  cinemas: readonly ScopeCinema[];
  children: ReactNode;
}

function resolveInitialCinemas(
  initialCinemas: readonly ScopeCinema[],
  canSeeAll: boolean,
  cinemaParam: string | null,
): readonly ScopeCinemaWithStatus[] {
  if (
    canSeeAll &&
    cinemaParam &&
    cinemaParam !== "all" &&
    !initialCinemas.some((c) => c.id === cinemaParam)
  ) {
    return [...initialCinemas, { id: cinemaParam, name: `Rạp ${cinemaParam.slice(0, 8)}` }];
  }
  return initialCinemas;
}

const ROLE_LABEL: Record<AdminRole, string> = { ADMIN: "Admin", MANAGER: "Quản lý", STAFF: "Nhân viên" };

/** Khung /admin: sidebar 250 + topbar 72 với bộ chọn phạm vi rạp (design-spec D4). */
export function AdminShell({ role, cinemas: initialCinemas, children }: Readonly<AdminShellProps>) {
  const canSeeAll = role === "ADMIN";
  const items = navItemsForRole(role);
  const searchParams = useSearchParams();
  const cinemaParam = searchParams.get("cinema");

  const initialList = useMemo(
    () => resolveInitialCinemas(initialCinemas, canSeeAll, cinemaParam),
    [initialCinemas, canSeeAll, cinemaParam],
  );

  const [cinemas, setCinemas] = useState<readonly ScopeCinemaWithStatus[]>(initialList);

  useEffect(() => {
    setCinemas(initialList);
  }, [initialList]);

  const { scope, setScope } = useAdminScope(cinemas, canSeeAll);

  return (
    <div className="flex min-h-dvh bg-background">
      <AdminSidebar items={items} cinemaId={scope} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-chrome px-4 md:h-18 md:px-6">
          <AdminMobileNav items={items} cinemaId={scope} />
          <span className="font-display text-body font-heavy tracking-[0.02em] text-fg">CINEMO</span>
          <Badge tone="brand" data-testid="admin-role-badge">{ROLE_LABEL[role]}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <CinemaSelector
              cinemas={cinemas}
              canSeeAll={canSeeAll}
              scope={scope}
              onScopeChange={setScope}
              onCinemasLoaded={setCinemas}
            />
            {/* Dưới md nút nằm trong menu điều hướng (Sheet) để topbar không chật. */}
            <SignOutButton variant="secondary" size="sm" className="hidden md:inline-flex" />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
