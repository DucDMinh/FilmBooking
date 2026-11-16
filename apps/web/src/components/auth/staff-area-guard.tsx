"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { isStaffAllowedPath } from "@/lib/auth/role-home";

/**
 * Layout (public) không render lại khi điều hướng mềm giữa các trang con (Partial Rendering), nên nhân sự
 * đang ở /tai-khoan bấm link sang trang khách sẽ lọt qua kiểm tra phía server. Guard này bắt trường hợp đó.
 * Chỉ là lớp UX; phía server (layout) vẫn redirect khi tải cứng.
 */
export function StaffAreaGuard({ home }: Readonly<{ home: string }>) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isStaffAllowedPath(pathname)) router.replace(home);
  }, [pathname, home, router]);

  return null;
}
