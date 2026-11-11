import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { parseEnv } from "../src/config/env";

const SECRET = "jwt-secret-for-test-jwt-secret-1234";
const URL_BASE = "https://abc.supabase.co";
const SUB = "aaaaaaaa-0000-0000-0000-000000000009";

let server: Server;
let jwksUrl: string;
let esKey: CryptoKey;
let rsKey: CryptoKey;
let strangerKey: CryptoKey;

beforeAll(async () => {
  const es = await generateKeyPair("ES256");
  const rs = await generateKeyPair("RS256");
  strangerKey = (await generateKeyPair("ES256")).privateKey;
  esKey = es.privateKey;
  rsKey = rs.privateKey;
  const keys = [
    { ...(await exportJWK(es.publicKey)), kid: "es", alg: "ES256", use: "sig" },
    { ...(await exportJWK(rs.publicKey)), kid: "rs", alg: "RS256", use: "sig" },
  ];
  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks.json`;
});

afterAll(() => {
  server.close();
});

const baseEnv = {
  WEB_ORIGIN: "https://filmbooking.example.com",
  SUPABASE_URL: URL_BASE,
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

const makeGuard = (extra: Record<string, string> = {}) =>
  new AuthGuard(
    new Reflector(),
    parseEnv({ ...baseEnv, SUPABASE_JWT_SECRET: SECRET, SUPABASE_JWKS_URL: jwksUrl, ...extra }),
  );

const sign = (alg: string, key: CryptoKey | Uint8Array, kid?: string, iss = `${URL_BASE}/auth/v1`) =>
  new SignJWT({ email: "u@x.vn" })
    .setProtectedHeader({ alg, ...(kid ? { kid } : {}) })
    .setAudience("authenticated")
    .setIssuer(iss)
    .setSubject(SUB)
    .setExpirationTime("5m")
    .sign(key);

const run = async (guard: AuthGuard, jwt: string) => {
  const req: { headers: Record<string, string>; user?: { id: string } } = {
    headers: { authorization: `Bearer ${jwt}` },
  };
  const context = {
    getHandler: () => run,
    getClass: () => AuthGuard,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  await guard.canActivate(context);
  return req.user;
};

describe("AuthGuard algorithms", () => {
  it("accepts ES256 via JWKS", async () => {
    expect((await run(makeGuard(), await sign("ES256", esKey, "es")))?.id).toBe(SUB);
  });

  it("accepts RS256 via JWKS", async () => {
    expect((await run(makeGuard(), await sign("RS256", rsKey, "rs")))?.id).toBe(SUB);
  });

  it("still accepts HS256 with the shared secret", async () => {
    expect((await run(makeGuard(), await sign("HS256", new TextEncoder().encode(SECRET))))?.id).toBe(SUB);
  });

  it("rejects ES256 signed by an unknown key", async () => {
    await expect(run(makeGuard(), await sign("ES256", strangerKey, "es"))).rejects.toMatchObject({ status: 401 });
  });

  it("rejects alg none and unknown alg", async () => {
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const claims = b64({ sub: SUB, aud: "authenticated", iss: `${URL_BASE}/auth/v1` });
    await expect(run(makeGuard(), `${b64({ alg: "none" })}.${claims}.`)).rejects.toMatchObject({ status: 401 });
    await expect(run(makeGuard(), `${b64({ alg: "HS512" })}.${claims}.c2ln`)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects HS256 when no secret is configured (JWKS-only)", async () => {
    const guard = makeGuard({ SUPABASE_JWT_SECRET: "" });
    await expect(run(guard, await sign("HS256", new TextEncoder().encode(SECRET)))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("honours SUPABASE_JWT_ISSUER override", async () => {
    const issuer = "http://localhost:54321/auth/v1";
    const token = await sign("ES256", esKey, "es", issuer);
    await expect(run(makeGuard(), token)).rejects.toMatchObject({ status: 401 });
    expect((await run(makeGuard({ SUPABASE_JWT_ISSUER: issuer }), token))?.id).toBe(SUB);
  });
});

describe("env fail-fast", () => {
  it("needs SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL", () => {
    expect(() => parseEnv(baseEnv)).toThrow(/SUPABASE_JWT_SECRET/);
    expect(() => parseEnv({ ...baseEnv, SUPABASE_JWKS_URL: jwksUrl })).not.toThrow();
  });
});
