import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

let requestPathname: string | null = "/";
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestPathname ? { "x-pathname": requestPathname } : {}),
}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser } }),
  getServerAccessToken: vi.fn(async () => "token-1"),
}));

const fetchMeOrNull = vi.fn();
vi.mock("@/lib/auth/load-me", () => ({ fetchMeOrNull: (token: string) => fetchMeOrNull(token) }));

vi.mock("@/components/shell/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/shell/site-footer", () => ({ SiteFooter: () => <footer /> }));
vi.mock("@/components/shell/unverified-email-banner", () => ({ UnverifiedEmailBanner: () => null }));
vi.mock("@/components/auth/staff-area-guard", () => ({
  StaffAreaGuard: ({ home }: { home: string }) => <i data-guard={home} />,
}));

import PublicLayout from "../layout";

const customer = { isAdmin: false, cinemas: [] };
const staff = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "STAFF" }] };
const manager = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "MANAGER" }] };
const admin = { isAdmin: true, cinemas: [] };

async function renderLayout() {
  const tree = await PublicLayout({ children: <p>trang khách</p> });
  return renderToStaticMarkup(tree);
}

function loggedIn(me: unknown) {
  getUser.mockResolvedValue({ data: { user: { email: "u@test.vn", email_confirmed_at: "x", user_metadata: {} } } });
  fetchMeOrNull.mockResolvedValue(me);
}

beforeEach(() => {
  vi.clearAllMocks();
  requestPathname = "/";
});

describe("(public)/layout — chuyển nhân sự về khu vực của họ", () => {
  it("khách chưa đăng nhập: không gọi /me, không redirect", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const html = await renderLayout();

    expect(html).toContain("trang khách");
    expect(fetchMeOrNull).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("customer đã đăng nhập: vào trang khách bình thường, không có guard", async () => {
    loggedIn(customer);

    const html = await renderLayout();

    expect(html).toContain("trang khách");
    expect(html).not.toContain("data-guard");
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["ADMIN", admin, "/", "/admin"],
    ["ADMIN", admin, "/phim", "/admin"],
    ["MANAGER", manager, "/dat-ve/abc", "/admin"],
    ["STAFF", staff, "/rap", "/staff/chon-rap"],
    ["STAFF", staff, "/ve", "/staff/chon-rap"],
  ])("%s mở %s → redirect %s", async (_role, me, pathname, expected) => {
    loggedIn(me);
    requestPathname = pathname;

    await expect(renderLayout()).rejects.toThrow(`NEXT_REDIRECT:${expected}`);
  });

  it("nhiều vai trò (ADMIN kiêm STAFF) → /admin", async () => {
    loggedIn({ isAdmin: true, cinemas: staff.cinemas });

    await expect(renderLayout()).rejects.toThrow("NEXT_REDIRECT:/admin");
  });

  it("nhân sự mở /tai-khoan/*: được ở lại, kèm guard chặn đường vòng bằng điều hướng client", async () => {
    loggedIn(admin);
    requestPathname = "/tai-khoan/bao-mat";

    const html = await renderLayout();

    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain("trang khách");
    expect(html).toContain('data-guard="/admin"');
  });

  it("không có x-pathname: không redirect server (guard phía client lo)", async () => {
    loggedIn(staff);
    requestPathname = null;

    const html = await renderLayout();

    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain('data-guard="/staff/chon-rap"');
  });

  it("/me lỗi (null): fail-open, nhân sự vẫn vào được trang khách", async () => {
    loggedIn(null);

    const html = await renderLayout();

    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain("trang khách");
    expect(html).not.toContain("data-guard");
  });

  it("phiên lỗi (getUser ném): render như khách, không redirect", async () => {
    getUser.mockRejectedValue(new Error("no env"));

    const html = await renderLayout();

    expect(html).toContain("trang khách");
    expect(redirect).not.toHaveBeenCalled();
  });
});
