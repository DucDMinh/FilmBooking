import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getServerAccessToken } = vi.hoisted(() => ({ getServerAccessToken: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getServerAccessToken }));

import { GET, POST } from "../route";

const upstreamFetch = vi.fn();

function call(
  handler: typeof GET,
  path: string[],
  init: { method?: string; headers?: Record<string, string>; body?: string; search?: string } = {},
) {
  const url = `http://localhost:3000/api/proxy/${path.join("/")}${init.search ?? ""}`;
  const req = new NextRequest(url, { method: init.method ?? "GET", headers: init.headers, body: init.body });
  return handler(req, { params: Promise.resolve({ path }) });
}

beforeEach(() => {
  vi.stubEnv("API_URL", "http://nest.test");
  upstreamFetch.mockReset();
  upstreamFetch.mockResolvedValue(
    new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json", "set-cookie": "a=b" } }),
  );
  vi.stubGlobal("fetch", upstreamFetch);
  getServerAccessToken.mockResolvedValue("secret-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/proxy", () => {
  it("gắn Bearer từ cookie, chuyển tiếp và không lộ token/cookie", async () => {
    const res = await call(GET, ["showtimes", "1"], { search: "?a=1", headers: { cookie: "sb=abc", "x-evil": "1" } });
    const [url, init] = upstreamFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://nest.test/showtimes/1?a=1");
    const sent = init.headers as Headers;
    expect(sent.get("authorization")).toBe("Bearer secret-token");
    expect(sent.get("cookie")).toBeNull();
    expect(sent.get("x-evil")).toBeNull();
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("secret-token");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("không có phiên -> vẫn chuyển tiếp, không kèm Authorization, trả nguyên status Nest", async () => {
    getServerAccessToken.mockResolvedValue(null);
    upstreamFetch.mockResolvedValue(
      new Response('{"error":{"code":"UNAUTHENTICATED"}}', { status: 401, headers: { "content-type": "application/json" } }),
    );
    const res = await call(GET, ["me"]);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const init = upstreamFetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Headers).get("authorization")).toBeNull();
    expect(res.status).toBe(401);
  });

  it.each([["..", "etc"], ["http:", "evil.com"], ["a%2f..", "b"], ["https://evil.com"], [""]])(
    "chặn path lạ %j",
    async (...segments) => {
      const res = await call(GET, segments);
      expect(res.status).toBe(400);
      expect(upstreamFetch).not.toHaveBeenCalled();
    },
  );

  it("mutation khác origin -> 403", async () => {
    const res = await call(POST, ["orders"], {
      method: "POST",
      body: "{}",
      headers: { origin: "http://evil.test", "content-type": "application/json" },
    });
    expect(res.status).toBe(403);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("body quá lớn -> 413", async () => {
    const res = await call(POST, ["orders"], {
      method: "POST",
      body: "x".repeat(1024 * 1024 + 1),
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(413);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("chuyển tiếp status/body lỗi nguyên vẹn", async () => {
    upstreamFetch.mockResolvedValue(
      new Response('{"error":{"code":"SEAT_TAKEN"}}', { status: 409, headers: { "content-type": "application/json" } }),
    );
    const res = await call(GET, ["x"]);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "SEAT_TAKEN" } });
  });
});
