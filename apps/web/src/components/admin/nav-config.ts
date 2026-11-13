import type { MeResponse } from "@filmbooking/shared/schemas/me";

/** Vai trò hiệu lực trong shell /admin. Chỉ để ẩn/hiện menu; quyền thật do API + RLS kiểm. */
export type AdminRole = "ADMIN" | "MANAGER" | "STAFF";

export interface AdminNavItem {
  href: string;
  label: string;
  roles: readonly AdminRole[];
  /** Mục mở trang toàn màn hình riêng (không nằm trong shell). */
  external?: boolean;
}

const ALL: readonly AdminRole[] = ["ADMIN", "MANAGER", "STAFF"];
const ADMIN_MANAGER: readonly AdminRole[] = ["ADMIN", "MANAGER"];

// Thứ tự theo design-spec §3 (ma trận sidebar). Mục GĐ2 (dashboard, tích hợp POS) không có.
// Staff (SPEC §5.3): Việc cần làm, Đơn hàng, Đơn bị ảnh hưởng, Soát vé.
// Manager thêm: Rạp/phòng, Lịch chiếu, Bảng giá & ngày lễ, Báo cáo doanh thu/suất, Quản lý nhân sự.
// Admin: Toàn bộ mục hệ thống (Thêm Cấu hình chuỗi, Audit log, Voucher CRUD, Phim).
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Việc cần làm", roles: ALL },
  { href: "/admin/phim", label: "Phim", roles: ["ADMIN"] },
  { href: "/admin/rap", label: "Rạp chiếu", roles: ADMIN_MANAGER },
  { href: "/admin/lich-chieu", label: "Lịch chiếu", roles: ADMIN_MANAGER },
  { href: "/admin/don-hang", label: "Đơn hàng", roles: ALL },
  { href: "/admin/don-can-xu-ly", label: "Đơn cần xử lý", roles: ADMIN_MANAGER },
  { href: "/admin/don-bi-anh-huong", label: "Đơn bị ảnh hưởng", roles: ALL },
  { href: "/admin/gia", label: "Giá & ngày lễ", roles: ADMIN_MANAGER },
  { href: "/admin/voucher", label: "Voucher", roles: ["ADMIN"] },
  { href: "/admin/nguoi-dung", label: "Người dùng", roles: ADMIN_MANAGER },
  { href: "/admin/bao-cao", label: "Báo cáo", roles: ADMIN_MANAGER },
  { href: "/admin/audit-log", label: "Audit log", roles: ["ADMIN"] },
  { href: "/admin/cau-hinh", label: "Cấu hình", roles: ["ADMIN"] },
  { href: "/staff/soat-ve", label: "Soát vé", roles: ALL, external: true },
];

/** Vai trò cao nhất của người dùng, hoặc null nếu không có vai trò nhân sự nào. */
export function resolveAdminRole(me?: Pick<MeResponse, "isAdmin" | "cinemas"> | null): AdminRole | null {
  if (!me) return null;
  if (me.isAdmin) return "ADMIN";
  if (me.cinemas.some((c) => c.role === "MANAGER")) return "MANAGER";
  if (me.cinemas.length > 0) return "STAFF";
  return null;
}

export function navItemsForRole(role: AdminRole): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Mục sidebar đang active: khớp chính xác hoặc là tiền tố; "/admin" chỉ khớp chính xác. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
