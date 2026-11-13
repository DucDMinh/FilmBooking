import { describe, expect, it } from "vitest";
import { assertLocalSupabaseUrl } from "./local-guard";

describe("assertLocalSupabaseUrl", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])("cho phép %s", (url) => {
    expect(() => assertLocalSupabaseUrl(url)).not.toThrow();
  });

  it.each([
    "https://abcd.supabase.co",
    "http://127.0.0.1.evil.com",
    "http://localhost.evil.com:54321",
    "http://user@evil.com#@127.0.0.1",
    "not a url",
  ])("từ chối %s", (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow();
  });
});
