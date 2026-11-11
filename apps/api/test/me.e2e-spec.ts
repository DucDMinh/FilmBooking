import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { configureApp } from "../src/config/configure-app";
import { ENV, parseEnv } from "../src/config/env";

const SECRET = "jwt-secret-for-test-jwt-secret-1234";
const URL_BASE = "http://127.0.0.1:54321";
const HN01 = "11111111-1111-1111-1111-111111111111";
const MANAGER = "aaaaaaaa-0000-0000-0000-000000000002";
const ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";

const testEnv = parseEnv({
  WEB_ORIGIN: "https://filmbooking.example.com",
  SUPABASE_URL: URL_BASE,
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: SECRET,
});

const roles = [{ user_id: ADMIN, role: "ADMIN" }];
const assignments = [{ user_id: MANAGER, cinema_id: HN01, role: "MANAGER" }];
const fakeSupabase = {
  admin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          data: (table === "user_roles" ? roles : assignments).filter((row) => row.user_id === id),
          error: null,
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({
            data: { user: { id, email_confirmed_at: id === MANAGER ? "2026-01-01T00:00:00Z" : null } },
            error: null,
          }),
      },
    },
  }),
};

const token = (sub: string) =>
  new SignJWT({ email: `${sub}@x.vn`, user_metadata: { email_verified: true } })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${URL_BASE}/auth/v1`)
    .setSubject(sub)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(SECRET));

/** Route giả không gắn @Public: chứng minh mặc định phải đăng nhập. */
@Controller("unmarked")
class UnmarkedController {
  @Get()
  get() {
    return { ok: true };
  }
}

describe("GET /me (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [UnmarkedController] })
      .overrideProvider(ENV)
      .useValue(testEnv)
      .overrideProvider(SupabaseService)
      .useValue(fakeSupabase)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, testEnv);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("401 without token", async () => {
    expect((await request(app.getHttpServer()).get("/me")).status).toBe(401);
  });

  it("returns roles + assigned cinemas + DB-based emailConfirmed", async () => {
    const response = await request(app.getHttpServer()).get("/me").set("Authorization", `Bearer ${await token(MANAGER)}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: MANAGER,
      email: `${MANAGER}@x.vn`,
      emailConfirmed: true,
      isAdmin: false,
      cinemas: [{ cinemaId: HN01, role: "MANAGER" }],
    });
    expect(JSON.stringify(response.body)).not.toContain("jwt");
  });

  it("emailConfirmed false (claim ignored) and isAdmin true", async () => {
    const response = await request(app.getHttpServer()).get("/me").set("Authorization", `Bearer ${await token(ADMIN)}`);
    expect(response.body).toMatchObject({ emailConfirmed: false, isAdmin: true, cinemas: [] });
  });

  it("route without @Public requires login by default", async () => {
    expect((await request(app.getHttpServer()).get("/unmarked")).status).toBe(401);
    const ok = await request(app.getHttpServer()).get("/unmarked").set("Authorization", `Bearer ${await token(MANAGER)}`);
    expect(ok.status).toBe(200);
  });

  it("/health stays public", async () => {
    expect((await request(app.getHttpServer()).get("/health")).status).toBe(200);
  });
});
