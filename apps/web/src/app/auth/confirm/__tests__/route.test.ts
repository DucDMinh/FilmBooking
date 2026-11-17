import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface StoredCookie {
  value: string;
  options?: { maxAge?: number; expires?: Date; httpOnly?: boolean };
}

// Kho cookie giả thay cho `cookies()` của next/headers: set rồi getAll trong cùng request thấy giá trị mới (như Next).
const cookieJar = new Map<string, StoredCookie>();
const fakeCookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)!.value } : undefined),
  getAll: () => [...cookieJar].map(([name, { value }]) => ({ name, value })),
  set: (name: string, value: string, options?: StoredCookie["options"]) => {
    cookieJar.set(name, { value, options });
  },
};
vi.mock("next/headers", () => ({ cookies: async () => fakeCookieStore }));

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp } }),
}));

const fetchMeOrNull = vi.fn();
vi.mock("@/lib/auth/load-me", () => ({ fetchMeOrNull: (token: string) => fetchMeOrNull(token) }));

import { GET } from "../route";

const ORIGIN = "http://localhost:3000";
const customer = { isAdmin: false, cinemas: [] };
const staff = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "STAFF" }] };
const manager = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "MANAGER" }] };
const admin = { isAdmin: true, cinemas: [] };

function request(params: Record<string, string>): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/confirm?${new URLSearchParams(params)}`);
}

async function confirm(me: unknown, next?: string): Promise<string | null> {
  verifyOtp.mockResolvedValue({ data: { session: { access_token: "at-1" } }, error: null });
  fetchMeOrNull.mockResolvedValue(me);
  const res = await GET(request({ token_hash: "hash-1", type: "signup", ...(next ? { next } : {}) }));
  return res.headers.get("location");
}

const THIRTY_DAYS = 30 * 24 * 3600;

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
});

// verifyOtp thật ghi cookie phiên qua setAll của createServerSupabase, vốn đọc cờ fb-remember còn sót (có thể =1 → 30 ngày).
function verifyOtpWritesSessionCookies(maxAge: number) {
  verifyOtp.mockImplementation(async () => {
    cookieJar.set("sb-127-auth-token.0", { value: "chunk-0", options: { maxAge, httpOnly: true } });
    cookieJar.set("sb-127-auth-token.1", { value: "chunk-1", options: { maxAge, httpOnly: true } });
    return { data: { session: { access_token: "at-1" } }, error: null };
  });
  fetchMeOrNull.mockResolvedValue(customer);
}

describe("/auth/confirm — xác nhận email rồi đăng nhập luôn", () => {
  it("token hợp lệ: gọi verifyOtp đúng type signup + token_hash, khách về trang success", async () => {
    expect(await confirm(customer)).toBe(`${ORIGIN}/xac-nhan-email?status=success`);
    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "hash-1" });
    expect(fetchMeOrNull).toHaveBeenCalledWith("at-1");
  });

  it("khách giữ next an toàn trong trang success", async () => {
    expect(await confirm(customer, "/dat-ve/abc")).toBe(
      `${ORIGIN}/xac-nhan-email?status=success&next=%2Fdat-ve%2Fabc`,
    );
  });

  it.each([
    ["ADMIN", admin, `${ORIGIN}/admin`],
    ["MANAGER", manager, `${ORIGIN}/admin`],
    ["STAFF", staff, `${ORIGIN}/staff/chon-rap`],
  ])("%s về khu vực vai trò", async (_role, me, expected) => {
    expect(await confirm(me)).toBe(expected);
  });

  it("/me lỗi → fail-open về trang success", async () => {
    expect(await confirm(null)).toBe(`${ORIGIN}/xac-nhan-email?status=success`);
  });

  it("không có access token trong session → không gọi /me, về trang success", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });

    const res = await GET(request({ token_hash: "hash-1", type: "signup" }));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/xac-nhan-email?status=success`);
    expect(fetchMeOrNull).not.toHaveBeenCalled();
  });

  it("open-redirect: next độc hại bị loại, về trang success mặc định", async () => {
    expect(await confirm(customer, "//evil.com")).toBe(`${ORIGIN}/xac-nhan-email?status=success`);
    expect(await confirm(customer, "https://evil.com")).toBe(`${ORIGIN}/xac-nhan-email?status=success`);
    expect(await confirm(customer, "/\\evil.com")).toBe(`${ORIGIN}/xac-nhan-email?status=success`);
  });

  it("verifyOtp trả lỗi (hết hạn / đã dùng / sai hash) → expired, không gọi /me", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Email link is invalid or has expired" } });

    const res = await GET(request({ token_hash: "bad", type: "signup" }));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/xac-nhan-email?status=expired`);
    expect(fetchMeOrNull).not.toHaveBeenCalled();
  });

  it("verifyOtp throw → expired, không lộ chi tiết lỗi", async () => {
    verifyOtp.mockRejectedValue(new Error("secret internal failure"));

    const res = await GET(request({ token_hash: "hash-1", type: "signup" }));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/xac-nhan-email?status=expired`);
    expect(res.headers.get("location")).not.toContain("secret");
    expect(fetchMeOrNull).not.toHaveBeenCalled();
  });

  it.each(["recovery", "magiclink", "email", "invite", "email_change", "SIGNUP", ""])(
    "type=%j (ngoài signup) → expired, KHÔNG gọi verifyOtp",
    async (type) => {
      const res = await GET(request({ token_hash: "hash-1", type }));

      expect(res.headers.get("location")).toBe(`${ORIGIN}/xac-nhan-email?status=expired`);
      expect(verifyOtp).not.toHaveBeenCalled();
    },
  );

  it("thiếu type → expired, KHÔNG gọi verifyOtp", async () => {
    const res = await GET(request({ token_hash: "hash-1" }));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/xac-nhan-email?status=expired`);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ token_hash: "" }]] as [Record<string, string>][])(
    "thiếu/rỗng token_hash %j → expired, KHÔNG gọi verifyOtp",
    async (extra) => {
      const res = await GET(request({ type: "signup", ...extra }));

      expect(res.headers.get("location")).toBe(`${ORIGIN}/xac-nhan-email?status=expired`);
      expect(verifyOtp).not.toHaveBeenCalled();
    },
  );

  describe("phiên từ link xác nhận luôn là phiên trình duyệt (R-15)", () => {
    it("cờ fb-remember=1 còn sót: cookie phiên bị ghi lại không maxAge, cờ bị ghim 0", async () => {
      cookieJar.set("fb-remember", { value: "1", options: { maxAge: THIRTY_DAYS } });
      verifyOtpWritesSessionCookies(THIRTY_DAYS);

      const res = await GET(request({ token_hash: "hash-1", type: "signup" }));

      expect(res.headers.get("location")).toBe(`${ORIGIN}/xac-nhan-email?status=success`);
      expect(cookieJar.get("fb-remember")?.value).toBe("0");
      expect(cookieJar.get("fb-remember")?.options?.maxAge).toBeUndefined();
      for (const name of ["sb-127-auth-token.0", "sb-127-auth-token.1"]) {
        const cookie = cookieJar.get(name);
        expect(cookie?.options?.maxAge, name).toBeUndefined();
        expect(cookie?.options?.expires, name).toBeUndefined();
        expect(cookie?.options?.httpOnly, name).toBe(true);
      }
      expect(cookieJar.get("sb-127-auth-token.0")?.value).toBe("chunk-0");
    });

    it("không có cờ fb-remember: cookie phiên vẫn không có maxAge, cờ được đặt 0", async () => {
      verifyOtpWritesSessionCookies(400 * 24 * 3600);

      await GET(request({ token_hash: "hash-1", type: "signup" }));

      expect(cookieJar.get("fb-remember")?.value).toBe("0");
      expect(cookieJar.get("sb-127-auth-token.0")?.options?.maxAge).toBeUndefined();
      expect(cookieJar.get("sb-127-auth-token.1")?.options?.maxAge).toBeUndefined();
    });

    it("chunk cookie đã bị xoá (value rỗng): không ghi lại thành cookie rác", async () => {
      verifyOtpWritesSessionCookies(THIRTY_DAYS);
      cookieJar.set("sb-127-auth-token.2", { value: "", options: { maxAge: 0 } });

      await GET(request({ token_hash: "hash-1", type: "signup" }));

      expect(cookieJar.get("sb-127-auth-token.2")).toEqual({ value: "", options: { maxAge: 0 } });
    });

    it("verifyOtp lỗi: không đụng cờ fb-remember của phiên đang có", async () => {
      cookieJar.set("fb-remember", { value: "1", options: { maxAge: THIRTY_DAYS } });
      verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });

      await GET(request({ token_hash: "bad", type: "signup" }));

      expect(cookieJar.get("fb-remember")).toEqual({ value: "1", options: { maxAge: THIRTY_DAYS } });
      expect([...cookieJar.keys()]).toEqual(["fb-remember"]);
    });
  });
});
