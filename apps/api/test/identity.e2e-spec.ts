import { randomUUID } from "node:crypto";
import { Global, Module, type INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ERROR_CODES } from "@filmbooking/shared";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { IdentityModule } from "../src/modules/identity/identity.module";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-123456789";
const SUPABASE_URL = "https://identity-test.supabase.co";

const USER_OAUTH_ONLY = "11111111-1111-4111-8111-111111111111";
const USER_WITH_PASSWORD = "22222222-2222-4222-8222-222222222222";
const USER_OTHER = "33333333-3333-4333-8333-333333333333";

interface FakeIdentity {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

interface FakeUser {
  id: string;
  email: string;
  has_password: boolean;
}

function createFakeSupabase() {
  const users = new Map<string, FakeUser>();
  const identities = new Map<string, FakeIdentity>();
  const emailOutbox: Record<string, unknown>[] = [];
  const missingEmailRequests: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];
  const rateLimitBuckets = new Map<string, { start: number; hits: number }>();
  const disposableDomains = new Set(["mailinator.com", "tempmail.com", "10minutemail.com"]);

  function reset() {
    users.clear();
    identities.clear();
    emailOutbox.length = 0;
    missingEmailRequests.length = 0;
    auditLogs.length = 0;
    rateLimitBuckets.clear();

    // 1. User chỉ có Facebook (chưa có mật khẩu)
    users.set(USER_OAUTH_ONLY, {
      id: USER_OAUTH_ONLY,
      email: "facebook_user@example.com",
      has_password: false,
    });
    identities.set(`${USER_OAUTH_ONLY}:facebook`, {
      id: randomUUID(),
      user_id: USER_OAUTH_ONLY,
      provider: "facebook",
      provider_id: "fb_123456",
      email: "facebook_user@example.com",
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    });

    // 2. User có email + mật khẩu (alice@x.com)
    users.set(USER_WITH_PASSWORD, {
      id: USER_WITH_PASSWORD,
      email: "alice@x.com",
      has_password: true,
    });
    identities.set(`${USER_WITH_PASSWORD}:email`, {
      id: randomUUID(),
      user_id: USER_WITH_PASSWORD,
      provider: "email",
      provider_id: USER_WITH_PASSWORD,
      email: "alice@x.com",
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    });

    // 3. User khác (bob@example.com) có Google google_bob_999
    users.set(USER_OTHER, {
      id: USER_OTHER,
      email: "bob@example.com",
      has_password: true,
    });
    identities.set(`${USER_OTHER}:google`, {
      id: randomUUID(),
      user_id: USER_OTHER,
      provider: "google",
      provider_id: "google_bob_999",
      email: "bob@example.com",
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    });
  }

  reset();

  const rpc = (name: string, args: Record<string, unknown>) => {
    if (name === "hit_rate_limit") {
      const key = String(args.p_key);
      const rawWindow = args.p_window;
      if (typeof rawWindow !== "string" || !/^\d+\s+seconds$/i.test(rawWindow)) {
        return Promise.resolve({
          data: null,
          error: {
            code: "42883",
            message: "function public.hit_rate_limit(text, integer, integer) does not exist",
          },
        });
      }
      const secondsMatch = /^(\d+)\s+seconds$/i.exec(rawWindow);
      const windowMs = Number(secondsMatch ? secondsMatch[1] : 0) * 1000;
      const max = Number(args.p_max);
      const bucket = rateLimitBuckets.get(key);
      if (!bucket || bucket.start + windowMs <= Date.now()) {
        rateLimitBuckets.set(key, { start: Date.now(), hits: 1 });
        return Promise.resolve({ data: true, error: null });
      }
      bucket.hits += 1;
      return Promise.resolve({ data: bucket.hits <= max, error: null });
    }

    if (name === "is_disposable_email") {
      const email = String(args.p_email ?? "").toLowerCase();
      const domain = email.split("@")[1] ?? "";
      return Promise.resolve({ data: disposableDomains.has(domain), error: null });
    }

    if (name === "get_user_identities") {
      const userId = String(args.p_user_id);
      const user = users.get(userId);
      const userIdentities = [...identities.values()].filter((i) => i.user_id === userId);
      const oauthCount = userIdentities.filter((i) => i.provider !== "email").length;
      const hasPassword = Boolean(user?.has_password);
      const totalMethods = oauthCount + (hasPassword ? 1 : 0);
      const canUnlink = totalMethods > 1;

      return Promise.resolve({
        data: {
          identities: userIdentities.map((i) => ({
            id: i.id,
            provider: i.provider,
            providerId: i.provider_id,
            email: i.email,
            createdAt: i.created_at,
            lastSignInAt: i.last_sign_in_at,
          })),
          hasPassword,
          canUnlink,
          totalMethods,
        },
        error: null,
      });
    }

    if (name === "link_user_identity") {
      const userId = String(args.p_user_id);
      const provider = String(args.p_provider);
      const providerId = String(args.p_provider_id);

      // R-23: kiểm tra xem provider + provider_id đã thuộc user khác chưa
      const existing = [...identities.values()].find(
        (i) => i.provider === provider && i.provider_id === providerId && i.user_id !== userId,
      );
      if (existing) {
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: "IDENTITY_ALREADY_LINKED" },
        });
      }

      // Kiểm tra xem chính user đã có provider này chưa
      const ownExisting = identities.get(`${userId}:${provider}`);
      if (ownExisting) {
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: "IDENTITY_ALREADY_LINKED" },
        });
      }

      const id = randomUUID();
      const user = users.get(userId);
      identities.set(`${userId}:${provider}`, {
        id,
        user_id: userId,
        provider,
        provider_id: providerId,
        email: user?.email ?? null,
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      });

      // Trigger R-24: enqueue email_outbox
      if (user?.email) {
        emailOutbox.push({
          kind: "identity_linked",
          to_email: user.email,
          payload: { template: "identity_linked", provider, user_id: userId, action: "linked" },
          status: "PENDING",
        });
      }

      return Promise.resolve({ data: { success: true, provider }, error: null });
    }

    if (name === "unlink_user_identity") {
      const userId = String(args.p_user_id);
      const provider = String(args.p_provider);

      if (provider === "email") {
        return Promise.resolve({
          data: null,
          error: {
            code: "22023",
            message: "INVALID_OPERATION: Không thể huỷ phương thức email/mật khẩu qua API này.",
          },
        });
      }

      const user = users.get(userId);
      const userIdentities = [...identities.values()].filter((i) => i.user_id === userId);
      const oauthCount = userIdentities.filter((i) => i.provider !== "email").length;
      const hasPassword = Boolean(user?.has_password);
      const totalMethods = oauthCount + (hasPassword ? 1 : 0);

      // AC-05: Chặn nếu là phương thức cuối cùng
      if (totalMethods <= 1) {
        return Promise.resolve({
          data: null,
          error: { code: "23514", message: "LAST_LOGIN_METHOD: Không thể huỷ phương thức cuối" },
        });
      }

      const existing = identities.get(`${userId}:${provider}`);
      if (!existing) {
        return Promise.resolve({
          data: null,
          error: { code: "P0002", message: "NOT_FOUND" },
        });
      }

      identities.delete(`${userId}:${provider}`);

      // Trigger R-24: enqueue email_outbox
      if (user?.email) {
        emailOutbox.push({
          kind: "identity_unlinked",
          to_email: user.email,
          payload: { template: "identity_unlinked", provider, user_id: userId, action: "unlinked" },
          status: "PENDING",
        });
      }

      return Promise.resolve({ data: { success: true, unlinkedProvider: provider }, error: null });
    }

    if (name === "mark_password_set") {
      const userId = String(args.p_user_id);
      const user = users.get(userId);
      if (user) {
        user.has_password = true;
        if (!identities.has(`${userId}:email`)) {
          identities.set(`${userId}:email`, {
            id: randomUUID(),
            user_id: userId,
            provider: "email",
            provider_id: userId,
            email: user.email,
            created_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
          });
        }
      }
      return Promise.resolve({ data: { success: true }, error: null });
    }

    if (name === "check_oauth_collision") {
      const provider = String(args.p_provider);
      const providerId = String(args.p_provider_id);
      const email = String(args.p_email ?? "").toLowerCase().trim();
      const authenticatedUserId = args.p_authenticated_user_id ? String(args.p_authenticated_user_id) : null;

      // 1. R-23: Đã gắn với user khác
      const existing = [...identities.values()].find((i) => i.provider === provider && i.provider_id === providerId);
      if (existing && existing.user_id !== authenticatedUserId) {
        return Promise.resolve({
          data: {
            status: "CONFLICT_IDENTITY",
            code: "IDENTITY_ALREADY_LINKED",
            message: "Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác.",
          },
          error: null,
        });
      }

      // 2. AC-04: Đăng nhập lần đầu (authenticatedUserId is null) mà email trùng tài khoản mật khẩu
      if (!authenticatedUserId && email) {
        const userWithEmail = [...users.values()].find((u) => u.email.toLowerCase() === email);
        if (userWithEmail && userWithEmail.has_password) {
          const hasProvider = [...identities.values()].some(
            (i) => i.user_id === userWithEmail.id && i.provider === provider,
          );
          if (!hasProvider) {
            return Promise.resolve({
              data: {
                status: "CONFLICT_EMAIL",
                code: "OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED",
                message: "Email này đã có tài khoản — hãy đăng nhập bằng mật khẩu để liên kết.",
              },
              error: null,
            });
          }
        }
      }

      return Promise.resolve({ data: { status: "OK", message: "Hợp lệ" }, error: null });
    }

    throw new Error(`Unhandled RPC in test mock: ${name}`);
  };

  const adminClient = {
    rpc,
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: () => {
            if (table === "profiles" || table === "users") {
              const u = [...users.values()].find((usr) => (col === "email" ? usr.email === val : usr.id === val));
              return Promise.resolve({ data: u ? { id: u.id, email: u.email } : null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        if (table === "email_outbox") {
          emailOutbox.push(payload);
        } else if (table === "oauth_missing_email_requests") {
          missingEmailRequests.push(payload);
        } else if (table === "audit_logs") {
          auditLogs.push(payload);
        }
        return Promise.resolve({ data: payload, error: null });
      },
    }),
    auth: {
      admin: {
        updateUserById: (userId: string, patch: Record<string, unknown>) => {
          const user = users.get(userId);
          if (user && patch.password) {
            user.has_password = true;
          }
          return Promise.resolve({ data: { user }, error: null });
        },
      },
    },
  };

  return {
    users,
    identities,
    emailOutbox,
    missingEmailRequests,
    auditLogs,
    reset,
    service: {
      admin: () => adminClient,
      forUser: () => adminClient,
    },
  };
}

async function signJwt(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, aud: "authenticated", iss: `${SUPABASE_URL}/auth/v1` })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

describe("IdentityModule (e2e)", () => {
  let app: INestApplication;
  const fake = createFakeSupabase();

  beforeAll(async () => {
    const testEnv: Env = {
      NODE_ENV: "test",
      PORT: 3000,
      WEB_ORIGIN: ["http://localhost:3000"],
      SUPABASE_URL,
      SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      SUPABASE_JWT_SECRET: JWT_SECRET,
      SUPABASE_JWT_ISSUER: `${SUPABASE_URL}/auth/v1`,
      TRUST_PROXY_HOPS: 0,
    };

    @Global()
    @Module({
      providers: [
        { provide: ENV, useValue: testEnv },
        { provide: SupabaseService, useValue: fake.service },
      ],
      exports: [ENV, SupabaseService],
    })
    class FakeGlobalModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [FakeGlobalModule, IdentityModule],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fake.reset();
  });

  describe("Authentication Guard", () => {
    it("chặn 401 UNAUTHENTICATED khi không có bearer token", async () => {
      const res = await request(app.getHttpServer()).get("/me/identities");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });
  });

  describe("GET /me/identities (R-21)", () => {
    it("trả về đúng identities, hasPassword=false, canUnlink=false cho tài khoản chỉ có Facebook", async () => {
      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");
      const res = await request(app.getHttpServer())
        .get("/me/identities")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasPassword).toBe(false);
      expect(res.body.canUnlink).toBe(false);
      expect(res.body.identities).toHaveLength(1);
      expect(res.body.identities[0].provider).toBe("facebook");
    });

    it("trả về hasPassword=true, canUnlink=true khi tài khoản có mật khẩu và phương thức khác", async () => {
      // Thêm Google cho user có mật khẩu
      fake.identities.set(`${USER_WITH_PASSWORD}:google`, {
        id: randomUUID(),
        user_id: USER_WITH_PASSWORD,
        provider: "google",
        provider_id: "google_alice_1",
        email: "alice@x.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
      });

      const token = await signJwt(USER_WITH_PASSWORD, "alice@x.com");
      const res = await request(app.getHttpServer())
        .get("/me/identities")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasPassword).toBe(true);
      expect(res.body.canUnlink).toBe(true);
      expect(res.body.identities.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("DELETE /me/identities/:provider (AC-05, R-21, R-24)", () => {
    it("AC-05: Từ chối huỷ liên kết phương thức cuối cùng (409 LAST_LOGIN_METHOD)", async () => {
      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");
      const res = await request(app.getHttpServer())
        .delete("/me/identities/facebook")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.error.details?.code).toBe("LAST_LOGIN_METHOD");
      expect(res.body.error.message).toContain("Không thể huỷ phương thức đăng nhập cuối cùng");
    });

    it("Chặn huỷ phương thức email qua DELETE /me/identities/email (400 VALIDATION_ERROR)", async () => {
      fake.identities.set(`${USER_WITH_PASSWORD}:google`, {
        id: randomUUID(),
        user_id: USER_WITH_PASSWORD,
        provider: "google",
        provider_id: "google_alice_99",
        email: "alice@x.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
      });

      const token = await signJwt(USER_WITH_PASSWORD, "alice@x.com");
      const res = await request(app.getHttpServer())
        .delete("/me/identities/email")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(fake.identities.has(`${USER_WITH_PASSWORD}:email`)).toBe(true);
    });

    it("Trả về 404 khi huỷ phương thức hợp lệ nhưng không tồn tại trên tài khoản", async () => {
      // Đặt thêm mật khẩu để canUnlink = true
      fake.users.get(USER_OAUTH_ONLY)!.has_password = true;

      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");
      const res = await request(app.getHttpServer())
        .delete("/me/identities/google")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it("Cho phép huỷ liên kết khi còn >= 2 phương thức và tự enqueue email notification (R-24)", async () => {
      // Cấp thêm Google cho user
      fake.identities.set(`${USER_OAUTH_ONLY}:google`, {
        id: randomUUID(),
        user_id: USER_OAUTH_ONLY,
        provider: "google",
        provider_id: "google_12345",
        email: "facebook_user@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
      });

      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");
      const res = await request(app.getHttpServer())
        .delete("/me/identities/facebook")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.unlinkedProvider).toBe("facebook");

      // R-24: Kiểm tra có 1 email thông báo huỷ liên kết trong email_outbox
      const email = fake.emailOutbox.find((m) => m.kind === "identity_unlinked");
      expect(email).toBeDefined();
      expect(email?.to_email).toBe("facebook_user@example.com");
      expect((email?.payload as Record<string, unknown>)?.provider).toBe("facebook");
    });
  });

  describe("POST /me/password (R-22)", () => {
    it("Từ chối đặt mật khẩu nếu tài khoản đã có mật khẩu (409 PASSWORD_ALREADY_SET)", async () => {
      const token = await signJwt(USER_WITH_PASSWORD, "alice@x.com");
      const res = await request(app.getHttpServer())
        .post("/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ password: "NewStrongPass123" });

      expect(res.status).toBe(409);
      expect(res.body.error.details?.code).toBe("PASSWORD_ALREADY_SET");
    });

    it("Từ chối mật khẩu không thoả mãn chính sách (400 VALIDATION_ERROR)", async () => {
      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");
      const res = await request(app.getHttpServer())
        .post("/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ password: "short" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Thành công đặt mật khẩu lần đầu cho tài khoản OAuth -> có thể huỷ Facebook sau đó (AC-05, R-22)", async () => {
      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");

      // 1. Đặt mật khẩu lần đầu
      const passRes = await request(app.getHttpServer())
        .post("/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ password: "ValidStrongPassword123" });

      expect(passRes.status).toBe(200);
      expect(passRes.body.success).toBe(true);

      // 2. Kiểm tra GET /me/identities: hasPassword thành true, canUnlink thành true
      const idRes = await request(app.getHttpServer())
        .get("/me/identities")
        .set("Authorization", `Bearer ${token}`);

      expect(idRes.body.hasPassword).toBe(true);
      expect(idRes.body.canUnlink).toBe(true);

      // 3. Bây giờ DELETE /me/identities/facebook thành công!
      const unlinkRes = await request(app.getHttpServer())
        .delete("/me/identities/facebook")
        .set("Authorization", `Bearer ${token}`);

      expect(unlinkRes.status).toBe(200);
      expect(unlinkRes.body.success).toBe(true);
    });
  });

  describe("POST /me/identities/link (R-21, R-23, R-24)", () => {
    it("R-23: Từ chối liên kết tài khoản MXH đã thuộc về người dùng khác (409 IDENTITY_ALREADY_LINKED)", async () => {
      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");

      // Cố liên kết provider_id 'google_bob_999' vốn đã thuộc về USER_OTHER
      const res = await request(app.getHttpServer())
        .post("/me/identities/link")
        .set("Authorization", `Bearer ${token}`)
        .send({
          provider: "google",
          providerId: "google_bob_999",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.details?.code).toBe("IDENTITY_ALREADY_LINKED");
    });

    it("Liên kết thành công phương thức mới và enqueue email thông báo (R-24)", async () => {
      const token = await signJwt(USER_OAUTH_ONLY, "facebook_user@example.com");

      const res = await request(app.getHttpServer())
        .post("/me/identities/link")
        .set("Authorization", `Bearer ${token}`)
        .send({
          provider: "google",
          providerId: "google_brand_new_123",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.provider).toBe("google");

      // Kiểm tra email_outbox có email identity_linked
      const email = fake.emailOutbox.find((m) => m.kind === "identity_linked");
      expect(email).toBeDefined();
      expect(email?.to_email).toBe("facebook_user@example.com");
    });
  });

  describe("POST /auth/oauth/missing-email (R-21, #18)", () => {
    it("Chặn disposable email (422 DISPOSABLE_EMAIL)", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/oauth/missing-email")
        .send({
          provider: "facebook",
          email: "spam@mailinator.com",
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("DISPOSABLE_EMAIL");
    });

    it("Email mới chưa tồn tại -> trả 200 CHECK_EMAIL và enqueue email xác nhận (template oauth_missing_email_verify)", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/oauth/missing-email")
        .send({
          provider: "facebook",
          email: "new_fb_user@gmail.com",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CHECK_EMAIL");

      // Kiểm tra có request được lưu và có email verify
      expect(fake.missingEmailRequests.length).toBe(1);
      const email = fake.emailOutbox.find((m) => m.kind === "oauth_missing_email_verify");
      expect(email).toBeDefined();
      expect(email?.to_email).toBe("new_fb_user@gmail.com");
    });

    it("#18: Email TRÙNG tài khoản có sẵn -> trả CÙNG 200 CHECK_EMAIL (không lộ thông tin), gửi email hướng dẫn cho chủ cũ", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/oauth/missing-email")
        .send({
          provider: "facebook",
          email: "alice@x.com", // Trùng email của USER_WITH_PASSWORD
        });

      // Vẫn trả cùng phản hồi chung để chống dò email
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CHECK_EMAIL");

      // KHÔNG tạo missing request mới
      expect(fake.missingEmailRequests.length).toBe(0);

      // Enqueue email hướng dẫn cho chủ tài khoản
      const email = fake.emailOutbox.find((m) => m.kind === "oauth_missing_email_collision");
      expect(email).toBeDefined();
      expect(email?.to_email).toBe("alice@x.com");
    });

    it("Chặn 429 RATE_LIMITED khi gửi yêu cầu vượt ngưỡng cho phép", async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post("/auth/oauth/missing-email")
          .send({
            provider: "facebook",
            email: `bulk_user_${i}@gmail.com`,
          });
      }

      const blocked = await request(app.getHttpServer())
        .post("/auth/oauth/missing-email")
        .send({
          provider: "facebook",
          email: "bulk_user_11@gmail.com",
        });

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
    });
  });

  describe("POST /auth/oauth/callback-check (AC-04 Guard)", () => {
    it("AC-04: Google a@x.com lần đầu khi đã có tài khoản mật khẩu a@x.com -> 409 OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/oauth/callback-check")
        .send({
          provider: "google",
          providerId: "google_alice_first_time",
          email: "alice@x.com", // đã có tài khoản mật khẩu
        });

      expect(res.status).toBe(409);
      expect(res.body.error.details?.code).toBe("OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED");
      expect(res.body.error.message).toContain("Email này đã có tài khoản");
    });

    it("R-23: MXH đã gắn với user khác -> 409 IDENTITY_ALREADY_LINKED", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/oauth/callback-check")
        .send({
          provider: "google",
          providerId: "google_bob_999", // đã thuộc về USER_OTHER
          email: "different_email@example.com",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.details?.code).toBe("IDENTITY_ALREADY_LINKED");
    });

    it("Đăng nhập OAuth email mới hoàn toàn -> 200 OK action PROCEED", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/oauth/callback-check")
        .send({
          provider: "google",
          providerId: "brand_new_google_id_777",
          email: "charlie@gmail.com",
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.action).toBe("PROCEED");
    });
  });
});
