import { Global, Module, type INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { ProfileModule } from "../src/modules/profile/profile.module";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://abc.supabase.co";
const ALICE = "aaaaaaaa-0000-0000-0000-00000000000a";
const BOB = "bbbbbbbb-0000-0000-0000-00000000000b";
const OAUTH_USER = "cccccccc-0000-0000-0000-00000000000c";
const CINEMA = "11111111-1111-4111-8111-111111111111";

interface Op {
  client: "user" | "admin";
  table: string;
  method: string;
  args: unknown[];
}

const ops: Op[] = [];
const rpcCalls: string[] = [];
const signedPaths: string[] = [];
/** Kết quả cấu hình theo test: khoá `${table}.${method đầu tiên}`. */
let results: Record<string, { data?: unknown; error?: { code?: string; message: string } | null }> = {};
let identities: Array<{ provider: string }> = [{ provider: "email" }];
let passwordOk = true;
let disposable = false;
let softDeleted: Array<[string, boolean]> = [];

/** Query builder giả: ghi lại mọi lời gọi chuỗi và trả kết quả đã cấu hình khi await. */
function builder(client: Op["client"], table: string) {
  let first = "";
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") {
          const result = results[`${table}.${first}`] ?? { data: null, error: null };
          return (resolve: (value: unknown) => void) => resolve({ error: null, ...result });
        }
        return (...args: unknown[]) => {
          first ||= prop;
          ops.push({ client, table, method: prop, args });
          return proxy;
        };
      },
    },
  );
  return proxy;
}

const fakeSupabase = {
  forUser: (jwt: string) => {
    if (!jwt) throw new Error("no jwt");
    return {
      from: (table: string) => builder("user", table),
      auth: {
        signInWithPassword: ({ email }: { email: string; password: string }) =>
          Promise.resolve(
            passwordOk
              ? { data: { user: { id: ALICE, email } }, error: null }
              : { data: { user: null }, error: { message: "bad" } },
          ),
      },
      storage: {
        from: () => ({
          createSignedUploadUrl: (path: string) => {
            signedPaths.push(path);
            return Promise.resolve({ data: { token: "tok", signedUrl: `${SUPABASE_URL}/signed/${path}` }, error: null });
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}` },
          }),
        }),
      },
    };
  },
  admin: () => ({
    from: (table: string) => builder("admin", table),
    rpc: (name: string) => {
      rpcCalls.push(name);
      return Promise.resolve({ data: disposable, error: null });
    },
    auth: {
      admin: {
        getUserById: () => Promise.resolve({ data: { user: { identities } }, error: null }),
        deleteUser: (id: string, soft: boolean) => {
          softDeleted.push([id, soft]);
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [{ name: "a.png" }], error: null }),
        remove: (paths: string[]) => {
          ops.push({ client: "admin", table: "storage.avatars", method: "remove", args: [paths] });
          return Promise.resolve({ data: [], error: null });
        },
      }),
    },
  }),
};

const sign = (sub: string, issuedAtSecondsAgo = 0) =>
  new SignJWT({ email: `${sub}@x.vn` })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setSubject(sub)
    .setIssuedAt(Math.floor(Date.now() / 1000) - issuedAtSecondsAgo)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));

const env = {
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "anon",
  NODE_ENV: "test",
} as Env;

const own = (client: Op["client"], table: string) => ops.filter((op) => op.client === client && op.table === table);
const eqIds = (table: string) => own("user", table).filter((op) => op.method === "eq").map((op) => op.args[1]);

describe("profile API (mock Supabase)", () => {
  let app: INestApplication;
  let aliceToken: string;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    aliceToken = await sign(ALICE);
    // Giống AppModule: ENV + SupabaseService là global, AuthGuard + filter gắn global.
    @Global()
    @Module({
      providers: [
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: ENV, useValue: env },
      ],
      exports: [SupabaseService, ENV],
    })
    class TestGlobalsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestGlobalsModule, ProfileModule],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  afterEach(() => {
    ops.length = 0;
    rpcCalls.length = 0;
    signedPaths.length = 0;
    softDeleted = [];
    results = {};
    identities = [{ provider: "email" }];
    passwordOk = true;
    disposable = false;
    fetchMock.mockReset();
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("rejects requests without a token", async () => {
    expect((await request(app.getHttpServer()).get("/me/profile")).status).toBe(401);
  });

  it("GET /me/profile reads only the caller's own row (id from JWT)", async () => {
    results = {
      "profiles.select": { data: { id: ALICE, full_name: "An" } },
      "favorite_cinemas.select": { data: [{ cinema_id: CINEMA }] },
    };
    const response = await request(app.getHttpServer()).get("/me/profile").set(as(aliceToken));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: ALICE, favorite_cinema_ids: [CINEMA] });
    expect(eqIds("profiles")).toEqual([ALICE]);
  });

  it("PATCH /me/profile maps fields, normalizes +84 phone and always targets the JWT user", async () => {
    results = { "profiles.update": { data: { id: ALICE } } };
    const response = await request(app.getHttpServer())
      .patch("/me/profile")
      .set(as(aliceToken))
      .send({ fullName: "Nguyen An", phone: "+84912345678", dateOfBirth: "1999-05-01", gender: "FEMALE" });
    expect(response.status).toBe(200);
    expect(own("user", "profiles").find((op) => op.method === "update")?.args[0]).toEqual({
      full_name: "Nguyen An",
      phone: "0912345678",
      date_of_birth: "1999-05-01",
      gender: "FEMALE",
    });
    expect(eqIds("profiles")).toEqual([ALICE]);
  });

  it("cannot target another customer's profile: body id is rejected and the filter stays the JWT id", async () => {
    const spoof = await request(app.getHttpServer()).patch("/me/profile").set(as(aliceToken)).send({ id: BOB, fullName: "X" });
    expect(spoof.status).toBe(422);
    expect(own("user", "profiles")).toHaveLength(0);
  });

  it.each([
    ["bad phone", { phone: "12345" }],
    ["future date of birth", { dateOfBirth: "2999-01-01" }],
    ["unknown email field", { email: "x@y.vn" }],
    ["empty body", {}],
  ])("PATCH /me/profile rejects %s with 422", async (_name, body) => {
    const response = await request(app.getHttpServer()).patch("/me/profile").set(as(aliceToken)).send(body);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(ops).toHaveLength(0);
  });

  it.each([
    ["foreign domain", "https://evil.example.com/storage/v1/object/public/avatars/" + ALICE + "/a.png"],
    ["http scheme in non-prod is ok only for same origin", "http://abc.supabase.co/storage/v1/object/public/avatars/" + ALICE + "/a.png"],
    ["javascript scheme", "javascript:alert(1)"],
    ["another user's folder", `${SUPABASE_URL}/storage/v1/object/public/avatars/${BOB}/a.png`],
    ["other bucket", `${SUPABASE_URL}/storage/v1/object/public/posters/${ALICE}/a.png`],
  ])("PATCH /me/profile avatarUrl: %s -> 422", async (_name, avatarUrl) => {
    const response = await request(app.getHttpServer()).patch("/me/profile").set(as(aliceToken)).send({ avatarUrl });
    expect(response.status).toBe(422);
  });

  it("PATCH /me/profile accepts the caller's own avatar URL", async () => {
    results = { "profiles.update": { data: { id: ALICE } } };
    const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${ALICE}/a.png`;
    const response = await request(app.getHttpServer()).patch("/me/profile").set(as(aliceToken)).send({ avatarUrl });
    expect(response.status).toBe(200);
  });

  it("POST /me/avatar issues a signed upload inside the caller's folder", async () => {
    const response = await request(app.getHttpServer())
      .post("/me/avatar")
      .set(as(aliceToken))
      .send({ contentType: "image/webp", sizeBytes: 1024 });
    expect(response.status).toBe(201);
    expect(signedPaths[0]).toMatch(new RegExp(`^${ALICE}/[0-9a-f-]+\\.webp$`));
    expect(response.body.publicUrl).toContain(`/avatars/${ALICE}/`);
  });

  it.each([
    ["too large", { contentType: "image/png", sizeBytes: 2 * 1024 * 1024 + 1 }],
    ["not an image", { contentType: "application/pdf", sizeBytes: 100 }],
    ["gif", { contentType: "image/gif", sizeBytes: 100 }],
  ])("POST /me/avatar rejects %s with 422", async (_name, body) => {
    const response = await request(app.getHttpServer()).post("/me/avatar").set(as(aliceToken)).send(body);
    expect(response.status).toBe(422);
    expect(signedPaths).toHaveLength(0);
  });

  it("POST /me/email asks GoTrue to change the email with the user's JWT", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const response = await request(app.getHttpServer()).post("/me/email").set(as(aliceToken)).send({ newEmail: "New@X.vn" });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ pendingEmail: "new@x.vn" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SUPABASE_URL}/auth/v1/user`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${aliceToken}`);
    expect(JSON.parse(init.body as string)).toEqual({ email: "new@x.vn" });
  });

  it("POST /me/email rejects disposable domains and bad addresses", async () => {
    disposable = true;
    const blocked = await request(app.getHttpServer()).post("/me/email").set(as(aliceToken)).send({ newEmail: "a@mailinator.com" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("DISPOSABLE_EMAIL");
    const invalid = await request(app.getHttpServer()).post("/me/email").set(as(aliceToken)).send({ newEmail: "nope" });
    expect(invalid.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PUT /me/preferences toggles marketing opt-in", async () => {
    results = { "profiles.update": { data: { id: ALICE, marketing_opt_in: true } } };
    const response = await request(app.getHttpServer()).put("/me/preferences").set(as(aliceToken)).send({ marketingOptIn: true });
    expect(response.status).toBe(200);
    expect(own("user", "profiles").find((op) => op.method === "update")?.args[0]).toEqual({ marketing_opt_in: true });
    const bad = await request(app.getHttpServer()).put("/me/preferences").set(as(aliceToken)).send({ marketingOptIn: "yes" });
    expect(bad.status).toBe(422);
  });

  it("PUT/DELETE /me/favorites/:cinemaId use the JWT user id; non-uuid -> 422; unknown cinema -> 404", async () => {
    expect((await request(app.getHttpServer()).put(`/me/favorites/${CINEMA}`).set(as(aliceToken))).status).toBe(200);
    expect(own("user", "favorite_cinemas").find((op) => op.method === "upsert")?.args[0]).toEqual({
      user_id: ALICE,
      cinema_id: CINEMA,
    });
    expect((await request(app.getHttpServer()).delete(`/me/favorites/${CINEMA}`).set(as(aliceToken))).status).toBe(200);
    expect(eqIds("favorite_cinemas")).toEqual([ALICE, CINEMA]);
    expect((await request(app.getHttpServer()).put("/me/favorites/not-a-uuid").set(as(aliceToken))).status).toBe(422);

    results = { "favorite_cinemas.upsert": { error: { code: "23503", message: "fk" } } };
    expect((await request(app.getHttpServer()).put(`/me/favorites/${CINEMA}`).set(as(aliceToken))).status).toBe(404);
  });

  it("PUT /me/province sets or clears the province; unknown province -> 404", async () => {
    results = { "profiles.update": { data: { id: ALICE } } };
    const ok = await request(app.getHttpServer()).put("/me/province").set(as(aliceToken)).send({ provinceId: CINEMA });
    expect(ok.status).toBe(200);
    const cleared = await request(app.getHttpServer()).put("/me/province").set(as(aliceToken)).send({ provinceId: null });
    expect(cleared.status).toBe(200);
    results = { "profiles.update": { error: { code: "23503", message: "fk" } } };
    const missing = await request(app.getHttpServer()).put("/me/province").set(as(aliceToken)).send({ provinceId: CINEMA });
    expect(missing.status).toBe(404);
  });

  describe("DELETE /me", () => {
    it("requires the acknowledgement flag", async () => {
      const response = await request(app.getHttpServer()).delete("/me").set(as(aliceToken)).send({ password: "pw" });
      expect(response.status).toBe(422);
    });

    it("password account: wrong or missing password -> 403 and nothing is deleted", async () => {
      passwordOk = false;
      const wrong = await request(app.getHttpServer())
        .delete("/me")
        .set(as(aliceToken))
        .send({ password: "bad", acknowledgeTicketLoss: true });
      expect(wrong.status).toBe(403);
      const missing = await request(app.getHttpServer()).delete("/me").set(as(aliceToken)).send({ acknowledgeTicketLoss: true });
      expect(missing.status).toBe(403);
      expect(own("admin", "profiles")).toHaveLength(0);
      expect(softDeleted).toHaveLength(0);
    });

    it("password account: anonymizes PII, drops account data, soft-deletes auth user, never touches orders", async () => {
      const response = await request(app.getHttpServer())
        .delete("/me")
        .set(as(aliceToken))
        .send({ password: "ok", acknowledgeTicketLoss: true });
      expect(response.status).toBe(200);
      expect(own("admin", "profiles").find((op) => op.method === "update")?.args[0]).toEqual({
        email: null,
        full_name: null,
        phone: null,
        date_of_birth: null,
        gender: null,
        avatar_url: null,
        marketing_opt_in: false,
        province_id: null,
      });
      expect(own("admin", "profiles").find((op) => op.method === "eq")?.args).toEqual(["id", ALICE]);
      for (const table of ["favorite_cinemas", "staff_assignments", "user_roles"]) {
        expect(own("admin", table).some((op) => op.method === "delete")).toBe(true);
      }
      expect(own("admin", "storage.avatars")[0]?.args[0]).toEqual([`${ALICE}/a.png`]);
      expect(softDeleted).toEqual([[ALICE, true]]);
      expect(ops.some((op) => /order|ticket/.test(op.table))).toBe(false);
    });

    it("OAuth-only account: needs a freshly issued token", async () => {
      identities = [{ provider: "google" }];
      const stale = await sign(OAUTH_USER, 3600);
      const rejected = await request(app.getHttpServer()).delete("/me").set(as(stale)).send({ acknowledgeTicketLoss: true });
      expect(rejected.status).toBe(403);
      expect(softDeleted).toHaveLength(0);

      const fresh = await sign(OAUTH_USER, 10);
      const accepted = await request(app.getHttpServer()).delete("/me").set(as(fresh)).send({ acknowledgeTicketLoss: true });
      expect(accepted.status).toBe(200);
      expect(softDeleted).toEqual([[OAUTH_USER, true]]);
    });
  });
});
