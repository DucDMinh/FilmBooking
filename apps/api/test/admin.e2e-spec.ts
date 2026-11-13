import { Global, Module, type INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { AuthModule } from "../src/common/auth/auth.module";
import { CinemaScopeGuard } from "../src/common/auth/cinema-scope.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { AdminModule } from "../src/modules/admin/admin.module";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://abc.supabase.co";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const HN01 = uuid(1);
const HN02 = uuid(2);
const ADMIN = uuid(10);
const MANAGER_HN01 = uuid(11);
const MANAGER_HN02 = uuid(12);
const STAFF_HN01 = uuid(13);
const USER_BOB = uuid(20);
const USER_ALICE = uuid(21);
const VOUCHER_1 = uuid(30);

type Row = Record<string, unknown>;
interface Failure {
  code: string;
  message: string;
}
interface Result {
  data: unknown;
  count?: number | null;
  error: Failure | null;
}

class FakeDb {
  tables: Record<string, Row[]> = {};
  usersAuth: Record<string, { banned_until: string | null; app_metadata: Record<string, unknown> }> = {};
  private nextId = 1000;

  reset() {
    this.nextId = 1000;
    this.usersAuth = {
      [USER_BOB]: { banned_until: null, app_metadata: {} },
      [USER_ALICE]: { banned_until: null, app_metadata: {} },
    };
    this.tables = {
      user_roles: [{ user_id: ADMIN, role: "ADMIN" }],
      staff_assignments: [
        { id: uuid(101), user_id: MANAGER_HN01, cinema_id: HN01, role: "MANAGER", created_at: "2026-01-01T00:00:00Z" },
        { id: uuid(102), user_id: MANAGER_HN02, cinema_id: HN02, role: "MANAGER", created_at: "2026-01-01T00:00:00Z" },
        { id: uuid(103), user_id: STAFF_HN01, cinema_id: HN01, role: "STAFF", created_at: "2026-01-01T00:00:00Z" },
      ],
      profiles: [
        { id: ADMIN, email: "admin@filmbooking.vn", full_name: "Admin System", phone: "0900000001", created_at: "2026-01-01T00:00:00Z" },
        { id: MANAGER_HN01, email: "manager.hn01@filmbooking.vn", full_name: "Manager HN01", phone: "0900000002", created_at: "2026-01-01T00:00:00Z" },
        { id: MANAGER_HN02, email: "manager.hn02@filmbooking.vn", full_name: "Manager HN02", phone: "0900000003", created_at: "2026-01-01T00:00:00Z" },
        { id: STAFF_HN01, email: "staff.hn01@filmbooking.vn", full_name: "Staff HN01", phone: "0900000004", created_at: "2026-01-01T00:00:00Z" },
        { id: USER_BOB, email: "bob@example.com", full_name: "Bob Dylan", phone: "0900000020", created_at: "2026-01-02T00:00:00Z" },
        { id: USER_ALICE, email: "alice@example.com", full_name: "Alice Wonderland", phone: "0900000021", created_at: "2026-01-03T00:00:00Z" },
      ],
      app_settings: [
        { key: "seat_hold_minutes_web", value: 10, description: "Hold minutes", updated_at: "2026-01-01T00:00:00Z" },
        { key: "default_cleaning_minutes", value: 15, description: "Cleaning minutes", updated_at: "2026-01-01T00:00:00Z" },
        { key: "default_online_cutoff_minutes", value: 15, description: "Cutoff minutes", updated_at: "2026-01-01T00:00:00Z" },
        { key: "no_refund_warning", value: "Vé đã mua không được hoàn tiền", description: "Warning", updated_at: "2026-01-01T00:00:00Z" },
        { key: "terms_version", value: "v1.0", description: "Terms version", updated_at: "2026-01-01T00:00:00Z" },
      ],
      audit_logs: [
        {
          id: 1,
          occurred_at: "2026-01-01T10:00:00Z",
          actor_id: ADMIN,
          cinema_id: null,
          table_name: "app_settings",
          record_id: "seat_hold_minutes_web",
          action: "UPDATE",
          before_data: { value: 10 },
          after_data: { value: 10 },
        },
        {
          id: 2,
          occurred_at: "2026-01-01T11:00:00Z",
          actor_id: MANAGER_HN01,
          cinema_id: HN01,
          table_name: "staff_assignments",
          record_id: STAFF_HN01,
          action: "INSERT",
          before_data: null,
          after_data: { role: "STAFF" },
        },
        {
          id: 3,
          occurred_at: "2026-01-01T12:00:00Z",
          actor_id: MANAGER_HN02,
          cinema_id: HN02,
          table_name: "cinemas",
          record_id: HN02,
          action: "UPDATE",
          before_data: { status: "OPEN" },
          after_data: { status: "OPEN" },
        },
      ],
      vouchers: [
        {
          id: VOUCHER_1,
          code: "SALE50",
          discount_type: "PERCENT",
          discount_value: 50,
          max_discount: 100000,
          applies_to: "ORDER",
          valid_from: null,
          valid_to: null,
          min_order_amount: 100000,
          total_uses_limit: 100,
          per_user_limit: 1,
          movie_id: null,
          active: true,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    };
  }

  from(table: string) {
    return new Query(this, table);
  }

  newId() {
    this.nextId += 1;
    return uuid(this.nextId);
  }

  authAdmin() {
    return {
      getUserById: (id: string) => {
        const u = this.usersAuth[id] ?? { banned_until: null, app_metadata: {} };
        return Promise.resolve({ data: { user: { id, ...u } }, error: null });
      },
      updateUserById: (id: string, attrs: { ban_duration?: string; app_metadata?: Record<string, unknown> }) => {
        const current = this.usersAuth[id] ?? { banned_until: null, app_metadata: {} };
        if (attrs.ban_duration === "none") {
          current.banned_until = null;
        } else if (attrs.ban_duration) {
          current.banned_until = "2099-01-01T00:00:00Z";
        }
        if (attrs.app_metadata) {
          current.app_metadata = { ...current.app_metadata, ...attrs.app_metadata };
        }
        this.usersAuth[id] = current;
        return Promise.resolve({ data: { user: { id, ...current } }, error: null });
      },
    };
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
  private orderKey = "";
  private orderAsc = true;
  private rangeFrom = 0;
  private rangeTo = Infinity;
  private mode: "many" | "one" | "maybe" = "many";
  private countMode: "exact" | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(_cols?: string, options?: { count?: "exact" }) {
    if (options?.count) this.countMode = options.count;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push((r) => r[key] === value);
    return this;
  }

  neq(key: string, value: unknown) {
    this.filters.push((r) => r[key] !== value);
    return this;
  }

  in(key: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[key]));
    return this;
  }

  gte(key: string, value: unknown) {
    this.filters.push((r) => String(r[key]) >= String(value));
    return this;
  }

  lte(key: string, value: unknown) {
    this.filters.push((r) => String(r[key]) <= String(value));
    return this;
  }

  ilike(key: string, pattern: string) {
    const raw = pattern.replace(/%/g, "").toLowerCase();
    this.filters.push((r) => String(r[key] ?? "").toLowerCase().includes(raw));
    return this;
  }

  or(expr: string) {
    // Parser đơn giản cho email.ilike.%q%,full_name.ilike.%q%,phone.ilike.%q%
    const parts = expr.split(",");
    this.filters.push((row) => {
      return parts.some((p) => {
        const [field, op, val] = p.split(".");
        if (op === "ilike" && field && val) {
          const raw = val.replace(/%/g, "").toLowerCase();
          return String(row[field] ?? "").toLowerCase().includes(raw);
        }
        return false;
      });
    });
    return this;
  }

  order(key: string, opts?: { ascending?: boolean }) {
    this.orderKey = key;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single() {
    this.mode = "one";
    return this;
  }

  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  then<A, B>(onFulfilled?: (value: Result) => A | PromiseLike<A>, onRejected?: (reason: unknown) => B | PromiseLike<B>) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  private execute(): Result {
    const store = (this.db.tables[this.table] ??= []);

    if (this.op === "select") {
      let filtered = store.filter((r) => this.filters.every((f) => f(r)));
      const count = this.countMode === "exact" ? filtered.length : null;

      if (this.orderKey) {
        filtered = [...filtered].sort((a, b) => {
          const va = String(a[this.orderKey] ?? "");
          const vb = String(b[this.orderKey] ?? "");
          return this.orderAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }

      const paged = filtered.slice(this.rangeFrom, this.rangeTo + 1);

      if (this.mode === "one") {
        if (paged.length !== 1) return { data: null, error: { code: "PGRST116", message: "no rows" } };
        return { data: { ...paged[0] }, count, error: null };
      }
      if (this.mode === "maybe") {
        return { data: paged[0] ? { ...paged[0] } : null, count, error: null };
      }
      return { data: paged.map((r) => ({ ...r })), count, error: null };
    }

    if (this.op === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: Row[] = [];

      for (const row of rows) {
        if (this.table === "vouchers") {
          const dup = store.some((v) => String(v.code).toUpperCase() === String(row.code).toUpperCase());
          if (dup) return { data: null, error: { code: "23505", message: "duplicate code" } };
        }
        if (this.table === "staff_assignments") {
          const dup = store.some((s) => s.user_id === row.user_id && s.cinema_id === row.cinema_id);
          if (dup) return { data: null, error: { code: "23505", message: "duplicate assignment" } };
        }
        if (this.table === "user_roles") {
          const dup = store.some((s) => s.user_id === row.user_id && s.role === row.role);
          if (dup) return { data: null, error: { code: "23505", message: "duplicate role" } };
        }

        const newRow: Row = {
          id: row.id ?? this.db.newId(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        store.push(newRow);
        inserted.push(newRow);

        // Mô phỏng trigger audit
        if (this.table === "vouchers" || this.table === "staff_assignments") {
          const auditStore = (this.db.tables.audit_logs ??= []);
          auditStore.push({
            id: auditStore.length + 1,
            occurred_at: new Date().toISOString(),
            actor_id: (row.assigned_by as string | undefined) ?? null,
            cinema_id: (row.cinema_id as string | undefined) ?? null,
            table_name: this.table,
            record_id: String(newRow.id),
            action: "INSERT",
            before_data: null,
            after_data: { ...newRow },
          });
        }
      }

      return { data: this.mode === "one" ? inserted[0] : inserted, error: null };
    }

    if (this.op === "update") {
      const targets = store.filter((r) => this.filters.every((f) => f(r)));
      if (targets.length === 0) return { data: null, error: null };

      for (const target of targets) {
        const before = { ...target };
        Object.assign(target, this.payload);

        // Mô phỏng trigger audit trên app_settings
        if (this.table === "app_settings") {
          const auditStore = (this.db.tables.audit_logs ??= []);
          auditStore.push({
            id: auditStore.length + 1,
            occurred_at: new Date().toISOString(),
            actor_id: ADMIN,
            cinema_id: null,
            table_name: "app_settings",
            record_id: String(target.key),
            action: "UPDATE",
            before_data: before,
            after_data: { ...target },
          });
        }
      }

      return { data: this.mode === "one" || this.mode === "maybe" ? targets[0] : targets, error: null };
    }

    if (this.op === "delete") {
      const toDelete = store.filter((r) => this.filters.every((f) => f(r)));
      if (toDelete.length === 0) return { data: null, error: null };

      this.db.tables[this.table] = store.filter((r) => !toDelete.includes(r));
      return { data: toDelete[0] ?? null, error: null };
    }

    return { data: null, error: null };
  }
}

// ── Test Setup ──────────────────────────────────────────────────────────────
const fakeDb = new FakeDb();
const fakeSupabase = {
  forUser: () => fakeDb,
  admin: () => ({
    from: (table: string) => fakeDb.from(table),
    auth: { admin: fakeDb.authAdmin() },
  }),
};

@Global()
@Module({
  providers: [
    { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL } as Env },
    { provide: SupabaseService, useValue: fakeSupabase },
  ],
  exports: [ENV, SupabaseService],
})
class FakeInfraModule {}

const signJwt = (sub: string) =>
  new SignJWT({ email: `${sub}@filmbooking.vn` })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));

describe("Admin Module E2E", () => {
  let app: INestApplication;
  let adminToken: string;
  let managerHn01Token: string;
  let customerToken: string;

  beforeAll(async () => {
    [adminToken, managerHn01Token, customerToken] = await Promise.all([
      signJwt(ADMIN),
      signJwt(MANAGER_HN01),
      signJwt(USER_BOB),
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [FakeInfraModule, AuthModule, AdminModule],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: CinemaScopeGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  beforeEach(() => {
    fakeDb.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Người dùng & vai trò, gán rạp (R-17, R-105, AC-16) ────────────────

  describe("Users & Staff Assignments (R-17, R-105, AC-16)", () => {
    it("Admin tìm kiếm người dùng có phân trang", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/users?q=bob&page=1&pageSize=10")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].email).toBe("bob@example.com");
      expect(res.body.items[0].isAdmin).toBe(false);
      expect(res.body.items[0].locked).toBe(false);
      expect(res.body.total).toBe(1);
    });

    it("Admin xem chi tiết user theo id", async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/users/${USER_BOB}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(USER_BOB);
      expect(res.body.fullName).toBe("Bob Dylan");
    });

    it("Customer và Manager không có quyền truy cập /admin/users (403)", async () => {
      const resCust = await request(app.getHttpServer())
        .get("/admin/users")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(resCust.status).toBe(403);

      const resMgr = await request(app.getHttpServer())
        .get("/admin/users")
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resMgr.status).toBe(403);
    });

    it("Admin khoá và mở khoá tài khoản", async () => {
      // Khoá tài khoản
      const lockRes = await request(app.getHttpServer())
        .patch(`/admin/users/${USER_BOB}/lock`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ locked: true });
      expect(lockRes.status).toBe(200);
      expect(lockRes.body.locked).toBe(true);

      expect(fakeDb.usersAuth[USER_BOB]?.banned_until).toBeTruthy();

      // Mở khoá tài khoản
      const unlockRes = await request(app.getHttpServer())
        .patch(`/admin/users/${USER_BOB}/lock`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ locked: false });
      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.locked).toBe(false);
      expect(fakeDb.usersAuth[USER_BOB]?.banned_until).toBeNull();
    });

    it("Admin cấp và thu hồi quyền ADMIN", async () => {
      // Cấp ADMIN
      const grantRes = await request(app.getHttpServer())
        .patch(`/admin/users/${USER_BOB}/admin-role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isAdmin: true });
      expect(grantRes.status).toBe(200);
      expect(grantRes.body.isAdmin).toBe(true);

      const roles = fakeDb.tables.user_roles ?? [];
      expect(roles.some((r) => r.user_id === USER_BOB && r.role === "ADMIN")).toBe(true);

      // Thu hồi ADMIN
      const revokeRes = await request(app.getHttpServer())
        .patch(`/admin/users/${USER_BOB}/admin-role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isAdmin: false });
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.isAdmin).toBe(false);
      expect(fakeDb.tables.user_roles?.some((r) => r.user_id === USER_BOB && r.role === "ADMIN")).toBe(false);
    });

    // ── AC-16 & R-105: Phân quyền gán nhân sự ──

    it("Manager cấp vai trò MANAGER hoặc ADMIN -> 403", async () => {
      // Manager cố gán vai trò MANAGER -> 403
      const resManager = await request(app.getHttpServer())
        .post(`/admin/cinemas/${HN01}/staff`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ userId: USER_BOB, role: "MANAGER" });
      expect(resManager.status).toBe(403);
      expect(resManager.body.error.code).toBe("FORBIDDEN");

      // Manager cố cấp vai trò ADMIN qua endpoint admin-role -> 403
      const resAdminRole = await request(app.getHttpServer())
        .patch(`/admin/users/${USER_BOB}/admin-role`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ isAdmin: true });
      expect(resAdminRole.status).toBe(403);
    });

    it("Manager thêm Staff cho rạp khác -> 403 (FORBIDDEN_CINEMA)", async () => {
      // Manager HN01 cố thêm Staff cho rạp HN02 -> 403
      const res = await request(app.getHttpServer())
        .post(`/admin/cinemas/${HN02}/staff`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ userId: USER_BOB, role: "STAFF" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager thêm Staff cho rạp mình hợp lệ bằng userId", async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/cinemas/${HN01}/staff`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ userId: USER_BOB, role: "STAFF" });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(USER_BOB);
      expect(res.body.cinemaId).toBe(HN01);
      expect(res.body.role).toBe("STAFF");
      expect(res.body.email).toBe("bob@example.com");
    });

    it("Manager thêm Staff cho rạp mình hợp lệ bằng email", async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/cinemas/${HN01}/staff`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ email: "alice@example.com", role: "STAFF" });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(USER_ALICE);
      expect(res.body.role).toBe("STAFF");
    });

    it("Manager xem danh sách nhân sự rạp mình; không xem được rạp khác (403)", async () => {
      const resOwn = await request(app.getHttpServer())
        .get(`/admin/cinemas/${HN01}/staff`)
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resOwn.status).toBe(200);
      expect(Array.isArray(resOwn.body)).toBe(true);

      const resOther = await request(app.getHttpServer())
        .get(`/admin/cinemas/${HN02}/staff`)
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resOther.status).toBe(403);
    });

    it("Manager xoá STAFF khỏi rạp mình -> 200; xoá MANAGER -> 403", async () => {
      // Xoá STAFF
      const resStaff = await request(app.getHttpServer())
        .delete(`/admin/cinemas/${HN01}/staff/${STAFF_HN01}`)
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resStaff.status).toBe(200);

      // Manager cố xoá MANAGER -> 403
      const resManager = await request(app.getHttpServer())
        .delete(`/admin/cinemas/${HN01}/staff/${MANAGER_HN01}`)
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resManager.status).toBe(403);
    });
  });

  // ── 2. Cấu hình chuỗi (R-106) ─────────────────────────────────────────────

  describe("Chain Settings (R-106)", () => {
    it("Admin và Manager xem được danh sách cấu hình chuỗi", async () => {
      const resAdmin = await request(app.getHttpServer())
        .get("/admin/settings")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body).toHaveLength(5);

      const resMgr = await request(app.getHttpServer())
        .get("/admin/settings")
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resMgr.status).toBe(200);
    });

    it("Đổi thời gian giữ ghế -> giá trị mới được lưu; ghi audit log", async () => {
      const res = await request(app.getHttpServer())
        .put("/admin/settings/seat_hold_minutes_web")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ value: 15 });

      expect(res.status).toBe(200);
      expect(res.body.key).toBe("seat_hold_minutes_web");
      expect(res.body.value).toBe(15);

      // Kiểm tra DB đã nhận giá trị mới
      const setting = fakeDb.tables.app_settings?.find((s) => s.key === "seat_hold_minutes_web");
      expect(setting?.value).toBe(15);

      // Kiểm tra audit log đã ghi
      const logs = fakeDb.tables.audit_logs ?? [];
      const audit = logs.find((l) => l.table_name === "app_settings" && l.record_id === "seat_hold_minutes_web");
      expect(audit).toBeTruthy();
      expect(audit?.action).toBe("UPDATE");
    });

    it("Giá trị cấu hình không hợp lệ -> 400 Validation Error", async () => {
      const res = await request(app.getHttpServer())
        .put("/admin/settings/seat_hold_minutes_web")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ value: 999 }); // Max là 120

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Manager cố sửa cấu hình chuỗi -> 403", async () => {
      const res = await request(app.getHttpServer())
        .put("/admin/settings/seat_hold_minutes_web")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ value: 15 });

      expect(res.status).toBe(403);
    });
  });

  // ── 3. Audit log (R-107) ──────────────────────────────────────────────────

  describe("Audit Logs (R-107)", () => {
    it("Admin tra cứu audit log có lọc theo table_name, action, page", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/audit-logs?tableName=app_settings&action=UPDATE&page=1&pageSize=10")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].tableName).toBe("app_settings");
      expect(res.body.items[0].action).toBe("UPDATE");
    });

    it("Manager chỉ xem được audit log của rạp mình", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/audit-logs?page=1&pageSize=10")
        .set("Authorization", `Bearer ${managerHn01Token}`);

      expect(res.status).toBe(200);
      // Chỉ nhận log của HN01 (id = 2)
      expect(res.body.items.every((item: { cinemaId: string | null }) => item.cinemaId === HN01)).toBe(true);
    });

    it("Manager tra cứu audit log của rạp khác -> 403 (FORBIDDEN_CINEMA)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/audit-logs?cinemaId=${HN02}`)
        .set("Authorization", `Bearer ${managerHn01Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });
  });

  // ── 4. Voucher CRUD (R-90) ────────────────────────────────────────────────

  describe("Vouchers CRUD (R-90)", () => {
    it("Manager xem được danh sách và chi tiết voucher", async () => {
      const resList = await request(app.getHttpServer())
        .get("/admin/vouchers")
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resList.status).toBe(200);
      expect(resList.body.items.length).toBeGreaterThanOrEqual(1);

      const resDetail = await request(app.getHttpServer())
        .get(`/admin/vouchers/${VOUCHER_1}`)
        .set("Authorization", `Bearer ${managerHn01Token}`);
      expect(resDetail.status).toBe(200);
      expect(resDetail.body.code).toBe("SALE50");
    });

    it("Manager tạo voucher -> 403 Forbidden", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/vouchers")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({
          code: "MGRNEW",
          discountType: "FIXED",
          discountValue: 30000,
        });

      expect(res.status).toBe(403);
    });

    it("Manager sửa voucher -> 403 Forbidden", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/vouchers/${VOUCHER_1}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ discountValue: 60 });

      expect(res.status).toBe(403);
    });

    it("Manager xoá voucher -> 403 Forbidden", async () => {
      const res = await request(app.getHttpServer())
        .delete(`/admin/vouchers/${VOUCHER_1}`)
        .set("Authorization", `Bearer ${managerHn01Token}`);

      expect(res.status).toBe(403);
    });

    it("Admin tạo voucher mới thành công -> 201 Created", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/vouchers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "SUMMER100",
          discountType: "FIXED",
          discountValue: 100000,
          appliesTo: "ORDER",
          minOrderAmount: 200000,
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe("SUMMER100");
      expect(res.body.discountType).toBe("FIXED");
      expect(res.body.discountValue).toBe(100000);
    });

    it("Admin tạo voucher trùng code -> 409 Conflict", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/vouchers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "SALE50",
          discountType: "PERCENT",
          discountValue: 20,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("Admin tạo voucher phần trăm > 100 -> 400 Validation Error", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/vouchers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "OVER100",
          discountType: "PERCENT",
          discountValue: 150,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Admin cập nhật voucher -> 200 OK", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/vouchers/${VOUCHER_1}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ discountValue: 40 });

      expect(res.status).toBe(200);
      expect(res.body.discountValue).toBe(40);
    });

    it("Admin xoá voucher -> 200 OK", async () => {
      const res = await request(app.getHttpServer())
        .delete(`/admin/vouchers/${VOUCHER_1}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(fakeDb.tables.vouchers?.find((v) => v.id === VOUCHER_1)).toBeUndefined();
    });
  });
});
