import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/config/configure-app";
import { ENV, parseEnv } from "../src/config/env";

const WEB_ORIGIN = "https://filmbooking.example.com";
const testEnv = parseEnv({
  WEB_ORIGIN,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: "jwt-secret-for-test",
});

describe("GET /health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(testEnv)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, testEnv);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 { status: 'ok' }", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("sets security headers (helmet)", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows CORS only for the configured web origin", async () => {
    const allowed = await request(app.getHttpServer()).get("/health").set("Origin", WEB_ORIGIN);
    expect(allowed.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);

    const denied = await request(app.getHttpServer()).get("/health").set("Origin", "https://evil.example.com");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
