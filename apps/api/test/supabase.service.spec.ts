import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppException } from "../src/common/errors/app-exception";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { parseEnv } from "../src/config/env";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ marker: "client" })) }));

const env = parseEnv({
  WEB_ORIGIN: "https://filmbooking.example.com",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: "jwt-secret-for-test",
});

describe("SupabaseService", () => {
  const createClientMock = vi.mocked(createClient);
  let service: SupabaseService;

  beforeEach(() => {
    createClientMock.mockClear();
    service = new SupabaseService(env);
  });

  it("forUser() uses the anon key + user JWT and never the service role key", () => {
    service.forUser("user-jwt");

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClientMock.mock.calls[0] ?? [];
    expect(url).toBe(env.SUPABASE_URL);
    expect(key).toBe(env.SUPABASE_ANON_KEY);
    expect(options?.global?.headers).toEqual({ Authorization: "Bearer user-jwt" });
    expect(JSON.stringify(createClientMock.mock.calls)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("forUser() creates an isolated client per call (no shared session state)", () => {
    service.forUser("jwt-a");
    service.forUser("jwt-b");
    const headers = createClientMock.mock.calls.map(([, , options]) => options?.global?.headers);
    expect(headers).toEqual([{ Authorization: "Bearer jwt-a" }, { Authorization: "Bearer jwt-b" }]);
  });

  it("forUser() rejects an empty token with UNAUTHENTICATED", () => {
    expect(() => service.forUser("")).toThrow(AppException);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("admin() uses the service role key and is created once", () => {
    const first = service.admin();
    const second = service.admin();

    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock.mock.calls[0]?.[1]).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
  });
});
