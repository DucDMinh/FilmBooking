import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
import { ENV, parseEnv } from "../../src/config/env";
import { createFactories, mintToken } from "./helpers/factories";
import {
  cleanupScope,
  createAdminClient,
  createRunScope,
  loadLocalSupabaseEnv,
  runInParallel,
  signInClients,
} from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

// Docker/Supabase không chạy -> skip (đã cảnh báo ở loadLocalSupabaseEnv), không fail.
describe.skipIf(!supabaseEnv)("integration smoke: API <-> Supabase local", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let app: INestApplication;
  let factories: ReturnType<typeof createFactories>;

  beforeAll(async () => {
    admin = createAdminClient(env);
    factories = createFactories(env, admin, scope);
    const apiEnv = parseEnv({
      WEB_ORIGIN: "https://filmbooking.example.com",
      SUPABASE_URL: env.url,
      SUPABASE_ANON_KEY: env.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
      SUPABASE_JWT_SECRET: env.jwtSecret,
      // GoTrue local ký ES256: cần JWKS để verify token thật (HS256 vẫn dùng cho token mint).
      SUPABASE_JWKS_URL: `${env.url}/auth/v1/.well-known/jwks.json`,
    });
    // Chỉ override ENV: SupabaseService thật nói chuyện với DB local.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(apiEnv)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, apiEnv);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (admin) await cleanupScope(admin, scope);
  });

  it("GET /me: customer đăng nhập thật (JWT GoTrue) -> không vai trò, đã xác nhận email", async () => {
    const user = await factories.createUser("customer");
    const res = await request(app.getHttpServer()).get("/me").set("Authorization", `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id, email: user.email, emailConfirmed: true, isAdmin: false, cinemas: [] });
  });

  it("GET /me: customer chưa xác nhận email -> emailConfirmed=false", async () => {
    const user = await factories.createUser("unconfirmed", { confirmed: false });
    const token = await mintToken(env, user);
    const res = await request(app.getHttpServer()).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, emailConfirmed: false });
  });

  it("GET /me: admin + manager gán rạp", async () => {
    const cinema = await factories.createCinema();
    const adminUser = await factories.createAdminUser();
    const manager = await factories.createStaffUser(cinema.id, "MANAGER");
    const adminRes = await request(app.getHttpServer()).get("/me").set("Authorization", `Bearer ${adminUser.accessToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body).toMatchObject({ isAdmin: true, cinemas: [] });
    const managerRes = await request(app.getHttpServer()).get("/me").set("Authorization", `Bearer ${manager.accessToken}`);
    expect(managerRes.status).toBe(200);
    expect(managerRes.body).toMatchObject({ isAdmin: false, cinemas: [{ cinemaId: cinema.id, role: "MANAGER" }] });
  });

  it("GET /me không token -> 401", async () => {
    expect((await request(app.getHttpServer()).get("/me")).status).toBe(401);
  });

  it("factory suất/ghế + N client song song", async () => {
    const showtime = await factories.createShowtime();
    expect(showtime.seatIds).toHaveLength(8);
    const users = await Promise.all([factories.createUser("p"), factories.createUser("p"), factories.createUser("p")]);
    const clients = await signInClients(env, users);
    const results = await runInParallel(clients.length, async (index) => {
      const { data, error } = await clients[index]!.auth.getUser();
      if (error) throw error;
      return data.user.id;
    });
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : "ERR"))).toEqual(users.map((u) => u.id));
  });
});
