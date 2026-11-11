import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ERROR_CODES } from "@filmbooking/shared/errors";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

import { ApiError, apiFetch } from "../client";
import { ERROR_MESSAGES, GENERIC_ERROR_MESSAGE } from "../error-messages";
import { proxy, isProtectedPath } from "../../../proxy";
import { sanitizeNext } from "../../auth/safe-next";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  getUser.mockReset();
});

describe("apiFetch", () => {
  it("SEAT_TAKEN -> ApiError tiếng Việt", async () => {
    mockFetch(409, { error: { code: "SEAT_TAKEN", message: "x" } });
    const err = await apiFetch("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("SEAT_TAKEN");
    expect((err as ApiError).message).toBe(ERROR_MESSAGES.SEAT_TAKEN);
    expect((err as ApiError).message).toMatch(/ghế/i);
  });

  it("mã chưa biết -> thông điệp chung", async () => {
    mockFetch(400, { error: { code: "WHATEVER", message: "x" } });
    const err = (await apiFetch("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(err.code).toBe("UNKNOWN");
  });

  it("gắn Bearer token và JSON body", async () => {
    const fn = mockFetch(200, { ok: true });
    await apiFetch("/y", { method: "POST", json: { a: 1 }, accessToken: "tok" });
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok");
    expect(init.body).toBe('{"a":1}');
  });
});

describe("error-messages", () => {
  it("phủ toàn bộ mã lỗi shared với message không rỗng", () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(ERROR_MESSAGES[code], code).toBeTruthy();
    }
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual(Object.keys(ERROR_CODES).sort());
  });
});

describe("proxy", () => {
  it("/ve khi chưa đăng nhập -> /dang-nhap?next=%2Fve", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(new NextRequest("http://localhost:3000/ve"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/dang-nhap");
    expect(loc.search).toBe("?next=%2Fve");
  });

  it("đã đăng nhập -> cho qua", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    const res = await proxy(new NextRequest("http://localhost:3000/admin/phim"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("route công khai -> cho qua", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(new NextRequest("http://localhost:3000/phim"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sanitizeNext loại URL ngoài domain", () => {
    expect(sanitizeNext("/ve")).toBe("/ve");
    expect(sanitizeNext("//evil.com")).toBeNull();
    expect(sanitizeNext("https://evil.com")).toBeNull();
    expect(sanitizeNext("/\\evil.com")).toBeNull();
    expect(sanitizeNext(null)).toBeNull();
  });
});

describe("apiFetch edge cases", () => {
  it("lỗi mạng -> ApiError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("boom"))));
    const err = (await apiFetch("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
  });

  it("body lỗi không phải JSON -> thông điệp chung", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    const err = (await apiFetch("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("UNKNOWN");
    expect(err.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("200 body rỗng -> undefined; 200 không phải JSON -> ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(apiFetch("/x")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 200 })));
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("proxy bổ sung", () => {
  it("/vexyz không bị chặn", () => {
    expect(isProtectedPath("/vexyz")).toBe(false);
    expect(isProtectedPath("/ve/abc")).toBe(true);
  });

  it("next chứa ký tự điều khiển bị loại", () => {
    expect(sanitizeNext("/ve\r\nSet-Cookie: x")).toBeNull();
  });

  it("thiếu env Supabase -> lỗi nêu rõ biến", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(proxy(new NextRequest("http://localhost:3000/"))).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
