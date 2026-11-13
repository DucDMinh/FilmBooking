import type { INestApplication } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, parseEnv } from "../src/config/env";
import { ReconcileController } from "../src/modules/jobs/jobs.controller";
import { PayosPaymentLookup, ReconcileService } from "../src/modules/jobs/reconcile.service";
import { PaymentService } from "../src/modules/payment/payment.service";
import { PayosClient } from "../src/modules/payment/payos.client";

const JOB_SECRET = "test-job-secret-very-secure-123456789";
const env = parseEnv({
  WEB_ORIGIN: "https://filmbooking.example.com",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_JWT_SECRET: "jwt-secret-for-test-jwt-secret-1234",
  JOB_SECRET,
});

interface PaymentRow {
  [key: string]: unknown;
  id: string;
  order_id: string;
  cinema_id: string;
  order_code: number;
  amount: number;
  status: string;
  created_at: string;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/**
 * Fake DB phản ánh hành vi thật của RPC (migration 20261113160000 / 20261113180000):
 *  - confirm_paid: pending_payment -> SUCCESS (1 vé), paid -> ALREADY_PAID, expired -> needs_manual_review, lệch tiền -> AMOUNT_MISMATCH
 *  - mark_payment_cancelled: mức ĐƠN (huỷ mọi payment PENDING của đơn), raise 23514 khi đơn đã paid
 *  - cancel_stale_payment: mức PAYMENT, no-op nếu payment không còn PENDING / có payment mới hơn / đơn không pending_payment
 *  - record_payment_event: idempotent theo transaction_ref
 */
function createFakeDb() {
  let payments: PaymentRow[] = [];
  const orderStatus = new Map<string, string>();
  const tickets = new Map<string, number>();
  const events = new Set<string>();
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const builder = (rows: PaymentRow[]) => {
    let result = rows;
    const b = {
      eq: (col: string, val: unknown) => {
        result = result.filter((r) => r[col] === val);
        return b;
      },
      lte: (_c: string, v: string) => {
        result = result.filter((r) => r.created_at <= v);
        return b;
      },
      gte: (_c: string, v: string) => {
        result = result.filter((r) => r.created_at >= v);
        return b;
      },
      order: () => {
        result = [...result].sort((x, y) => x.created_at.localeCompare(y.created_at));
        return b;
      },
      limit: (n: number) => {
        result = result.slice(0, n);
        return b;
      },
      maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
      then: (resolve: (v: { data: PaymentRow[]; error: null }) => void) =>
        resolve({ data: result, error: null }),
    };
    return b;
  };

  const cancelOrder = (orderId: string, reason: string) => {
    const status = reason.toUpperCase().includes("EXPIRE") ? "expired" : "cancelled";
    orderStatus.set(orderId, status);
    for (const p of payments) {
      if (p.order_id === orderId && p.status === "PENDING") {
        p.status = status === "expired" ? "EXPIRED" : "CANCELLED";
      }
    }
    return { success: true, status };
  };

  const confirmPaid = (args: Record<string, unknown>) => {
    const orderId = args.p_order_id as string;
    const status = orderStatus.get(orderId);
    if (status === "paid") return { success: true, status: "ALREADY_PAID" };
    const payment = payments.find((p) => p.order_code === args.p_order_code);
    if (payment && payment.amount !== args.p_amount) return { success: false, status: "AMOUNT_MISMATCH" };
    if (status !== "pending_payment") return { success: false, status: "needs_manual_review" };
    orderStatus.set(orderId, "paid");
    tickets.set(orderId, (tickets.get(orderId) ?? 0) + 1);
    return { success: true, status: "SUCCESS", order_id: orderId };
  };

  const cancelStalePayment = (args: Record<string, unknown>) => {
    const payment = payments.find((p) => p.id === args.p_payment_id);
    const skipped = { success: true, status: "SKIPPED" };
    if (!payment || payment.status !== "PENDING") return skipped;
    if (orderStatus.get(payment.order_id) !== "pending_payment") return skipped;
    const hasNewer = payments.some(
      (p) => p.order_id === payment.order_id && p.created_at > payment.created_at,
    );
    if (hasNewer) return skipped;
    return cancelOrder(payment.order_id, String(args.p_reason));
  };

  const admin = {
    from: (table: string) => {
      if (table !== "payments") throw new Error(`unexpected table ${table}`);
      return { select: () => builder(payments) };
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      switch (name) {
        case "confirm_paid":
          return { data: confirmPaid(args), error: null };
        case "cancel_stale_payment":
          return { data: cancelStalePayment(args), error: null };
        case "mark_payment_cancelled":
          if (orderStatus.get(args.p_order_id as string) === "paid") {
            return { data: null, error: { message: "Không thể huỷ đơn hàng đã thanh toán", code: "23514" } };
          }
          return { data: cancelOrder(args.p_order_id as string, String(args.p_reason)), error: null };
        case "record_payment_event":
          events.add(String(args.p_transaction_ref));
          return { data: null, error: null };
        default:
          return { data: null, error: null };
      }
    }),
  };

  return {
    admin: () => admin,
    rpcCalls,
    orderStatus,
    tickets,
    events,
    paymentStatus: (id: string) => payments.find((p) => p.id === id)?.status,
    reset(rows: PaymentRow[], orders: Record<string, string> = {}) {
      payments = rows.map((r) => ({ ...r }));
      orderStatus.clear();
      for (const r of rows) orderStatus.set(r.order_id, "pending_payment");
      for (const [id, st] of Object.entries(orders)) orderStatus.set(id, st);
      tickets.clear();
      events.clear();
      rpcCalls.length = 0;
    },
  };
}

const row = (n: number, status: string, ageMin: number, orderN = n): PaymentRow => ({
  id: `pay-${n}`,
  order_id: `order-${orderN}`,
  cinema_id: "cinema-1",
  order_code: 1000 + n,
  amount: 150000,
  status,
  created_at: minutesAgo(ageMin),
});

describe("POST /jobs/reconcile (R-78, R-80, AC-11)", () => {
  const db = createFakeDb();
  const getPayment = vi.fn();
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReconcileController],
      providers: [
        ReconcileService,
        PaymentService,
        { provide: ENV, useValue: env },
        { provide: SupabaseService, useValue: { admin: db.admin } },
        { provide: PayosClient, useValue: {} },
        { provide: PayosPaymentLookup, useValue: { getPayment } },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    getPayment.mockReset();
  });

  const call = () =>
    request(app.getHttpServer()).post("/jobs/reconcile").set("x-job-secret", JOB_SECRET);

  it("401 khi thiếu x-job-secret", async () => {
    const res = await request(app.getHttpServer()).post("/jobs/reconcile");
    expect(res.status).toBe(401);
  });

  it("PAID trên PayOS mà webhook lỡ -> confirm_paid, đúng 1 vé; chạy lại -> alreadyPaid, vẫn 1 vé", async () => {
    db.reset([row(1, "PENDING", 10)]);
    getPayment.mockResolvedValue({
      status: "PAID",
      amountPaid: 150000,
      reference: "REF-1",
      transactionDateTime: "2026-11-13 10:00:00",
    });

    const first = await call();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ checked: 1, paid: 1, alreadyPaid: 0, needsReview: 0, errors: 0 });
    expect(db.orderStatus.get("order-1")).toBe("paid");
    expect(db.tickets.get("order-1")).toBe(1);
    const confirm = db.rpcCalls.find((c) => c.name === "confirm_paid");
    expect(confirm?.args).toMatchObject({
      p_amount: 150000,
      p_transaction_ref: "REF-1",
      p_order_code: 1001,
    });

    const second = await call();
    expect(second.body).toMatchObject({ paid: 0, alreadyPaid: 1 });
    expect(db.tickets.get("order-1")).toBe(1);
  });

  it("PayOS không trả reference -> dùng cùng chuỗi PAYOS_<orderCode> với webhook (idempotent)", async () => {
    db.reset([row(11, "PENDING", 10)]);
    getPayment.mockResolvedValue({ status: "PAID", amountPaid: 150000 });

    await call();
    expect(db.events).toEqual(new Set(["PAYOS_1011"]));
  });

  it("CANCELLED trên PayOS -> cancel_stale_payment nhả ghế, đơn cancelled", async () => {
    db.reset([row(2, "PENDING", 10)]);
    getPayment.mockResolvedValue({ status: "CANCELLED", amountPaid: 0 });

    const res = await call();
    expect(res.body).toMatchObject({ checked: 1, cancelled: 1, errors: 0 });
    expect(db.rpcCalls).toContainEqual({
      name: "cancel_stale_payment",
      args: { p_payment_id: "pay-2", p_reason: "CANCELLED" },
    });
    expect(db.orderStatus.get("order-2")).toBe("cancelled");
  });

  it("EXPIRED trên PayOS -> đơn expired", async () => {
    db.reset([row(3, "PENDING", 10)]);
    getPayment.mockResolvedValue({ status: "EXPIRED", amountPaid: 0 });

    const res = await call();
    expect(res.body).toMatchObject({ expired: 1, errors: 0 });
    expect(db.orderStatus.get("order-3")).toBe("expired");
  });

  it("MAJOR-1: đơn có payment A cũ + B mới, PayOS báo A CANCELLED -> không đụng B, đơn, ghế", async () => {
    db.reset([row(20, "PENDING", 20, 20), row(21, "PENDING", 5, 20)]);
    getPayment.mockImplementation(async (orderCode: number) =>
      orderCode === 1020 ? { status: "CANCELLED", amountPaid: 0 } : { status: "PENDING", amountPaid: 0 },
    );

    const res = await call();
    expect(res.body).toMatchObject({ cancelled: 0, errors: 0 });
    expect(db.orderStatus.get("order-20")).toBe("pending_payment");
    expect(db.paymentStatus("pay-21")).toBe("PENDING");
    expect(db.rpcCalls.some((c) => c.name === "mark_payment_cancelled")).toBe(false);
  });

  it("PAID nhưng đơn đã expired -> needsReview, không đếm là paid", async () => {
    db.reset([row(12, "EXPIRED", 30)], { "order-12": "expired" });
    getPayment.mockResolvedValue({ status: "PAID", amountPaid: 150000 });

    const res = await call();
    expect(res.body).toMatchObject({ paid: 0, needsReview: 1 });
  });

  it("PAID lệch tiền -> needsReview, không tạo vé", async () => {
    db.reset([row(13, "PENDING", 10)]);
    getPayment.mockResolvedValue({ status: "PAID", amountPaid: 1000 });

    const res = await call();
    expect(res.body).toMatchObject({ paid: 0, needsReview: 1 });
    expect(db.tickets.get("order-13")).toBeUndefined();
  });

  it("payment EXPIRED của ta nhưng PayOS báo PAID trong cửa sổ 1h (tiền về muộn) -> đi qua confirm_paid", async () => {
    db.reset([row(4, "EXPIRED", 30)], { "order-4": "expired" });
    getPayment.mockResolvedValue({ status: "PAID", amountPaid: 150000 });

    await call();
    expect(db.rpcCalls.some((c) => c.name === "confirm_paid")).toBe(true);
  });

  it("PENDING quá mới (dưới 2 phút) hoặc quá 24h, EXPIRED quá 1h -> không hỏi PayOS", async () => {
    db.reset([
      row(5, "PENDING", 10),
      row(6, "PENDING", 1),
      row(7, "PENDING", 60 * 25),
      row(14, "EXPIRED", 120),
    ]);
    getPayment.mockResolvedValue({ status: "PENDING", amountPaid: 0 });

    const res = await call();
    expect(res.body).toMatchObject({ checked: 1, skipped: 1 });
    expect(getPayment).toHaveBeenCalledTimes(1);
  });

  it("MAJOR-2: nhiều EXPIRED hơn batch không làm PENDING bị bỏ đói", async () => {
    const expiredRows = Array.from({ length: 60 }, (_, i) => row(100 + i, "EXPIRED", 20 + (i % 5)));
    db.reset(
      [...expiredRows, row(30, "PENDING", 10)],
      Object.fromEntries(expiredRows.map((r) => [r.order_id, "expired"])),
    );
    getPayment.mockImplementation(async (orderCode: number) =>
      orderCode === 1030 ? { status: "PAID", amountPaid: 150000 } : { status: "EXPIRED", amountPaid: 0 },
    );

    const res = await call();
    expect(res.body).toMatchObject({ paid: 1, errors: 0 });
    expect(db.tickets.get("order-30")).toBe(1);
    expect(res.body.checked).toBe(21); // 1 PENDING + tối đa 20 EXPIRED
  });

  it("MAJOR-2: hơn 50 PENDING -> chỉ kiểm 50 cũ nhất mỗi lượt", async () => {
    db.reset(Array.from({ length: 70 }, (_, i) => row(200 + i, "PENDING", 10 + i * 0.01)));
    getPayment.mockResolvedValue({ status: "PENDING", amountPaid: 0 });

    const res = await call();
    expect(res.body.checked).toBe(50);
  });

  it("PayOS lỗi trên 1 payment không làm hỏng các payment khác", async () => {
    db.reset([row(8, "PENDING", 10), row(9, "PENDING", 9)]);
    getPayment
      .mockRejectedValueOnce(new Error("PayOS timeout"))
      .mockResolvedValueOnce({ status: "PAID", amountPaid: 150000 });

    const res = await call();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ checked: 2, errors: 1, paid: 1 });
  });

  it("chưa cấu hình PayOS (lookup trả null) -> bỏ qua, không crash", async () => {
    db.reset([row(10, "PENDING", 10)]);
    getPayment.mockResolvedValue(null);

    const res = await call();
    expect(res.body).toMatchObject({ checked: 1, skipped: 1, errors: 0 });
  });
});
