import type { INestApplication } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { AuthExtController } from "../src/modules/auth-ext/auth-ext.controller";
import { AuthExtService, SUPABASE_ANON_CLIENT } from "../src/modules/auth-ext/auth-ext.service";
import { TurnstileService } from "../src/modules/auth-ext/turnstile.service";

const GOOD_PASSWORD = "Abcdef12";
const CAPTCHA_OK = "captcha-ok";

interface FakeUser {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
  recovery_sent_at: string | null;
}

/** Mô phỏng tối thiểu: hàm DB (rate limit, khoá đăng nhập, disposable), bảng, Admin API và GoTrue anon. */
function createFake() {
  const state = {
    users: new Map<string, FakeUser>(),
    buckets: new Map<string, { start: number; hits: number }>(),
    attempts: new Map<string, { count: number; lockedUntil: number | null }>(),
    outbox: [] as Record<string, unknown>[],
    consents: [] as Record<string, unknown>[],
    createUserCalls: [] as Record<string, unknown>[],
    resendCalls: [] as string[],
    signOutCalls: [] as { token: string; scope: string }[],
    termsVersion: "1.0",
    consentInsertError: false,
  };
  const disposable = new Set(["mailinator.com"]);
  const findByEmail = (email: string) => [...state.users.values()].find((user) => user.email === email.toLowerCase());
  let seq = 0;

  const rpc = (name: string, args: Record<string, unknown>) => {
    if (name === "hit_rate_limit") {
      const key = String(args.p_key);
      const windowMs = Number.parseInt(String(args.p_window), 10) * 1000;
      const bucket = state.buckets.get(key);
      if (!bucket || bucket.start + windowMs <= Date.now()) {
        state.buckets.set(key, { start: Date.now(), hits: 1 });
        return { data: true, error: null };
      }
      bucket.hits += 1;
      return { data: bucket.hits <= Number(args.p_max), error: null };
    }
    const email = String(args.p_email ?? "").toLowerCase();
    if (name === "is_disposable_email") return { data: disposable.has(email.split("@")[1] ?? ""), error: null };
    if (name === "is_login_locked") {
      const row = state.attempts.get(email);
      return { data: !!row?.lockedUntil && row.lockedUntil > Date.now(), error: null };
    }
    if (name === "clear_login_failures") {
      state.attempts.delete(email);
      return { data: null, error: null };
    }
    if (name === "register_login_failure") {
      const row = state.attempts.get(email) ?? { count: 0, lockedUntil: null };
      row.count += 1;
      if (row.count >= 5) row.lockedUntil = Date.now() + 15 * 60_000;
      state.attempts.set(email, row);
      const locked = !!row.lockedUntil;
      const lockedUntil = row.lockedUntil ? new Date(row.lockedUntil).toISOString() : null;
      return { data: [{ is_locked: locked, locked_until: lockedUntil, failed_count: row.count }], error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  };

  const from = (table: string) => ({
    select: () => ({
      eq: (_column: string, value: string) => ({
        maybeSingle: async () => {
          if (table === "app_settings") return { data: { value: state.termsVersion }, error: null };
          if (table === "login_attempts") {
            const row = state.attempts.get(value);
            return { data: row ? { failed_count: row.count } : null, error: null };
          }
          if (table === "rate_limit_buckets") {
            const bucket = state.buckets.get(value);
            return { data: bucket ? { window_start: new Date(bucket.start).toISOString() } : null, error: null };
          }
          throw new Error(`unexpected select on ${table}`);
        },
      }),
    }),
    insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      const list = Array.isArray(rows) ? rows : [rows];
      if (table === "email_outbox") state.outbox.push(...list);
      else if (table === "consents") {
        if (state.consentInsertError) return { error: { message: "db down" } };
        state.consents.push(...list);
      } else throw new Error(`unexpected insert on ${table}`);
      return { error: null };
    },
  });

  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => rpc(name, args),
    from,
    auth: {
      getUser: async (token: string) => {
        const user = [...state.users.values()].find((candidate) => `token-${candidate.id}` === token);
        return user ? { data: { user: { id: user.id } }, error: null } : { data: { user: null }, error: { message: "bad jwt" } };
      },
      admin: {
        createUser: async (attrs: { email: string; password: string; email_confirm: boolean }) => {
          state.createUserCalls.push(attrs);
          if (findByEmail(attrs.email)) return { data: { user: null }, error: { code: "email_exists", status: 422, message: "exists" } };
          seq += 1;
          const user: FakeUser = {
            id: `user-${seq}`,
            email: attrs.email.toLowerCase(),
            password: attrs.password,
            confirmed: attrs.email_confirm,
            recovery_sent_at: null,
          };
          state.users.set(user.id, user);
          return { data: { user: { id: user.id } }, error: null };
        },
        deleteUser: async (id: string) => {
          state.users.delete(id);
          return { error: null };
        },
        getUserById: async (id: string) => ({ data: { user: state.users.get(id) ?? null }, error: null }),
        updateUserById: async (id: string, attrs: { password: string }) => {
          const user = state.users.get(id);
          if (user) user.password = attrs.password;
          return { data: { user }, error: null };
        },
        signOut: async (token: string, scope: string) => {
          state.signOutCalls.push({ token, scope });
          return { error: null };
        },
      },
    },
  };

  const anon = {
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const user = findByEmail(email);
        if (!user || user.password !== password) {
          return { data: { session: null }, error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } };
        }
        if (!user.confirmed) {
          return { data: { session: null }, error: { code: "email_not_confirmed", status: 400, message: "Email not confirmed" } };
        }
        const session = { access_token: `token-${user.id}`, refresh_token: "refresh", expires_in: 3600, expires_at: 1, token_type: "bearer" };
        return { data: { session, user: { id: user.id, email: user.email } }, error: null };
      },
      resend: async ({ email }: { email: string }) => {
        state.resendCalls.push(email);
        return { error: null };
      },
      resetPasswordForEmail: async (email: string) => {
        const user = findByEmail(email);
        if (user) user.recovery_sent_at = new Date().toISOString();
        return { data: {}, error: null };
      },
    },
  };

  return { state, admin, anon, disposable };
}

const testEnv = { WEB_ORIGIN: ["https://filmbooking.example.com"] } as unknown as Env;

describe("Auth mở rộng (e2e, mock Supabase + Turnstile)", () => {
  let app: INestApplication;
  let fake = createFake();
  let service: AuthExtService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthExtController],
      providers: [
        AuthExtService,
        { provide: ENV, useValue: testEnv },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: SupabaseService, useValue: { admin: () => fake.admin } },
        { provide: SUPABASE_ANON_CLIENT, useValue: new Proxy({}, { get: (_target, prop) => Reflect.get(fake.anon, prop) }) },
        { provide: TurnstileService, useValue: { verify: vi.fn(async (token?: string) => token === CAPTCHA_OK) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(AuthExtService);
  });

  beforeEach(() => {
    fake = createFake();
  });

  afterAll(async () => {
    await app.close();
  });

  const registerBody = (overrides: Record<string, unknown> = {}) => ({
    email: "New@Example.com",
    password: GOOD_PASSWORD,
    acceptTerms: true,
    captchaToken: CAPTCHA_OK,
    ...overrides,
  });

  const seedUser = (email: string, confirmed = true) => {
    fake.state.users.set("user-seed", { id: "user-seed", email, password: GOOD_PASSWORD, confirmed, recovery_sent_at: null });
  };

  describe("POST /auth/register", () => {
    it("creates a CUSTOMER via Admin API (created_via=nest, unconfirmed), stores consent+version, sends confirmation", async () => {
      const response = await http().post("/auth/register").send(registerBody({ role: "ADMIN", app_metadata: { role: "ADMIN" } }));
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: "CHECK_EMAIL" });
      expect(fake.state.createUserCalls).toHaveLength(1);
      const call = fake.state.createUserCalls[0]!;
      expect(call).toMatchObject({ email: "new@example.com", email_confirm: false, app_metadata: { created_via: "nest" } });
      expect(JSON.stringify(call)).not.toContain("ADMIN");
      expect(fake.state.consents.map((row) => row.consent_type)).toEqual(["TERMS_OF_SERVICE", "PRIVACY_POLICY"]);
      expect(fake.state.consents.every((row) => row.version === "1.0")).toBe(true);
      expect(fake.state.resendCalls).toEqual(["new@example.com"]);
    });

    it("returns the same neutral response for an existing email regardless of case, creating nothing", async () => {
      seedUser("a@x.com");
      const response = await http().post("/auth/register").send(registerBody({ email: "A@x.com" }));
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: "CHECK_EMAIL" });
      expect(fake.state.users.size).toBe(1);
      expect(fake.state.resendCalls).toHaveLength(0);
      expect(fake.state.consents).toHaveLength(0);
    });

    it("rejects disposable domains with 422 DISPOSABLE_EMAIL", async () => {
      const response = await http().post("/auth/register").send(registerBody({ email: "x@mailinator.com" }));
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("DISPOSABLE_EMAIL");
      expect(fake.state.users.size).toBe(0);
    });

    it("rejects a bad captcha with 400 CAPTCHA_FAILED", async () => {
      const response = await http().post("/auth/register").send(registerBody({ captchaToken: "nope" }));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("CAPTCHA_FAILED");
      expect(fake.state.users.size).toBe(0);
    });

    it("rejects weak passwords with 422 and the reasons", async () => {
      const response = await http().post("/auth/register").send(registerBody({ password: "abc" }));
      expect(response.status).toBe(422);
      expect(response.body.error.details.reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("ít nhất 8"), expect.stringContaining("chữ hoa"), expect.stringContaining("chữ số")]),
      );
      const tooLong = await http().post("/auth/register").send(registerBody({ password: `Aa1${"x".repeat(80)}` }));
      expect(tooLong.status).toBe(422);
      expect(fake.state.users.size).toBe(0);
    });

    it("requires consent: unticked -> 422 CONSENT_REQUIRED; stale terms version -> 422", async () => {
      const unticked = await http().post("/auth/register").send(registerBody({ acceptTerms: false }));
      expect(unticked.status).toBe(422);
      expect(unticked.body.error.code).toBe("CONSENT_REQUIRED");
      const stale = await http().post("/auth/register").send(registerBody({ termsVersion: "0.9" }));
      expect(stale.status).toBe(422);
      expect(stale.body.error.code).toBe("CONSENT_REQUIRED");
      expect(fake.state.users.size).toBe(0);
    });

    it("rolls the user back when the consent record cannot be stored", async () => {
      fake.state.consentInsertError = true;
      const response = await http().post("/auth/register").send(registerBody());
      expect(response.status).toBe(500);
      expect(fake.state.users.size).toBe(0);
    });

    it("limits registrations to 5 per IP per hour (429 RATE_LIMITED + retryAfter)", async () => {
      for (let i = 0; i < 5; i += 1) {
        const ok = await http().post("/auth/register").send(registerBody({ email: `u${i}@example.com` }));
        expect(ok.status).toBe(202);
      }
      const blocked = await http().post("/auth/register").send(registerBody({ email: "u9@example.com" }));
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
      expect(blocked.body.error.details.retryAfter).toBeGreaterThan(0);
    });
  });

  describe("POST /auth/login", () => {
    const login = (password: string, captchaToken?: string, email = "Lock@x.com") =>
      http().post("/auth/login").send({ email, password, ...(captchaToken ? { captchaToken } : {}) });

    it("returns the session and clears failures on success", async () => {
      seedUser("lock@x.com");
      fake.state.attempts.set("lock@x.com", { count: 2, lockedUntil: null });
      const response = await login(GOOD_PASSWORD);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ accessToken: "token-user-seed", refreshToken: "refresh", user: { id: "user-seed", email: "lock@x.com" } });
      expect(fake.state.attempts.has("lock@x.com")).toBe(false);
    });

    it("uses one generic message for wrong password and unknown email (R-12)", async () => {
      seedUser("lock@x.com");
      const wrong = await login("Wrong1234");
      const unknown = await login("Wrong1234", undefined, "ghost@x.com");
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.error.message).toBe("Email hoặc mật khẩu không đúng");
      expect(unknown.body).toEqual(wrong.body);
    });

    it("requires captcha after 3 failures", async () => {
      seedUser("lock@x.com");
      for (let i = 0; i < 3; i += 1) expect((await login("Wrong1234")).status).toBe(401);
      const missing = await login(GOOD_PASSWORD);
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe("CAPTCHA_FAILED");
      const solved = await login(GOOD_PASSWORD, CAPTCHA_OK);
      expect(solved.status).toBe(200);
    });

    it("AC-03: 5 wrong -> locked; the 6th (correct) attempt is still 423 and the owner is alerted once", async () => {
      seedUser("lock@x.com");
      for (let i = 0; i < 4; i += 1) expect((await login("Wrong1234", CAPTCHA_OK)).status).toBe(401);
      const fifth = await login("Wrong1234", CAPTCHA_OK);
      expect(fifth.status).toBe(423);
      expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");
      const sixth = await login(GOOD_PASSWORD, CAPTCHA_OK);
      expect(sixth.status).toBe(423);
      expect(sixth.body.error.code).toBe("ACCOUNT_LOCKED");
      expect(fake.state.outbox).toHaveLength(1);
      expect(fake.state.outbox[0]).toMatchObject({ kind: "ACCOUNT_LOCKED_ALERT", to_email: "lock@x.com" });
    });

    it("reports EMAIL_NOT_CONFIRMED (403) without counting a failure", async () => {
      seedUser("lock@x.com", false);
      const response = await login(GOOD_PASSWORD);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("EMAIL_NOT_CONFIRMED");
      expect(fake.state.attempts.size).toBe(0);
    });

    it("limits login to 10 attempts per IP per minute", async () => {
      for (let i = 0; i < 10; i += 1) await login("Wrong1234", CAPTCHA_OK, `u${i}@x.com`);
      const blocked = await login("Wrong1234", CAPTCHA_OK, "u11@x.com");
      expect(blocked.status).toBe(429);
    });
  });

  describe("POST /auth/resend-confirmation", () => {
    it("AC-02: second call within 60s -> 429 RATE_LIMITED with retryAfter and no extra email", async () => {
      const first = await http().post("/auth/resend-confirmation").send({ email: "u@x.com" });
      expect(first.status).toBe(202);
      const second = await http().post("/auth/resend-confirmation").send({ email: "U@x.com" });
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe("RATE_LIMITED");
      expect(second.body.error.details.retryAfter).toBeGreaterThan(0);
      expect(second.body.error.details.retryAfter).toBeLessThanOrEqual(60);
      expect(fake.state.resendCalls).toHaveLength(1);
    });

    it("caps at 5 per hour per email even after the 60s cooldown passes", async () => {
      const hourKeyOnly = async () => {
        for (const key of [...fake.state.buckets.keys()]) if (key.startsWith("resend:cooldown:")) fake.state.buckets.delete(key);
      };
      for (let i = 0; i < 5; i += 1) {
        expect((await http().post("/auth/resend-confirmation").send({ email: "u@x.com" })).status).toBe(202);
        await hourKeyOnly();
      }
      const sixth = await http().post("/auth/resend-confirmation").send({ email: "u@x.com" });
      expect(sixth.status).toBe(429);
      expect(fake.state.resendCalls).toHaveLength(5);
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("is neutral whether or not the email exists", async () => {
      seedUser("real@x.com");
      const real = await http().post("/auth/forgot-password").send({ email: "real@x.com", captchaToken: CAPTCHA_OK });
      const ghost = await http().post("/auth/forgot-password").send({ email: "ghost@x.com", captchaToken: CAPTCHA_OK });
      expect(real.status).toBe(202);
      expect(ghost.status).toBe(202);
      expect(ghost.body).toEqual(real.body);
    });

    it("requires captcha", async () => {
      const response = await http().post("/auth/forgot-password").send({ email: "real@x.com" });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("CAPTCHA_FAILED");
    });
  });

  describe("POST /auth/reset-password (G5 = C: link khôi phục hiệu lực 1 giờ)", () => {
    const reset = (newPassword = "NewPass123") => http().post("/auth/reset-password").send({ accessToken: "token-user-seed", newPassword });
    const sentMinutesAgo = (minutes: number) => {
      seedUser("real@x.com");
      fake.state.users.get("user-seed")!.recovery_sent_at = new Date(Date.now() - minutes * 60_000).toISOString();
    };

    it("accepts a link sent 59 minutes ago, updates the password, clears login lockouts and signs out other sessions", async () => {
      sentMinutesAgo(59);
      fake.state.attempts.set("real@x.com", { count: 5, lockedUntil: Date.now() + 600_000 });
      const response = await reset();
      expect(response.status).toBe(200);
      expect(fake.state.users.get("user-seed")!.password).toBe("NewPass123");
      expect(fake.state.attempts.has("real@x.com")).toBe(false);
      expect(fake.state.signOutCalls).toEqual([{ token: "token-user-seed", scope: "others" }]);
    });

    it("rejects a link sent 61 minutes ago with a clear reason and leaves the password untouched", async () => {
      sentMinutesAgo(61);
      const response = await reset();
      expect(response.status).toBe(401);
      expect(response.body.error.details.reason).toBe("RECOVERY_LINK_EXPIRED");
      expect(fake.state.users.get("user-seed")!.password).toBe(GOOD_PASSWORD);
      expect(fake.state.signOutCalls).toHaveLength(0);
    });

    it("rejects a session that never had a recovery link, a bad token and a weak password", async () => {
      seedUser("real@x.com");
      expect((await reset()).status).toBe(401);
      sentMinutesAgo(1);
      expect((await http().post("/auth/reset-password").send({ accessToken: "garbage", newPassword: "NewPass123" })).status).toBe(401);
      expect((await reset("weak")).status).toBe(422);
    });
  });

  describe("tài khoản nhân sự (R-17)", () => {
    it("is created with email_confirm=true and created_via=nest, only via the service (no public route)", async () => {
      const result = await service.createStaffAccount("Staff@X.com", GOOD_PASSWORD);
      expect(result.userId).toBeTruthy();
      expect(fake.state.createUserCalls[0]).toMatchObject({ email: "staff@x.com", email_confirm: true, app_metadata: { created_via: "nest" } });
      expect((await http().post("/auth/staff").send({})).status).toBe(404);
    });
  });
});
