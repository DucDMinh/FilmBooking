import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnv: () => ({ url: "http://localhost:54321", anonKey: "anon" }),
}));

import { proxy } from "../proxy";

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: null } });
});

describe("proxy", () => {
  it("chuyển pathname cho Server Component qua request header x-pathname (không gọi /me)", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/phim/abc?x=1"));

    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/phim/abc");
  });

  it("ghi đè x-pathname do client tự gửi (không giả mạo được)", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/phim", { headers: { "x-pathname": "/tai-khoan" } }),
    );

    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/phim");
  });

  it("khách vào trang cần đăng nhập vẫn bị chuyển sang /dang-nhap?next=", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/admin/don-hang"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dang-nhap?next=%2Fadmin%2Fdon-hang");
  });
});
