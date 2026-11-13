import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessService } from "../src/common/auth/access.service";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env, parseEnv, EnvValidationError } from "../src/config/env";
import { PaymentController } from "../src/modules/payment/payment.controller";
import { PaymentService } from "../src/modules/payment/payment.service";
import { PayosClient } from "../src/modules/payment/payos.client";
import { WebhookController } from "../src/modules/payment/webhook.controller";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://test.supabase.co";
const CHECKSUM_KEY = "test-payos-checksum-key-123456789";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const USER_CUSTOMER = uuid(101);
const USER_OTHER = uuid(102);
const USER_NO_CONSENT = uuid(103);
const USER_ZERO = uuid(104);
const USER_OLD_PENDING = uuid(105);
const USER_EXPIRED = uuid(106);

const CINEMA_HN01 = uuid(201);
const SHOWTIME_01 = uuid(301);

const ORDER_PENDING_01 = uuid(401);
const ORDER_NO_CONSENT = uuid(402);
const ORDER_EXPIRED = uuid(403);
const ORDER_ZERO_VOUCHER = uuid(404);
const ORDER_OLD_PENDING = uuid(405);
const ORDER_LATE_SEATS_SOLD = uuid(406);
const ORDER_OLD_CANCELLED = uuid(407);

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
  emailOutbox: Row[] = [];
  tickets: Row[] = [];
  paymentEvents: Row[] = [];

  reset() {
    this.emailOutbox = [];
    this.tickets = [];
    this.paymentEvents = [];
    this.tables = {
      orders: [
        {
          id: ORDER_PENDING_01,
          cinema_id: CINEMA_HN01,
          cinema_code: "HN01",
          showtime_id: SHOWTIME_01,
          user_id: USER_CUSTOMER,
          status: "holding",
          subtotal_amount: 150000,
          discount_amount: 0,
          total_amount: 150000,
          booking_code: "HN01-123456",
          hold_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          consent_at: new Date().toISOString(),
        },
        {
          id: ORDER_OLD_CANCELLED,
          cinema_id: CINEMA_HN01,
          cinema_code: "HN01",
          showtime_id: SHOWTIME_01,
          user_id: USER_CUSTOMER,
          status: "cancelled",
          subtotal_amount: 150000,
          discount_amount: 0,
          total_amount: 150000,
          booking_code: "HN01-777777",
          hold_expires_at: new Date(Date.now() - 5000).toISOString(),
          consent_at: new Date().toISOString(),
        },
        {
          id: ORDER_NO_CONSENT,
          cinema_id: CINEMA_HN01,
          cinema_code: "HN01",
          showtime_id: SHOWTIME_01,
          user_id: USER_NO_CONSENT,
          status: "holding",
          subtotal_amount: 150000,
          discount_amount: 0,
          total_amount: 150000,
          booking_code: "HN01-222222",
          hold_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          consent_at: null,
        },
        {
          id: ORDER_EXPIRED,
          cinema_id: CINEMA_HN01,
          cinema_code: "HN01",
          showtime_id: SHOWTIME_01,
          user_id: USER_EXPIRED,
          status: "holding",
          subtotal_amount: 150000,
          discount_amount: 0,
          total_amount: 150000,
          booking_code: "HN01-333333",
          hold_expires_at: new Date(Date.now() - 1000).toISOString(), // đã hết hạn
          consent_at: new Date().toISOString(),
        },
        {
          id: ORDER_ZERO_VOUCHER,
          cinema_id: CINEMA_HN01,
          cinema_code: "HN01",
          showtime_id: SHOWTIME_01,
          user_id: USER_ZERO,
          status: "holding",
          subtotal_amount: 150000,
          discount_amount: 150000,
          total_amount: 0,
          booking_code: "HN01-000000",
          hold_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          consent_at: new Date().toISOString(),
        },
        {
          id: ORDER_OLD_PENDING,
          cinema_id: CINEMA_HN01,
          cinema_code: "HN01",
          showtime_id: SHOWTIME_01,
          user_id: USER_OLD_PENDING,
          status: "pending_payment",
          subtotal_amount: 150000,
          discount_amount: 0,
          total_amount: 150000,
          booking_code: "HN01-555555",
          hold_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          consent_at: new Date().toISOString(),
        },
        {
          id: ORDER_LATE_SEATS_SOLD,
          cinema_id: CINEMA_HN01,
          cinema_code: "HN01",
          showtime_id: SHOWTIME_01,
          user_id: USER_CUSTOMER,
          status: "expired",
          subtotal_amount: 150000,
          discount_amount: 0,
          total_amount: 150000,
          booking_code: "HN01-666666",
          hold_expires_at: new Date(Date.now() - 60000).toISOString(),
          consent_at: new Date().toISOString(),
        },
      ],
      payments: [
        {
          id: uuid(901),
          order_id: ORDER_OLD_CANCELLED,
          cinema_id: CINEMA_HN01,
          order_code: 999901,
          amount: 150000,
          status: "CANCELLED",
          payment_link_id: "link-payos-999901",
          link_cancelled_at: null,
        },
        {
          id: uuid(903),
          order_id: ORDER_OLD_PENDING,
          cinema_id: CINEMA_HN01,
          order_code: 999903,
          amount: 150000,
          status: "PENDING",
          payment_link_id: "link-payos-999903",
          link_cancelled_at: null,
        },
        {
          id: uuid(902),
          order_id: ORDER_LATE_SEATS_SOLD,
          cinema_id: CINEMA_HN01,
          order_code: 999902,
          amount: 150000,
          status: "PENDING",
          payment_link_id: "link-payos-999902",
          link_cancelled_at: null,
        },
      ],
      order_seats: [
        { id: uuid(701), order_id: ORDER_PENDING_01, seat_id: uuid(801) },
      ],
      user_roles: [
        { user_id: USER_CUSTOMER, role: "CUSTOMER" },
        { user_id: USER_NO_CONSENT, role: "CUSTOMER" },
        { user_id: USER_ZERO, role: "CUSTOMER" },
        { user_id: USER_OLD_PENDING, role: "CUSTOMER" },
        { user_id: USER_EXPIRED, role: "CUSTOMER" },
      ],
      staff_assignments: [],
    };
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    if (fn === "confirm_zero_amount") {
      const orderId = args.p_order_id as string;
      const order = (this.tables.orders ?? []).find((o) => o.id === orderId);
      if (!order) return Promise.resolve({ data: null, error: { code: "P0001", message: "Order not found" } });
      order.status = "paid";
      return Promise.resolve({
        data: { success: true, status: "SUCCESS", order_id: orderId, booking_code: order.booking_code },
        error: null,
      });
    }

    if (fn === "mark_payment_cancelled") {
      const orderId = args.p_order_id as string;
      const order = (this.tables.orders ?? []).find((o) => o.id === orderId);
      if (order) order.status = "cancelled";
      const pay = (this.tables.payments ?? []).find((p) => p.order_id === orderId && p.status === "PENDING");
      if (pay) pay.status = "CANCELLED";
      return Promise.resolve({ data: { success: true, status: "cancelled", order_id: orderId }, error: null });
    }

    if (fn === "record_payment_event") {
      const ref = args.p_transaction_ref as string;
      const existing = this.paymentEvents.find((e) => e.transaction_ref === ref);
      if (!existing) {
        this.paymentEvents.push({ ...args });
      }
      return Promise.resolve({ data: { id: uuid(501) }, error: null });
    }

    if (fn === "confirm_paid") {
      const orderId = args.p_order_id as string;
      const orderCode = args.p_order_code as number | undefined;
      const order = (this.tables.orders ?? []).find((o) => o.id === orderId);
      if (!order) return Promise.resolve({ data: null, error: { code: "P0001", message: "Order not found" } });

      // AC-10 Idempotency: nếu đã paid -> trả ALREADY_PAID
      if (order.status === "paid") {
        return Promise.resolve({
          data: { success: true, status: "ALREADY_PAID", order_id: order.id, booking_code: order.booking_code },
          error: null,
        });
      }

      // K5-1: Ưu tiên chọn payment theo order_code = p_order_code, fallback theo order_id mới nhất
      let pay = orderCode
        ? (this.tables.payments ?? []).find((p) => p.order_id === orderId && p.order_code === orderCode)
        : null;
      if (!pay) {
        pay = (this.tables.payments ?? []).filter((p) => p.order_id === orderId).at(-1);
      }

      // Mô phỏng lỗi 23505 nếu chọn nhầm payment cũ khác mà cố gán order_code của payment đang tồn tại
      if (pay && orderCode && pay.order_code !== orderCode) {
        const conflict = (this.tables.payments ?? []).find(
          (p) => p.order_code === orderCode && p.id !== pay?.id,
        );
        if (conflict) {
          return Promise.resolve({
            data: null,
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "payments_order_code_key"',
            },
          });
        }
      }

      // AC-11: Nếu là đơn ORDER_LATE_SEATS_SOLD (đơn expired + ghế đã bán) -> chuyển sang needs_manual_review
      if (order.id === ORDER_LATE_SEATS_SOLD) {
        order.status = "needs_manual_review";
        if (pay) pay.status = "PAID";
        this.emailOutbox.push({
          kind: "LATE_PAYMENT_MANUAL_REVIEW",
          order_id: order.id,
          status: "PENDING",
        });
        return Promise.resolve({
          data: { success: false, status: "NEEDS_MANUAL_REVIEW", order_id: order.id },
          error: null,
        });
      }

      // Thanh toán thành công bình thường
      order.status = "paid";
      if (pay) pay.status = "PAID";

      this.tickets.push({
        id: uuid(999),
        order_id: order.id,
        qr_token: "token-123456",
      });

      this.emailOutbox.push({
        kind: "TICKET_ISSUED",
        order_id: order.id,
        booking_code: order.booking_code,
        status: "PENDING",
      });

      return Promise.resolve({
        data: { success: true, status: "SUCCESS", order_id: order.id, booking_code: order.booking_code },
        error: null,
      });
    }

    return Promise.resolve({ data: null, error: { code: "PGRST202", message: "function not found" } });
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
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
  neq(key: string, value: unknown) {
    this.filters.push((row) => row[key] !== value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  is(key: string, value: unknown) {
    this.filters.push((row) => {
      const val = row[key];
      if (value === null) {
        return val === null || val === undefined;
      }
      return val === value;
    });
    return this;
  }
  not(key: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[key] !== null && row[key] !== undefined);
    } else if (operator === "eq") {
      this.filters.push((row) => row[key] !== value);
    } else if (operator === "in" && Array.isArray(value)) {
      this.filters.push((row) => !value.includes(row[key]));
    }
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
    return (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)));
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
        id: uuid(Math.floor(Math.random() * 100000)),
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
}

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
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(JWT_SECRET));

describe("Payment & PayOS Webhook API (Task 02: R-73..R-84, AC-09, AC-10, AC-11, K5-1, B/M1-M4)", () => {
  let app: INestApplication;
  let customerToken: string;
  let otherToken: string;
  let noConsentToken: string;
  let zeroToken: string;
  let pendingToken: string;
  let expiredToken: string;
  let payosClient: PayosClient;

  beforeAll(async () => {
    customerToken = await sign(USER_CUSTOMER);
    otherToken = await sign(USER_OTHER);
    noConsentToken = await sign(USER_NO_CONSENT);
    zeroToken = await sign(USER_ZERO);
    pendingToken = await sign(USER_OLD_PENDING);
    expiredToken = await sign(USER_EXPIRED);

    const testEnv: Env = {
      NODE_ENV: "test",
      PORT: 3001,
      WEB_ORIGIN: ["http://localhost:3000"],
      SUPABASE_URL,
      SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      SUPABASE_JWT_SECRET: JWT_SECRET,
      PAYOS_CHECKSUM_KEY: CHECKSUM_KEY,
      PAYOS_CLIENT_ID: "mock-client-id",
      PAYOS_API_KEY: "mock-api-key",
    } as Env;

    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentController, WebhookController],
      providers: [
        { provide: ENV, useValue: testEnv },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        PaymentService,
        PayosClient,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    payosClient = moduleRef.get(PayosClient);
  });

  beforeEach(() => {
    fakeDb.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /bookings/:id/payment", () => {
    it("yêu cầu xác thực (401 khi không có token)", async () => {
      const res = await request(app.getHttpServer()).post(`/bookings/${ORDER_PENDING_01}/payment`);
      expect(res.status).toBe(401);
    });

    it("404 khi đơn không tồn tại", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${uuid(99999)}/payment`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(404);
    });

    it("403 khi đơn không thuộc về user", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_PENDING_01}/payment`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });

    it("AC-08: tạo payment khi chưa có consent -> 409 CONSENT_REQUIRED", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_NO_CONSENT}/payment`)
        .set("Authorization", `Bearer ${noConsentToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe("CONSENT_REQUIRED");
    });

    it("410 khi đơn đã hết hạn giữ ghế", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_EXPIRED}/payment`)
        .set("Authorization", `Bearer ${expiredToken}`);
      expect(res.status).toBe(410);
      expect(res.body.error?.code).toBe("HOLD_EXPIRED");
    });

    it("đơn 0đ (voucher 100%): gọi confirm_zero_amount, chốt luôn status PAID, không checkoutUrl", async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_ZERO_VOUCHER}/payment`)
        .set("Authorization", `Bearer ${zeroToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PAID");
      expect(res.body.checkoutUrl).toBeNull();
      expect(res.body.bookingCode).toBe("HN01-000000");

      const order = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_ZERO_VOUCHER);
      expect(order?.status).toBe("paid");
    });

    it("đơn có tiền: tạo payment link, đơn sang pending_payment, huỷ link PayOS của đơn cũ bị hold_seats huỷ (#10, B/M2)", async () => {
      const cancelSpy = vi.spyOn(payosClient, "cancelPaymentLink");

      const res = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_PENDING_01}/payment`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          returnUrl: "http://localhost:3000/dat-ve/xac-nhan",
          cancelUrl: "http://localhost:3000/dat-ve/huy",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("AWAITING_PAYMENT");
      expect(res.body.checkoutUrl).toContain("payos.vn");
      expect(res.body.bookingCode).toBe("HN01-123456");

      // Đơn hiện tại chuyển sang pending_payment
      const currentOrder = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_PENDING_01);
      expect(currentOrder?.status).toBe("pending_payment");

      // Bản ghi payment mới được lưu
      const newPayment = (fakeDb.tables.payments ?? []).find(
        (p) => p.order_id === ORDER_PENDING_01 && p.status === "PENDING",
      );
      expect(newPayment).toBeDefined();
      expect(newPayment?.amount).toBe(150000);

      // Link của đơn cũ bị hold_seats huỷ (status = CANCELLED, link_cancelled_at = null)
      // được huỷ trên PayOS và cập nhật link_cancelled_at (B/M2)
      expect(cancelSpy).toHaveBeenCalledWith(999901, "Huỷ đơn cũ");
      const oldPayment = (fakeDb.tables.payments ?? []).find((p) => p.order_code === 999901);
      expect(oldPayment?.status).toBe("CANCELLED");
      expect(oldPayment?.link_cancelled_at).toBeDefined();
      expect(typeof oldPayment?.link_cancelled_at).toBe("string");
    });

    it("B/M2: không gọi cancelPaymentLink lại cho payment đơn cũ đã có link_cancelled_at", async () => {
      // Đánh dấu payment 999901 đã huỷ link trước đó
      const oldPayment = (fakeDb.tables.payments ?? []).find((p) => p.order_code === 999901);
      if (oldPayment) {
        oldPayment.link_cancelled_at = new Date(Date.now() - 60000).toISOString();
      }

      const cancelSpy = vi.spyOn(payosClient, "cancelPaymentLink");

      const res = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_PENDING_01}/payment`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      // cancelPaymentLink KHÔNG được gọi với 999901 vì link_cancelled_at đã có giá trị
      expect(cancelSpy).not.toHaveBeenCalledWith(999901, expect.anything());
    });
  });

  describe("GET /bookings/:id/payment-status", () => {
    it("trả về trạng thái cho màn 'Đang xác nhận' (polling)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/bookings/${ORDER_OLD_PENDING}/payment-status`)
        .set("Authorization", `Bearer ${pendingToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("AWAITING_PAYMENT");
      expect(res.body.orderStatus).toBe("pending_payment");
      expect(res.body.bookingCode).toBe("HN01-555555");
    });
  });

  describe("POST /bookings/:id/payment/cancel", () => {
    it("huỷ payment link và chuyển đơn sang cancelled", async () => {
      const cancelSpy = vi.spyOn(payosClient, "cancelPaymentLink");

      const res = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_OLD_PENDING}/payment/cancel`)
        .set("Authorization", `Bearer ${pendingToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");

      const oldOrder = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_OLD_PENDING);
      expect(oldOrder?.status).toBe("cancelled");
      expect(cancelSpy).toHaveBeenCalledWith(999903, "Khách huỷ thanh toán");
    });
  });

  describe("POST /payos/webhook (@Public)", () => {
    it("AC-09: webhook chữ ký sai -> 200/400 theo chuẩn PayOS, đơn không đổi, log cảnh báo có orderCode", async () => {
      const payload = {
        code: "00",
        desc: "success",
        data: {
          orderCode: 999903,
          amount: 150000,
          reference: "REF_FAKE_01",
          code: "00",
        },
        signature: "invalid-signature-12345",
      };

      const res = await request(app.getHttpServer()).post("/payos/webhook").send(payload);

      // Theo AC-09: status 200 hoặc 400
      expect([200, 400]).toContain(res.status);
      expect(res.body.success).toBe(false);

      // Đơn không bị đổi trạng thái
      const order = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_OLD_PENDING);
      expect(order?.status).toBe("pending_payment");
    });

    it("AC-10: cùng webhook hợp lệ 3 lần -> đúng 1 lần paid, đúng 1 email vé trong outbox (idempotent)", async () => {
      const data = {
        orderCode: 999903,
        amount: 150000,
        reference: "REF_TXN_VALID_01",
        code: "00",
        transactionDateTime: new Date().toISOString(),
      };
      const validSignature = payosClient.computeSignature(data, CHECKSUM_KEY);

      const payload = {
        code: "00",
        desc: "success",
        data,
        signature: validSignature,
      };

      // Gửi lần 1
      const res1 = await request(app.getHttpServer()).post("/payos/webhook").send(payload);
      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      const orderAfter1 = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_OLD_PENDING);
      expect(orderAfter1?.status).toBe("paid");
      expect(fakeDb.tickets.length).toBe(1);
      expect(fakeDb.emailOutbox.length).toBe(1);

      // Gửi lần 2
      const res2 = await request(app.getHttpServer()).post("/payos/webhook").send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      // Gửi lần 3
      const res3 = await request(app.getHttpServer()).post("/payos/webhook").send(payload);
      expect(res3.status).toBe(200);
      expect(res3.body.success).toBe(true);

      // Idempotency: Vẫn chỉ đúng 1 vé và đúng 1 email outbox!
      expect(fakeDb.tickets.length).toBe(1);
      expect(fakeDb.emailOutbox.length).toBe(1);
    });

    it("AC-11: webhook cho đơn expired + ghế đã bán -> needs_manual_review và email hướng dẫn liên hệ", async () => {
      const data = {
        orderCode: 999902, // tương ứng ORDER_LATE_SEATS_SOLD
        amount: 150000,
        reference: "REF_TXN_LATE_02",
        code: "00",
        transactionDateTime: new Date().toISOString(),
      };
      const validSignature = payosClient.computeSignature(data, CHECKSUM_KEY);

      const payload = {
        code: "00",
        desc: "success",
        data,
        signature: validSignature,
      };

      const res = await request(app.getHttpServer()).post("/payos/webhook").send(payload);
      expect(res.status).toBe(200);

      const order = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_LATE_SEATS_SOLD);
      expect(order?.status).toBe("needs_manual_review");

      const payment = (fakeDb.tables.payments ?? []).find((p) => p.order_code === 999902);
      expect(payment?.status).toBe("PAID");

      // Email thông báo hướng dẫn liên hệ rạp được tạo trong outbox
      const manualReviewEmail = fakeDb.emailOutbox.find(
        (e) => e.kind === "LATE_PAYMENT_MANUAL_REVIEW",
      );
      expect(manualReviewEmail).toBeDefined();
    });
  });

  describe("K5-1: Thanh toán lại cùng đơn và tránh lỗi 23505", () => {
    it("thanh toán lại tạo payment mới, huỷ payment cũ, webhook xác nhận đúng payment mới không lỗi 23505", async () => {
      // 1. Khách gọi payment lần 1
      const res1 = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_PENDING_01}/payment`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res1.status).toBe(200);

      const payments1 = (fakeDb.tables.payments ?? []).filter(
        (p) => p.order_id === ORDER_PENDING_01,
      );
      expect(payments1.length).toBe(1);
      const payment1 = payments1[0]!;
      expect(payment1.status).toBe("PENDING");
      const orderCode1 = payment1.order_code as number;

      // 2. Khách thanh toán lại lần 2 (đơn đang pending_payment)
      const res2 = await request(app.getHttpServer())
        .post(`/bookings/${ORDER_PENDING_01}/payment`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res2.status).toBe(200);

      const payments2 = (fakeDb.tables.payments ?? []).filter(
        (p) => p.order_id === ORDER_PENDING_01,
      );
      expect(payments2.length).toBe(2);

      // Payment 1 đã bị CANCELLED và link_cancelled_at được cập nhật
      const p1Updated = payments2.find((p) => p.order_code === orderCode1);
      expect(p1Updated?.status).toBe("CANCELLED");
      expect(p1Updated?.link_cancelled_at).toBeDefined();
      expect(typeof p1Updated?.link_cancelled_at).toBe("string");

      // Payment 2 là PENDING
      const p2 = payments2.find((p) => p.order_code !== orderCode1);
      expect(p2?.status).toBe("PENDING");
      const orderCode2 = p2!.order_code as number;

      // 3. Webhook PayOS gửi về cho orderCode của lần 2
      const data = {
        orderCode: orderCode2,
        amount: 150000,
        reference: "REF_TXN_RETRY_02",
        code: "00",
        transactionDateTime: new Date().toISOString(),
      };
      const validSignature = payosClient.computeSignature(data, CHECKSUM_KEY);

      const webhookRes = await request(app.getHttpServer()).post("/payos/webhook").send({
        code: "00",
        desc: "success",
        data,
        signature: validSignature,
      });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.success).toBe(true);

      // Đơn thành công, payment 2 cập nhật thành PAID, không bị lỗi 23505
      const orderAfter = (fakeDb.tables.orders ?? []).find((o) => o.id === ORDER_PENDING_01);
      expect(orderAfter?.status).toBe("paid");
      expect(p2?.status).toBe("PAID");
    });
  });

  describe("B/M1: Xử lý lỗi hạ tầng / RPC trong Webhook (HTTP 500 cho PayOS retry)", () => {
    it("webhook trả HTTP 500 khi confirm_paid gặp lỗi hạ tầng/RPC", async () => {
      const origRpc = fakeDb.rpc.bind(fakeDb);
      fakeDb.rpc = (fn: string, args: Record<string, unknown>) => {
        if (fn === "confirm_paid") {
          return Promise.resolve({
            data: null,
            error: { code: "XX000", message: "Database connection failed" },
          });
        }
        return origRpc(fn, args);
      };

      try {
        const data = {
          orderCode: 999903,
          amount: 150000,
          reference: "REF_TXN_ERR_01",
          code: "00",
          transactionDateTime: new Date().toISOString(),
        };
        const validSignature = payosClient.computeSignature(data, CHECKSUM_KEY);

        const res = await request(app.getHttpServer()).post("/payos/webhook").send({
          code: "00",
          desc: "success",
          data,
          signature: validSignature,
        });

        expect(res.status).toBe(500);
      } finally {
        fakeDb.rpc = origRpc;
      }
    });

    it("webhook trả HTTP 500 khi record_payment_event gặp lỗi DB", async () => {
      const origRpc = fakeDb.rpc.bind(fakeDb);
      fakeDb.rpc = (fn: string, args: Record<string, unknown>) => {
        if (fn === "record_payment_event") {
          return Promise.resolve({
            data: null,
            error: { code: "XX000", message: "DB timeout" },
          });
        }
        return origRpc(fn, args);
      };

      try {
        const data = {
          orderCode: 999903,
          amount: 150000,
          reference: "REF_TXN_ERR_02",
          code: "00",
          transactionDateTime: new Date().toISOString(),
        };
        const validSignature = payosClient.computeSignature(data, CHECKSUM_KEY);

        const res = await request(app.getHttpServer()).post("/payos/webhook").send({
          code: "00",
          desc: "success",
          data,
          signature: validSignature,
        });

        expect(res.status).toBe(500);
      } finally {
        fakeDb.rpc = origRpc;
      }
    });
  });

  describe("B/M3: Validate cấu hình PayOS ở môi trường production", () => {
    it("parseEnv: thiếu PAYOS_* ném lỗi EnvValidationError khi NODE_ENV=production", () => {
      const baseEnv = {
        NODE_ENV: "production",
        PORT: "3001",
        WEB_ORIGIN: "https://filmbooking.vn",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key-diff",
        SUPABASE_JWT_SECRET: "jwt-secret-at-least-32-chars-long-1234",
      };

      expect(() =>
        parseEnv({
          ...baseEnv,
          PAYOS_CLIENT_ID: "",
          PAYOS_API_KEY: "api-key",
          PAYOS_CHECKSUM_KEY: "checksum-key",
        }),
      ).toThrow(EnvValidationError);

      expect(() =>
        parseEnv({
          ...baseEnv,
          PAYOS_CLIENT_ID: "client-id",
          PAYOS_API_KEY: undefined,
          PAYOS_CHECKSUM_KEY: "checksum-key",
        }),
      ).toThrow(EnvValidationError);

      expect(() =>
        parseEnv({
          ...baseEnv,
          PAYOS_CLIENT_ID: "client-id",
          PAYOS_API_KEY: "api-key",
          PAYOS_CHECKSUM_KEY: "",
        }),
      ).toThrow(EnvValidationError);
    });

    it("PayosClient: ném lỗi rõ ràng nếu thiếu cấu hình ở production", async () => {
      const prodEnv: Env = {
        NODE_ENV: "production",
        PORT: 3001,
        WEB_ORIGIN: ["https://filmbooking.vn"],
        SUPABASE_URL,
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SUPABASE_JWT_SECRET: JWT_SECRET,
      } as Env;

      const unconfiguredClient = new PayosClient(prodEnv);
      await expect(
        unconfiguredClient.createPaymentLink({
          orderCode: 123456,
          amount: 100000,
          description: "Test",
          returnUrl: "https://filmbooking.vn/return",
          cancelUrl: "https://filmbooking.vn/cancel",
        }),
      ).rejects.toThrow("PayOS client is not configured in production environment");
    });
  });

  describe("B/M4: timingSafeEqual và verifyWebhook an toàn", () => {
    it("verifyWebhook: trả về null an toàn khi chữ ký có độ dài lệch hoặc sai lệch nội dung", async () => {
      const data = {
        orderCode: 999903,
        amount: 150000,
      };

      // Độ dài ngắn hơn bình thường
      const resultShort = await payosClient.verifyWebhook({
        data,
        signature: "short-signature",
      });
      expect(resultShort).toBeNull();

      // Độ dài giống 64 ký tự hex nhưng sai nội dung
      const dummy64 = "0".repeat(64);
      const resultWrong = await payosClient.verifyWebhook({
        data,
        signature: dummy64,
      });
      expect(resultWrong).toBeNull();
    });
  });
});
