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

describe("AppModule Smoke E2E (Wiring #4)", () => {
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

  describe("Layer 5/6 modules (Wiring #4)", () => {
    const SHOWTIME_ID = "2b6f1c3e-4d5a-4b7c-8e9f-0a1b2c3d4e5f";
    const ORDER_ID = "3c7a2d4f-5e6b-4c8d-9fa0-1b2c3d4e5f60";

    it("GET /showtimes/:id/seatmap -> 200 (@Public, không cần token)", async () => {
      fakeSupabase.handlers.set("showtimes:select", () => ({
        data: {
          id: SHOWTIME_ID,
          cinema_id: CINEMA_ID,
          room_id: "4d8b3e5a-6f7c-4d9e-8ab1-2c3d4e5f6071",
          movie_id: "5e9c4f6b-7a8d-4eaf-9bc2-3d4e5f607182",
          starts_at: "2099-01-01T10:00:00Z",
          ends_at: "2099-01-01T12:00:00Z",
          format: "2D",
          status: "SCHEDULED",
          movies: { status: "PUBLISHED" },
        },
      }));
      fakeSupabase.handlers.set("rooms:select", () => ({
        data: { id: "4d8b3e5a-6f7c-4d9e-8ab1-2c3d4e5f6071", name: "P1", grid_rows: 1, grid_cols: 1 },
      }));
      fakeSupabase.handlers.set("cinemas:select", () => ({ data: { status: "OPEN" } }));
      const response = await request(app.getHttpServer()).get(`/showtimes/${SHOWTIME_ID}/seatmap`);
      expect(response.status).toBe(200);
      expect(response.body.room.name).toBe("P1");
    });

    it("POST /payos/webhook là @Public: thiếu chữ ký bị từ chối, không bị 401", async () => {
      const response = await request(app.getHttpServer()).post("/payos/webhook").send({});
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(404);
      expect(response.body.success).toBe(false);
    });

    it.each(["/jobs/send-emails", "/jobs/reconcile"])(
      "POST %s không có secret -> 401 (route @Public nhưng có JobSecretGuard)",
      async (path) => {
        const response = await request(app.getHttpServer()).post(path);
        expect(response.status).toBe(401);
      },
    );

    const protectedRoutes: Array<[method: "get" | "post" | "patch" | "put", path: string]> = [
      ["post", "/bookings/holds"],
      ["get", `/bookings/${ORDER_ID}`],
      ["post", `/bookings/${ORDER_ID}/payment`],
      ["get", `/bookings/${ORDER_ID}/payment-status`],
      ["post", "/checkin/scan"],
      ["get", "/admin/users"],
      ["get", "/admin/settings"],
      ["get", "/admin/vouchers"],
      ["get", "/admin/audit"],
      ["get", "/orders"],
      ["get", `/orders/${ORDER_ID}`],
      ["get", "/admin/todo"],
      ["get", "/reports/revenue"],
      ["get", "/admin/reports/revenue"],
      ["get", "/reports/cancelled-showtimes"],
      ["patch", `/admin/cinemas/${CINEMA_ID}/status`],
    ];

    it.each(protectedRoutes)("%s %s -> 401 UNAUTHENTICATED khi không có token (route đã mount)", async (method, path) => {
      const response = await request(app.getHttpServer())[method](path);
      expect(response.status).toBe(401);
      expect(response.body.error?.code).toBe("UNAUTHENTICATED");
    });

    it("token CUSTOMER không vào được route quản trị/báo cáo -> 403", async () => {
      const token = await createToken(USER_ID);
      for (const path of ["/admin/users", "/reports/revenue", "/orders"]) {
        const response = await request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`);
        expect(response.status).toBe(403);
      }
    });
  });
});
