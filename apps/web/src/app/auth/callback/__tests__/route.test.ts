import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { exchangeCodeForSession } }),
}));

const fetchMeOrNull = vi.fn();
vi.mock("@/lib/auth/load-me", () => ({ fetchMeOrNull: (token: string) => fetchMeOrNull(token) }));

import { GET } from "../route";

const customer = { isAdmin: false, cinemas: [] };
const staff = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "STAFF" }] };
const manager = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "MANAGER" }] };
const admin = { isAdmin: true, cinemas: [] };

async function callback(me: unknown, next?: string): Promise<string | null> {
  exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: "at-1" } }, error: null });
  fetchMeOrNull.mockResolvedValue(me);
  const query = new URLSearchParams({ code: "abc", ...(next ? { next } : {}) });
  const res = await GET(new NextRequest(`http://localhost:3000/auth/callback?${query}`));
  return res.headers.get("location");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OAuth callback → điều hướng theo vai trò", () => {
  it.each([
    ["ADMIN", admin, "http://localhost:3000/admin"],
    ["MANAGER", manager, "http://localhost:3000/admin"],
    ["STAFF", staff, "http://localhost:3000/staff/chon-rap"],
    ["CUSTOMER", customer, "http://localhost:3000/"],
  ])("%s đăng nhập OAuth không có next", async (_role, me, expected) => {
    expect(await callback(me)).toBe(expected);
    expect(fetchMeOrNull).toHaveBeenCalledWith("at-1");
  });

  it("CUSTOMER giữ next; nhân sự bỏ next trỏ trang khách, giữ next /admin* và /tai-khoan*", async () => {
    expect(await callback(customer, "/dat-ve/abc")).toBe("http://localhost:3000/dat-ve/abc");
    expect(await callback(admin, "/dat-ve/abc")).toBe("http://localhost:3000/admin");
    expect(await callback(admin, "/admin/rap")).toBe("http://localhost:3000/admin/rap");
    // luồng liên kết OAuth từ trang tài khoản phải quay lại đúng chỗ
    expect(await callback(staff, "/tai-khoan/bao-mat")).toBe("http://localhost:3000/tai-khoan/bao-mat");
  });

  it("open-redirect: next độc hại bị loại", async () => {
    expect(await callback(customer, "//evil.com")).toBe("http://localhost:3000/");
    expect(await callback(admin, "https://evil.com")).toBe("http://localhost:3000/admin");
  });

  it("/me lỗi → fail-open về next hoặc /", async () => {
    expect(await callback(null, "/ve")).toBe("http://localhost:3000/ve");
  });

  it("không có access token trong session → không gọi /me, về next hoặc /", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });

    const res = await GET(new NextRequest("http://localhost:3000/auth/callback?code=abc"));

    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(fetchMeOrNull).not.toHaveBeenCalled();
  });

  it("đổi code lỗi → luồng lỗi cũ, không gọi /me", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: "boom" } });

    const res = await GET(new NextRequest("http://localhost:3000/auth/callback?code=abc"));

    expect(res.headers.get("location")).toBe("http://localhost:3000/dang-nhap?error=oauth");
    expect(fetchMeOrNull).not.toHaveBeenCalled();
  });
});
