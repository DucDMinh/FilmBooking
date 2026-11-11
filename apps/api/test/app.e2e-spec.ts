import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { configureApp } from "../src/config/configure-app";
import { ENV, parseEnv } from "../src/config/env";
import { SUPABASE_ANON_CLIENT } from "../src/modules/auth-ext/auth-ext.service";
import { TurnstileService } from "../src/modules/auth-ext/turnstile.service";

const JWT_SECRET = "test-jwt-secret-for-e2e-smoke-test-at-least-32-chars";
const WEB_ORIGIN = "https://filmbooking.example.com";
const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CINEMA_ID = "11111111-1111-1111-1111-111111111111";

const testEnv = parseEnv({
  WEB_ORIGIN,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: JWT_SECRET,
});

type Operation = [method: string, args: unknown[]];
interface Query {
  table: string;
  ops: Operation[];
  jwt: string;
}
type Responder = (query: Query) => { data?: unknown; error?: { code?: string; message: string } | null };

function createFakeSupabase() {
  const handlers = new Map<string, Responder>();

  const builder = (table: string, jwt: string): unknown => {
    const query: Query = { table, ops: [], jwt };
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (prop === "then") {
            const result = handlers.get(`${table}:${query.ops[0]?.[0] ?? "select"}`)?.(query) ?? { data: [] };
            return (resolve: (value: unknown) => unknown) => resolve({ error: null, ...result });
          }
          return (...args: unknown[]) => {
            query.ops.push([prop, args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const service = {
    admin: () => ({
      from: (table: string) => builder(table, "admin"),
      auth: {
        admin: {
          getUserById: (id: string) =>
            Promise.resolve({
              data: { user: { id, email_confirmed_at: "2026-01-01T00:00:00Z" } },
              error: null,
            }),
        },
      },
    }),
    forUser: (jwt: string) => ({ from: (table: string) => builder(table, jwt) }),
  };

  handlers.set("profiles:select", () => ({
    data: {
      id: USER_ID,
      email: "user@example.com",
      full_name: "Smoke Test User",
      phone: "0901234567",
      date_of_birth: "1995-01-01",
      gender: "OTHER",
      avatar_url: null,
      marketing_opt_in: false,
      province_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  }));
  handlers.set("favorite_cinemas:select", () => ({ data: [] }));
  handlers.set("cinemas:select", () => ({ data: [] }));
  handlers.set("movies:select", () => ({ data: [] }));
  handlers.set("showtimes:select", () => ({ data: [] }));

  return { service, handlers };
}

const createToken = (sub: string) =>
  new SignJWT({ email: `${sub}@example.com`, user_metadata: { email_verified: true } })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${testEnv.SUPABASE_URL}/auth/v1`)
    .setSubject(sub)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));

describe("AppModule Smoke E2E (Wiring #2)", () => {
  let app: INestApplication;
  const fakeSupabase = createFakeSupabase();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ENV)
      .useValue(testEnv)
      .overrideProvider(SupabaseService)
      .useValue(fakeSupabase.service)
      .overrideProvider(TurnstileService)
      .useValue({ verify: () => Promise.resolve(true) })
      .overrideProvider(SUPABASE_ANON_CLIENT)
      .useValue({
        auth: {
          signInWithPassword: () => Promise.resolve({ data: null, error: null }),
          signUp: () => Promise.resolve({ data: null, error: null }),
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app, testEnv);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("Health check & Shell", () => {
    it("GET /health -> 200 { status: 'ok' }", async () => {
      const response = await request(app.getHttpServer()).get("/health");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok" });
    });

    it("GET /health sets security headers and CORS origin", async () => {
      const response = await request(app.getHttpServer()).get("/health").set("Origin", WEB_ORIGIN);
      expect(response.status).toBe(200);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    });
  });

  describe("CatalogModule (Public routes)", () => {
    it("GET /cinemas -> 200 (public)", async () => {
      const response = await request(app.getHttpServer()).get("/cinemas");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("GET /movies -> 200 (public)", async () => {
      const response = await request(app.getHttpServer()).get("/movies");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("MeModule & ProfileModule", () => {
    it("GET /me/profile -> 401 UNAUTHENTICATED khi không có bearer token", async () => {
      const response = await request(app.getHttpServer()).get("/me/profile");
      expect(response.status).toBe(401);
      expect(response.body.error?.code).toBe("UNAUTHENTICATED");
    });

    it("GET /me/profile -> 200 với token hợp lệ", async () => {
      const userToken = await createToken(USER_ID);
      const response = await request(app.getHttpServer())
        .get("/me/profile")
        .set("Authorization", `Bearer ${userToken}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(USER_ID);
      expect(response.body.email).toBe("user@example.com");
    });
  });

  describe("AuthExtModule", () => {
    it("POST /auth/login -> 400 validation error khi gửi body rỗng (chứng minh route @Public đã mount)", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("CinemaOpsModule", () => {
    it("GET /cinemas/:cinemaId/rooms -> 401 UNAUTHENTICATED khi không có bearer token", async () => {
      const response = await request(app.getHttpServer()).get(`/cinemas/${CINEMA_ID}/rooms`);
      expect(response.status).toBe(401);
      expect(response.body.error?.code).toBe("UNAUTHENTICATED");
    });
  });
});
