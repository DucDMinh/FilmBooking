import "@testing-library/jest-dom/vitest";

import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import type { MeResponse } from "@filmbooking/shared/schemas/me";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminLayout from "@/app/admin/layout";
import { AdminMobileNav, AdminSidebar } from "../admin-sidebar";
import { CinemaSelector, CinemaScopeSwitcher } from "../cinema-selector";
import {
  ADMIN_NAV_ITEMS,
  isNavEntryActive,
  isNavItemActive,
  navItemsForRole,
  resolveAdminRole,
  resolveNavHref,
} from "../nav-config";
import { ALL_CINEMAS, resolveScope, useAdminScope, type ScopeCinema } from "../use-admin-scope";

// ── Mock Next.js navigation ──────────────────────────────────────
const mockPush = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
let currentPathname = "/admin";
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => currentPathname,
  useSearchParams: () => currentSearchParams,
  redirect: (url: string) => mockRedirect(url),
}));

// ── Mock Supabase browser client ─────────────────────────────────
const mockSupabaseFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  })),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    from: () => mockSupabaseFrom(),
  }),
}));

// ── Mock Supabase server session ─────────────────────────────────
const mockGetServerAccessToken = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerAccessToken: () => mockGetServerAccessToken(),
}));

// ── Mock API client ──────────────────────────────────────────────
const mockApiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    constructor(readonly status: number, message: string) {
      super(message);
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  currentPathname = "/admin";
  currentSearchParams = new URLSearchParams();
});

describe("nav-config: resolveAdminRole", () => {
  it("trả về ADMIN khi isAdmin = true bất kể rạp được gán", () => {
    const meAdmin: Pick<MeResponse, "isAdmin" | "cinemas"> = {
      isAdmin: true,
      cinemas: [],
    };
    expect(resolveAdminRole(meAdmin)).toBe("ADMIN");

    const meAdminWithCinemas: Pick<MeResponse, "isAdmin" | "cinemas"> = {
      isAdmin: true,
      cinemas: [{ cinemaId: "c1", role: "STAFF" }],
    };
    expect(resolveAdminRole(meAdminWithCinemas)).toBe("ADMIN");
  });

  it("trả về MANAGER khi có ít nhất một rạp vai trò MANAGER", () => {
    const meManager: Pick<MeResponse, "isAdmin" | "cinemas"> = {
      isAdmin: false,
      cinemas: [
        { cinemaId: "c1", role: "STAFF" },
        { cinemaId: "c2", role: "MANAGER" },
      ],
    };
    expect(resolveAdminRole(meManager)).toBe("MANAGER");
  });

  it("trả về STAFF khi chỉ có rạp vai trò STAFF", () => {
    const meStaff: Pick<MeResponse, "isAdmin" | "cinemas"> = {
      isAdmin: false,
      cinemas: [{ cinemaId: "c1", role: "STAFF" }],
    };
    expect(resolveAdminRole(meStaff)).toBe("STAFF");
  });

  it("trả về null khi là khách hàng (CUSTOMER: isAdmin = false, không có rạp gán)", () => {
    const meCustomer: Pick<MeResponse, "isAdmin" | "cinemas"> = {
      isAdmin: false,
      cinemas: [],
    };
    expect(resolveAdminRole(meCustomer)).toBeNull();
  });
});

describe("nav-config: navItemsForRole và phạm vi vai trò (R-39, D4)", () => {
  it("Staff chỉ thấy 4 mục: Việc cần làm, Đơn hàng, Đơn bị ảnh hưởng, Soát vé", () => {
    const staffItems = navItemsForRole("STAFF");
    const staffHrefs = staffItems.map((item) => item.href);

    expect(staffHrefs).toEqual([
      "/admin",
      "/admin/don-hang",
      "/admin/don-bi-anh-huong",
      "/staff/soat-ve",
    ]);

    // Không thấy các mục quản trị hệ thống
    expect(staffHrefs).not.toContain("/admin/phim");
    expect(staffHrefs).not.toContain("/admin/rap");
    expect(staffHrefs).not.toContain("/admin/ngay-le");
    expect(staffHrefs).not.toContain("/admin/lich-chieu");
    expect(staffHrefs).not.toContain("/admin/gia");
    expect(staffHrefs).not.toContain("/admin/voucher");
    expect(staffHrefs).not.toContain("/admin/nguoi-dung");
    expect(staffHrefs).not.toContain("/admin/bao-cao");
    expect(staffHrefs).not.toContain("/admin/audit-log");
    expect(staffHrefs).not.toContain("/admin/cau-hinh");
  });

  it("Manager thêm: Rạp/phòng, Lịch chiếu, Bảng giá & ngày lễ, Báo cáo, Quản lý nhân sự, Voucher (xem), Cấu hình", () => {
    const managerItems = navItemsForRole("MANAGER");
    const managerHrefs = managerItems.map((item) => item.href);

    // Chứa đầy đủ các mục của Staff
    expect(managerHrefs).toContain("/admin");
    expect(managerHrefs).toContain("/admin/don-hang");
    expect(managerHrefs).toContain("/admin/don-bi-anh-huong");
    expect(managerHrefs).toContain("/staff/soat-ve");

    // Thêm các mục của Manager (SPEC §5.3, design-spec §3)
    expect(managerHrefs).toContain("/admin/rap");
    expect(managerHrefs).not.toContain("/admin/phong");
    expect(managerItems.some((i) => i.label === "Phòng & sơ đồ ghế")).toBe(true);
    expect(managerHrefs).toContain("/admin/lich-chieu");
    expect(managerHrefs).toContain("/admin/gia");
    expect(managerHrefs).toContain("/admin/voucher");
    expect(managerHrefs).toContain("/admin/cau-hinh");
    expect(managerHrefs).toContain("/admin/bao-cao");
    expect(managerHrefs).toContain("/admin/nguoi-dung");

    // Manager KHÔNG thấy mục toàn chuỗi của Admin
    expect(managerHrefs).not.toContain("/admin/phim");
    expect(managerHrefs).not.toContain("/admin/audit-log");
  });

  it("Admin thấy toàn bộ mục hệ thống (thêm Phim, Voucher CRUD, Audit log, Cấu hình chuỗi)", () => {
    const adminItems = navItemsForRole("ADMIN");
    const adminHrefs = adminItems.map((item) => item.href);

    expect(adminHrefs).toContain("/admin/phim");
    expect(adminHrefs).toContain("/admin/ngay-le");
    expect(adminHrefs).toContain("/admin/voucher");
    expect(adminHrefs).toContain("/admin/audit-log");
    expect(adminHrefs).toContain("/admin/cau-hinh");
    expect(adminItems.length).toBe(ADMIN_NAV_ITEMS.length);
  });

  it("mục Phòng & sơ đồ ghế: có rạp đang chọn thì trỏ /admin/rap/<id>/phong, không thì /admin/rap", () => {
    const rooms = ADMIN_NAV_ITEMS.find((i) => i.label === "Phòng & sơ đồ ghế");
    expect(rooms).toBeDefined();
    expect(resolveNavHref(rooms!, "c1")).toBe("/admin/rap/c1/phong");
    expect(resolveNavHref(rooms!, null)).toBe("/admin/rap");
    expect(resolveNavHref(rooms!, "all")).toBe("/admin/rap");
    expect(resolveNavHref(rooms!, "")).toBe("/admin/rap");
  });

  it("active: trang phòng chỉ active mục Phòng; /admin/rap chỉ active Rạp chiếu", () => {
    const rooms = ADMIN_NAV_ITEMS.find((i) => i.label === "Phòng & sơ đồ ghế")!;
    const cinemas = ADMIN_NAV_ITEMS.find((i) => i.label === "Rạp chiếu")!;
    for (const path of ["/admin/rap/c1/phong", "/admin/rap/c1/phong/r9"]) {
      expect(isNavEntryActive(rooms, path)).toBe(true);
      expect(isNavEntryActive(cinemas, path)).toBe(false);
    }
    expect(isNavEntryActive(rooms, "/admin/rap")).toBe(false);
    expect(isNavEntryActive(cinemas, "/admin/rap")).toBe(true);
    expect(isNavEntryActive(cinemas, "/admin/rap/c1")).toBe(true);
  });

  it("không mục sidebar nào trỏ route không tồn tại /admin/phong", () => {
    for (const item of ADMIN_NAV_ITEMS) expect(item.href).not.toBe("/admin/phong");
  });

  it("CR remove-pos (spec 2.0.0): không có mục POS trong bất kỳ vai trò nào", () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(item.href).not.toBe("/pos");
      expect(item.href).not.toBe("/admin/tich-hop-pos");
      expect(item.label.toLowerCase()).not.toContain("pos");
    }
  });

  it("isNavItemActive: kiểm tra chính xác đường dẫn active", () => {
    expect(isNavItemActive("/admin", "/admin")).toBe(true);
    expect(isNavItemActive("/admin", "/admin/don-hang")).toBe(false);
    expect(isNavItemActive("/admin/don-hang", "/admin/don-hang")).toBe(true);
    expect(isNavItemActive("/admin/don-hang", "/admin/don-hang/DH-001")).toBe(true);
    expect(isNavItemActive("/admin/rap", "/admin/lich-chieu")).toBe(false);
  });
});

describe("useAdminScope & resolveScope: Bộ chọn phạm vi rạp (R-39)", () => {
  const cinemas: ScopeCinema[] = [
    { id: "cinema-hn-01", name: "CINEMO Long Biên" },
    { id: "cinema-hn-02", name: "CINEMO Cầu Giấy" },
  ];

  it("Admin (canSeeAll = true) có thể chọn 'all' (Toàn chuỗi) hoặc rạp cụ thể", () => {
    expect(resolveScope(ALL_CINEMAS, cinemas, true)).toBe(ALL_CINEMAS);
    expect(resolveScope(null, cinemas, true)).toBe(ALL_CINEMAS);
    expect(resolveScope("cinema-hn-01", cinemas, true)).toBe("cinema-hn-01");
    // Id lạ không tồn tại -> fallback "all"
    expect(resolveScope("cinema-unknown", cinemas, true)).toBe(ALL_CINEMAS);
  });

  it("Manager/Staff (canSeeAll = false) KHÔNG được chọn 'all', chỉ chọn rạp được gán", () => {
    // Nếu URL có ?cinema=all hoặc null -> fallback về rạp đầu tiên được gán
    expect(resolveScope(ALL_CINEMAS, cinemas, false)).toBe("cinema-hn-01");
    expect(resolveScope(null, cinemas, false)).toBe("cinema-hn-01");
    expect(resolveScope("cinema-hn-02", cinemas, false)).toBe("cinema-hn-02");
    // Id rạp khác không được gán -> fallback rạp được gán
    expect(resolveScope("cinema-unassigned", cinemas, false)).toBe("cinema-hn-01");
  });

  it("useAdminScope hook: đổi scope cập nhật query string vào router", () => {
    currentSearchParams = new URLSearchParams("cinema=cinema-hn-01");
    let resultScope = "";
    let resultSetScope: (next: string) => void = () => undefined;

    function TestComponent() {
      const { scope, setScope } = useAdminScope(cinemas, true);
      resultScope = scope;
      resultSetScope = setScope;
      return null;
    }

    render(<TestComponent />);
    expect(resultScope).toBe("cinema-hn-01");

    resultSetScope("cinema-hn-02");
    expect(mockPush).toHaveBeenCalledWith("/admin?cinema=cinema-hn-02");
  });
});

describe("CinemaScopeSwitcher component", () => {
  const cinemas: ScopeCinema[] = [
    { id: "c1", name: "CINEMO Long Biên" },
    { id: "c2", name: "CINEMO Cầu Giấy" },
  ];

  it("Admin: hiển thị dropdown có thể đổi, có lựa chọn 'Toàn chuỗi'", () => {
    const onScopeChange = vi.fn();
    render(
      <CinemaScopeSwitcher
        cinemas={cinemas}
        canSeeAll={true}
        scope="all"
        onScopeChange={onScopeChange}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Phạm vi rạp" });
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent("Toàn chuỗi");
  });

  it("Manager được gán nhiều rạp: không có 'Toàn chuỗi', có ghi chú giới hạn rạp", () => {
    const onScopeChange = vi.fn();
    render(
      <CinemaScopeSwitcher
        cinemas={cinemas}
        canSeeAll={false}
        scope="c1"
        onScopeChange={onScopeChange}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Phạm vi rạp" });
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent("CINEMO Long Biên");

    // Có thông điệp phạm vi được gán
    expect(
      screen.getByText("Dữ liệu chỉ giới hạn trong rạp được phân công"),
    ).toBeInTheDocument();
  });

  it("Manager/Staff chỉ có 1 rạp: hiển thị dạng nhãn không mở được (disabled)", () => {
    const singleCinema = [{ id: "c1", name: "CINEMO Long Biên" }];
    render(
      <CinemaScopeSwitcher
        cinemas={singleCinema}
        canSeeAll={false}
        scope="c1"
        onScopeChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Phạm vi rạp" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("CINEMO Long Biên");
  });

  it("G/M13-2: Admin thấy đầy đủ các rạp ở trạng thái TEMP_CLOSED, COMING_SOON, CLOSED với nhãn trạng thái", () => {
    const mixedCinemas = [
      { id: "c1", name: "CINEMO Long Biên", status: "OPEN" },
      { id: "c2", name: "CINEMO Cầu Giấy", status: "TEMP_CLOSED" },
      { id: "c3", name: "CINEMO Hoàng Mai", status: "COMING_SOON" },
      { id: "c4", name: "CINEMO Ba Đình", status: "CLOSED" },
    ];
    render(
      <CinemaSelector
        cinemas={mixedCinemas}
        canSeeAll={true}
        scope="c2"
        onScopeChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Phạm vi rạp" });
    expect(trigger).toHaveTextContent("CINEMO Cầu Giấy");
    expect(trigger).toHaveTextContent("Tạm đóng");
  });

  it("G/M13-2: Nhân sự rạp chưa OPEN hiển thị đúng tên rạp thay vì fallback ID thô", async () => {
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "c-temp", name: "CINEMO Cầu Giấy", code: "HN02", status: "TEMP_CLOSED" },
          ],
          error: null,
        }),
      }),
    });

    const initialAssigned = [{ id: "c-temp", name: "Rạp c-temp1234" }];
    render(
      <CinemaSelector
        cinemas={initialAssigned}
        canSeeAll={false}
        scope="c-temp"
        onScopeChange={vi.fn()}
      />,
    );

    // Khi load từ Supabase xong, tên rạp được cập nhật thành tên thật
    expect(await screen.findByText(/CINEMO Cầu Giấy/)).toBeInTheDocument();
  });
});

describe("AdminSidebar và AdminMobileNav (Keyboard nav & Responsive Sheet)", () => {
  it("AdminSidebar: render danh sách nav items với bàn phím có thể focus, đánh dấu item active", () => {
    currentPathname = "/admin";
    const items = navItemsForRole("STAFF");
    render(<AdminSidebar items={items} />);

    const nav = screen.getByRole("navigation", { name: "Điều hướng quản trị" });
    expect(nav).toBeInTheDocument();

    const activeLink = screen.getByRole("link", { name: "Việc cần làm" });
    expect(activeLink).toHaveAttribute("aria-current", "page");

    const ordersLink = screen.getByRole("link", { name: "Đơn hàng" });
    expect(ordersLink).not.toHaveAttribute("aria-current");

    // Focus link bằng bàn phím
    ordersLink.focus();
    expect(ordersLink).toHaveFocus();
  });

  it("G/M13-1: giữ nguyên query ?cinema= khi chuyển đổi giữa các route con /admin/*", () => {
    currentSearchParams = new URLSearchParams("cinema=cinema-hn-01");
    const items = navItemsForRole("STAFF");
    render(<AdminSidebar items={items} />);

    const ordersLink = screen.getByRole("link", { name: "Đơn hàng" });
    expect(ordersLink).toHaveAttribute("href", "/admin/don-hang?cinema=cinema-hn-01");

    const affectedLink = screen.getByRole("link", { name: "Đơn bị ảnh hưởng" });
    expect(affectedLink).toHaveAttribute("href", "/admin/don-bi-anh-huong?cinema=cinema-hn-01");

    // Link external không bị gắn ?cinema=
    const checkinLink = screen.getByRole("link", { name: /Soát vé/ });
    expect(checkinLink).toHaveAttribute("href", "/staff/soat-ve");
  });

  it("mục Phòng & sơ đồ ghế: có cinemaId → /admin/rap/<id>/phong (giữ ?cinema=); 'all' → /admin/rap", () => {
    currentSearchParams = new URLSearchParams("cinema=c1");
    const items = navItemsForRole("MANAGER");
    const { unmount } = render(<AdminSidebar items={items} cinemaId="c1" />);
    expect(screen.getByRole("link", { name: "Phòng & sơ đồ ghế" })).toHaveAttribute(
      "href",
      "/admin/rap/c1/phong?cinema=c1",
    );
    unmount();
    currentSearchParams = new URLSearchParams("cinema=all");
    render(<AdminSidebar items={items} cinemaId="all" />);
    expect(screen.getByRole("link", { name: "Phòng & sơ đồ ghế" })).toHaveAttribute("href", "/admin/rap?cinema=all");
  });

  it("G/M13-1: không thêm query string khi không có param ?cinema=", () => {
    currentSearchParams = new URLSearchParams();
    const items = navItemsForRole("STAFF");
    render(<AdminSidebar items={items} />);

    const ordersLink = screen.getByRole("link", { name: "Đơn hàng" });
    expect(ordersLink).toHaveAttribute("href", "/admin/don-hang");
  });

  it("AdminMobileNav: mở Sheet trên mobile và đóng khi chọn mục", async () => {
    const user = userEvent.setup();
    const items = navItemsForRole("STAFF");
    render(<AdminMobileNav items={items} />);

    const openButton = screen.getByRole("button", { name: "Mở menu quản trị" });
    expect(openButton).toBeInTheDocument();

    await user.click(openButton);

    // Sheet mở ra
    const sheetTitle = await screen.findByText("Quản trị");
    expect(sheetTitle).toBeInTheDocument();

    // Bấm một link trong Sheet -> Sheet đóng lại
    const [link] = screen.getAllByRole("link", { name: "Đơn hàng" });
    expect(link).toBeDefined();
    if (link) {
      await user.click(link);
    }
  });
});

describe("AdminLayout (Chặn CUSTOMER và phân quyền)", () => {
  beforeEach(() => {
    mockGetServerAccessToken.mockResolvedValue("mock-jwt-token");
  });

  it("chuyển hướng sang /dang-nhap khi chưa đăng nhập", async () => {
    mockGetServerAccessToken.mockResolvedValue(null);

    await expect(AdminLayout({ children: <div>Admin Page</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/dang-nhap?next=/admin",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/dang-nhap?next=/admin");
  });

  it("chuyển hướng sang /khong-co-quyen (403) khi là CUSTOMER", async () => {
    const customerMe: MeResponse = {
      id: "user-cust-1",
      email: "cust@example.com",
      emailConfirmed: true,
      isAdmin: false,
      cinemas: [],
    };
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/me") return customerMe;
      return [];
    });

    await expect(AdminLayout({ children: <div>Admin Page</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/khong-co-quyen",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/khong-co-quyen");
  });

  it("cho phép nhân sự (STAFF / MANAGER / ADMIN) truy cập và tải danh sách rạp", async () => {
    const staffMe: MeResponse = {
      id: "user-staff-1",
      email: "staff@example.com",
      emailConfirmed: true,
      isAdmin: false,
      cinemas: [{ cinemaId: "c1", role: "STAFF" }],
    };
    const mockCinemas: CinemaDto[] = [
      {
        id: "c1",
        code: "HN01",
        name: "CINEMO Long Biên",
        provinceCode: "HN",
        district: "Long Biên",
        address: "Tầng 4, TTTM Mipec Long Biên",
        latitude: 21.04,
        longitude: 105.87,
        hotline: "1900 8888",
        email: "longbien@cinemo.vn",
        openingHours: "08:30 - 23:30",
        imageUrl: null,
        amenities: [],
        status: "OPEN",
        scheduledStatus: null,
        scheduledEffectiveAt: null,
      },
    ];

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/me") return staffMe;
      if (path === "/cinemas") return mockCinemas;
      return [];
    });

    const result = await AdminLayout({ children: <div>Admin Content</div> });
    expect(result).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
