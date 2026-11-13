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
import { OrdersModule } from "../src/modules/orders/orders.module";
import { AdminOrdersController, OrdersController } from "../src/modules/orders/orders.controller";
import { OrdersService } from "../src/modules/orders/orders.service";
import { ReportModule } from "../src/modules/report/report.module";
import { AdminReportController, ReportController, ReportService } from "../src/modules/report/report.controller";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://test.supabase.co";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Cinemas
const HN01 = uuid(1);
const HN02 = uuid(2);

// Users
const ADMIN = uuid(11);
const MANAGER_HN01 = uuid(12);
const MANAGER_HN02 = uuid(13);
const STAFF_HN01 = uuid(14);
const STAFF_HN02 = uuid(15);
const CUSTOMER = uuid(16);

// Showtimes
const SHOWTIME_HN01_1 = uuid(101);
const SHOWTIME_HN02_1 = uuid(102);
const SHOWTIME_UPCOMING_HN01 = uuid(103);

// Seats
const SEAT_1 = uuid(201);
const SEAT_2 = uuid(202);

// Orders
const ORDER_PAID_HN01 = uuid(301);
const ORDER_NMR_HN01 = uuid(302);
const ORDER_NMR_HN02 = uuid(303);
const ORDER_AFFECTED_HN01 = uuid(304);
const ORDER_HOLDING_HN01 = uuid(305);

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
  currentJwt: string | null = null;

  reset() {
    const now = new Date();
    const in15m = new Date(now.getTime() + 15 * 60 * 1000);
    const in3h = new Date(now.getTime() + 180 * 60 * 1000);

    this.tables = {
      user_roles: [{ user_id: ADMIN, role: "ADMIN" }],
      staff_assignments: [
        { user_id: MANAGER_HN01, cinema_id: HN01, role: "MANAGER" },
        { user_id: MANAGER_HN02, cinema_id: HN02, role: "MANAGER" },
        { user_id: STAFF_HN01, cinema_id: HN01, role: "STAFF" },
        { user_id: STAFF_HN02, cinema_id: HN02, role: "STAFF" },
      ],
      cinemas: [
        { id: HN01, code: "HN01", name: "FilmBooking Hà Nội 01" },
        { id: HN02, code: "HN02", name: "FilmBooking Hà Nội 02" },
      ],
      rooms: [
        { id: uuid(902), cinema_id: HN01, name: "Phòng 1" },
        { id: uuid(903), cinema_id: HN02, name: "Phòng 2" },
      ],
      showtimes: [
        {
          id: SHOWTIME_HN01_1,
          cinema_id: HN01,
          room_id: uuid(902),
          format: "2D",
          starts_at: in3h.toISOString(),
          ends_at: new Date(in3h.getTime() + 120 * 60 * 1000).toISOString(),
          status: "ON_SALE",
          movies: { title_vi: "Phim Hay HN01" },
        },
        {
          id: SHOWTIME_HN02_1,
          cinema_id: HN02,
          room_id: uuid(903),
          format: "2D",
          starts_at: in3h.toISOString(),
          ends_at: new Date(in3h.getTime() + 120 * 60 * 1000).toISOString(),
          status: "ON_SALE",
          movies: { title_vi: "Phim Hay HN02" },
        },
        {
          id: SHOWTIME_UPCOMING_HN01,
          cinema_id: HN01,
          room_id: uuid(902),
          format: "2D",
          starts_at: in15m.toISOString(), // Bắt đầu trong 15p (nằm trong 30p)
          ends_at: new Date(in15m.getTime() + 120 * 60 * 1000).toISOString(),
          status: "ON_SALE",
          movies: { title_vi: "Phim Sắp Chiếu" },
        },
      ],
      orders: [
        {
          id: ORDER_PAID_HN01,
          booking_code: "HN01-PAID01",
          channel: "WEB",
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          showtime_id: SHOWTIME_HN01_1,
          movie_title: "Phim Hay HN01",
          room_name: "Phòng 1",
          showtime_starts_at: "2026-11-13T10:00:00Z",
          showtime_ends_at: "2026-11-13T12:00:00Z",
          status: "paid",
          subtotal_amount: 100000,
          discount_amount: 0,
          total_amount: 100000,
          user_id: CUSTOMER,
          contact_email: "khach1@test.com",
          contact_phone: "0901234567",
          manual_review_resolved_at: null,
          cancelled_at: null,
          cancel_reason: null,
          created_at: "2026-11-13T08:00:00Z",
          updated_at: "2026-11-13T08:05:00Z",
        },
        {
          id: ORDER_NMR_HN01,
          booking_code: "HN01-NMR001",
          channel: "WEB",
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          showtime_id: SHOWTIME_HN01_1,
          movie_title: "Phim Hay HN01",
          room_name: "Phòng 1",
          showtime_starts_at: "2026-11-13T10:00:00Z",
          showtime_ends_at: "2026-11-13T12:00:00Z",
          status: "needs_manual_review",
          subtotal_amount: 120000,
          discount_amount: 0,
          total_amount: 120000,
          user_id: CUSTOMER,
          contact_email: "khach2@test.com",
          contact_phone: "0901234568",
          manual_review_resolved_at: null,
          cancelled_at: null,
          cancel_reason: null,
          created_at: "2026-11-13T08:10:00Z",
          updated_at: "2026-11-13T08:25:00Z",
        },
        {
          id: ORDER_NMR_HN02,
          booking_code: "HN02-NMR002",
          channel: "WEB",
          cinema_id: HN02,
          cinema_code: "HN02",
          cinema_name: "FilmBooking Hà Nội 02",
          showtime_id: SHOWTIME_HN02_1,
          movie_title: "Phim Hay HN02",
          room_name: "Phòng 2",
          showtime_starts_at: "2026-11-13T10:00:00Z",
          showtime_ends_at: "2026-11-13T12:00:00Z",
          status: "needs_manual_review",
          subtotal_amount: 90000,
          discount_amount: 0,
          total_amount: 90000,
          user_id: CUSTOMER,
          contact_email: "khach3@test.com",
          contact_phone: "0901234569",
          manual_review_resolved_at: null,
          cancelled_at: null,
          cancel_reason: null,
          created_at: "2026-11-13T08:15:00Z",
          updated_at: "2026-11-13T08:30:00Z",
        },
        {
          id: ORDER_AFFECTED_HN01,
          booking_code: "HN01-AFF001",
          channel: "WEB",
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          showtime_id: SHOWTIME_HN01_1,
          movie_title: "Phim Hay HN01",
          room_name: "Phòng 1",
          showtime_starts_at: "2026-11-13T10:00:00Z",
          showtime_ends_at: "2026-11-13T12:00:00Z",
          status: "affected",
          subtotal_amount: 100000,
          discount_amount: 0,
          total_amount: 100000,
          user_id: CUSTOMER,
          contact_email: "khach4@test.com",
          contact_phone: "0901234570",
          manual_review_resolved_at: null,
          cancelled_at: null,
          cancel_reason: "Hỏng máy chiếu",
          created_at: "2026-11-13T07:00:00Z",
          updated_at: "2026-11-13T07:30:00Z",
        },
        {
          id: ORDER_HOLDING_HN01,
          booking_code: null,
          channel: "WEB",
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          showtime_id: SHOWTIME_HN01_1,
          movie_title: "Phim Hay HN01",
          room_name: "Phòng 1",
          showtime_starts_at: "2026-11-13T10:00:00Z",
          showtime_ends_at: "2026-11-13T12:00:00Z",
          status: "holding",
          subtotal_amount: 80000,
          discount_amount: 0,
          total_amount: 80000,
          user_id: CUSTOMER,
          contact_email: "khach5@test.com",
          contact_phone: "0901234571",
          manual_review_resolved_at: null,
          cancelled_at: null,
          cancel_reason: null,
          created_at: "2026-11-13T09:00:00Z",
          updated_at: "2026-11-13T09:00:00Z",
        },
      ],
      order_seats: [
        {
          id: uuid(401),
          order_id: ORDER_NMR_HN01,
          seat_id: SEAT_1,
          seat_label: "A1",
          seat_type: "NORMAL",
          price_amount: 120000,
        },
        {
          id: uuid(402),
          order_id: ORDER_NMR_HN02,
          seat_id: SEAT_2,
          seat_label: "B1",
          seat_type: "VIP",
          price_amount: 90000,
        },
      ],
      showtime_seat_states: [],
      tickets: [
        {
          id: uuid(501),
          order_id: ORDER_PAID_HN01,
          order_seat_id: uuid(400),
          showtime_id: SHOWTIME_HN01_1,
          cinema_id: HN01,
          qr_token: "a".repeat(32),
          checked_in_at: null,
          checked_in_by: null,
          created_at: "2026-11-13T08:05:00Z",
        },
      ],
      payments: [
        {
          id: uuid(601),
          order_id: ORDER_PAID_HN01,
          cinema_id: HN01,
          order_code: 10001,
          amount: 100000,
          status: "PAID",
          transaction_ref: "PAYOS_TX_001",
          paid_at: "2026-11-13T08:05:00Z",
          payment_link_id: "LINK_001",
          created_at: "2026-11-13T08:00:00Z",
        },
      ],
      email_outbox: [
        {
          id: uuid(701),
          cinema_id: HN01,
          to_email: "err@test.com",
          kind: "TICKET",
          last_error: "SMTP connection refused",
          attempts: 3,
          status: "FAILED",
          created_at: "2026-11-13T08:10:00Z",
        },
      ],
      affected_order_actions: [],
      audit_logs: [],
    };
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    const pCinemaId = args.p_cinema_id as string | null | undefined;

    let callerId: string | null = null;
    if (this.currentJwt) {
      try {
        const part = this.currentJwt.split(".")[1];
        if (part) {
          const payload = JSON.parse(Buffer.from(part, "base64").toString());
          callerId = payload.sub ?? null;
        }
      } catch {
        callerId = null;
      }
    }

    // Giả lập RBAC cho RPC báo cáo (AC-16): Manager rạp A gọi rạp B -> 42501
    const isCallerStaff = (this.tables.staff_assignments ?? []).some(
      (sa) => sa.user_id === callerId && sa.role === "STAFF",
    );
    if (isCallerStaff) {
      return Promise.resolve({ data: null, error: { code: "42501", message: "FORBIDDEN_CINEMA_SCOPE" } });
    }
    const isCallerManagerHn01 = (this.tables.staff_assignments ?? []).some(
      (sa) => sa.user_id === callerId && sa.cinema_id === HN01 && sa.role === "MANAGER",
    );
    if (isCallerManagerHn01 && pCinemaId === HN02) {
      return Promise.resolve({ data: null, error: { code: "42501", message: "FORBIDDEN_CINEMA_SCOPE" } });
    }

    if (fn === "resolve_manual_review") {
      const orderId = args.p_order_id as string;
      const order = (this.tables.orders ?? []).find((o) => o.id === orderId);
      if (!order) {
        return Promise.resolve({ data: null, error: { code: "P0002", message: "ORDER_NOT_FOUND" } });
      }
      if (order.status !== "needs_manual_review") {
        return Promise.resolve({ data: null, error: { code: "P0003", message: "INVALID_ORDER_STATUS" } });
      }
      if (order.manual_review_resolved_at) {
        return Promise.resolve({ data: null, error: { code: "P0004", message: "ALREADY_RESOLVED" } });
      }

      const isAdmin = (this.tables.user_roles ?? []).some(
        (ur) => ur.user_id === callerId && ur.role === "ADMIN",
      );
      const isManager = (this.tables.staff_assignments ?? []).some(
        (sa) => sa.user_id === callerId && sa.cinema_id === order.cinema_id && sa.role === "MANAGER",
      );

      if (!isAdmin && !isManager) {
        return Promise.resolve({ data: null, error: { code: "42501", message: "FORBIDDEN_SCOPE" } });
      }

      const now = new Date().toISOString();
      order.manual_review_resolved_at = now;

      (this.tables.audit_logs ??= []).push({
        action: "UPDATE",
        actor_id: callerId ?? (order.user_id as string),
        cinema_id: order.cinema_id as string,
        table_name: "orders",
        record_id: order.id as string,
        after_data: {
          action_detail: "RESOLVE_MANUAL_REVIEW",
          action: args.p_action,
          note: args.p_note ?? null,
          refund_reference: args.p_refund_reference ?? null,
          refunded_amount: args.p_refunded_amount ?? null,
          resolved_at: now,
        },
      });

      return Promise.resolve({
        data: {
          success: true,
          order_id: order.id,
          resolved_at: now,
        },
        error: null,
      });
    }

    if (fn === "report_revenue") {
      // Chỉ tính đơn paid/checked_in
      const data = [
        {
          report_date: "2026-11-13",
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          channel: "WEB",
          total_orders: 1,
          total_tickets: 1,
          gross_revenue: 100000,
          total_discount: 0,
          net_revenue: 100000,
        },
      ];
      if (pCinemaId === HN02) {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data, error: null });
    }

    if (fn === "report_by_movie_showtime") {
      const data = [
        {
          showtime_id: SHOWTIME_HN01_1,
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          movie_id: uuid(901),
          movie_title: "Phim Hay HN01",
          room_id: uuid(902),
          room_name: "Phòng 1",
          starts_at: "2026-11-13T10:00:00Z",
          ends_at: "2026-11-13T12:00:00Z",
          format: "2D",
          showtime_status: "ON_SALE",
          room_capacity: 100,
          sold_seats: 1,
          occupancy_rate: 1.0,
          net_revenue: 100000,
        },
      ];
      if (pCinemaId === HN02) {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data, error: null });
    }

    if (fn === "report_payos_reconciliation") {
      const data = [
        {
          payment_id: uuid(601),
          order_id: ORDER_PAID_HN01,
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          order_code: 10001,
          payment_amount: 100000,
          order_total_amount: 100000,
          payment_status: "PAID",
          order_status: "paid",
          transaction_ref: "PAYOS_TX_001",
          discrepancy_type: "NONE",
          payment_created_at: "2026-11-13T08:00:00Z",
          order_created_at: "2026-11-13T08:00:00Z",
        },
      ];
      if (pCinemaId === HN02) {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data, error: null });
    }

    if (fn === "report_cancelled_showtimes") {
      const data = [
        {
          showtime_id: SHOWTIME_HN01_1,
          cinema_id: HN01,
          cinema_code: "HN01",
          cinema_name: "FilmBooking Hà Nội 01",
          movie_title: "Phim Hay HN01",
          room_name: "Phòng 1",
          starts_at: "2026-11-13T10:00:00Z",
          ends_at: "2026-11-13T12:00:00Z",
          showtime_status: "CANCELLED",
          total_affected_orders: 1,
          exchanged_orders: 0,
          refunded_manual_orders: 0,
          pending_orders: 1,
          total_refunded_amount: 0,
        },
      ];
      if (pCinemaId === HN02) {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data, error: null });
    }

    return Promise.resolve({ data: null, error: { code: "PGRST202", message: "function not found" } });
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private mode: "many" | "one" | "maybe" = "many";
  private countMode: "exact" | null = null;
  private rangeFrom = 0;
  private rangeTo = 999;
  private limitCount?: number;
  private selectedCols: string | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(cols?: string, opts?: { count?: "exact" }) {
    this.selectedCols = cols ?? null;
    if (opts?.count === "exact") this.countMode = "exact";
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[]) {
    this.op = "upsert";
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
  neq(key: string, value: unknown) {
    this.filters.push((row) => row[key] !== value);
    return this;
  }
  is(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  ilike(key: string, pattern: string) {
    const raw = pattern.replace(/%/g, "").toLowerCase();
    this.filters.push((row) => String(row[key] ?? "").toLowerCase().includes(raw));
    return this;
  }
  gte(key: string, val: string | number) {
    this.filters.push((row) => String(row[key] ?? "") >= String(val));
    return this;
  }
  lte(key: string, val: string | number) {
    this.filters.push((row) => String(row[key] ?? "") <= String(val));
    return this;
  }
  order(key: string, options?: { ascending?: boolean }) {
    this.orderKey = key;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number) {
    this.limitCount = n;
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

  private execute(): Result {
    const store = (this.db.tables[this.table] ??= []);
    if (this.op === "select") {
      // Mô phỏng ràng buộc quan hệ Foreign Key PostgREST: showtimes không có direct FK tới cinemas
      if (this.table === "showtimes" && this.selectedCols?.includes("cinemas(")) {
        return {
          data: null,
          error: {
            code: "PGRST200",
            message: "Could not find a relationship between 'showtimes' and 'cinemas' in the schema cache",
          },
        };
      }

      const allMatched = this.matching();
      let sliced = allMatched.slice(this.rangeFrom, this.rangeTo + 1);
      if (this.limitCount !== undefined) {
        sliced = sliced.slice(0, this.limitCount);
      }
      const count = this.countMode === "exact" ? allMatched.length : null;

      if (this.mode === "one") {
        if (allMatched.length !== 1) return { data: null, error: { code: "PGRST116", message: "not one row" } };
        return { data: { ...allMatched[0] }, count, error: null };
      }
      if (this.mode === "maybe") {
        return { data: allMatched[0] ? { ...allMatched[0] } : null, count, error: null };
      }
      return { data: sliced.map((r) => ({ ...r })), count, error: null };
    }

    if (this.op === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: row.id ?? uuid(Math.floor(Math.random() * 8000) + 1000),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...row,
      }));

      // Mô phỏng check constraint audit_logs_action_check trên Postgres: action in ('INSERT', 'UPDATE', 'DELETE')
      if (this.table === "audit_logs") {
        for (const row of incoming) {
          const r = row as Row;
          if (!["INSERT", "UPDATE", "DELETE"].includes(r.action as string)) {
            return {
              data: null,
              error: {
                code: "23514",
                message: 'new row for relation "audit_logs" violates check constraint "audit_logs_action_check"',
              },
            };
          }
        }
      }

      store.push(...incoming);
      return { data: incoming, error: null };
    }

    if (this.op === "upsert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: row.id ?? uuid(Math.floor(Math.random() * 8000) + 1000),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...row,
      }));

      if (this.table === "audit_logs") {
        for (const row of incoming) {
          const r = row as Row;
          if (!["INSERT", "UPDATE", "DELETE"].includes(r.action as string)) {
            return {
              data: null,
              error: {
                code: "23514",
                message: 'new row for relation "audit_logs" violates check constraint "audit_logs_action_check"',
              },
            };
          }
        }
      }

      store.push(...incoming);
      return { data: incoming, error: null };
    }

    const targets = this.matching();
    if (this.op === "update") {
      for (const row of targets) {
        Object.assign(row, this.payload);
      }
      return { data: targets, error: null };
    }

    return { data: null, error: null };
  }
}

const fakeDb = new FakeDb();
const fakeSupabase = {
  forUser: (jwt: string) => {
    fakeDb.currentJwt = jwt;
    return fakeDb;
  },
  admin: () => {
    return fakeDb;
  },
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

describe("Orders & Report API (Task 07, R-103, R-104, R-112, R-113, R-116, AC-11, AC-16)", () => {
  let app: INestApplication;
  let adminToken: string;
  let managerHn01Token: string;
  let managerHn02Token: string;
  let staffHn01Token: string;
  let staffHn02Token: string;
  let customerToken: string;

  beforeAll(async () => {
    adminToken = await sign(ADMIN);
    managerHn01Token = await sign(MANAGER_HN01);
    managerHn02Token = await sign(MANAGER_HN02);
    staffHn01Token = await sign(STAFF_HN01);
    staffHn02Token = await sign(STAFF_HN02);
    customerToken = await sign(CUSTOMER);

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController, AdminOrdersController, ReportController, AdminReportController],
      providers: [
        OrdersService,
        ReportService,
        {
          provide: ENV,
          useValue: {
            SUPABASE_URL,
            SUPABASE_ANON_KEY: "anon-key",
            SUPABASE_SERVICE_ROLE_KEY: "service-key",
            SUPABASE_JWT_SECRET: JWT_SECRET,
          } as Env,
        },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
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
    fakeDb.reset();
  });

  // ── AC-11: Danh sách đơn needs_manual_review ──────────────────────────────
  describe("AC-11: needs_manual_review list visibility", () => {
    it("đơn needs_manual_review HN01 xuất hiện cho Admin và Manager HN01, nhưng không xuất hiện cho Manager HN02", async () => {
      // 1. Admin thấy cả HN01 và HN02
      const resAdmin = await request(app.getHttpServer())
        .get("/orders/needs-manual-review")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const adminOrderIds = resAdmin.body.items.map((o: { id: string }) => o.id);
      expect(adminOrderIds).toContain(ORDER_NMR_HN01);
      expect(adminOrderIds).toContain(ORDER_NMR_HN02);

      // 2. Manager HN01 chỉ thấy HN01
      const resHn01 = await request(app.getHttpServer())
        .get("/orders/needs-manual-review")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(200);

      const hn01OrderIds = resHn01.body.items.map((o: { id: string }) => o.id);
      expect(hn01OrderIds).toContain(ORDER_NMR_HN01);
      expect(hn01OrderIds).not.toContain(ORDER_NMR_HN02);

      // 3. Manager HN02 chỉ thấy HN02
      const resHn02 = await request(app.getHttpServer())
        .get("/orders/needs-manual-review")
        .set("Authorization", `Bearer ${managerHn02Token}`)
        .expect(200);

      const hn02OrderIds = resHn02.body.items.map((o: { id: string }) => o.id);
      expect(hn02OrderIds).toContain(ORDER_NMR_HN02);
      expect(hn02OrderIds).not.toContain(ORDER_NMR_HN01);
    });

    it("Manager HN01 gọi lọc cinemaId=HN02 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/needs-manual-review?cinemaId=${HN02}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Staff gọi /orders/needs-manual-review hoặc /admin/orders/needs-manual-review -> 403 Forbidden (D/M5)", async () => {
      const res1 = await request(app.getHttpServer())
        .get("/orders/needs-manual-review")
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(403);
      expect(res1.body.error.code).toBe("FORBIDDEN");

      const res2 = await request(app.getHttpServer())
        .get("/admin/orders/needs-manual-review")
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(403);
      expect(res2.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ── AC-16: Phân quyền rạp (Manager rạp A gọi rạp B -> 403 hoặc rỗng) ────────
  describe("AC-16: Manager HN01 gọi báo cáo/đơn HN02 -> 403", () => {
    it("Manager HN01 xem chi tiết đơn của HN02 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/${ORDER_NMR_HN02}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 gọi báo cáo doanh thu rạp HN02 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/revenue?cinemaId=${HN02}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 gọi báo cáo suất chiếu rạp HN02 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/showtimes?cinemaId=${HN02}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 gọi báo cáo đối soát PayOS rạp HN02 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/payos-reconciliation?cinemaId=${HN02}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 gọi báo cáo suất bị huỷ rạp HN02 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cancelled-showtimes?cinemaId=${HN02}`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });
  });

  // ── Xử lý đơn needs_manual_review & Quyền Staff ───────────────────────────
  describe("Xử lý needs_manual_review & Staff ghi xử lý -> 403", () => {
    it("Staff HN01 ghi kết quả xử lý needs_manual_review -> 403 (chỉ đọc)", async () => {
      const res = await request(app.getHttpServer())
        .post(`/orders/${ORDER_NMR_HN01}/resolve-manual-review`)
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .send({ action: "CONFIRM_SALE", note: "Staff cố giải quyết" })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Manager HN01 ghi xử lý CONFIRM_SALE -> 200/201 Thành công, status giữ nguyên needs_manual_review", async () => {
      const res = await request(app.getHttpServer())
        .post(`/orders/${ORDER_NMR_HN01}/resolve-manual-review`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ action: "CONFIRM_SALE", note: "Ghế còn trống, đánh dấu đã xử lý thủ công" })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("CONFIRM_SALE");

      // Đơn đã cập nhật manual_review_resolved_at nhưng status GIỮ NGUYÊN 'needs_manual_review' (C1, SPECIFICATIONS.md:311)
      const order = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_NMR_HN01);
      expect(order?.status).toBe("needs_manual_review");
      expect(order?.manual_review_resolved_at).not.toBeNull();

      // Không tạo vé ma hay ghế ma
      const tickets = (fakeDb.tables.tickets ?? []).filter((t) => t.order_id === ORDER_NMR_HN01);
      expect(tickets.length).toBe(0);

      // Audit log ghi action: 'UPDATE' và action_detail: 'RESOLVE_MANUAL_REVIEW'
      const auditLog = (fakeDb.tables.audit_logs ?? []).find(
        (a) => a.table_name === "orders" && a.record_id === ORDER_NMR_HN01,
      );
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe("UPDATE");
      expect((auditLog?.after_data as Record<string, unknown>)?.action_detail).toBe("RESOLVE_MANUAL_REVIEW");
    });

    it("Manager HN02 gọi xử lý đơn của HN01 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .post(`/orders/${ORDER_NMR_HN01}/resolve-manual-review`)
        .set("Authorization", `Bearer ${managerHn02Token}`)
        .send({ action: "CONFIRM_SALE", note: "Manager HN02 cố xử lý đơn của HN01" })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Manager HN01 ghi xử lý REFUND_MANUAL thiếu refundReference hoặc refundedAmount -> 400 VALIDATION_ERROR", async () => {
      const res = await request(app.getHttpServer())
        .post(`/orders/${ORDER_NMR_HN01}/resolve-manual-review`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ action: "REFUND_MANUAL" })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Manager HN01 ghi xử lý REFUND_MANUAL đủ trường -> Thành công và ghi vào audit_logs", async () => {
      const res = await request(app.getHttpServer())
        .post(`/orders/${ORDER_NMR_HN01}/resolve-manual-review`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({
          action: "REFUND_MANUAL",
          note: "Hoàn tiền qua Vietcombank",
          refundReference: "VCB_REFUND_999",
          refundedAmount: 120000,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("REFUND_MANUAL");

      // Đơn giữ nguyên status needs_manual_review và có manual_review_resolved_at
      const order = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_NMR_HN01);
      expect(order?.status).toBe("needs_manual_review");
      expect(order?.manual_review_resolved_at).not.toBeNull();

      // Audit log ghi action: 'UPDATE' và action_detail: 'RESOLVE_MANUAL_REVIEW'
      const auditLog = (fakeDb.tables.audit_logs ?? []).find(
        (a) => a.table_name === "orders" && a.record_id === ORDER_NMR_HN01,
      );
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe("UPDATE");
      const afterData = auditLog?.after_data as Record<string, unknown>;
      expect(afterData?.action_detail).toBe("RESOLVE_MANUAL_REVIEW");
      expect(afterData?.refund_reference).toBe("VCB_REFUND_999");
      expect(afterData?.refunded_amount).toBe(120000);
    });

    it("FakeDb chặn cứng insert action không thuộc ('INSERT', 'UPDATE', 'DELETE') trên audit_logs", async () => {
      const res = await fakeDb.from("audit_logs").insert({
        action: "INVALID_ACTION",
        actor_id: ADMIN,
        table_name: "orders",
      });
      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe("23514");
    });

    it("Đơn đã xử lý giải quyết nếu gọi lại -> 409 CONFLICT", async () => {
      // Đánh dấu đã giải quyết trước
      const order = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_NMR_HN01);
      if (order) order.manual_review_resolved_at = "2026-11-13T09:00:00Z";

      const res = await request(app.getHttpServer())
        .post(`/orders/${ORDER_NMR_HN01}/resolve-manual-review`)
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .send({ action: "CONFIRM_SALE" })
        .expect(409);

      expect(res.body.error.code).toBe("CONFLICT");
    });
  });

  // ── Tra cứu đơn hàng (R-103) & Chi tiết đơn hàng (R-104) ────────────────────
  describe("Tra cứu đơn & chi tiết đơn", () => {
    it("Staff HN01 tìm đơn theo mã đặt vé của HN01 -> 200 có kết quả", async () => {
      const res = await request(app.getHttpServer())
        .get("/orders?bookingCode=PAID01")
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(200);

      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].bookingCode).toBe("HN01-PAID01");
    });

    it("Staff HN01 tìm kiếm với cinemaId=HN02 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders?cinemaId=${HN02}`)
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Staff HN02 tìm kiếm với cinemaId=HN01 -> 403 FORBIDDEN_CINEMA", async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders?cinemaId=${HN01}`)
        .set("Authorization", `Bearer ${staffHn02Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });

    it("Khách hàng vãng lai / Customer gọi /orders -> 403 FORBIDDEN", async () => {
      await request(app.getHttpServer())
        .get("/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(403);
    });

    it("GET /orders/:id trả về chi tiết đơn + lịch sử trạng thái", async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/${ORDER_PAID_HN01}`)
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(200);

      expect(res.body.id).toBe(ORDER_PAID_HN01);
      expect(res.body.tickets).toBeDefined();
      expect(res.body.payments).toBeDefined();
      expect(res.body.statusHistory).toBeDefined();

      const statuses = res.body.statusHistory.map((s: { status: string }) => s.status);
      expect(statuses).toContain("holding");
      expect(statuses).toContain("paid");
    });

    it("GET /orders/:id truy vấn lịch sử trạng thái từ audit_logs table_name = 'orders' (D/M6)", async () => {
      fakeDb.tables.audit_logs = [
        {
          id: 101,
          occurred_at: "2026-11-13T08:00:00Z",
          actor_id: CUSTOMER,
          cinema_id: HN01,
          table_name: "orders",
          record_id: ORDER_PAID_HN01,
          action: "INSERT",
          before_data: null,
          after_data: { status: "holding" },
        },
        {
          id: 102,
          occurred_at: "2026-11-13T08:02:00Z",
          actor_id: CUSTOMER,
          cinema_id: HN01,
          table_name: "orders",
          record_id: ORDER_PAID_HN01,
          action: "UPDATE",
          before_data: { status: "holding" },
          after_data: { status: "pending_payment" },
        },
        {
          id: 103,
          occurred_at: "2026-11-13T08:05:00Z",
          actor_id: null,
          cinema_id: HN01,
          table_name: "orders",
          record_id: ORDER_PAID_HN01,
          action: "UPDATE",
          before_data: { status: "pending_payment" },
          after_data: { status: "paid" },
        },
      ];

      const res = await request(app.getHttpServer())
        .get(`/orders/${ORDER_PAID_HN01}`)
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(200);

      expect(res.body.statusHistory).toHaveLength(3);
      expect(res.body.statusHistory[0].status).toBe("holding");
      expect(res.body.statusHistory[0].timestamp).toBe("2026-11-13T08:00:00Z");
      expect(res.body.statusHistory[1].status).toBe("pending_payment");
      expect(res.body.statusHistory[1].timestamp).toBe("2026-11-13T08:02:00Z");
      expect(res.body.statusHistory[2].status).toBe("paid");
      expect(res.body.statusHistory[2].timestamp).toBe("2026-11-13T08:05:00Z");
    });
  });

  // ── GET /admin/todo (D5) ──────────────────────────────────────────────────
  describe("GET /admin/todo (D5)", () => {
    it("Manager HN01 gọi /admin/todo -> trả về đúng cấu trúc chỉ tính dữ liệu HN01", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/todo")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(200);

      expect(res.body).toHaveProperty("needsManualReviewCount");
      expect(res.body).toHaveProperty("needsManualReviewOrders");
      expect(res.body).toHaveProperty("affectedCount");
      expect(res.body).toHaveProperty("failedEmailCount");
      expect(res.body).toHaveProperty("upcomingShowtimesCount");

      // Chỉ có đơn HN01
      const nmrIds = res.body.needsManualReviewOrders.map((o: { id: string }) => o.id);
      expect(nmrIds).toContain(ORDER_NMR_HN01);
      expect(nmrIds).not.toContain(ORDER_NMR_HN02);

      // Có 1 email lỗi HN01
      expect(res.body.failedEmailCount).toBe(1);

      // Có 1 suất sắp bắt đầu trong 30p, map đúng cinemaName và roomName qua query riêng (Defect 2)
      expect(res.body.upcomingShowtimesCount).toBe(1);
      const upcoming = res.body.upcomingShowtimes[0];
      expect(upcoming.cinemaName).toBe("FilmBooking Hà Nội 01");
      expect(upcoming.roomName).toBe("Phòng 1");
      expect(upcoming.movieTitle).toBe("Phim Sắp Chiếu");
    });

    it("Staff gọi /admin/todo -> ẩn needs_manual_review và failedEmails (D/M5)", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/todo")
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(200);

      // Staff không thấy needs_manual_review và failedEmails
      expect(res.body.needsManualReviewCount).toBe(0);
      expect(res.body.needsManualReviewOrders).toEqual([]);
      expect(res.body.failedEmailCount).toBe(0);
      expect(res.body.failedEmails).toEqual([]);

      // Staff vẫn thấy affected orders và upcoming showtimes của rạp mình
      expect(res.body.affectedCount).toBeGreaterThanOrEqual(1);
      expect(res.body.upcomingShowtimesCount).toBeGreaterThanOrEqual(1);
    });

    it("Admin gọi /admin/todo -> trả về thống kê toàn chuỗi", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/todo")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const nmrIds = res.body.needsManualReviewOrders.map((o: { id: string }) => o.id);
      expect(nmrIds).toContain(ORDER_NMR_HN01);
      expect(nmrIds).toContain(ORDER_NMR_HN02);
    });

    it("FakeDb chặn query embedding cinemas(name) trên showtimes mô phỏng lỗi PGRST200", async () => {
      const res = await fakeDb.from("showtimes").select("id, cinemas(name)");
      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe("PGRST200");
    });
  });

  // ── Báo cáo doanh thu & khớp số liệu (R-112, R-113, R-116) ────────────────
  describe("Báo cáo doanh thu, suất chiếu, đối soát PayOS", () => {
    it("Staff gọi báo cáo doanh thu -> 403 (chỉ Manager và Admin)", async () => {
      const res = await request(app.getHttpServer())
        .get("/reports/revenue")
        .set("Authorization", `Bearer ${staffHn01Token}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Manager HN01 gọi báo cáo doanh thu -> 200 trả về doanh thu đúng", async () => {
      const res = await request(app.getHttpServer())
        .get("/reports/revenue")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].netRevenue).toBe(100000);
      expect(res.body[0].cinemaCode).toBe("HN01");
    });

    it("Manager HN01 gọi báo cáo showtimes -> 200 trả về tỷ lệ lấp đầy", async () => {
      const res = await request(app.getHttpServer())
        .get("/reports/showtimes")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].occupancyRate).toBe(1.0);
    });

    it("Manager HN01 gọi báo cáo đối soát PayOS -> 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/reports/payos-reconciliation")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].orderCode).toBe(10001);
    });

    it("Manager HN01 gọi báo cáo suất bị huỷ -> 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/reports/cancelled-showtimes")
        .set("Authorization", `Bearer ${managerHn01Token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].totalAffectedOrders).toBe(1);
    });
  });

  // ── M7: OrdersModule & ReportModule import AuthModule (DI Verification) ────
  describe("M7: Module DI Hardening", () => {
    it("OrdersModule và ReportModule khởi tạo trơn tru mà không cần khai báo lặp AccessService", async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [OrdersModule, ReportModule],
      })
        .useMocker((token) => {
          if (token === SupabaseService) return fakeSupabase;
          if (token === ENV) {
            return {
              SUPABASE_URL,
              SUPABASE_ANON_KEY: "anon-key",
              SUPABASE_SERVICE_ROLE_KEY: "service-key",
              SUPABASE_JWT_SECRET: JWT_SECRET,
            };
          }
          return undefined;
        })
        .compile();

      expect(moduleFixture.get(OrdersService)).toBeDefined();
      expect(moduleFixture.get(ReportService)).toBeDefined();
      expect(moduleFixture.get(AccessService)).toBeDefined();
      await moduleFixture.close();
    });
  });
});
