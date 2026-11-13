import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccessService } from "../src/common/auth/access.service";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { CinemaScopeGuard } from "../src/common/auth/cinema-scope.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { CancellationController } from "../src/modules/cancellation/cancellation.controller";
import { CancellationService } from "../src/modules/cancellation/cancellation.service";

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
const STAFF_HN02 = uuid(35);

const SHOWTIME_HN01 = uuid(101);
const SHOWTIME_HN01_EMPTY = uuid(102);
const SHOWTIME_HN02 = uuid(103);

type Row = Record<string, unknown>;
interface Failure {
  code: string;
  message: string;
  details?: unknown;
}
interface Result {
  data: unknown;
  error: Failure | null;
  count?: number;
}

interface FakeTables {
  user_roles: Row[];
  staff_assignments: Row[];
  cinemas: Row[];
  rooms: Row[];
  showtimes: Row[];
  orders: Row[];
  order_seats: Row[];
  affected_order_cases: Row[];
  affected_order_actions: Row[];
  email_outbox: Row[];
  [key: string]: Row[];
}

class FakeDb {
  tables: FakeTables = {
    user_roles: [],
    staff_assignments: [],
    cinemas: [],
    rooms: [],
    showtimes: [],
    orders: [],
    order_seats: [],
    affected_order_cases: [],
    affected_order_actions: [],
    email_outbox: [],
  };
  private nextId = 1000;

  reset() {
    this.nextId = 1000;
    this.tables = {
      user_roles: [{ user_id: ADMIN, role: "ADMIN" }],
      staff_assignments: [
        { user_id: MANAGER_HN01, cinema_id: HN01, role: "MANAGER" },
        { user_id: MANAGER_HN02, cinema_id: HN02, role: "MANAGER" },
        { user_id: STAFF_HN01, cinema_id: HN01, role: "STAFF" },
        { user_id: STAFF_HN02, cinema_id: HN02, role: "STAFF" },
      ],
      cinemas: [
        { id: HN01, code: "HN01", name: "FilmBooking Hà Nội 01", status: "OPEN" },
        { id: HN02, code: "HN02", name: "FilmBooking Hà Nội 02", status: "OPEN" },
      ],
      rooms: [
        { id: ROOM_HN01, cinema_id: HN01, name: "Phòng 1" },
        { id: ROOM_HN02, cinema_id: HN02, name: "Phòng 1" },
      ],
      showtimes: [
        {
          id: SHOWTIME_HN01,
          cinema_id: HN01,
          room_id: ROOM_HN01,
          status: "OPEN",
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 93600000).toISOString(),
        },
        {
          id: SHOWTIME_HN01_EMPTY,
          cinema_id: HN01,
          room_id: ROOM_HN01,
          status: "OPEN",
          starts_at: new Date(Date.now() + 172800000).toISOString(),
          ends_at: new Date(Date.now() + 180000000).toISOString(),
        },
        {
          id: SHOWTIME_HN02,
          cinema_id: HN02,
          room_id: ROOM_HN02,
          status: "OPEN",
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 93600000).toISOString(),
        },
      ],
      orders: [],
      order_seats: [],
      affected_order_cases: [],
      affected_order_actions: [],
      email_outbox: [],
    };
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    if (fn === "preview_cancel_showtimes") {
      const showtimeIds = (args.p_showtime_ids as string[]) ?? [];
      const orders = (this.tables.orders ?? []).filter(
        (o) => showtimeIds.includes(o.showtime_id as string) && ["paid", "checked_in"].includes(o.status as string),
      );
      const totalAmount = orders.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
      return Promise.resolve({
        data: {
          showtimes_count: showtimeIds.length,
          paid_orders_count: orders.length,
          web_paid_orders_count: orders.length,
          pos_paid_orders_count: 0,
          holding_orders_count: 0,
          sold_seats_count: orders.length,
          held_seats_count: 0,
          total_refund_amount: totalAmount,
        },
        error: null,
      });
    }

    if (fn === "cancel_showtimes") {
      const showtimeIds = (args.p_showtime_ids as string[]) ?? [];
      const reason = args.p_reason as string;
      const actorId = args.p_actor_id as string;

      if (!reason || reason.trim().length === 0) {
        return Promise.resolve({
          data: null,
          error: { code: "P0001", message: "CANCEL_REASON_REQUIRED: Lý do huỷ suất không được để trống" },
        });
      }

      // Đổi trạng thái showtimes
      for (const st of this.tables.showtimes ?? []) {
        if (showtimeIds.includes(st.id as string)) {
          st.status = "CANCELLED";
          st.cancel_reason = reason;
          st.cancelled_at = new Date().toISOString();
          st.cancelled_by = actorId;
        }
      }

      // Đổi trạng thái orders
      const affectedOrders = (this.tables.orders ?? []).filter(
        (o) => showtimeIds.includes(o.showtime_id as string) && ["paid", "checked_in"].includes(o.status as string),
      );

      for (const o of affectedOrders) {
        o.status = "affected";
        o.cancel_reason = reason;
        o.cancelled_at = new Date().toISOString();

        // Thêm vào affected_order_cases
        this.tables.affected_order_cases.push({
          id: this.newId(),
          order_id: o.id,
          showtime_id: o.showtime_id,
          cinema_id: o.cinema_id,
          reason,
          email_sent: true,
          created_at: new Date().toISOString(),
        });

        // Enqueue email
        if (o.contact_email) {
          this.tables.email_outbox.push({
            id: this.newId(),
            kind: "showtime_cancelled",
            to_email: o.contact_email,
            payload: {
              order_id: o.id,
              booking_code: o.booking_code,
              cinema_id: o.cinema_id,
              reason,
            },
            cinema_id: o.cinema_id,
            status: "PENDING",
            attempts: 0,
            created_at: new Date().toISOString(),
          });
        }
      }

      return Promise.resolve({
        data: {
          success: true,
          cancelled_showtimes_count: showtimeIds.length,
          affected_orders_count: affectedOrders.length,
          cancelled_holds_count: 0,
          cancelled_orders_count: 0,
          emails_enqueued_count: affectedOrders.length,
        },
        error: null,
      });
    }

    if (fn === "set_cinema_status") {
      const cinemaId = args.p_cinema_id as string;
      const status = args.p_status as string;

      const cinema = (this.tables.cinemas ?? []).find((c) => c.id === cinemaId);
      if (!cinema) {
        return Promise.resolve({
          data: null,
          error: { code: "P0002", message: "CINEMA_NOT_FOUND: Rạp không tồn tại" },
        });
      }

      if (["TEMP_CLOSED", "CLOSED"].includes(status)) {
        // Kiểm tra suất tương lai đã bán vé
        const soldShowtimes = (this.tables.showtimes ?? [])
          .filter(
            (st) =>
              st.cinema_id === cinemaId &&
              st.status !== "CANCELLED" &&
              (this.tables.orders ?? []).some(
                (o) => o.showtime_id === st.id && ["paid", "checked_in"].includes(o.status as string),
              ),
          )
          .map((st) => st.id as string);

        if (soldShowtimes.length > 0) {
          return Promise.resolve({
            data: null,
            error: {
              code: "23514",
              message: `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES: Rạp còn ${soldShowtimes.length} suất chiếu tương lai đã bán vé (${soldShowtimes.join(", ")})`,
              details: JSON.stringify(soldShowtimes),
            },
          });
        }
      }

      cinema.status = status;
      return Promise.resolve({
        data: { success: true, cinema_id: cinemaId, status },
        error: null,
      });
    }

    return Promise.resolve({ data: null, error: { code: "PGRST202", message: "function not found" } });
  }

  newId() {
    this.nextId += 1;
    return uuid(this.nextId);
  }
}

function getFieldVal(row: Row, key: string): unknown {
  if (key.includes("->>")) {
    const parts = key.split("->>");
    const col = parts[0] ?? "";
    const prop = parts[1] ?? "";
    const obj = row[col];
    const parsed = typeof obj === "string" ? JSON.parse(obj) : obj;
    return (parsed as Record<string, unknown> | null | undefined)?.[prop];
  }
  return row[key];
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private sliceRange: [number, number] | null = null;
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
    this.filters.push((row) => getFieldVal(row, key) === value);
    return this;
  }
  filter(key: string, op: string, value: unknown) {
    if (op === "eq") {
      this.filters.push((row) => getFieldVal(row, key) === value);
    }
    return this;
  }
  neq(key: string, value: unknown) {
    this.filters.push((row) => getFieldVal(row, key) !== value);
    return this;
  }
  gt(key: string, value: unknown) {
    this.filters.push((row) => String(getFieldVal(row, key)) > String(value));
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(getFieldVal(row, key)));
    return this;
  }
  order(key: string, options?: { ascending?: boolean }) {
    this.orderKey = key;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }
  range(from: number, to: number) {
    this.sliceRange = [from, to];
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

  then<A, B>(
    onFulfilled?: (value: Result) => A | PromiseLike<A>,
    onRejected?: (reason: unknown) => B | PromiseLike<B>,
  ) {
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

  private execute(): Result {
    const store = (this.db.tables[this.table] ??= []);
    if (this.op === "select") {
      const rows = this.matching();
      const count = rows.length;
      const sliced = this.sliceRange ? rows.slice(this.sliceRange[0], this.sliceRange[1] + 1) : rows;
      const shaped = this.shape(sliced);
      return { ...shaped, count };
    }

    if (this.op === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: this.db.newId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...row,
      }));
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

  private shape(rows: Row[]): Result {
    if (this.mode === "many") return { data: rows.map((r) => ({ ...r })), error: null };
    if (this.mode === "one") {
      if (rows.length !== 1) return { data: null, error: { code: "PGRST116", message: "no rows or multiple rows" } };
      return { data: { ...rows[0] }, error: null };
    }
    return { data: rows[0] ? { ...rows[0] } : null, error: null };
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

describe("Cancellation API (Task 08: Huỷ suất, đóng rạp, đơn bị ảnh hưởng)", () => {
  let app: INestApplication;
  let adminToken: string;
  let managerHn01Token: string;
  let managerHn02Token: string;
  let staffHn01Token: string;
  let staffHn02Token: string;

  beforeAll(async () => {
    adminToken = await sign(ADMIN);
    managerHn01Token = await sign(MANAGER_HN01);
    managerHn02Token = await sign(MANAGER_HN02);
    staffHn01Token = await sign(STAFF_HN01);
    staffHn02Token = await sign(STAFF_HN02);

    const moduleRef = await Test.createTestingModule({
      controllers: [CancellationController],
      providers: [
        { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL } as Env },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        CancellationService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: CinemaScopeGuard },
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

  const call = async (
    method: "get" | "post" | "patch" | "delete",
    path: string,
    token: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`);
    return body ? req.send(body) : req;
  };

  // ==========================================================================
  // 1. AC-24: Huỷ suất 10 đơn paid -> 10 affected, 10 email; GET danh sách
  // ==========================================================================
  describe("AC-24: Huỷ suất chiếu & đơn bị ảnh hưởng", () => {
    it("Preview xem trước ảnh hưởng của suất chiếu (201/200)", async () => {
      // Chuẩn bị 10 đơn paid cho SHOWTIME_HN01
      for (let i = 1; i <= 10; i++) {
        fakeDb.tables.orders.push({
          id: uuid(500 + i),
          cinema_id: HN01,
          showtime_id: SHOWTIME_HN01,
          booking_code: `HN01-${String(i).padStart(6, "0")}`,
          status: "paid",
          total_amount: 100000,
          contact_email: `customer${i}@example.com`,
          created_at: new Date().toISOString(),
        });
      }

      const res = await call("post", `/cinemas/${HN01}/showtimes/cancel/preview`, managerHn01Token, {
        showtimeIds: [SHOWTIME_HN01],
      });
      expect(res.status).toBe(201);
      expect(res.body.showtimesCount).toBe(1);
      expect(res.body.paidOrdersCount).toBe(10);
      expect(res.body.totalRefundAmount).toBe(1000000);
    });

    it("Huỷ suất 10 đơn paid -> 10 affected, 10 email outbox, GET danh sách thấy emailStatus=PENDING", async () => {
      for (let i = 1; i <= 10; i++) {
        fakeDb.tables.orders.push({
          id: uuid(500 + i),
          cinema_id: HN01,
          cinema_name: "FilmBooking Hà Nội 01",
          cinema_code: "HN01",
          showtime_id: SHOWTIME_HN01,
          movie_title: "Dune 2",
          room_name: "Phòng 1",
          showtime_starts_at: new Date(Date.now() + 86400000).toISOString(),
          booking_code: `HN01-${String(i).padStart(6, "0")}`,
          status: "paid",
          total_amount: 120000,
          contact_email: `customer${i}@example.com`,
          contact_phone: "0901234567",
          contact_name: `Khách hàng ${i}`,
          created_at: new Date().toISOString(),
        });
      }

      // Manager HN01 huỷ suất
      const cancelRes = await call("post", `/cinemas/${HN01}/showtimes/cancel`, managerHn01Token, {
        showtimeIds: [SHOWTIME_HN01],
        reason: "Sự cố mất điện kỹ thuật",
      });
      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.cancelledShowtimesCount).toBe(1);
      expect(cancelRes.body.affectedOrdersCount).toBe(10);
      expect(cancelRes.body.emailsEnqueuedCount).toBe(10);

      // Suất đã đổi sang CANCELLED
      const showtime = fakeDb.tables.showtimes.find((s) => s.id === SHOWTIME_HN01);
      expect(showtime?.status).toBe("CANCELLED");
      expect(showtime?.cancel_reason).toBe("Sự cố mất điện kỹ thuật");

      // Đơn hàng đã sang affected
      expect(fakeDb.tables.orders.every((o) => o.status === "affected")).toBe(true);

      // Email outbox có 10 bản ghi PENDING
      expect(fakeDb.tables.email_outbox).toHaveLength(10);
      expect(fakeDb.tables.email_outbox.every((e) => e.status === "PENDING")).toBe(true);

      // GET danh sách đơn bị ảnh hưởng hiển thị emailStatus: PENDING
      const listRes = await call(
        "get",
        `/admin/affected-orders?showtimeId=${SHOWTIME_HN01}`,
        staffHn01Token,
      );
      expect(listRes.status).toBe(200);
      expect(listRes.body.items).toHaveLength(10);
      expect(listRes.body.items[0].status).toBe("affected");
      expect(listRes.body.items[0].emailStatus).toBe("PENDING");
      expect(listRes.body.items[0].cinemaCode).toBe("HN01");
    });

    it("Huỷ suất yêu cầu lý do bắt buộc (không được để trống -> 400)", async () => {
      const res = await call("post", `/cinemas/${HN01}/showtimes/cancel`, managerHn01Token, {
        showtimeIds: [SHOWTIME_HN01],
        reason: "   ",
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Staff không có quyền huỷ suất -> 403", async () => {
      const res = await call("post", `/cinemas/${HN01}/showtimes/cancel`, staffHn01Token, {
        showtimeIds: [SHOWTIME_HN01],
        reason: "Huỷ suất",
      });
      expect(res.status).toBe(403);
    });

    it("Manager HN02 không được huỷ suất của HN01 -> 403", async () => {
      const res = await call("post", `/cinemas/${HN01}/showtimes/cancel`, managerHn02Token, {
        showtimeIds: [SHOWTIME_HN01],
        reason: "Huỷ suất",
      });
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 2. AC-25: Ghi nhận hoàn tiền thủ công
  // ==========================================================================
  describe("AC-25: Hoàn tiền thủ công", () => {
    const affectedOrderId = uuid(601);

    beforeEach(() => {
      fakeDb.tables.orders.push({
        id: affectedOrderId,
        cinema_id: HN01,
        cinema_name: "FilmBooking Hà Nội 01",
        cinema_code: "HN01",
        showtime_id: SHOWTIME_HN01,
        movie_title: "Avatar 2",
        room_name: "Phòng 1",
        showtime_starts_at: new Date(Date.now() + 86400000).toISOString(),
        booking_code: "HN01-AFF001",
        status: "affected",
        total_amount: 150000,
        contact_email: "khach1@gmail.com",
        created_at: new Date().toISOString(),
      });
    });

    it("Thiếu số tiền -> 422", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn01Token,
        {
          refundReference: "MBVCB123456",
        },
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Thiếu mã giao dịch ngân hàng -> 422", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn01Token,
        {
          refundedAmount: 150000,
        },
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Mã giao dịch chỉ toàn khoảng trắng -> 422", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn01Token,
        {
          refundedAmount: 150000,
          refundReference: "   ",
        },
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Số tiền âm -> 422", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn01Token,
        {
          refundedAmount: -1000,
          refundReference: "REF123",
        },
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Số tiền bằng 0 -> 422", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn01Token,
        {
          refundedAmount: 0,
          refundReference: "REF123",
        },
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Số tiền hoàn vượt quá tổng tiền đơn hàng (total_amount) -> 422", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn01Token,
        {
          refundedAmount: 200000, // total_amount là 150000
          refundReference: "REF123",
        },
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Đơn không ở trạng thái affected (vd: paid) -> 409 CONFLICT", async () => {
      const paidOrderId = uuid(602);
      fakeDb.tables.orders.push({
        id: paidOrderId,
        cinema_id: HN01,
        status: "paid",
        total_amount: 150000,
        booking_code: "HN01-PAID",
      });
      const res = await call(
        "post",
        `/admin/affected-orders/${paidOrderId}/refund`,
        staffHn01Token,
        {
          refundedAmount: 150000,
          refundReference: "REF123",
        },
      );
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("Staff HN02 ghi kết quả cho đơn HN01 -> 403", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn02Token,
        {
          refundedAmount: 150000,
          refundReference: "REF123456",
        },
      );
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Staff HN01 ghi đủ trường bắt buộc -> 201/200, đơn chuyển refunded_manual", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${affectedOrderId}/refund`,
        staffHn01Token,
        {
          refundedAmount: 150000,
          refundReference: "VCB-TX-998877",
          note: "Đã chuyển khoản hoàn tiền theo yêu cầu khách",
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe("refunded_manual");
      expect(res.body.refundedAmount).toBe(150000);
      expect(res.body.refundReference).toBe("VCB-TX-998877");

      // Đơn trong DB đã sang refunded_manual
      const order = fakeDb.tables.orders.find((o) => o.id === affectedOrderId);
      expect(order?.status).toBe("refunded_manual");

      // Action được ghi
      expect(fakeDb.tables.affected_order_actions).toHaveLength(1);
      expect(fakeDb.tables.affected_order_actions[0]?.action).toBe("REFUNDED_MANUAL");
      expect(fakeDb.tables.affected_order_actions[0]?.refund_reference).toBe("VCB-TX-998877");
    });

    it("Thao tác hoàn tiền lần 2 trên đơn đã hoàn -> 409 CONFLICT", async () => {
      // Lần 1: hoàn thành công
      await call("post", `/admin/affected-orders/${affectedOrderId}/refund`, staffHn01Token, {
        refundedAmount: 150000,
        refundReference: "REF-001",
      });

      // Lần 2: bị từ chối
      const res2 = await call("post", `/admin/affected-orders/${affectedOrderId}/refund`, staffHn01Token, {
        refundedAmount: 150000,
        refundReference: "REF-002",
      });
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe("CONFLICT");
    });
  });

  // ==========================================================================
  // 3. AC-26: Đóng rạp còn suất đã bán -> 409 kèm danh sách suất cần huỷ
  // ==========================================================================
  describe("AC-26: Đóng rạp & kiểm tra suất chiếu còn hiệu lực", () => {
    it("Đóng rạp còn suất tương lai đã bán vé -> 409 CONFLICT kèm danh sách suất cần huỷ", async () => {
      // Có đơn paid cho SHOWTIME_HN01
      fakeDb.tables.orders.push({
        id: uuid(701),
        cinema_id: HN01,
        showtime_id: SHOWTIME_HN01,
        status: "paid",
        total_amount: 100000,
      });

      const res = await call("patch", `/admin/cinemas/${HN01}/status`, adminToken, {
        status: "TEMP_CLOSED",
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.details.showtimeIds).toBeDefined();
      expect(res.body.error.details.showtimeIds).toContain(SHOWTIME_HN01);

      // Trạng thái rạp chưa bị đổi
      const cinema = fakeDb.tables.cinemas.find((c) => c.id === HN01);
      expect(cinema?.status).toBe("OPEN");
    });

    it("Đóng rạp khi không còn suất tương lai đã bán -> 200 OK", async () => {
      // Rạp HN02 không có đơn paid nào
      const res = await call("patch", `/admin/cinemas/${HN02}/status`, adminToken, {
        status: "TEMP_CLOSED",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe("TEMP_CLOSED");

      const cinema = fakeDb.tables.cinemas.find((c) => c.id === HN02);
      expect(cinema?.status).toBe("TEMP_CLOSED");
    });

    it("Manager / Staff không được đổi trạng thái rạp -> 403", async () => {
      const res = await call("patch", `/admin/cinemas/${HN01}/status`, managerHn01Token, {
        status: "TEMP_CLOSED",
      });
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 4. Gửi lại email thông báo đơn bị ảnh hưởng (R-109)
  // ==========================================================================
  describe("Gửi lại email đơn bị ảnh hưởng (R-109)", () => {
    const orderId = uuid(801);

    beforeEach(() => {
      fakeDb.tables.orders.push({
        id: orderId,
        cinema_id: HN01,
        status: "affected",
        contact_email: "test@example.com",
        booking_code: "HN01-RESEND",
        cancel_reason: "Lỗi suất",
      });
      fakeDb.tables.email_outbox.push({
        id: uuid(901),
        kind: "showtime_cancelled",
        to_email: "test@example.com",
        payload: { order_id: orderId },
        cinema_id: HN01,
        status: "FAILED",
        last_error: "SMTP timeout",
      });
    });

    it("Gửi lại email đặt trạng thái outbox về PENDING", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${orderId}/resend-email`,
        staffHn01Token,
      );
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe("PENDING");

      const outbox = fakeDb.tables.email_outbox.find((e) => e.id === uuid(901));
      expect(outbox?.status).toBe("PENDING");
      expect(outbox?.last_error).toBeNull();
    });

    it("Staff rạp khác không được gửi lại email -> 403", async () => {
      const res = await call(
        "post",
        `/admin/affected-orders/${orderId}/resend-email`,
        staffHn02Token,
      );
      expect(res.status).toBe(403);
    });

    it("Email đang PENDING -> 409 CONFLICT chặn gửi trùng", async () => {
      const outbox = fakeDb.tables.email_outbox.find((e) => e.id === uuid(901));
      if (outbox) outbox.status = "PENDING";

      const res = await call(
        "post",
        `/admin/affected-orders/${orderId}/resend-email`,
        staffHn01Token,
      );
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("Email đã SENT -> 409 CONFLICT chặn gửi trùng", async () => {
      const outbox = fakeDb.tables.email_outbox.find((e) => e.id === uuid(901));
      if (outbox) outbox.status = "SENT";

      const res = await call(
        "post",
        `/admin/affected-orders/${orderId}/resend-email`,
        staffHn01Token,
      );
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("Đơn chưa có email outbox -> tạo mới bản ghi với đầy đủ thông tin rạp/phim", async () => {
      const newOrderId = uuid(802);
      fakeDb.tables.orders.push({
        id: newOrderId,
        cinema_id: HN01,
        cinema_name: "FilmBooking Hà Nội 01",
        movie_title: "Avatar 2",
        room_name: "Phòng 1",
        showtime_starts_at: "2026-12-05T19:00:00Z",
        status: "affected",
        contact_email: "khachmoi@example.com",
        booking_code: "HN01-NEW",
        cancel_reason: "Bảo trì khẩn cấp",
      });

      const res = await call(
        "post",
        `/admin/affected-orders/${newOrderId}/resend-email`,
        staffHn01Token,
      );
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const created = fakeDb.tables.email_outbox.find(
        (e) => (e.payload as Record<string, unknown>)?.order_id === newOrderId,
      );
      expect(created).toBeDefined();
      expect(created?.status).toBe("PENDING");
      expect(created?.payload).toMatchObject({
        order_id: newOrderId,
        booking_code: "HN01-NEW",
        cinema_id: HN01,
        cinema_name: "FilmBooking Hà Nội 01",
        movie_title: "Avatar 2",
        room_name: "Phòng 1",
        showtime_starts_at: "2026-12-05T19:00:00Z",
        reason: "Bảo trì khẩn cấp",
      });
    });
  });

  // ==========================================================================
  // 5. Xuất CSV đơn bị ảnh hưởng
  // ==========================================================================
  describe("Xuất CSV đơn bị ảnh hưởng", () => {
    beforeEach(() => {
      fakeDb.tables.orders.push(
        {
          id: uuid(911),
          cinema_id: HN01,
          cinema_name: "FilmBooking Hà Nội 01",
          cinema_code: "HN01",
          showtime_id: SHOWTIME_HN01,
          movie_title: "Thám Tử Lừng Danh Conan",
          room_name: "Phòng VIP 1",
          showtime_starts_at: "2026-12-05T19:00:00Z",
          booking_code: "HN01-CSV01",
          status: "affected",
          total_amount: 180000,
          contact_name: "Nguyễn Văn A",
          contact_phone: "0912345678",
          contact_email: "nguyenvana@gmail.com",
          created_at: new Date().toISOString(),
        },
        {
          id: uuid(912),
          cinema_id: HN02,
          cinema_name: "FilmBooking Hà Nội 02",
          cinema_code: "HN02",
          showtime_id: SHOWTIME_HN02,
          movie_title: "Godzilla vs Kong",
          room_name: "Phòng 2",
          showtime_starts_at: "2026-12-05T20:00:00Z",
          booking_code: "HN02-CSV02",
          status: "refunded_manual",
          total_amount: 200000,
          contact_name: "Trần Thị B",
          contact_phone: "0987654321",
          contact_email: "tranthib@gmail.com",
          created_at: new Date().toISOString(),
        },
      );

      fakeDb.tables.order_seats.push({
        id: uuid(921),
        order_id: uuid(911),
        seat_label: "F8",
      });
    });

    it("CSV chứa UTF-8 BOM, tiêu đề tiếng Việt và chỉ dữ liệu của rạp HN01 với Staff HN01", async () => {
      const res = await call("get", "/admin/affected-orders/export", staffHn01Token);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("don-bi-anh-huong.csv");

      const text = res.text;
      // Kiểm tra UTF-8 BOM
      expect(text.charCodeAt(0)).toBe(0xfeff);

      // Kiểm tra tiêu đề tiếng Việt
      expect(text).toContain("Mã đặt vé");
      expect(text).toContain("Tên rạp");
      expect(text).toContain("Tên phim");
      expect(text).toContain("Tổng tiền (VNĐ)");

      // Chỉ có đơn của HN01, không có đơn của HN02
      expect(text).toContain("HN01-CSV01");
      expect(text).toContain("Nguyễn Văn A");
      expect(text).toContain("F8");
      expect(text).not.toContain("HN02-CSV02");
      expect(text).not.toContain("Trần Thị B");
    });

    it("Admin xuất CSV thấy toàn chuỗi cả HN01 và HN02", async () => {
      const res = await call("get", "/admin/affected-orders/export", adminToken);
      expect(res.status).toBe(200);
      const text = res.text;
      expect(text).toContain("HN01-CSV01");
      expect(text).toContain("HN02-CSV02");
    });

    it("CSV escape ký tự formula injection (=, +, -, @, \\t, \\r) với tiền tố '", async () => {
      fakeDb.tables.orders.push({
        id: uuid(913),
        cinema_id: HN01,
        cinema_name: "FilmBooking Hà Nội 01",
        cinema_code: "HN01",
        showtime_id: SHOWTIME_HN01,
        movie_title: "=cmd|'/c calc'!A0",
        room_name: "+Phòng 1",
        showtime_starts_at: "2026-12-05T19:00:00Z",
        booking_code: "HN01-INJECT",
        status: "affected",
        total_amount: 150000,
        contact_name: "@CustomerEvil",
        contact_phone: "-\t0912345678",
        contact_email: "\rtest@example.com",
        created_at: new Date().toISOString(),
      });

      const res = await call("get", "/admin/affected-orders/export", staffHn01Token);
      expect(res.status).toBe(200);
      const text = res.text;

      // Ký tự formula injection phải có tiền tố '
      expect(text).toContain("HN01-INJECT");
      expect(text).toContain("'=cmd|'/c calc'!A0");
      expect(text).toContain("'+Phòng 1");
      expect(text).toContain("'@CustomerEvil");
      expect(text).toContain("'-\t0912345678");
      expect(text).toContain("'\rtest@example.com");
    });
  });
});
