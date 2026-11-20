import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { exchangeCodeForSession } }),
}));

const fetchMeOrNull = vi.fn();
vi.mock("@/lib/auth/load-me", () => ({ fetchMeOrNull: (token: string) => fetchMeOrNull(token) }));

import { GET, isMaskedIdentityCreationError } from "../route";

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

// GoTrue che lỗi trigger guard_identity_insert (OAUTH_AUTO_MERGE_BLOCKED) thành 500 chung (CR-015, AC-04, R-20).
const MASKED_QUERY = "error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity";

async function callbackWithQuery(query: string): Promise<string | null> {
  const res = await GET(new NextRequest(`http://localhost:3000/auth/callback?${query}`));
  return res.headers.get("location");
}

describe("OAuth callback → lỗi che 'Error creating identity' của GoTrue", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("luồng đăng nhập → /dang-nhap?error=email_exists", async () => {
    expect(await callbackWithQuery(MASKED_QUERY)).toBe("http://localhost:3000/dang-nhap?error=email_exists");
  });

  it("luồng đăng nhập giữ next khác '/'", async () => {
    expect(await callbackWithQuery(`${MASKED_QUERY}&next=/dat-ve/abc`)).toBe(
      "http://localhost:3000/dang-nhap?error=email_exists&next=%2Fdat-ve%2Fabc",
    );
  });

  it("chỉ cần mô tả (không phân biệt hoa thường), không cần error_code", async () => {
    expect(await callbackWithQuery("error=server_error&error_description=ERROR+CREATING+IDENTITY")).toBe(
      "http://localhost:3000/dang-nhap?error=email_exists",
    );
  });

  it("chỉ có error_code=unexpected_failure (mã chung lỗi 500) → KHÔNG email_exists", async () => {
    expect(await callbackWithQuery("error_code=unexpected_failure")).toBe(
      "http://localhost:3000/dang-nhap?error=oauth",
    );
  });

  it("500 khác (đổi code lỗi) ở luồng đăng nhập → error=oauth", async () => {
    expect(
      await callbackWithQuery(
        "error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code",
      ),
    ).toBe("http://localhost:3000/dang-nhap?error=oauth");
  });

  it("luồng liên kết (next=/tai-khoan/bao-mat) → KHÔNG email_exists, giữ error=oauth về next", async () => {
    expect(await callbackWithQuery(`${MASKED_QUERY}&next=/tai-khoan/bao-mat`)).toBe(
      "http://localhost:3000/tai-khoan/bao-mat?error=oauth",
    );
  });

  it("lỗi khác (không phải lỗi che) ở luồng đăng nhập vẫn là error=oauth", async () => {
    expect(await callbackWithQuery("error=access_denied&error_description=User+denied")).toBe(
      "http://localhost:3000/dang-nhap?error=oauth",
    );
  });

  it("không phản chiếu error_description ra location", async () => {
    const location = await callbackWithQuery(MASKED_QUERY);
    expect(location).not.toContain("Error");
    expect(location).not.toContain("creating");
  });

  it("log chẩn đoán không chứa mô tả thô, code, state hay token", async () => {
    await callbackWithQuery(`${MASKED_QUERY}&code=SECRETCODE&state=SECRETSTATE`);
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).toContain("email_exists");
    expect(logged).toContain("login");
    expect(logged).toContain('"maskedIdentity":true');
    expect(logged).not.toContain("SECRETCODE");
    expect(logged).not.toContain("SECRETSTATE");
    expect(logged.toLowerCase()).not.toContain("error creating identity");
  });
});

describe("isMaskedIdentityCreationError", () => {
  it.each([
    ["Error creating identity", true],
    ["error CREATING identity: x", true],
    ["Unable to exchange external code", false],
    ["User denied access", false],
    [null, false],
    [undefined, false],
  ])("desc=%s → %s", (desc, expected) => {
    expect(isMaskedIdentityCreationError(desc)).toBe(expected);
  });
});
