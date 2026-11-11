import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccessService } from "../src/common/auth/access.service";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { PricingController } from "../src/modules/pricing/pricing.controller";
import { PricingService } from "../src/modules/pricing/pricing.service";

// ── Dữ liệu cố định ─────────────────────────────────────────────────────────
const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://test.supabase.co";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const HN01 = uuid(1);
const HN02 = uuid(2);
const ROOM_HN01 = uuid(11);
const ROOM_HN02 = uuid(12);

const ADMIN = uuid(31);
const MANAGER_HN01 = uuid(32);
const MANAGER_HN02 = uuid(33);
const STAFF_HN01 = uuid(34);

// 2026-12-05 là Thứ 7 (WEEKEND)
// VN = UTC + 7 -> 19:00 VN = 12:00 UTC
// 16:59 VN = 09:59 UTC
// 17:00 VN = 10:00 UTC
const SHOWTIME_HN01_SAT_1900 = uuid(101);
const SHOWTIME_HN02_SAT_1900 = uuid(102);
const SHOWTIME_HN01_SAT_1659 = uuid(103);
const SHOWTIME_HN01_SAT_1700 = uuid(104);

const SEAT_VIP_1 = uuid(201);
const SEAT_SWEETBOX_1 = uuid(202);

type Row = Record<string, unknown>;
interface Failure {
  code: string;
  message: string;
}
interface Result {
  data: unknown;
  error: Failure | null;
}

class FakeDb {
  tables: Record<string, Row[]> = {};
  private nextId = 1000;

  reset() {
    this.nextId = 1000;
    this.tables = {
      user_roles: [{ user_id: ADMIN, role: "ADMIN" }],
      staff_assignments: [
        { user_id: MANAGER_HN01, cinema_id: HN01, role: "MANAGER" },
        { user_id: MANAGER_HN02, cinema_id: HN02, role: "MANAGER" },
        { user_id: STAFF_HN01, cinema_id: HN01, role: "STAFF" },
      ],
      cinemas: [
        { id: HN01, name: "FilmBooking Hà Nội 01" },
        { id: HN02, name: "FilmBooking Hà Nội 02" },
      ],
      showtimes: [
        {
          id: SHOWTIME_HN01_SAT_1900,
          cinema_id: HN01,
          room_id: ROOM_HN01,
          format: "2D",
          starts_at: "2026-12-05T12:00:00Z", // 19:00 VN Thứ 7
        },
        {
          id: SHOWTIME_HN02_SAT_1900,
          cinema_id: HN02,
          room_id: ROOM_HN02,
          format: "2D",
          starts_at: "2026-12-05T12:00:00Z", // 19:00 VN Thứ 7
        },
        {
          id: SHOWTIME_HN01_SAT_1659,
          cinema_id: HN01,
          room_id: ROOM_HN01,
          format: "2D",
          starts_at: "2026-12-05T09:59:00Z", // 16:59 VN Thứ 7
        },
        {
          id: SHOWTIME_HN01_SAT_1700,
          cinema_id: HN01,
          room_id: ROOM_HN01,
          format: "2D",
          starts_at: "2026-12-05T10:00:00Z", // 17:00 VN Thứ 7
        },
      ],
      seats: [
        { id: SEAT_VIP_1, room_id: ROOM_HN01, seat_type: "VIP" },
        { id: SEAT_SWEETBOX_1, room_id: ROOM_HN01, seat_type: "SWEETBOX" },
      ],
      holidays: [],
      price_rules: [],
    };
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    if (fn === "price_quote") {
      const showtimeId = args.p_showtime_id as string;
      const seatIds = args.p_seat_ids as string[];
      const st = (this.tables.showtimes ?? []).find((s) => s.id === showtimeId);
      if (!st) return Promise.resolve({ data: null, error: { code: "23503", message: "Suất chiếu không tồn tại" } });

      const quoted = seatIds.map((seatId) => {
        const seat = (this.tables.seats ?? []).find((s) => s.id === seatId);
        const seatType = (seat?.seat_type as string) ?? "NORMAL";
        const rule = (this.tables.price_rules ?? []).find((r) => r.seat_type === seatType);
        return {
          seat_id: seatId,
          seat_type: seatType,
          seat_count: seatType === "SWEETBOX" ? 2 : 1,
          amount: (rule?.amount as number) ?? 100000,
        };
      });
      return Promise.resolve({ data: quoted, error: null });
    }
    return Promise.resolve({ data: null, error: { code: "PGRST202", message: "function not found" } });
  }

  newId() {
    this.nextId += 1;
    return uuid(this.nextId);
  }

  beforeWrite(table: string, row: Row): Failure | null {
    if (table === "holidays") {
      const exists = (this.tables.holidays ?? []).some((h) => h.holiday_date === row.holiday_date);
      if (exists) return { code: "23505", message: "duplicate holiday_date" };
    }
    if (table === "price_rules") {
      if (row.scope === "CHAIN") {
        const exists = (this.tables.price_rules ?? []).some(
          (r) =>
            r.scope === "CHAIN" &&
            r.seat_type === row.seat_type &&
            r.format === row.format &&
            r.day_type === row.day_type &&
            r.time_band === row.time_band,
        );
        if (exists) return { code: "23505", message: "duplicate chain rule" };
      }
      if (row.scope === "CINEMA") {
        const exists = (this.tables.price_rules ?? []).some(
          (r) =>
            r.scope === "CINEMA" &&
            r.cinema_id === row.cinema_id &&
            r.seat_type === row.seat_type &&
            r.format === row.format &&
            r.day_type === row.day_type &&
            r.time_band === row.time_band,
        );
        if (exists) return { code: "23505", message: "duplicate cinema rule" };
      }
      if (row.scope === "SHOWTIME") {
        const exists = (this.tables.price_rules ?? []).some(
          (r) => r.scope === "SHOWTIME" && r.showtime_id === row.showtime_id && r.seat_type === row.seat_type,
        );
        if (exists) return { code: "23505", message: "duplicate showtime rule" };
      }
    }
    return null;
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private mode: "many" | "one" | "maybe" = "many";

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select() {
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
    this.filters.push((row) => row[key] === value);
    return this;
  }
  order(key: string, options?: { ascending?: boolean }) {
    this.orderKey = key;
    this.orderAsc = options?.ascending ?? true;
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

  private matching(): Row[] {
    const rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)));
    if (this.orderKey) {
      const k = this.orderKey;
      const asc = this.orderAsc;
      rows.sort((a, b) => (asc ? (String(a[k]) > String(b[k]) ? 1 : -1) : String(a[k]) < String(b[k]) ? 1 : -1));
    }
    return rows;
  }

  private shape(rows: Row[]): Result {
    if (this.mode === "many") return { data: rows.map((r) => ({ ...r })), error: null };
    if (this.mode === "one") {
      if (rows.length !== 1) return { data: null, error: { code: "PGRST116", message: "no rows or multiple rows" } };
      return { data: { ...rows[0] }, error: null };
    }
    return { data: rows[0] ? { ...rows[0] } : null, error: null };
  }

  private execute(): Result {
    const store = (this.db.tables[this.table] ??= []);
    if (this.op === "select") return this.shape(this.matching());

    if (this.op === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: this.db.newId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...row,
      }));
      for (const row of incoming) {
        const failure = this.db.beforeWrite(this.table, row);
        if (failure) return { data: null, error: failure };
      }
      store.push(...incoming);
      return this.shape(incoming);
    }

    const targets = this.matching();
    if (this.op === "update") {
      for (const row of targets) {
        Object.assign(row, this.payload);
      }
      return this.shape(targets);
    }

    if (this.op === "delete") {
      this.db.tables[this.table] = store.filter((row) => !targets.includes(row));
      return { data: targets, error: null };
    }

    return { data: null, error: null };
  }
}

// ── Test harness ────────────────────────────────────────────────────────────
const fakeDb = new FakeDb();
const fakeSupabase = {
  forUser: () => fakeDb,
  admin: () => fakeDb,
};

const sign = (sub: string) =>
  new SignJWT({ email: `${sub}@filmbooking.vn` })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));

describe("Pricing API (Task 08: Bảng giá, ngày lễ, AC-15)", () => {
  let app: INestApplication;
  let adminToken: string;
  let managerHn01Token: string;
  let managerHn02Token: string;
  let staffHn01Token: string;

  beforeAll(async () => {
    adminToken = await sign(ADMIN);
    managerHn01Token = await sign(MANAGER_HN01);
    managerHn02Token = await sign(MANAGER_HN02);
    staffHn01Token = await sign(STAFF_HN01);

    const moduleRef = await Test.createTestingModule({
      controllers: [PricingController],
      providers: [
        { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL } as Env },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        PricingService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    fakeDb.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // 1. Phân quyền CRUD Holidays
  // ==========================================================================
  describe("Holidays (R-53)", () => {
    it("Khách / Người dùng xem danh sách ngày lễ công khai (200)", async () => {
      fakeDb.tables.holidays = [
        { holiday_date: "2026-01-01", name: "Tết Dương Lịch", created_at: "2026-01-01T00:00:00Z" },
        { holiday_date: "2026-04-30", name: "Giải phóng miền Nam", created_at: "2026-01-01T00:00:00Z" },
      ];

      const res = await request(app.getHttpServer()).get("/holidays").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].holidayDate).toBe("2026-01-01");
      expect(res.body[0].name).toBe("Tết Dương Lịch");
    });

    it("Admin tạo ngày lễ thành công (201)", async () => {
      const res = await request(app.getHttpServer())
        .post("/holidays")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ holidayDate: "2026-09-02", name: "Quốc khánh" })
        .expect(201);

      expect(res.body.holidayDate).toBe("2026-09-02");
      expect(res.body.name).toBe("Quốc khánh");
      expect(fakeDb.tables.holidays).toHaveLength(1);
    });

    it("Manager tạo ngày lễ bị chặn 403 FORBIDDEN", async () => {
      const res = await request(app.getHttpServer())
        .post("/holidays")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ holidayDate: "2026-09-02", name: "Quốc khánh" })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Admin tạo ngày lễ trùng lặp báo 409 CONFLICT", async () => {
      fakeDb.tables.holidays = [{ holiday_date: "2026-09-02", name: "Quốc khánh", created_at: "2026-01-01T00:00:00Z" }];

      const res = await request(app.getHttpServer())
        .post("/holidays")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ holidayDate: "2026-09-02", name: "Quốc khánh mới" })
        .expect(409);

      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("Admin xoá ngày lễ thành công (200), không tìm thấy báo 404 NOT_FOUND", async () => {
      fakeDb.tables.holidays = [{ holiday_date: "2026-09-02", name: "Quốc khánh", created_at: "2026-01-01T00:00:00Z" }];

      await request(app.getHttpServer())
        .delete("/holidays/2026-09-02")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(fakeDb.tables.holidays).toHaveLength(0);

      // Xoá lại -> 404
      const res404 = await request(app.getHttpServer())
        .delete("/holidays/2026-09-02")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
      expect(res404.body.error.code).toBe("NOT_FOUND");
    });

    it("Manager xoá ngày lễ bị chặn 403 FORBIDDEN", async () => {
      fakeDb.tables.holidays = [{ holiday_date: "2026-09-02", name: "Quốc khánh", created_at: "2026-01-01T00:00:00Z" }];

      const res = await request(app.getHttpServer())
        .delete("/holidays/2026-09-02")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================================================
  // 2. Phân quyền & Quản lý Price Rules (R-52)
  // ==========================================================================
  describe("Price Rules Scope & Access Control", () => {
    it("Manager tạo rule scope CHAIN bị chặn 403 FORBIDDEN", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({
          scope: "CHAIN",
          seatType: "VIP",
          format: "2D",
          dayType: "WEEKEND",
          timeBand: "AFTER_17",
          amount: 120000,
        })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Admin tạo rule scope CHAIN thành công (201)", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          scope: "CHAIN",
          seatType: "VIP",
          format: "2D",
          dayType: "WEEKEND",
          timeBand: "AFTER_17",
          amount: 120000,
        })
        .expect(201);

      expect(res.body.scope).toBe("CHAIN");
      expect(res.body.amount).toBe(120000);
      expect(res.body.cinemaId).toBeNull();
    });

    it("Manager HN01 tạo rule CINEMA cho HN02 bị chặn 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({
          scope: "CINEMA",
          cinemaId: HN02,
          seatType: "VIP",
          format: "2D",
          dayType: "WEEKEND",
          timeBand: "AFTER_17",
          amount: 100000,
        })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 tạo rule CINEMA cho HN01 thành công (201)", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({
          scope: "CINEMA",
          cinemaId: HN01,
          seatType: "VIP",
          format: "2D",
          dayType: "WEEKEND",
          timeBand: "AFTER_17",
          amount: 110000,
        })
        .expect(201);

      expect(res.body.scope).toBe("CINEMA");
      expect(res.body.cinemaId).toBe(HN01);
      expect(res.body.amount).toBe(110000);
    });

    it("Staff tạo rule bị chặn 403 FORBIDDEN (chỉ Manager/Admin)", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .send({
          scope: "CINEMA",
          cinemaId: HN01,
          seatType: "VIP",
          format: "2D",
          dayType: "WEEKEND",
          timeBand: "AFTER_17",
          amount: 110000,
        })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Manager HN01 tạo rule SHOWTIME cho suất của HN02 bị chặn 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({
          scope: "SHOWTIME",
          showtimeId: SHOWTIME_HN02_SAT_1900,
          seatType: "VIP",
          amount: 95000,
        })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 tạo rule SHOWTIME cho suất của HN01 thành công (201)", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({
          scope: "SHOWTIME",
          showtimeId: SHOWTIME_HN01_SAT_1900,
          seatType: "VIP",
          amount: 95000,
        })
        .expect(201);

      expect(res.body.scope).toBe("SHOWTIME");
      expect(res.body.showtimeId).toBe(SHOWTIME_HN01_SAT_1900);
      expect(res.body.cinemaId).toBe(HN01);
      expect(res.body.amount).toBe(95000);
    });

    it("Manager sửa/xoá rule CHAIN bị chặn 403 FORBIDDEN", async () => {
      const ruleChainId = uuid(501);
      fakeDb.tables.price_rules = [
        {
          id: ruleChainId,
          scope: "CHAIN",
          cinema_id: null,
          showtime_id: null,
          seat_type: "VIP",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 120000,
        },
      ];

      // Sửa
      const patchRes = await request(app.getHttpServer())
        .patch(`/price-rules/${ruleChainId}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ amount: 130000 })
        .expect(403);
      expect(patchRes.body.error.code).toBe("FORBIDDEN");

      // Xoá
      const delRes = await request(app.getHttpServer())
        .delete(`/price-rules/${ruleChainId}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);
      expect(delRes.body.error.code).toBe("FORBIDDEN");
    });

    it("Manager HN01 sửa/xoá rule CINEMA của HN02 bị chặn 403 FORBIDDEN_CINEMA", async () => {
      const ruleHn02Id = uuid(502);
      fakeDb.tables.price_rules = [
        {
          id: ruleHn02Id,
          scope: "CINEMA",
          cinema_id: HN02,
          showtime_id: null,
          seat_type: "VIP",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 100000,
        },
      ];

      // Sửa
      const patchRes = await request(app.getHttpServer())
        .patch(`/price-rules/${ruleHn02Id}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ amount: 105000 })
        .expect(403);
      expect(patchRes.body.error.code).toBe("FORBIDDEN_CINEMA");

      // Manager HN02 sửa rule của HN02 thành công (200)
      const patchHn02Res = await request(app.getHttpServer())
        .patch(`/price-rules/${ruleHn02Id}`)
        .set("Authorization", `Bearer ${managerHn02Token}`)
        .send({ amount: 105000 })
        .expect(200);
      expect(patchHn02Res.body.amount).toBe(105000);

      // Xoá (Manager HN01 bị chặn)
      const delRes = await request(app.getHttpServer())
        .delete(`/price-rules/${ruleHn02Id}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);
      expect(delRes.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 sửa và xoá rule CINEMA của HN01 thành công (200)", async () => {
      const ruleHn01Id = uuid(503);
      fakeDb.tables.price_rules = [
        {
          id: ruleHn01Id,
          scope: "CINEMA",
          cinema_id: HN01,
          showtime_id: null,
          seat_type: "VIP",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 110000,
        },
      ];

      // Sửa
      const patchRes = await request(app.getHttpServer())
        .patch(`/price-rules/${ruleHn01Id}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ amount: 115000 })
        .expect(200);
      expect(patchRes.body.amount).toBe(115000);

      // Xoá
      await request(app.getHttpServer())
        .delete(`/price-rules/${ruleHn01Id}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(200);
      expect(fakeDb.tables.price_rules).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 3. Validation giá âm / không nguyên → 422
  // ==========================================================================
  describe("Price Validation (Giá âm/không nguyên → 422)", () => {
    it("Tạo rule với giá âm (-1000) trả về 422 VALIDATION_ERROR", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          scope: "CHAIN",
          seatType: "VIP",
          format: "2D",
          dayType: "WEEKEND",
          timeBand: "AFTER_17",
          amount: -1000,
        })
        .expect(422);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Tạo rule với giá không phải số nguyên (99.5) trả về 422 VALIDATION_ERROR", async () => {
      const res = await request(app.getHttpServer())
        .post("/price-rules")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          scope: "CHAIN",
          seatType: "VIP",
          format: "2D",
          dayType: "WEEKEND",
          timeBand: "AFTER_17",
          amount: 99.5,
        })
        .expect(422);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Cập nhật rule (PATCH) với giá âm (-500) trả về 422 VALIDATION_ERROR", async () => {
      const ruleId = uuid(601);
      fakeDb.tables.price_rules = [
        {
          id: ruleId,
          scope: "CHAIN",
          seat_type: "VIP",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 120000,
        },
      ];

      const res = await request(app.getHttpServer())
        .patch(`/price-rules/${ruleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ amount: -500 })
        .expect(422);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Cập nhật rule (PATCH) với số thập phân (120000.75) trả về 422 VALIDATION_ERROR", async () => {
      const ruleId = uuid(602);
      fakeDb.tables.price_rules = [
        {
          id: ruleId,
          scope: "CHAIN",
          seat_type: "VIP",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 120000,
        },
      ];

      const res = await request(app.getHttpServer())
        .patch(`/price-rules/${ruleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ amount: 120000.75 })
        .expect(422);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================================================
  // 4. Báo giá suất chiếu & AC-15
  // ==========================================================================
  describe("Báo giá suất chiếu GET /showtimes/:showtimeId/prices (AC-15)", () => {
    beforeEach(() => {
      // Thiết lập bảng giá mặc định chuỗi (CHAIN) 2D Thứ 7 tối (WEEKEND + AFTER_17):
      // VIP = 120.000, NORMAL = 90.000, SWEETBOX = 200.000
      fakeDb.tables.price_rules = [
        {
          id: uuid(701),
          scope: "CHAIN",
          cinema_id: null,
          showtime_id: null,
          seat_type: "NORMAL",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 90000,
        },
        {
          id: uuid(702),
          scope: "CHAIN",
          cinema_id: null,
          showtime_id: null,
          seat_type: "VIP",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 120000,
        },
        {
          id: uuid(703),
          scope: "CHAIN",
          cinema_id: null,
          showtime_id: null,
          seat_type: "SWEETBOX",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 200000,
        },
        // Ghi đè rạp HN02: VIP = 100.000
        {
          id: uuid(704),
          scope: "CINEMA",
          cinema_id: HN02,
          showtime_id: null,
          seat_type: "VIP",
          format: "2D",
          day_type: "WEEKEND",
          time_band: "AFTER_17",
          amount: 100000,
        },
      ];
    });

    it("AC-15 qua API: Báo giá VIP suất 2D Thứ 7 tối tại HN02 = 100.000, HN01 = 120.000", async () => {
      // 1. Suất tại HN02 (có override CINEMA)
      const resHn02 = await request(app.getHttpServer())
        .get(`/showtimes/${SHOWTIME_HN02_SAT_1900}/prices`)
        .expect(200);

      expect(resHn02.body.cinemaId).toBe(HN02);
      expect(resHn02.body.dayType).toBe("WEEKEND");
      expect(resHn02.body.timeBand).toBe("AFTER_17");
      expect(resHn02.body.bySeatType.VIP).toBe(100000); // Override rạp HN02
      expect(resHn02.body.bySeatType.NORMAL).toBe(90000); // Lấy từ CHAIN
      expect(resHn02.body.bySeatType.SWEETBOX).toBe(200000); // Lấy từ CHAIN

      // 2. Suất tại HN01 (không có override CINEMA -> lấy CHAIN)
      const resHn01 = await request(app.getHttpServer())
        .get(`/showtimes/${SHOWTIME_HN01_SAT_1900}/prices`)
        .expect(200);

      expect(resHn01.body.cinemaId).toBe(HN01);
      expect(resHn01.body.dayType).toBe("WEEKEND");
      expect(resHn01.body.timeBand).toBe("AFTER_17");
      expect(resHn01.body.bySeatType.VIP).toBe(120000); // CHAIN
      expect(resHn01.body.bySeatType.NORMAL).toBe(90000); // CHAIN
      expect(resHn01.body.bySeatType.SWEETBOX).toBe(200000); // CHAIN
    });

    it("Ghi đè SHOWTIME ưu tiên hơn CINEMA", async () => {
      // Thêm rule SHOWTIME cho suất tại HN02: VIP = 95.000
      (fakeDb.tables.price_rules ??= []).push({
        id: uuid(705),
        scope: "SHOWTIME",
        cinema_id: HN02,
        showtime_id: SHOWTIME_HN02_SAT_1900,
        seat_type: "VIP",
        format: null,
        day_type: null,
        time_band: null,
        amount: 95000,
      });

      const res = await request(app.getHttpServer())
        .get(`/showtimes/${SHOWTIME_HN02_SAT_1900}/prices`)
        .expect(200);

      // Ưu tiên SHOWTIME (95.000) > CINEMA (100.000) > CHAIN (120.000)
      expect(res.body.bySeatType.VIP).toBe(95000);
    });

    it("Ngày lễ ưu tiên hơn cuối tuần (HOLIDAY > WEEKEND)", async () => {
      // 2026-12-05 là Thứ 7. Nếu thêm vào danh sách holidays -> dayType = HOLIDAY
      (fakeDb.tables.holidays ??= []).push({
        holiday_date: "2026-12-05",
        name: "Lễ đặc biệt",
        created_at: "2026-01-01T00:00:00Z",
      });

      // Thêm rule CHAIN cho ngày lễ: VIP = 150.000
      (fakeDb.tables.price_rules ??= []).push({
        id: uuid(706),
        scope: "CHAIN",
        cinema_id: null,
        showtime_id: null,
        seat_type: "VIP",
        format: "2D",
        day_type: "HOLIDAY",
        time_band: "AFTER_17",
        amount: 150000,
      });

      const res = await request(app.getHttpServer())
        .get(`/showtimes/${SHOWTIME_HN01_SAT_1900}/prices`)
        .expect(200);

      expect(res.body.dayType).toBe("HOLIDAY");
      expect(res.body.bySeatType.VIP).toBe(150000);
    });

    it("Khung giờ: 16:59 là BEFORE_17 vs 17:00 là AFTER_17", async () => {
      // Thêm rule CHAIN BEFORE_17: VIP = 110.000
      (fakeDb.tables.price_rules ??= []).push({
        id: uuid(707),
        scope: "CHAIN",
        cinema_id: null,
        showtime_id: null,
        seat_type: "VIP",
        format: "2D",
        day_type: "WEEKEND",
        time_band: "BEFORE_17",
        amount: 110000,
      });

      // 1. Suất 16:59 VN
      const res1659 = await request(app.getHttpServer())
        .get(`/showtimes/${SHOWTIME_HN01_SAT_1659}/prices`)
        .expect(200);
      expect(res1659.body.timeBand).toBe("BEFORE_17");
      expect(res1659.body.bySeatType.VIP).toBe(110000);

      // 2. Suất 17:00 VN
      const res1700 = await request(app.getHttpServer())
        .get(`/showtimes/${SHOWTIME_HN01_SAT_1700}/prices`)
        .expect(200);
      expect(res1700.body.timeBand).toBe("AFTER_17");
      expect(res1700.body.bySeatType.VIP).toBe(120000);
    });

    it("Báo giá danh sách ghế qua POST /showtimes/:showtimeId/price-quote", async () => {
      const res = await request(app.getHttpServer())
        .post(`/showtimes/${SHOWTIME_HN01_SAT_1900}/price-quote`)
        .send({ seatIds: [SEAT_VIP_1, SEAT_SWEETBOX_1] })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].seatId).toBe(SEAT_VIP_1);
      expect(res.body[0].seatCount).toBe(1);
      expect(res.body[1].seatId).toBe(SEAT_SWEETBOX_1);
      expect(res.body[1].seatCount).toBe(2); // Sweetbox tính 2 ghế
    });
  });
});
