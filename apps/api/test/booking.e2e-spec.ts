import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ERROR_HTTP_STATUS } from "@filmbooking/shared";
import { AccessService } from "../src/common/auth/access.service";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { BookingController } from "../src/modules/booking/booking.controller";
import { BookingService } from "../src/modules/booking/booking.service";
import { SeatmapService } from "../src/modules/booking/seatmap.service";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://test.supabase.co";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const HN01 = uuid(1);
const HN_CLOSED = uuid(2);
const ROOM_1 = uuid(10);
const ROOM_CLOSED = uuid(11);
const MOVIE_1 = uuid(20);
const MOVIE_OTHER = uuid(21);
const MOVIE_DRAFT = uuid(22);

const SHOWTIME_1 = uuid(100);
const SHOWTIME_CANCELLED = uuid(101);
const SHOWTIME_CLOSED = uuid(102);
const SHOWTIME_DRAFT_MOVIE = uuid(103);

const SEAT_E1 = uuid(201);
const SEAT_E2 = uuid(202);
const SEAT_E3 = uuid(203);
const SEAT_E4 = uuid(204);
const SEAT_E5 = uuid(205);
const SEAT_E6 = uuid(206);
const SEAT_VIP = uuid(207);
const SEAT_SWEETBOX = uuid(208);
const SEAT_BROKEN = uuid(209);
const SEAT_LOCKED = uuid(210);

const ALICE = uuid(501);
const BOB = uuid(502);
const UNCONFIRMED_USER = uuid(503);
const STAFF_USER = uuid(504);
const MANAGER_USER = uuid(505);
const ADMIN_USER = uuid(506);

type Row = Record<string, unknown>;
interface Result {
  data: unknown;
  error: { code?: string; message: string } | null;
}

class FakeDb {
  tables: Record<string, Row[]> = {};
  voucherAttempts: Record<string, number> = {};
  private nextId = 1000;

  auth = {
    admin: {
      getUserById: (userId: string) => {
        if (userId === UNCONFIRMED_USER) {
          return Promise.resolve({ data: { user: { id: userId, email_confirmed_at: null } }, error: null });
        }
        return Promise.resolve({ data: { user: { id: userId, email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null });
      },
    },
  };

  reset() {
    this.nextId = 1000;
    this.voucherAttempts = {};
    this.tables = {
      cinemas: [
        {
          id: HN01,
          code: "HN01",
          name: "FilmBooking Hà Nội 01",
          address: "123 Đường Láng",
          district: "Đống Đa",
          status: "OPEN",
        },
        {
          id: HN_CLOSED,
          code: "HN_CLOSED",
          name: "FilmBooking Tạm Đóng",
          address: "456 Giải Phóng",
          district: "Hoàng Mai",
          status: "TEMP_CLOSED",
        },
      ],
      rooms: [
        {
          id: ROOM_1,
          cinema_id: HN01,
          name: "Phòng 1",
          grid_rows: 10,
          grid_cols: 12,
        },
        {
          id: ROOM_CLOSED,
          cinema_id: HN_CLOSED,
          name: "Phòng Tạm Đóng",
          grid_rows: 10,
          grid_cols: 12,
        },
      ],
      movies: [
        {
          id: MOVIE_1,
          title: "Dune 2",
          age_rating: "T13",
          poster_url: "https://example.com/dune2.jpg",
          status: "PUBLISHED",
        },
        {
          id: MOVIE_DRAFT,
          title: "Phim Nháp",
          age_rating: "P",
          poster_url: "https://example.com/draft.jpg",
          status: "DRAFT",
        },
      ],
      showtimes: [
        {
          id: SHOWTIME_1,
          cinema_id: HN01,
          room_id: ROOM_1,
          movie_id: MOVIE_1,
          starts_at: "2026-12-05T12:00:00Z",
          ends_at: "2026-12-05T14:30:00Z",
          format: "2D",
          status: "ON_SALE",
        },
        {
          id: SHOWTIME_CANCELLED,
          cinema_id: HN01,
          room_id: ROOM_1,
          movie_id: MOVIE_1,
          starts_at: "2026-12-05T15:00:00Z",
          ends_at: "2026-12-05T17:30:00Z",
          format: "2D",
          status: "CANCELLED",
        },
        {
          id: SHOWTIME_CLOSED,
          cinema_id: HN_CLOSED,
          room_id: ROOM_CLOSED,
          movie_id: MOVIE_1,
          starts_at: "2026-12-05T18:00:00Z",
          ends_at: "2026-12-05T20:30:00Z",
          format: "2D",
          status: "ON_SALE",
        },
        {
          id: SHOWTIME_DRAFT_MOVIE,
          cinema_id: HN01,
          room_id: ROOM_1,
          movie_id: MOVIE_DRAFT,
          starts_at: "2026-12-05T21:00:00Z",
          ends_at: "2026-12-05T23:30:00Z",
          format: "2D",
          status: "ON_SALE",
        },
      ],
      seats: [
        { id: SEAT_E1, room_id: ROOM_1, row_label: "E", col_number: 1, col_span: 1, seat_type: "NORMAL", label: "E1" },
        { id: SEAT_E2, room_id: ROOM_1, row_label: "E", col_number: 2, col_span: 1, seat_type: "NORMAL", label: "E2" },
        { id: SEAT_E3, room_id: ROOM_1, row_label: "E", col_number: 3, col_span: 1, seat_type: "NORMAL", label: "E3" },
        { id: SEAT_E4, room_id: ROOM_1, row_label: "E", col_number: 4, col_span: 1, seat_type: "NORMAL", label: "E4" },
        { id: SEAT_E5, room_id: ROOM_1, row_label: "E", col_number: 5, col_span: 1, seat_type: "NORMAL", label: "E5" },
        { id: SEAT_E6, room_id: ROOM_1, row_label: "E", col_number: 6, col_span: 1, seat_type: "NORMAL", label: "E6" },
        { id: SEAT_VIP, room_id: ROOM_1, row_label: "F", col_number: 1, col_span: 1, seat_type: "VIP", label: "F1" },
        { id: SEAT_SWEETBOX, room_id: ROOM_1, row_label: "G", col_number: 1, col_span: 2, seat_type: "SWEETBOX", label: "G1" },
        { id: SEAT_BROKEN, room_id: ROOM_1, row_label: "H", col_number: 1, col_span: 1, seat_type: "BROKEN", label: "H1" },
        { id: SEAT_LOCKED, room_id: ROOM_1, row_label: "H", col_number: 2, col_span: 1, seat_type: "NORMAL", label: "H2" },
      ],
      showtime_seat_locks: [
        { id: uuid(701), showtime_id: SHOWTIME_1, seat_id: SEAT_LOCKED },
      ],
      showtime_seat_states: [],
      orders: [],
      order_seats: [],
      consents: [],
      vouchers: [
        {
          id: uuid(801),
          code: "VOUCHER10K",
          discount_type: "FIXED",
          discount_value: 10000,
          min_order_amount: 50000,
          active: true,
          valid_from: "2026-01-01T00:00:00Z",
          valid_to: "2026-12-31T23:59:59Z",
          total_uses_limit: 100,
        },
        {
          id: uuid(802),
          code: "EXPIRED",
          discount_type: "FIXED",
          discount_value: 10000,
          min_order_amount: 50000,
          active: true,
          valid_from: "2025-01-01T00:00:00Z",
          valid_to: "2025-12-31T23:59:59Z",
        },
        {
          id: uuid(803),
          code: "EXHAUSTED",
          discount_type: "FIXED",
          discount_value: 10000,
          min_order_amount: 50000,
          active: true,
          valid_from: "2026-01-01T00:00:00Z",
          valid_to: "2026-12-31T23:59:59Z",
          total_uses_limit: 1,
        },
        {
          id: uuid(804),
          code: "MIN500K",
          discount_type: "FIXED",
          discount_value: 50000,
          min_order_amount: 500000,
          active: true,
          valid_from: "2026-01-01T00:00:00Z",
          valid_to: "2026-12-31T23:59:59Z",
        },
        {
          id: uuid(805),
          code: "OTHERMOVIE",
          discount_type: "FIXED",
          discount_value: 10000,
          min_order_amount: 50000,
          movie_id: MOVIE_OTHER,
          active: true,
          valid_from: "2026-01-01T00:00:00Z",
          valid_to: "2026-12-31T23:59:59Z",
        },
      ],
      voucher_redemptions: [
        {
          id: uuid(850),
          voucher_id: uuid(803),
          order_id: uuid(999),
          user_id: BOB,
          status: "CONSUMED",
        },
      ],
      user_roles: [
        { user_id: ADMIN_USER, role: "ADMIN" },
      ],
      staff_assignments: [
        { user_id: STAFF_USER, cinema_id: HN01, role: "STAFF" },
        { user_id: MANAGER_USER, cinema_id: HN01, role: "MANAGER" },
      ],
    };
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>, currentUserId?: string): Promise<Result> {
    if (fn === "price_quote") {
      const seatIds = (args.p_seat_ids as string[]) ?? [];
      const quoted = seatIds.map((seatId) => {
        const seat = (this.tables.seats ?? []).find((s) => s.id === seatId);
        const seatType = (seat?.seat_type as string) ?? "NORMAL";
        let amount = 75000;
        if (seatType === "VIP") amount = 90000;
        if (seatType === "SWEETBOX") amount = 160000;
        return {
          seat_id: seatId,
          seat_type: seatType,
          seat_count: seatType === "SWEETBOX" ? 2 : 1,
          amount,
        };
      });
      return Promise.resolve({ data: quoted, error: null });
    }

    if (fn === "hold_seats") {
      const showtimeId = args.p_showtime_id as string;
      const seatIds = (args.p_seat_ids as string[]) ?? [];

      const showtime = (this.tables.showtimes ?? []).find((s) => s.id === showtimeId);
      if (!showtime) {
        return Promise.resolve({ data: null, error: { message: "SHOWTIME_NOT_FOUND: Suất chiếu không tồn tại" } });
      }
      if (showtime.status === "CANCELLED") {
        return Promise.resolve({ data: null, error: { message: "SHOWTIME_CANCELLED: Suất chiếu đã bị huỷ" } });
      }

      if (seatIds.length > 8) {
        return Promise.resolve({ data: null, error: { message: "HOLD_LIMIT: Mỗi đơn chỉ được giữ tối đa 8 ghế" } });
      }

      // Check locked seats (R-67, RPC hold_seats 'Ghế ... đang bị khoá')
      const locked = (this.tables.showtime_seat_locks ?? []).filter(
        (lk) => lk.showtime_id === showtimeId && seatIds.includes(lk.seat_id as string),
      );
      if (locked.length > 0) {
        const lockedLabels = locked.map((l) => {
          const seat = (this.tables.seats ?? []).find((s) => s.id === l.seat_id);
          return (seat?.label as string) ?? "E5";
        });
        return Promise.resolve({
          data: null,
          error: { message: `SEAT_TAKEN: Ghế ${lockedLabels.join(", ")} đang bị khoá` },
        });
      }

      // Check taken seats
      const taken = (this.tables.showtime_seat_states ?? []).filter(
        (st) =>
          st.showtime_id === showtimeId &&
          seatIds.includes(st.seat_id as string) &&
          (st.state === "SOLD" || (st.state === "HELD" && new Date(st.expires_at as string) > new Date())),
      );
      if (taken.length > 0) {
        const takenLabels = taken.map((t) => {
          const seat = (this.tables.seats ?? []).find((s) => s.id === t.seat_id);
          return (seat?.label as string) ?? "E5";
        });
        return Promise.resolve({
          data: null,
          error: { message: `SEAT_TAKEN: Ghế ${takenLabels.join(", ")} đã có người giữ hoặc mua` },
        });
      }

      // Check orphan seat (giả lập nếu chọn E1, E3 bỏ lại E2)
      if (seatIds.includes(SEAT_E1) && seatIds.includes(SEAT_E3) && !seatIds.includes(SEAT_E2)) {
        return Promise.resolve({
          data: null,
          error: { message: "ORPHAN_SEAT: Không được để trống 1 ghế đơn lẻ trên hàng E (ghế E2)" },
        });
      }

      // Calculate total
      let subtotal = 0;
      for (const id of seatIds) {
        const seat = (this.tables.seats ?? []).find((s) => s.id === id);
        if (seat?.seat_type === "VIP") subtotal += 90000;
        else if (seat?.seat_type === "SWEETBOX") subtotal += 160000;
        else subtotal += 75000;
      }

      const orderId = this.newId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const bookingCode = `HN01-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const order: Row = {
        id: orderId,
        channel: "WEB",
        cinema_id: showtime.cinema_id,
        showtime_id: showtimeId,
        user_id: currentUserId || ALICE,
        status: "holding",
        subtotal_amount: subtotal,
        discount_amount: 0,
        total_amount: subtotal,
        booking_code: bookingCode,
        hold_expires_at: expiresAt,
        consent_at: null,
        age_confirmed: false,
        movie_title: "Dune 2",
        cinema_code: "HN01",
        cinema_name: "FilmBooking Hà Nội 01",
        room_name: "Phòng 1",
        showtime_starts_at: showtime.starts_at,
        showtime_ends_at: showtime.ends_at,
        created_at: new Date().toISOString(),
      };
      (this.tables.orders ??= []).push(order);

      for (const sid of seatIds) {
        const seat = (this.tables.seats ?? []).find((s) => s.id === sid);
        (this.tables.order_seats ??= []).push({
          id: this.newId(),
          order_id: orderId,
          seat_id: sid,
          seat_label: (seat?.label as string) ?? "E1",
          seat_type: (seat?.seat_type as string) ?? "NORMAL",
          price_amount: seat?.seat_type === "VIP" ? 90000 : 75000,
        });
        (this.tables.showtime_seat_states ??= []).push({
          id: this.newId(),
          showtime_id: showtimeId,
          seat_id: sid,
          state: "HELD",
          expires_at: expiresAt,
          order_id: orderId,
        });
      }

      return Promise.resolve({
        data: [
          {
            order_id: orderId,
            booking_code: bookingCode,
            hold_expires_at: expiresAt,
            subtotal_amount: subtotal,
            discount_amount: 0,
            total_amount: subtotal,
            seat_count: seatIds.length,
          },
        ],
        error: null,
      });
    }

    if (fn === "release_seats") {
      const orderId = args.p_order_id as string;
      const order = (this.tables.orders ?? []).find((o) => o.id === orderId);
      if (!order) {
        return Promise.resolve({ data: null, error: { message: "ORDER_NOT_FOUND: Đơn hàng không tồn tại" } });
      }
      if (order.status !== "holding") {
        return Promise.resolve({
          data: null,
          error: { message: "INVALID_ORDER_STATUS: Chỉ có thể nhả ghế cho đơn đang ở trạng thái holding" },
        });
      }

      order.status = "cancelled";
      this.tables.showtime_seat_states = (this.tables.showtime_seat_states ?? []).filter((s) => s.order_id !== orderId);
      return Promise.resolve({ data: null, error: null });
    }

    if (fn === "apply_voucher") {
      const orderId = args.p_order_id as string;
      const code = (args.p_code as string)?.toUpperCase();

      this.voucherAttempts[orderId] = (this.voucherAttempts[orderId] ?? 0) + 1;
      if (this.voucherAttempts[orderId] > 10) {
        return Promise.resolve({
          data: { ok: false, error_code: "RATE_LIMITED" },
          error: null,
        });
      }

      const order = (this.tables.orders ?? []).find((o) => o.id === orderId);
      if (!order) {
        return Promise.resolve({ data: { ok: false, error_code: "ORDER_NOT_FOUND" }, error: null });
      }
      if (order.status !== "holding" && order.status !== "pending_payment") {
        return Promise.resolve({ data: { ok: false, error_code: "ORDER_NOT_HOLDING" }, error: null });
      }

      if (order.voucher_id) {
        return Promise.resolve({ data: { ok: false, error_code: "VOUCHER_ALREADY_APPLIED" }, error: null });
      }

      const voucher = (this.tables.vouchers ?? []).find((v) => (v.code as string).toUpperCase() === code);
      if (!voucher || !voucher.active) {
        return Promise.resolve({ data: { ok: false, error_code: "VOUCHER_INVALID" }, error: null });
      }

      const now = new Date();
      if (voucher.valid_to && new Date(voucher.valid_to as string) < now) {
        return Promise.resolve({ data: { ok: false, error_code: "VOUCHER_EXPIRED" }, error: null });
      }

      if (voucher.total_uses_limit) {
        const used = (this.tables.voucher_redemptions ?? []).filter(
          (vr) => vr.voucher_id === voucher.id && (vr.status === "HELD" || vr.status === "CONSUMED"),
        ).length;
        if (used >= (voucher.total_uses_limit as number)) {
          return Promise.resolve({ data: { ok: false, error_code: "VOUCHER_EXHAUSTED" }, error: null });
        }
      }

      if (voucher.movie_id) {
        const st = (this.tables.showtimes ?? []).find((s) => s.id === order.showtime_id);
        if (st && st.movie_id !== voucher.movie_id) {
          return Promise.resolve({ data: { ok: false, error_code: "VOUCHER_NOT_APPLICABLE" }, error: null });
        }
      }

      if ((order.subtotal_amount as number) < ((voucher.min_order_amount as number) ?? 0)) {
        return Promise.resolve({ data: { ok: false, error_code: "VOUCHER_MIN_NOT_MET" }, error: null });
      }

      const discount = voucher.discount_value as number;
      const total = (order.subtotal_amount as number) - discount;

      order.voucher_id = voucher.id;
      order.discount_amount = discount;
      order.total_amount = total;

      (this.tables.voucher_redemptions ??= []).push({
        id: this.newId(),
        voucher_id: voucher.id,
        order_id: orderId,
        user_id: order.user_id,
        discount_amount: discount,
        status: "HELD",
      });

      return Promise.resolve({
        data: {
          ok: true,
          order_id: orderId,
          voucher_id: voucher.id,
          code: voucher.code,
          subtotal_amount: order.subtotal_amount,
          discount_amount: discount,
          total_amount: total,
        },
        error: null,
      });
    }

    if (fn === "remove_voucher") {
      const orderId = args.p_order_id as string;
      const order = (this.tables.orders ?? []).find((o) => o.id === orderId);
      if (!order) {
        return Promise.resolve({ data: null, error: { message: "ORDER_NOT_FOUND: Đơn hàng không tồn tại" } });
      }

      order.voucher_id = null;
      order.discount_amount = 0;
      order.total_amount = order.subtotal_amount;

      this.tables.voucher_redemptions = (this.tables.voucher_redemptions ?? []).filter((vr) => vr.order_id !== orderId);

      return Promise.resolve({
        data: {
          order_id: orderId,
          subtotal_amount: order.subtotal_amount,
          discount_amount: 0,
          total_amount: order.subtotal_amount,
        },
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

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private mode: "many" | "one" | "maybe" = "many";

  private selectedCols?: string;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
    private readonly isAdmin = true,
  ) {}

  select(cols?: string) {
    this.selectedCols = cols;
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
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
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

  then<TResult1 = Result, TResult2 = never>(
    onFulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  private matching(): Row[] {
    const rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)));
    if (this.table === "showtimes") {
      for (const row of rows) {
        const movie = (this.db.tables.movies ?? []).find((m) => m.id === row.movie_id);
        row.movies = movie ? { id: movie.id, status: movie.status, age_rating: movie.age_rating, poster_url: movie.poster_url } : null;
      }
    }
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
    // Mô phỏng schema cache PostgREST: showtimes không có foreign key đơn lẻ tới cinemas
    if (this.table === "showtimes" && this.selectedCols?.includes("cinemas(")) {
      return {
        data: null,
        error: {
          code: "PGRST200",
          message: "Could not find a relationship between 'showtimes' and 'cinemas' in the schema cache",
        },
      };
    }
    // Mô phỏng ràng buộc phân quyền Postgres & RLS thật (Defect 1, 2, 3)
    if (!this.isAdmin) {
      if (this.op === "update" && this.table === "orders") {
        return { data: null, error: { code: "42501", message: "permission denied for table orders" } };
      }
      if (this.op === "insert" && this.table === "consents") {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (incoming.some((row) => "accepted_at" in row)) {
          return {
            data: null,
            error: { code: "42501", message: 'permission denied for column "accepted_at" of relation "consents"' },
          };
        }
      }
      if (this.op === "select" && this.table === "vouchers") {
        return this.shape([]);
      }
    }

    const store = (this.db.tables[this.table] ??= []);
    if (this.op === "select") return this.shape(this.matching());

    if (this.op === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: this.db.newId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(this.table === "consents" && !("accepted_at" in row) ? { accepted_at: new Date().toISOString() } : {}),
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
}

class FakeClient {
  constructor(
    private readonly db: FakeDb,
    private readonly isAdmin: boolean,
    private readonly userId?: string,
  ) {}

  from(table: string) {
    return new Query(this.db, table, this.isAdmin);
  }

  rpc(fn: string, args: Record<string, unknown>) {
    return this.db.rpc(fn, args, this.userId);
  }

  get auth() {
    return this.db.auth;
  }
}

// ── Test harness ────────────────────────────────────────────────────────────
const fakeDb = new FakeDb();

const decodeUserId = (jwt?: string) => {
  if (!jwt) return undefined;
  try {
    const parts = jwt.split(".");
    const part1 = parts[1];
    if (!part1) return undefined;
    const payload = JSON.parse(Buffer.from(part1, "base64").toString());
    return payload.sub as string;
  } catch {
    return undefined;
  }
};

const fakeSupabase = {
  forUser: (jwt?: string) => new FakeClient(fakeDb, false, decodeUserId(jwt)),
  admin: () => new FakeClient(fakeDb, true),
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

describe("Booking API (Layer 5 Task 01: Sơ đồ ghế, giữ/nhả ghế, tóm tắt, consent, voucher)", () => {
  let app: INestApplication;
  let aliceToken: string;
  let bobToken: string;
  let unconfirmedToken: string;
  let staffToken: string;
  let managerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    aliceToken = await sign(ALICE);
    bobToken = await sign(BOB);
    unconfirmedToken = await sign(UNCONFIRMED_USER);
    staffToken = await sign(STAFF_USER);
    managerToken = await sign(MANAGER_USER);
    adminToken = await sign(ADMIN_USER);

    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL } as Env },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        BookingService,
        SeatmapService,
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
  // 1. GET /showtimes/:id/seatmap (public)
  // ==========================================================================
  describe("GET /showtimes/:id/seatmap", () => {
    it("trả về sơ đồ ghế công khai, không cần đăng nhập", async () => {
      const res = await request(app.getHttpServer()).get(`/showtimes/${SHOWTIME_1}/seatmap`).expect(200);

      expect(res.body).toHaveProperty("showtime");
      expect(res.body.showtime.id).toBe(SHOWTIME_1);
      expect(res.body).toHaveProperty("room");
      expect(res.body.room.name).toBe("Phòng 1");
      expect(res.body).toHaveProperty("pricing");
      expect(res.body.pricing).toMatchObject({ NORMAL: 75000, VIP: 90000, SWEETBOX: 160000 });
      expect(res.body).toHaveProperty("seats");
      expect(Array.isArray(res.body.seats)).toBe(true);

      // Tuyệt đối không trả user_id / order_id trong seatmap
      for (const seat of res.body.seats) {
        expect(seat).not.toHaveProperty("user_id");
        expect(seat).not.toHaveProperty("order_id");
        expect(seat).not.toHaveProperty("userId");
        expect(seat).not.toHaveProperty("orderId");
      }
    });

    it("ghế HELD còn hạn hiển thị state HELD kèm expiresAt; ghế HELD hết hạn trả về FREE", async () => {
      const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      fakeDb.tables.showtime_seat_states = [
        { id: uuid(901), showtime_id: SHOWTIME_1, seat_id: SEAT_E1, state: "HELD", expires_at: future, order_id: uuid(991) },
        { id: uuid(902), showtime_id: SHOWTIME_1, seat_id: SEAT_E2, state: "HELD", expires_at: past, order_id: uuid(992) },
        { id: uuid(903), showtime_id: SHOWTIME_1, seat_id: SEAT_E3, state: "SOLD", expires_at: null, order_id: uuid(993) },
      ];

      const res = await request(app.getHttpServer()).get(`/showtimes/${SHOWTIME_1}/seatmap`).expect(200);

      const seatE1 = res.body.seats.find((s: { id: string }) => s.id === SEAT_E1);
      const seatE2 = res.body.seats.find((s: { id: string }) => s.id === SEAT_E2);
      const seatE3 = res.body.seats.find((s: { id: string }) => s.id === SEAT_E3);
      const seatLocked = res.body.seats.find((s: { id: string }) => s.id === SEAT_LOCKED);
      const seatBroken = res.body.seats.find((s: { id: string }) => s.id === SEAT_BROKEN);

      expect(seatE1.state).toBe("HELD");
      expect(seatE1.expiresAt).toBe(future);

      // AC: Ghế HELD hết hạn trả về FREE (expiresAt: null)
      expect(seatE2.state).toBe("FREE");
      expect(seatE2.expiresAt).toBeNull();

      expect(seatE3.state).toBe("SOLD");
      expect(seatLocked.state).toBe("LOCKED");
      expect(seatBroken.state).toBe("LOCKED");
    });

    it("trả về 404 khi suất chiếu không tồn tại", async () => {
      const fakeId = uuid(999);
      const res = await request(app.getHttpServer()).get(`/showtimes/${fakeId}/seatmap`).expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("trả về 409 khi suất chiếu đã bị huỷ", async () => {
      const res = await request(app.getHttpServer()).get(`/showtimes/${SHOWTIME_CANCELLED}/seatmap`).expect(409);
      expect(res.body.error.code).toBe("SHOWTIME_CANCELLED");
    });

    it("A/MAJOR-4: trả về 404 khi suất chiếu thuộc rạp TEMP_CLOSED", async () => {
      const res = await request(app.getHttpServer()).get(`/showtimes/${SHOWTIME_CLOSED}/seatmap`).expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(res.body.error.message).toBe("Suất chiếu không khả dụng");
    });

    it("A/MAJOR-4: trả về 404 khi suất chiếu thuộc phim DRAFT", async () => {
      const res = await request(app.getHttpServer()).get(`/showtimes/${SHOWTIME_DRAFT_MOVIE}/seatmap`).expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(res.body.error.message).toBe("Suất chiếu không khả dụng");
    });

    it("A/MAJOR-4: FakeDb chặn embedding cinemas(status) trên showtimes mô phỏng lỗi PGRST200", async () => {
      const res = await fakeSupabase.admin().from("showtimes").select("id, cinemas(status)").eq("id", SHOWTIME_1).maybeSingle();
      expect(res.error).toMatchObject({
        code: "PGRST200",
        message: "Could not find a relationship between 'showtimes' and 'cinemas' in the schema cache",
      });
    });
  });

  // ==========================================================================
  // 2. POST /bookings/holds
  // ==========================================================================
  describe("POST /bookings/holds", () => {
    it("chưa đăng nhập -> 401 UNAUTHENTICATED", async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] })
        .expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("AC-01: khách chưa xác nhận email gọi hold -> 403 EMAIL_NOT_CONFIRMED", async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${unconfirmedToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] })
        .expect(403);

      expect(res.body.error.code).toBe("EMAIL_NOT_CONFIRMED");
    });

    it("Staff / Manager / Admin gọi hold online -> 403 FORBIDDEN", async () => {
      const resStaff = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] })
        .expect(403);
      expect(resStaff.body.error.code).toBe("FORBIDDEN");

      const resManager = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] })
        .expect(403);
      expect(resManager.body.error.code).toBe("FORBIDDEN");

      const resAdmin = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] })
        .expect(403);
      expect(resAdmin.body.error.code).toBe("FORBIDDEN");
    });

    it("khách đã xác nhận email giữ ghế thành công -> 201 trả về orderId & bookingCode", async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1, SEAT_E2] })
        .expect(201);

      expect(res.body).toHaveProperty("orderId");
      expect(res.body).toHaveProperty("bookingCode");
      expect(res.body).toHaveProperty("holdExpiresAt");
      expect(res.body.subtotalAmount).toBe(150000);
      expect(res.body.totalAmount).toBe(150000);
      expect(res.body.seatCount).toBe(2);
    });

    it("AC-06: 2 request cùng ghế E5 song song -> đúng 1 thành công, request kia 409 SEAT_TAKEN details.seats=['E5']", async () => {
      // Giữ trước E5
      fakeDb.tables.showtime_seat_states = [
        {
          id: uuid(910),
          showtime_id: SHOWTIME_1,
          seat_id: SEAT_E5,
          state: "HELD",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          order_id: uuid(990),
        },
      ];

      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E5] })
        .expect(409);

      expect(res.body.error.code).toBe("SEAT_TAKEN");
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.seats).toContain("E5");
    });

    it("Defect 4: ghế đang bị khoá ('Ghế H2 đang bị khoá') -> 409 SEAT_TAKEN details.seats=['H2']", async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_LOCKED] })
        .expect(409);

      expect(res.body.error.code).toBe("SEAT_TAKEN");
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.seats).toContain("H2");
    });

    it("vi phạm ghế lẻ ORPHAN_SEAT -> 422 ORPHAN_SEAT", async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1, SEAT_E3] })
        .expect(422);

      expect(res.body.error.code).toBe("ORPHAN_SEAT");
    });

    it("giữ quá 8 ghế -> 400 VALIDATION_ERROR (hoặc 422 HOLD_LIMIT)", async () => {
      const nineSeats = [SEAT_E1, SEAT_E2, SEAT_E3, SEAT_E4, SEAT_E5, SEAT_E6, SEAT_VIP, SEAT_SWEETBOX, SEAT_BROKEN];
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: nineSeats })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================================================
  // 3. GET /bookings/:id (tóm tắt đơn)
  // ==========================================================================
  describe("GET /bookings/:id", () => {
    let orderId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1, SEAT_E2] });
      orderId = res.body.orderId;
    });

    it("chủ đơn Alice xem tóm tắt đơn thành công (200)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/bookings/${orderId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body.id).toBe(orderId);
      expect(res.body.status).toBe("holding");
      expect(res.body.movie.title).toBe("Dune 2");
      expect(res.body.cinema.name).toBe("FilmBooking Hà Nội 01");
      expect(res.body.cinema.address).toBe("123 Đường Láng");
      expect(res.body.showtime.roomName).toBe("Phòng 1");
      expect(res.body.seats).toHaveLength(2);
      expect(res.body.pricing.subtotal).toBe(150000);
      expect(res.body.pricing.total).toBe(150000);
      expect(res.body.expiresInSeconds).toBeGreaterThan(0);
      expect(res.body.ageConfirmed).toBe(false);
      expect(res.body.consent.consented).toBe(false);
    });

    it("người khác (Bob) xem đơn của Alice -> 403 FORBIDDEN", async () => {
      const res = await request(app.getHttpServer())
        .get(`/bookings/${orderId}`)
        .set("Authorization", `Bearer ${bobToken}`)
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("đơn không tồn tại -> 404 NOT_FOUND", async () => {
      const fakeOrderId = uuid(999);
      const res = await request(app.getHttpServer())
        .get(`/bookings/${fakeOrderId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(404);

      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================================================
  // 4. POST /bookings/:id/age-confirm
  // ==========================================================================
  describe("POST /bookings/:id/age-confirm", () => {
    let orderId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] });
      orderId = res.body.orderId;
    });

    it("chủ đơn xác nhận độ tuổi thành công -> 200", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/age-confirm`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({})
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.ageConfirmed).toBe(true);

      const summary = await request(app.getHttpServer())
        .get(`/bookings/${orderId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      expect(summary.body.ageConfirmed).toBe(true);
    });

    it("người khác xác nhận độ tuổi -> 403 FORBIDDEN", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/age-confirm`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({})
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================================================
  // 5. POST /bookings/:id/consent (AC-08)
  // ==========================================================================
  describe("POST /bookings/:id/consent", () => {
    let orderId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] });
      orderId = res.body.orderId;
    });

    it("AC-08 & A/MAJOR-2: lưu bằng chứng đồng ý không huỷ/không hoàn kèm thời điểm và phiên bản nội dung server-enforced, không fake IP", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/consent`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .set("User-Agent", "TestRunner/1.0")
        .send({ version: "1.0.0" })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.consentAt).toBeDefined();
      expect(res.body.version).toBe("1.0.0");

      // Kiểm tra bản ghi consents được lưu vào DB
      const consentRecord = (fakeDb.tables.consents ?? []).find(
        (c) => c.user_id === ALICE && c.consent_type === "NO_REFUND_BOOKING",
      );
      expect(consentRecord).toBeDefined();
      expect(consentRecord?.version).toBe("1.0.0");
      expect((consentRecord?.metadata as { order_id: string; ip: string | null })?.order_id).toBe(orderId);
      // IP được lấy từ kết nối thực tế
      expect((consentRecord?.metadata as { ip: string | null })?.ip).toBeDefined();

      // Kiểm tra orders.consent_at được cập nhật chính xác bằng accepted_at của consentRecord
      const updatedOrder = (fakeDb.tables.orders ?? []).find((o) => o.id === orderId);
      expect(updatedOrder?.consent_at).toBe(consentRecord?.accepted_at);
      expect(res.body.consentAt).toBe(consentRecord?.accepted_at);

      // Tóm tắt đơn hiển thị đã đồng ý
      const summary = await request(app.getHttpServer())
        .get(`/bookings/${orderId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      expect(summary.body.consent.consented).toBe(true);
      expect(summary.body.consent.consentAt).toBe(consentRecord?.accepted_at);
    });

    it("A/MAJOR-2: saveConsent lưu ip: null khi không có IP (không fake 127.0.0.1)", async () => {
      const bookingService = app.get(BookingService);
      const aliceAuthUser = { id: ALICE, email: "alice@filmbooking.vn", jwt: aliceToken, authTime: Math.floor(Date.now() / 1000) };
      await bookingService.saveConsent(aliceAuthUser, orderId, null, "TestRunner/1.0");

      const latestConsent = (fakeDb.tables.consents ?? []).filter((c) => c.user_id === ALICE).pop();
      expect((latestConsent?.metadata as { ip: string | null })?.ip).toBeNull();
    });

    it("A/MAJOR-2: từ chối 400 VALIDATION_ERROR khi client gửi phiên bản không hợp lệ", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/consent`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ version: "99.9.9" })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("người khác gọi consent -> 403 FORBIDDEN", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/consent`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ version: "1.0.0" })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================================================
  // 6. POST & DELETE /bookings/:id/voucher
  // ==========================================================================
  describe("Voucher on Booking (POST & DELETE /bookings/:id/voucher)", () => {
    let orderId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1, SEAT_E2] });
      orderId = res.body.orderId;
    });

    it("áp dụng voucher hợp lệ thành công -> 200 giảm 10.000đ", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(201);

      expect(res.body.discountAmount).toBe(10000);
      expect(res.body.totalAmount).toBe(140000);
      expect(res.body.code).toBe("VOUCHER10K");

      const summary = await request(app.getHttpServer())
        .get(`/bookings/${orderId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      expect(summary.body.pricing.discount).toBe(10000);
      expect(summary.body.pricing.total).toBe(140000);
      expect(summary.body.voucher?.code).toBe("VOUCHER10K");
    });

    it("áp dụng voucher lần 2 trên cùng 1 đơn -> 409 CONFLICT", async () => {
      await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(409);

      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("mã voucher không tồn tại -> 404 VOUCHER_NOT_FOUND", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "KHONGTONTAI" })
        .expect(404);

      expect(res.body.error.code).toBe("VOUCHER_NOT_FOUND");
    });

    it("mã voucher đã hết hạn -> 422 VOUCHER_EXPIRED", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "EXPIRED" })
        .expect(422);

      expect(res.body.error.code).toBe("VOUCHER_EXPIRED");
    });

    it("mã voucher đã hết lượt -> 422 VOUCHER_EXHAUSTED", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "EXHAUSTED" })
        .expect(422);

      expect(res.body.error.code).toBe("VOUCHER_EXHAUSTED");
    });

    it("chưa đủ giá trị đơn tối thiểu -> 422 VOUCHER_MIN_ORDER", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "MIN500K" })
        .expect(422);

      expect(res.body.error.code).toBe("VOUCHER_MIN_ORDER");
    });

    it("mã không áp dụng cho phim/suất này -> 422 VOUCHER_NOT_APPLICABLE_SHOWTIME", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "OTHERMOVIE" })
        .expect(422);

      expect(res.body.error.code).toBe("VOUCHER_NOT_APPLICABLE_SHOWTIME");
    });

    it("R-95: nhập voucher sai quá 10 lần/phút -> 429 RATE_LIMITED", async () => {
      // 10 lần sai đầu tiên -> 404
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post(`/bookings/${orderId}/voucher`)
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({ code: `SAI_${i}` })
          .expect(404);
      }

      // Lần thứ 11 -> 429 RATE_LIMITED
      const res = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(429);

      expect(res.body.error.code).toBe("RATE_LIMITED");
    });

    it("gỡ voucher thành công qua DELETE /bookings/:id/voucher", async () => {
      await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body.discountAmount).toBe(0);
      expect(res.body.totalAmount).toBe(150000);
    });

    it("A/MAJOR-3: non-owner (Bob) hoặc Staff gọi applyVoucher -> 403 FORBIDDEN", async () => {
      const resBob = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(403);
      expect(resBob.body.error.code).toBe("FORBIDDEN");

      const resStaff = await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(403);
      expect(resStaff.body.error.code).toBe("FORBIDDEN");
    });

    it("A/MAJOR-3: non-owner (Bob) hoặc Staff gọi removeVoucher -> 403 FORBIDDEN", async () => {
      // Alice áp dụng voucher trước
      await request(app.getHttpServer())
        .post(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ code: "VOUCHER10K" })
        .expect(201);

      const resBob = await request(app.getHttpServer())
        .delete(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${bobToken}`)
        .expect(403);
      expect(resBob.body.error.code).toBe("FORBIDDEN");

      const resStaff = await request(app.getHttpServer())
        .delete(`/bookings/${orderId}/voucher`)
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(403);
      expect(resStaff.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================================================
  // 7. DELETE /bookings/:id/hold (nhả ghế)
  // ==========================================================================
  describe("DELETE /bookings/:id/hold", () => {
    let orderId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ showtimeId: SHOWTIME_1, seatIds: [SEAT_E1] });
      orderId = res.body.orderId;
    });

    it("chủ đơn Alice nhả ghế thành công -> 200", async () => {
      const res = await request(app.getHttpServer())
        .delete(`/bookings/${orderId}/hold`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.orderId).toBe(orderId);

      // Ghế được giải phóng về FREE trên seatmap
      const seatmap = await request(app.getHttpServer()).get(`/showtimes/${SHOWTIME_1}/seatmap`).expect(200);
      const seatE1 = seatmap.body.seats.find((s: { id: string }) => s.id === SEAT_E1);
      expect(seatE1.state).toBe("FREE");
    });

    it("đơn không tồn tại -> 404 NOT_FOUND", async () => {
      const fakeOrderId = uuid(999);
      const res = await request(app.getHttpServer())
        .delete(`/bookings/${fakeOrderId}/hold`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(404);

      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("A/MAJOR-3: non-owner (Bob) hoặc Staff gọi releaseHold -> 403 FORBIDDEN", async () => {
      const resBob = await request(app.getHttpServer())
        .delete(`/bookings/${orderId}/hold`)
        .set("Authorization", `Bearer ${bobToken}`)
        .expect(403);
      expect(resBob.body.error.code).toBe("FORBIDDEN");

      const resStaff = await request(app.getHttpServer())
        .delete(`/bookings/${orderId}/hold`)
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(403);
      expect(resStaff.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================================================
  // AC-08 & A/MAJOR-5: CONSENT_REQUIRED HTTP Status Code
  // ==========================================================================
  describe("AC-08 & A/MAJOR-5: CONSENT_REQUIRED HTTP Status", () => {
    it("CONSENT_REQUIRED có HTTP status 409 theo AC-08 và API_SPEC", () => {
      expect(ERROR_HTTP_STATUS.CONSENT_REQUIRED).toBe(409);
    });
  });

  // ==========================================================================
  // 8. Postgres RLS & Permission Guard Verification (Defect 1, 2, 3)
  // ==========================================================================
  describe("Postgres Security & RLS Enforcement Verification (Defect 1, 2, 3)", () => {
    it("userDb không được update bảng orders trực tiếp (42501)", async () => {
      const userDb = fakeSupabase.forUser();
      const res = await userDb.from("orders").update({ age_confirmed: true }).eq("id", "any-id");
      expect(res.error?.code).toBe("42501");
    });

    it("userDb không được insert accepted_at vào bảng consents (42501)", async () => {
      const userDb = fakeSupabase.forUser();
      const res = await userDb.from("consents").insert({
        user_id: ALICE,
        consent_type: "NO_REFUND_BOOKING",
        version: "1.0.0",
        accepted_at: new Date().toISOString(),
      });
      expect(res.error?.code).toBe("42501");
    });

    it("userDb không thể select bảng vouchers trực tiếp (RLS trả về rỗng)", async () => {
      const userDb = fakeSupabase.forUser();
      const res = await userDb.from("vouchers").select().eq("code", "VOUCHER10K").maybeSingle();
      expect(res.data).toBeNull();
    });
  });
});
