import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { EnvValidationError, parseEnv } from "../src/config/env";

const validEnv = {
  WEB_ORIGIN: "https://filmbooking.example.com/",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: "jwt-secret-for-test",
};

describe("parseEnv", () => {
  it("applies defaults and normalizes WEB_ORIGIN (comma list, trailing slash)", () => {
    const env = parseEnv({ ...validEnv, WEB_ORIGIN: "https://a.example.com/, http://localhost:3000" });
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.WEB_ORIGIN).toEqual(["https://a.example.com", "http://localhost:3000"]);
  });

  it("names every missing required variable and never prints values", () => {
    const secretValue = "super-secret-value-123";
    try {
      parseEnv({ SUPABASE_ANON_KEY: secretValue, PORT: "not-a-number" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const { message, variables } = error as EnvValidationError;
      expect(variables).toEqual(
        expect.arrayContaining(["WEB_ORIGIN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET", "PORT"]),
      );
      expect(variables).not.toContain("SUPABASE_ANON_KEY");
      expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(message).not.toContain(secretValue);
      expect(message).not.toContain("not-a-number");
    }
  });

  it("treats empty strings as missing", () => {
    expect(() => parseEnv({ ...validEnv, SUPABASE_JWT_SECRET: "" })).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it("rejects an anon key equal to the service role key", () => {
    expect(() => parseEnv({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: validEnv.SUPABASE_ANON_KEY })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});

describe("AppModule bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to start when required env is missing, naming the variables", async () => {
    for (const name of Object.keys(validEnv)) vi.stubEnv(name, undefined);
    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      /WEB_ORIGIN.*SUPABASE_URL/,
    );
  });
});
