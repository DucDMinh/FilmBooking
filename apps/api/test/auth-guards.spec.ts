import { Controller, Get, Inject, Post, Req, UseGuards, type INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessService, type AuthenticatedRequest } from "../src/common/auth/access.service";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { CinemaScopeGuard } from "../src/common/auth/cinema-scope.guard";
import { CinemaScope, CurrentUser, Public, Roles, type AuthUser } from "../src/common/auth/decorators";
import { JobSecretGuard } from "../src/common/auth/job-secret.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const HN01 = "11111111-1111-1111-1111-111111111111";
const HN02 = "22222222-2222-2222-2222-222222222222";
const ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";
const MANAGER = "aaaaaaaa-0000-0000-0000-000000000002";
const STAFF = "aaaaaaaa-0000-0000-0000-000000000003";
const CUSTOMER = "aaaaaaaa-0000-0000-0000-000000000004";

const DUAL = "aaaaaaaa-0000-0000-0000-000000000005";
const SUPABASE_URL = "https://abc.supabase.co";

const userRoles = [{ user_id: ADMIN, role: "ADMIN" }];
const assignments = [
  { user_id: MANAGER, cinema_id: HN01, role: "MANAGER" },
  { user_id: STAFF, cinema_id: HN01, role: "STAFF" },
  { user_id: DUAL, cinema_id: HN01, role: "MANAGER" },
  { user_id: DUAL, cinema_id: HN02, role: "STAFF" },
];
/** Nguồn tin cậy cho email_confirmed_at (auth.users). */
const confirmedAt: Record<string, string | null> = { [MANAGER]: "2026-01-01T00:00:00Z" };

const calls = { from: 0, getUserById: 0 };

/** Mock tối thiểu của supabase.from(t).select().eq(col, v) và auth.admin.getUserById. */
const fakeSupabase = {
  admin: () => ({
    from: (table: string) => {
      calls.from += 1;
      return {
        select: () => ({
          eq: (_column: string, value: string) => ({
            data: (table === "user_roles" ? userRoles : assignments).filter((row) => row.user_id === value),
            error: null,
          }),
        }),
      };
    },
    auth: {
      admin: {
        getUserById: (id: string) => {
          calls.getUserById += 1;
          return Promise.resolve({ data: { user: { id, email_confirmed_at: confirmedAt[id] ?? null } }, error: null });
        },
      },
    },
  }),
};

interface SignOptions {
  secret?: string;
  expiresIn?: string;
  aud?: string;
  iss?: string;
  alg?: string;
  withSub?: boolean;
}

const sign = (sub: string, options: SignOptions = {}) => {
  // Claim user_metadata do user tự đặt: cố tình luôn "đã xác nhận" để chứng minh server không tin nó.
  const jwt = new SignJWT({ email: `${sub}@x.vn`, user_metadata: { email_verified: true } })
    .setProtectedHeader({ alg: options.alg ?? "HS256" })
    .setAudience(options.aud ?? "authenticated")
    .setIssuer(options.iss ?? `${SUPABASE_URL}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m");
  if (options.withSub !== false) jwt.setSubject(sub);
  return jwt.sign(new TextEncoder().encode(options.secret ?? JWT_SECRET));
};

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsignedToken = (sub: string) =>
  `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ sub, aud: "authenticated", iss: `${SUPABASE_URL}/auth/v1` })}.`;

@Controller("probe")
class ProbeController {
  constructor(@Inject(AccessService) private readonly access: AccessService) {}

  @Public()
  @Get("public")
  open() {
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id, email: user.email, hasJwt: Boolean(user.jwt), keys: Object.keys(user).sort() };
  }

  @Get("email")
  async email(@Req() req: AuthenticatedRequest) {
    // Gọi hai lần để kiểm memoize theo request.
    const first = await this.access.isEmailConfirmed(req);
    const second = await this.access.isEmailConfirmed(req);
    return { confirmed: first && second === first };
  }

  @Roles("ADMIN")
  @Get("admin")
  adminOnly() {
    return { ok: true };
  }

  @CinemaScope({ resolve: (req) => (req.headers as Record<string, string>)["x-cinema"] })
  @Get("resolved")
  resolved() {
    return { ok: true };
  }

  @CinemaScope()
  @Get("scoped-query")
  scopedQuery() {
    return { ok: true };
  }

  @Roles("MANAGER")
  @Get("manager")
  manager() {
    return { ok: true };
  }

  @Roles("STAFF")
  @Get("staff")
  staff() {
    return { ok: true };
  }

  @Roles("MANAGER")
  @CinemaScope()
  @Get("cinemas/:cinemaId/report")
  report() {
    return { ok: true };
  }

  @CinemaScope()
  @Post("scoped-body")
  scopedBody() {
    return { ok: true };
  }

  @Public()
  @UseGuards(JobSecretGuard)
  @Post("jobs/run")
  job() {
    return { ok: true };
  }
}

describe("auth guards", () => {
  let app: INestApplication;

  const build = async (jobSecret: string | undefined) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL, JOB_SECRET: jobSecret } as Env },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        JobSecretGuard,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: CinemaScopeGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    const created = moduleRef.createNestApplication();
    created.useLogger(false);
    await created.init();
    return created;
  };

  beforeAll(async () => {
    app = await build("job-secret-value");
  });
  afterAll(async () => {
    await app.close();
  });

  const get = async (path: string, sub?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return sub ? req.set("Authorization", `Bearer ${await sign(sub)}`) : req;
  };

  const postAs = async (path: string, sub: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set("Authorization", `Bearer ${await sign(sub)}`)
      .send(body);

  describe("AuthGuard", () => {
    it("lets @Public routes through without a token", async () => {
      expect((await get("/probe/public")).status).toBe(200);
    });

    it("401 without a token", async () => {
      const res = await get("/probe/me");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("attaches req.user from a valid token", async () => {
      const res = await get("/probe/me", CUSTOMER);
      expect(res.status).toBe(200);
      // Không có emailConfirmed trên req.user: chỉ id/email/jwt.
      expect(res.body).toEqual({
        id: CUSTOMER,
        email: `${CUSTOMER}@x.vn`,
        hasJwt: true,
        keys: ["email", "id", "jwt"],
      });
    });

    it("401 for wrong signature, expiry, audience, issuer, alg none, HS384, missing sub and garbage", async () => {
      const bad = [
        await sign(CUSTOMER, { secret: "another-secret-another-secret-12345" }),
        await sign(CUSTOMER, { expiresIn: "-1m" }),
        await sign(CUSTOMER, { aud: "anon" }),
        await sign(CUSTOMER, { iss: "https://evil.example/auth/v1" }),
        await sign(CUSTOMER, { alg: "HS384" }),
        await sign(CUSTOMER, { withSub: false }),
        unsignedToken(ADMIN),
        "not-a-jwt",
      ];
      for (const token of bad) {
        const res = await request(app.getHttpServer()).get("/probe/me").set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHENTICATED");
      }
    });
  });

  describe("email confirmation", () => {
    it("ignores the user_metadata.email_verified claim: DB says unconfirmed -> false", async () => {
      const res = await get("/probe/email", CUSTOMER);
      expect(res.body).toEqual({ confirmed: false });
    });

    it("true when auth.users.email_confirmed_at is set, fetched once per request", async () => {
      const before = calls.getUserById;
      const res = await get("/probe/email", MANAGER);
      expect(res.body).toEqual({ confirmed: true });
      expect(calls.getUserById - before).toBe(1);
    });
  });

  describe("RolesGuard", () => {
    it("loads roles once per request even with RolesGuard + CinemaScopeGuard", async () => {
      const before = calls.from;
      await get(`/probe/cinemas/${HN01}/report`, MANAGER);
      expect(calls.from - before).toBe(2); // user_roles + staff_assignments, một lần
    });

    it("non-admin hitting Roles ADMIN -> 403", async () => {
      expect((await get("/probe/admin", MANAGER)).status).toBe(403);
      expect((await get("/probe/admin", ADMIN)).status).toBe(200);
    });

    it("Manager at HN01 who is only Staff at HN02 cannot use Roles MANAGER for HN02", async () => {
      expect((await get(`/probe/cinemas/${HN01}/report`, DUAL)).status).toBe(200);
      const res = await get(`/probe/cinemas/${HN02}/report`, DUAL);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("403 FORBIDDEN when the user has no role", async () => {
      const res = await get("/probe/manager", CUSTOMER);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Staff cannot pass Roles MANAGER", async () => {
      expect((await get("/probe/manager", STAFF)).status).toBe(403);
    });

    it("Manager passes MANAGER and STAFF; Admin passes everything", async () => {
      expect((await get("/probe/manager", MANAGER)).status).toBe(200);
      expect((await get("/probe/staff", MANAGER)).status).toBe(200);
      expect((await get("/probe/staff", STAFF)).status).toBe(200);
      expect((await get("/probe/manager", ADMIN)).status).toBe(200);
    });
  });

  describe("CinemaScopeGuard", () => {
    it("Manager HN01 on HN01 -> 200", async () => {
      expect((await get(`/probe/cinemas/${HN01}/report`, MANAGER)).status).toBe(200);
    });

    it("Manager HN01 on HN02 -> 403 FORBIDDEN_CINEMA (AC-16)", async () => {
      const res = await get(`/probe/cinemas/${HN02}/report`, MANAGER);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Admin passes any cinema", async () => {
      expect((await get(`/probe/cinemas/${HN02}/report`, ADMIN)).status).toBe(200);
    });

    it("Staff at HN01 is stopped by Roles MANAGER even in their own cinema", async () => {
      expect((await get(`/probe/cinemas/${HN01}/report`, STAFF)).status).toBe(403);
    });

    it("reads cinemaId from the body and rejects mismatches", async () => {
      expect((await postAs("/probe/scoped-body", MANAGER, { cinemaId: HN01 })).status).toBe(201);
      const res = await postAs("/probe/scoped-body", MANAGER, { cinemaId: HN02 });
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("fails closed when no cinemaId is found or it is not a string", async () => {
      expect((await postAs("/probe/scoped-body", MANAGER, {})).body.error.code).toBe("FORBIDDEN_CINEMA");
      expect((await postAs("/probe/scoped-body", MANAGER, { cinemaId: [HN01] })).body.error.code).toBe(
        "FORBIDDEN_CINEMA",
      );
    });

    it("repeated query cinemaId (array) is rejected", async () => {
      const res = await get(`/probe/scoped-query?cinemaId=${HN01}&cinemaId=${HN01}`, MANAGER);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
      expect((await get(`/probe/scoped-query?cinemaId=${HN01}`, MANAGER)).status).toBe(200);
    });

    it("resolve option: entity-derived cinemaId is enforced", async () => {
      const call = async (cinema: string) =>
        request(app.getHttpServer())
          .get("/probe/resolved")
          .set("x-cinema", cinema)
          .set("Authorization", `Bearer ${await sign(MANAGER)}`);
      expect((await call(HN01)).status).toBe(200);
      expect((await call(HN02)).body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("a query cinemaId elsewhere cannot piggy-back on an allowed body cinemaId", async () => {
      const res = await postAs(`/probe/scoped-body?cinemaId=${HN02}`, MANAGER, { cinemaId: HN01 });
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });
  });

  describe("JobSecretGuard", () => {
    const run = (secret?: string) => {
      const req = request(app.getHttpServer()).post("/probe/jobs/run");
      return secret === undefined ? req : req.set("x-job-secret", secret);
    };

    it("passes with the right secret", async () => {
      expect((await run("job-secret-value")).status).toBe(201);
    });

    it("401 with a wrong, same-length-wrong or missing secret", async () => {
      expect((await run("wrong")).status).toBe(401);
      expect((await run("job-secret-valuX")).status).toBe(401);
      expect((await run()).status).toBe(401);
    });

    it("is fail-closed when JOB_SECRET is not configured", async () => {
      const unconfigured = await build(undefined);
      const res = await request(unconfigured.getHttpServer()).post("/probe/jobs/run").set("x-job-secret", "anything");
      expect(res.status).toBe(401);
      await unconfigured.close();
    });
  });
});
