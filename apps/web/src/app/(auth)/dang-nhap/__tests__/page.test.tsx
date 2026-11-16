import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoginResult } from "@/components/auth/login-form";

const redirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const cookieStore = { set: vi.fn(), getAll: vi.fn(() => []) };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

const setSession = vi.fn();
const getServerAccessToken = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { setSession } }),
  getServerAccessToken: () => getServerAccessToken(),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@/lib/api/client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const fetchMeOrNull = vi.fn();
vi.mock("@/lib/auth/load-me", () => ({ fetchMeOrNull: (token: string) => fetchMeOrNull(token) }));

vi.mock("@/components/auth/login-form", () => ({ LoginForm: () => null }));

import LoginPage from "../page";

const customer = { isAdmin: false, cinemas: [] };
const staff = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "STAFF" }] };
const manager = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "MANAGER" }] };
const admin = { isAdmin: true, cinemas: [] };

type OnLogin = (data: { email: string; password: string; rememberMe: boolean }) => Promise<LoginResult>;

async function loginWith(me: unknown, next?: string): Promise<LoginResult> {
  getServerAccessToken.mockResolvedValue(null);
  apiFetch.mockResolvedValue({ accessToken: "at-1", refreshToken: "rt-1" });
  fetchMeOrNull.mockResolvedValue(me);
  const element = (await LoginPage({ searchParams: Promise.resolve({ next }) })) as ReactElement<{
    onLogin: OnLogin;
  }>;
  return element.props.onLogin({ email: "a@b.vn", password: "x", rememberMe: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerAccessToken.mockResolvedValue(null);
});

describe("đăng nhập mật khẩu → điều hướng theo vai trò", () => {
  it.each([
    ["admin@", admin, undefined, "/admin"],
    ["manager.hn01@", manager, undefined, "/admin"],
    ["staff.hn01@", staff, undefined, "/staff/chon-rap"],
    ["customer@", customer, undefined, "/"],
  ])("%s không có next → %s", async (_who, me, next, expected) => {
    const result = await loginWith(me, next);

    expect(result).toEqual({ success: true, redirectTo: expected });
    expect(fetchMeOrNull).toHaveBeenCalledWith("at-1");
  });

  it("nhân sự có next trỏ trang khách → bỏ qua next", async () => {
    expect(await loginWith(admin, "/dat-ve/abc")).toMatchObject({ redirectTo: "/admin" });
  });

  it("nhân sự có next /admin/rap/moi → giữ next", async () => {
    expect(await loginWith(admin, "/admin/rap/moi")).toMatchObject({ redirectTo: "/admin/rap/moi" });
  });

  it("customer có next → giữ next; next độc hại bị loại", async () => {
    expect(await loginWith(customer, "/dat-ve/abc")).toMatchObject({ redirectTo: "/dat-ve/abc" });
    expect(await loginWith(customer, "//evil.com")).toMatchObject({ redirectTo: "/" });
  });

  it("/me lỗi → fail-open: đăng nhập vẫn thành công, về next hoặc /", async () => {
    expect(await loginWith(null, "/ve")).toEqual({ success: true, redirectTo: "/ve" });
  });
});

describe("/dang-nhap khi đã đăng nhập", () => {
  it("khách chưa đăng nhập: hiện form, không gọi /me", async () => {
    getServerAccessToken.mockResolvedValue(null);

    await LoginPage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
    expect(fetchMeOrNull).not.toHaveBeenCalled();
  });

  it("nhân sự đã đăng nhập → chuyển về khu vực của vai trò", async () => {
    getServerAccessToken.mockResolvedValue("at-2");
    fetchMeOrNull.mockResolvedValue(staff);

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT:/staff/chon-rap",
    );
  });

  it("nhân sự đã đăng nhập, next=/admin/don-hang → tôn trọng next", async () => {
    getServerAccessToken.mockResolvedValue("at-2");
    fetchMeOrNull.mockResolvedValue(admin);

    await expect(
      LoginPage({ searchParams: Promise.resolve({ next: "/admin/don-hang" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/don-hang");
  });

  it("customer đã đăng nhập → vẫn thấy form (hành vi cũ)", async () => {
    getServerAccessToken.mockResolvedValue("at-2");
    fetchMeOrNull.mockResolvedValue(customer);

    await LoginPage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("phiên hết hạn (/me lỗi → null): hiện form, không vòng lặp với /admin → /dang-nhap", async () => {
    getServerAccessToken.mockResolvedValue("expired");
    fetchMeOrNull.mockResolvedValue(null);

    await LoginPage({ searchParams: Promise.resolve({ next: "/admin" }) });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("lỗi đọc phiên (thiếu env): hiện form thay vì 500", async () => {
    getServerAccessToken.mockRejectedValue(new Error("Thiếu biến môi trường"));

    await LoginPage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
  });
});
