import type { MeResponse } from "@filmbooking/shared/schemas/me";

import { resolveAdminRole } from "@/components/admin/nav-config";

import { sanitizeNext } from "./safe-next";

type RoleSource = Pick<MeResponse, "isAdmin" | "cinemas">;

export const ADMIN_HOME = "/admin";
// /staff không có page riêng (404); trang vào của nhân sự soát vé là chọn rạp (cùng đích với staff/layout khi 401).
export const STAFF_HOME = "/staff/chon-rap";

// Nhân sự chỉ được ở khu vực của mình, ngoại trừ /tai-khoan (đổi mật khẩu, liên kết OAuth, đăng xuất).
const STAFF_ALLOWED_PREFIXES = [ADMIN_HOME, "/staff", "/tai-khoan"] as const;

/** Trang chủ theo vai trò cao nhất (ADMIN > MANAGER > STAFF, qua `resolveAdminRole`); CUSTOMER → null. */
export function roleHome(me: RoleSource | null | undefined): string | null {
  const role = resolveAdminRole(me);
  if (!role) return null;
  return role === "STAFF" ? STAFF_HOME : ADMIN_HOME;
}

/** Đường dẫn mà nhân sự được phép ở lại. Chuẩn hoá qua URL để `/admin/../phim` không lách được. */
export function isStaffAllowedPath(path: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(path, "http://localhost").pathname;
  } catch {
    return false;
  }
  return STAFF_ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Đích sau đăng nhập (mật khẩu và OAuth callback).
 * Khách giữ `next` an toàn hoặc `/`; nhân sự chỉ giữ `next` nếu nằm trong khu vực được phép, còn lại về trang chủ vai trò.
 * `me` null (API lỗi) → fail-open như khách; layout (public) vẫn chuyển nhân sự đi khi họ hạ cánh ở trang khách.
 */
export function resolvePostLoginTarget({
  next,
  me,
}: {
  next: string | string[] | null | undefined;
  me: RoleSource | null | undefined;
}): string {
  const safeNext = sanitizeNext(next);
  const home = roleHome(me);
  if (!home) return safeNext ?? "/";
  return safeNext && isStaffAllowedPath(safeNext) ? safeNext : home;
}
