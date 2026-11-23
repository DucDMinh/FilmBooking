import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SCAN_RESULT_COLOR, type ScanTicketResponse } from "@filmbooking/shared/schemas/checkin";
import { AccessService } from "../src/common/auth/access.service";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { CinemaScopeGuard } from "../src/common/auth/cinema-scope.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { CheckinController } from "../src/modules/checkin/checkin.controller";
import { CheckinService } from "../src/modules/checkin/checkin.service";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://abc.supabase.co";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const HN01 = uuid(1);
const HN02 = uuid(2);
const ADMIN = uuid(31);
const MANAGER_HN01 = uuid(32);
const STAFF_HN01 = uuid(33);
const CUSTOMER = uuid(34);

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
  jwtUsed: string;
}

let rpcCalls: RpcCall[] = [];
let rpcPayload: Record<string, unknown> = {};
let rpcError: { code: string; message: string } | null = null;
/** Bảng đọc bằng client của nhân viên (RLS), tách khỏi `accessRows` đọc bằng service role. */
const tableRows: Record<string, Record<string, unknown>[]> = {};
let comboRowsError: { message: string } | null = null;

/** Payload cố tình chứa PII để chứng minh API chỉ chuyển tiếp danh sách trắng. */
const PII = { customer_name: "Nguyen Van A", customer_email: "a@x.vn", seat_label: "A1", full_name: "Nguyen Van A" };
const PII_PATTERN = /Nguyen|a@x\.vn|customer|"A1"/;

const accessRows: Record<string, Record<string, unknown>[]> = {
  user_roles: [{ user_id: ADMIN, role: "ADMIN" }],
  staff_assignments: [
    { user_id: MANAGER_HN01, cinema_id: HN01, role: "MANAGER" },
    { user_id: STAFF_HN01, cinema_id: HN01, role: "STAFF" },
  ],
};

const fakeClient = (jwt: string) => ({
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args, jwtUsed: jwt });
    return { data: rpcError ? null : rpcPayload, error: rpcError };
  },
  from: (table: string) => ({
    select: () => ({
      eq: async (column: string, value: string) => ({
        data: comboRowsError ? null : (tableRows[table] ?? []).filter((row) => row[column] === value),
        error: comboRowsError,
      }),
    }),
  }),
});

const fakeAdmin = {
  from: (table: string) => ({
    select: () => ({
      eq: async (column: string, value: string) => ({
        data: (accessRows[table] ?? []).filter((row) => row[column] === value),
        error: null,
      }),
    }),
  }),
};

const fakeSupabase = { forUser: fakeClient, admin: () => fakeAdmin };

const sign = (sub: string) =>
  new SignJWT({ email: `${sub}@x.vn` })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));

describe("checkin API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CheckinController],
      providers: [
        { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL } as Env },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        CheckinService,
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
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    rpcCalls = [];
    rpcError = null;
    rpcPayload = {};
    comboRowsError = null;
  });

  const scan = async (as: string, payload: object) =>
    request(app.getHttpServer()).post("/checkin/scan").set("Authorization", `Bearer ${await sign(as)}`).send(payload);
  const parsed = (res: request.Response) => res.body as ScanTicketResponse;

  describe("phân quyền theo rạp làm việc (R-102)", () => {
    it("không token -> 401", async () => {
      const res = await request(app.getHttpServer()).post("/checkin/scan").send({ cinemaId: HN01, token: "abc" });
      expect(res.status).toBe(401);
    });

    it("khách hàng (không có vai trò) -> 403, không gọi RPC", async () => {
      const res = await scan(CUSTOMER, { cinemaId: HN01, token: "abc" });
      expect(res.status).toBe(403);
      expect(rpcCalls).toHaveLength(0);
    });

    it("Staff gửi cinemaId không được gán -> 403 FORBIDDEN_CINEMA, không gọi RPC", async () => {
      const res = await scan(STAFF_HN01, { cinemaId: HN02, token: "abc" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
      expect(rpcCalls).toHaveLength(0);
    });

    it("Manager rạp khác -> 403; Manager đúng rạp và Admin (mọi rạp) -> 200", async () => {
      rpcPayload = { status: "INVALID", message: "x" };
      expect((await scan(MANAGER_HN01, { cinemaId: HN02, token: "abc" })).status).toBe(403);
      expect((await scan(MANAGER_HN01, { cinemaId: HN01, token: "abc" })).status).toBe(200);
      expect((await scan(ADMIN, { cinemaId: HN02, token: "abc" })).status).toBe(200);
    });

    it("RPC trả 42501 -> 403 FORBIDDEN_CINEMA", async () => {
      rpcError = { code: "42501", message: "FORBIDDEN_CINEMA_SCOPE" };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "abc" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
    });
  });

  describe("gọi RPC", () => {
    it("dùng client của user, staff id lấy từ JWT; body mang staffId bị từ chối", async () => {
      rpcPayload = { status: "INVALID", message: "x" };
      const spoof = await scan(STAFF_HN01, { cinemaId: HN01, bookingCode: "ABC123", staffId: CUSTOMER });
      expect(spoof.status).toBe(400);
      expect(rpcCalls).toHaveLength(0);

      await scan(STAFF_HN01, { cinemaId: HN01, bookingCode: "ABC123" });
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0]).toMatchObject({
        fn: "checkin_ticket",
        args: { p_token_or_code: "ABC123", p_cinema_id: HN01, p_staff_id: STAFF_HN01 },
      });
      expect(rpcCalls[0]?.jwtUsed).not.toBe("");
    });

    it("thiếu hoặc đủ cả token lẫn bookingCode, hoặc chuỗi trống -> 400", async () => {
      expect((await scan(STAFF_HN01, { cinemaId: HN01 })).status).toBe(400);
      expect((await scan(STAFF_HN01, { cinemaId: HN01, token: "a", bookingCode: "B" })).status).toBe(400);
      expect((await scan(STAFF_HN01, { cinemaId: HN01, token: "   " })).status).toBe(400);
      expect(rpcCalls).toHaveLength(0);
    });
  });

  describe("kết quả màu (AC-12, AC-13)", () => {
    it("OK (xanh): trả cả đơn với đủ N ghế và seatCount (QR cấp đơn)", async () => {
      rpcPayload = {
        status: "OK",
        result: "SUCCESS",
        message: "Soát vé thành công",
        order_id: uuid(90),
        booking_code: "ABC123",
        movie_title: "Phim",
        cinema_name: "Rạp 1",
        room_name: "P1",
        seats: ["A1", "A2", "A10"],
        seat_count: 3,
        starts_at: "2026-12-01T12:00:00Z",
        checked_in_at: "2026-12-01T11:50:00Z",
        customer_name: "Nguyen Van A",
        customer_email: "a@x.vn",
        ticket_id: uuid(91),
      };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
      expect(res.status).toBe(200);
      expect(parsed(res)).toMatchObject({ result: "OK", color: "green" });
      expect(parsed(res).order).toEqual({
        orderId: uuid(90),
        bookingCode: "ABC123",
        movieTitle: "Phim",
        cinemaName: "Rạp 1",
        roomName: "P1",
        seats: ["A1", "A2", "A10"],
        seatCount: 3,
        startsAt: "2026-12-01T12:00:00Z",
        checkedInAt: "2026-12-01T11:50:00Z",
        combos: [],
      });
      expect(res.body.ticket).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/Nguyen|a@x\.vn|customer|ticket_id|ticketId/);
    });

    it("OK: kèm combo bắp nước của đơn (tên + số lượng), không lộ giá hay id nội bộ", async () => {
      tableRows.order_combos = [
        { order_id: uuid(90), combo_name: "Combo Solo", quantity: 2, unit_price: 99000, id: uuid(95) },
        { order_id: uuid(99), combo_name: "Đơn khác", quantity: 1, unit_price: 1000, id: uuid(96) },
      ];
      try {
        rpcPayload = { status: "OK", message: "m", order_id: uuid(90), seats: ["A1"], seat_count: 1 };
        const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
        expect(parsed(res).order?.combos).toEqual([{ name: "Combo Solo", quantity: 2 }]);
        expect(JSON.stringify(res.body)).not.toMatch(/99000|unit_price/);
      } finally {
        delete tableRows.order_combos;
      }
    });

    it("OK: đọc combo lỗi thì vẫn trả kết quả soát với combos rỗng (không làm hỏng lượt soát)", async () => {
      comboRowsError = { message: "boom" };
      rpcPayload = { status: "OK", message: "m", order_id: uuid(90), seats: ["A1"], seat_count: 1 };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
      expect(res.status).toBe(200);
      expect(parsed(res)).toMatchObject({ result: "OK", order: { combos: [] } });
    });

    it("OK: seats có phần tử không phải chuỗi bị lọc; seatCount luôn = số ghế đã lọc (bỏ qua seat_count của RPC)", async () => {
      rpcPayload = {
        status: "OK",
        message: "m",
        order_id: uuid(90),
        booking_code: "ABC123",
        seats: ["A1", 7, null, "A2"],
        seat_count: "2",
      };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
      expect(parsed(res).order?.seats).toEqual(["A1", "A2"]);
      expect(parsed(res).order?.seatCount).toBe(2);
    });

    it("OK: seats không phải mảng -> seats rỗng, seatCount 0", async () => {
      rpcPayload = { status: "OK", message: "m", order_id: uuid(90), seats: "A1", seat_count: 1 };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
      expect(parsed(res).order?.seats).toEqual([]);
      expect(parsed(res).order?.seatCount).toBe(0);
    });

    it("USED (đỏ): quét lần hai báo giờ và nhân viên đã soát lần đầu (AC-12)", async () => {
      rpcPayload = {
        status: "USED",
        message: "Vé đã được sử dụng",
        checked_in_at: "2026-12-01T11:50:00Z",
        staff_name: "Lan",
        seats: ["A1", "A2"],
        seat_count: 2,
        ...PII,
      };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
      expect(parsed(res)).toMatchObject({
        result: "USED",
        color: "red",
        used: { checkedInAt: "2026-12-01T11:50:00Z", staffName: "Lan" },
      });
      expect(JSON.stringify(res.body)).not.toMatch(PII_PATTERN);
    });

    it("TOO_EARLY (đỏ): chưa đến giờ vào phòng chiếu báo đỏ và kèm giờ chiếu (AC-12)", async () => {
      rpcPayload = {
        status: "TOO_EARLY",
        message: "Chưa đến giờ vào phòng chiếu",
        starts_at: "2026-12-01T12:00:00Z",
        ...PII,
      };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
      expect(parsed(res)).toMatchObject({
        result: "TOO_EARLY",
        color: "red",
        startsAt: "2026-12-01T12:00:00Z",
      });
      expect(JSON.stringify(res.body)).not.toMatch(PII_PATTERN);
    });

    it("WRONG_CINEMA (đỏ): chỉ trả rạp đúng, KHÔNG lộ tên khách, ghế, email (AC-13)", async () => {
      rpcPayload = {
        status: "WRONG_CINEMA",
        message: "Vé thuộc rạp khác",
        correct_cinema_id: HN02,
        correct_cinema_code: "HN02",
        correct_cinema_name: "Rạp Hai",
        correct_cinema_address: "1 Phố A",
        ...PII,
        movie_title: "Phim bí mật",
        booking_code: "ABC123",
        order_id: uuid(90),
        seats: ["A1", "A2"],
        seat_count: 2,
      };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, token: "qr" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        result: "WRONG_CINEMA",
        color: "red",
        message: "Vé thuộc rạp khác",
        correctCinema: { id: HN02, code: "HN02", name: "Rạp Hai", address: "1 Phố A" },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/Nguyen|a@x\.vn|"A1"|"A2"|seat|bí mật|ABC123/i);
      expect(JSON.stringify(res.body)).not.toContain(uuid(90));
    });

    it.each([
      [{ status: "CANCELLED", result: "AFFECTED", message: "m", order_status: "cancelled", ...PII }, "CANCELLED"],
      [{ status: "EXPIRED", result: "OUTSIDE_WINDOW", message: "m", expired_at: "x", ...PII }, "EXPIRED"],
      [{ status: "TOO_EARLY", message: "m", starts_at: "2026-12-01T12:00:00Z", ...PII }, "TOO_EARLY"],
      [{ status: "INVALID", code: "TICKET_NOT_FOUND", message: "m" }, "NOT_FOUND"],
      [{ status: "INVALID", message: "m", order_status: "pending_payment", ...PII }, "NOT_PAID"],
    ] as const)("ánh xạ %j -> %s với màu đúng và không lộ PII", async (payload, expected) => {
      rpcPayload = { ...payload };
      const res = await scan(STAFF_HN01, { cinemaId: HN01, bookingCode: "ABC123" });
      expect(res.status).toBe(200);
      expect(parsed(res).result).toBe(expected);
      expect(parsed(res).color).toBe(SCAN_RESULT_COLOR[expected]);
      expect(JSON.stringify(res.body)).not.toMatch(PII_PATTERN);
    });
  });
});
