import type { MeResponse } from "@filmbooking/shared/schemas/me";

/** Vai trò hiệu lực trong shell /admin. Chỉ để ẩn/hiện menu; quyền thật do API + RLS kiểm. */
export type AdminRole = "ADMIN" | "MANAGER" | "STAFF";

export interface AdminNavItem {
  href: string;
  label: string;
  roles: readonly AdminRole[];
  /** Mục mở trang toàn màn hình riêng (không nằm trong shell). */
  external?: boolean;
  /** Mục theo từng rạp: có rạp đang chọn (?cinema=) thì trỏ thẳng trang của rạp đó, không thì dùng `href`. */
  cinemaHref?: (cinemaId: string) => string;
}

const ALL: readonly AdminRole[] = ["ADMIN", "MANAGER", "STAFF"];
const ADMIN_MANAGER: readonly AdminRole[] = ["ADMIN", "MANAGER"];

// Thứ tự theo design-spec §3 (ma trận sidebar). Mục GĐ2 (dashboard, tích hợp POS) không có.
// Staff (SPEC §5.3): Việc cần làm, Đơn hàng, Đơn bị ảnh hưởng, Soát vé.
// Manager thêm: Rạp chiếu, Phòng & sơ đồ ghế, Lịch chiếu, Bảng giá & ngày lễ, Voucher (xem), Quản lý nhân sự, Báo cáo, Cấu hình rạp.
// Admin: Toàn bộ mục hệ thống (Thêm Cấu hình chuỗi, Audit log, Voucher CRUD, Phim).
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Việc cần làm", roles: ALL },
  { href: "/admin/phim", label: "Phim", roles: ["ADMIN"] },
  { href: "/admin/rap", label: "Rạp chiếu", roles: ADMIN_MANAGER },
  {
    href: "/admin/rap",
    label: "Phòng & sơ đồ ghế",
    roles: ADMIN_MANAGER,
    cinemaHref: (cinemaId) => `/admin/rap/${encodeURIComponent(cinemaId)}/phong`,
  },
  { href: "/admin/lich-chieu", label: "Lịch chiếu", roles: ADMIN_MANAGER },
  { href: "/admin/don-hang", label: "Đơn hàng", roles: ALL },
  { href: "/admin/don-can-xu-ly", label: "Đơn cần xử lý", roles: ADMIN_MANAGER },
  { href: "/admin/don-bi-anh-huong", label: "Đơn bị ảnh hưởng", roles: ALL },
  { href: "/admin/gia", label: "Giá & ngày lễ", roles: ADMIN_MANAGER },
  { href: "/admin/ngay-le", label: "Ngày lễ", roles: ["ADMIN"] },
  { href: "/admin/voucher", label: "Voucher", roles: ADMIN_MANAGER },
  { href: "/admin/nguoi-dung", label: "Người dùng", roles: ADMIN_MANAGER },
  { href: "/admin/bao-cao", label: "Báo cáo", roles: ADMIN_MANAGER },
  { href: "/admin/audit-log", label: "Audit log", roles: ["ADMIN"] },
  { href: "/admin/cau-hinh", label: "Cấu hình", roles: ADMIN_MANAGER },
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

const ROOMS_PATH = /^\/admin\/rap\/[^/]+\/phong(\/|$)/;

/**
 * Đích điều hướng của mục sidebar. `cinemaId` là rạp đang chọn đã được shell resolve (resolveScope):
 * "all"/rỗng/null → không có rạp cụ thể → dùng `href` (chọn rạp trước).
 */
export function resolveNavHref(item: AdminNavItem, cinemaId: string | null): string {
  const hasCinema = cinemaId !== null && cinemaId !== "" && cinemaId !== "all";
  return item.cinemaHref && hasCinema ? item.cinemaHref(cinemaId) : item.href;
}

/** Active theo mục: trang phòng thuộc "Phòng & sơ đồ ghế", không thuộc "Rạp chiếu". */
export function isNavEntryActive(item: AdminNavItem, pathname: string): boolean {
  if (item.external) return false;
  if (item.cinemaHref) return ROOMS_PATH.test(pathname);
  if (item.href === "/admin/rap" && ROOMS_PATH.test(pathname)) return false;
  return isNavItemActive(item.href, pathname);
}
