import { createHmac } from "node:crypto";
import { Logger, type INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
import { ENV, parseEnv } from "../../src/config/env";
import { PayosPaymentLookup, type PayosPaymentInfo } from "../../src/modules/jobs/reconcile.service";
import { createFactories, type TestShowtime, type TestUser } from "./helpers/factories";
import { cleanupScope, createAdminClient, createRunScope, loadLocalSupabaseEnv } from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

const CHECKSUM_KEY = "it-payos-checksum-key";
const SEAT_PRICE = 90_000;
const JOB_SECRET = "it-job-secret-payos-webhook";

/** Chữ ký PayOS thật: sort key theo alphabet, ghép `k=v&...`, HMAC-SHA256 hex (độc lập với PayosClient để test không "tự khớp"). */
function signPayosData(data: Record<string, unknown>, key = CHECKSUM_KEY): string {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] === null || data[k] === undefined ? "" : String(data[k])}`)
    .join("&");
  return createHmac("sha256", key).update(query).digest("hex");
}

interface BookedOrder {
  orderId: string;
  orderCode: number;
  total: number;
  seatIds: string[];
  customer: TestUser;
}

// Docker/Supabase không chạy -> skip, không fail.
describe.skipIf(!supabaseEnv)("integration: webhook PayOS (AC-09, AC-10, AC-11) + đối soát", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let app: INestApplication;
  let factories: ReturnType<typeof createFactories>;
  /** orderCode -> thông tin PayOS giả cho job đối soát (mặc định: không biết -> skip). */
  const payosLedger = new Map<number, PayosPaymentInfo>();
  const warnSpy = vi.spyOn(Logger.prototype, "warn");

  beforeAll(async () => {
    admin = createAdminClient(env);
    factories = createFactories(env, admin, scope);
    const apiEnv = parseEnv({
      NODE_ENV: "test",
      WEB_ORIGIN: "https://filmbooking.example.com",
      SUPABASE_URL: env.url,
      SUPABASE_ANON_KEY: env.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
      SUPABASE_JWT_SECRET: env.jwtSecret,
      SUPABASE_JWKS_URL: `${env.url}/auth/v1/.well-known/jwks.json`,
      // Chỉ checksum key: PayosClient không dựng SDK thật -> không gọi mạng; verify webhook vẫn dùng HMAC thật.
      PAYOS_CHECKSUM_KEY: CHECKSUM_KEY,
      JOB_SECRET,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(apiEnv)
      // Biên HTTP của PayOS cho job đối soát: tra sổ giả theo orderCode, không biết -> null (skip).
      .overrideProvider(PayosPaymentLookup)
      .useValue({ getPayment: async (orderCode: number) => payosLedger.get(orderCode) ?? null })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, apiEnv);
    await app.init();
  });

  afterEach(() => {
    warnSpy.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    warnSpy.mockRestore();
    if (admin) await cleanupScope(admin, scope);
  });

  const http = () => request(app.getHttpServer());
  const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });

  /** Suất mới + giá riêng cho suất (hold_seats cần quy tắc giá); rule xoá theo suất khi cleanup. */
  async function createPricedShowtime(options: { cinemaId?: string } = {}): Promise<TestShowtime> {
    const showtime = await factories.createShowtime(options);
    const { error } = await admin
      .from("price_rules")
      .insert({ scope: "SHOWTIME", showtime_id: showtime.id, seat_type: "NORMAL", amount: SEAT_PRICE });
    expect(error).toBeNull();
    return showtime;
  }

  /** Khách giữ ghế -> đồng ý điều khoản -> tạo link thanh toán qua API thật; trả đơn pending_payment + order_code. */
  async function bookPendingOrder(showtime: TestShowtime, seatIndexes: number[], customer?: TestUser): Promise<BookedOrder> {
    const user = customer ?? (await factories.createUser("cust"));
    const seatIds = seatIndexes.map((i) => showtime.seatIds[i]!);
    const hold = await http().post("/bookings/holds").set(bearer(user)).send({ showtimeId: showtime.id, seatIds });
    expect(hold.status, JSON.stringify(hold.body)).toBeLessThan(300);
    const orderId: string = hold.body.orderId;
    expect((await http().post(`/bookings/${orderId}/consent`).set(bearer(user)).send({})).status).toBeLessThan(300);
    const pay = await http().post(`/bookings/${orderId}/payment`).set(bearer(user)).send({});
    expect(pay.status).toBe(200);
    expect(pay.body.status).toBe("AWAITING_PAYMENT");
    const { data: payment, error } = await admin.from("payments").select("order_code, amount").eq("order_id", orderId).single();
    expect(error).toBeNull();
    return { orderId, orderCode: Number(payment!.order_code), total: Number(payment!.amount), seatIds, customer: user };
  }

  function webhookBody(order: BookedOrder, overrides: Record<string, unknown> = {}, reference?: string) {
    const data: Record<string, unknown> = {
      orderCode: order.orderCode,
      amount: order.total,
      description: "IT webhook",
      accountNumber: "0000000000",
      reference: reference ?? `IT-TX-${scope.runId}-${order.orderCode}`,
      transactionDateTime: "2026-11-14 10:00:00",
      currency: "VND",
      paymentLinkId: `mock_link_${order.orderCode}`,
      code: "00",
      desc: "success",
      ...overrides,
    };
    return { code: "00", desc: "success", success: true, data, signature: signPayosData(data) };
  }

  const sendWebhook = (body: unknown) => http().post("/payos/webhook").send(body as object);

  async function orderRow(orderId: string) {
    const { data, error } = await admin.from("orders").select("status, booking_code").eq("id", orderId).single();
    expect(error).toBeNull();
    return data!;
  }
  async function countRows(table: "tickets" | "payments" | "payment_events", column: string, value: string | number) {
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
    expect(error).toBeNull();
    return count ?? 0;
  }
  async function outboxKinds(orderId: string): Promise<string[]> {
    const { data, error } = await admin.from("email_outbox").select("kind").eq("payload->>order_id", orderId);
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.kind as string);
  }

  /** Đơn quá hạn giữ -> expired (qua job thật), payment EXPIRED, ghế nhả. */
  async function expireOrder(orderId: string) {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { error } = await admin.from("orders").update({ hold_expires_at: past }).eq("id", orderId);
    expect(error).toBeNull();
    const { error: rpcError } = await admin.rpc("expire_overdue_holds");
    expect(rpcError).toBeNull();
    expect((await orderRow(orderId)).status).toBe("expired");
  }

  it("AC-09: chữ ký sai -> đơn/payment không đổi, không vé/email, có log cảnh báo kèm orderCode", async () => {
    const showtime = await createPricedShowtime();
    const order = await bookPendingOrder(showtime, [0]);

    const wrongKey = webhookBody(order);
    wrongKey.signature = signPayosData(wrongKey.data, "khong-phai-checksum-key");
    const tampered = webhookBody(order); // ký đúng amount gốc rồi sửa amount -> chữ ký không còn khớp
    (tampered.data as Record<string, unknown>).amount = 1;

    for (const body of [wrongKey, tampered]) {
      const res = await sendWebhook(body);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: false, message: "Invalid signature" });
    }

    expect((await orderRow(order.orderId)).status).toBe("pending_payment");
    const { data: payment } = await admin.from("payments").select("status").eq("order_code", order.orderCode).single();
    expect(payment!.status).toBe("PENDING");
    expect(await countRows("tickets", "order_id", order.orderId)).toBe(0);
    expect(await countRows("payment_events", "order_code", order.orderCode)).toBe(0);
    expect(await outboxKinds(order.orderId)).toEqual([]);
    expect(warnSpy.mock.calls.some(([msg]) => String(msg).includes("signature invalid") && String(msg).includes(String(order.orderCode)))).toBe(true);
  });

  it("AC-10: 3 webhook song song -> 1 payment PAID, 1 vé, 1 email vé, đơn paid", async () => {
    const showtime = await createPricedShowtime();
    const order = await bookPendingOrder(showtime, [0]);
    const body = webhookBody(order);

    const results = await Promise.all([sendWebhook(body), sendWebhook(body), sendWebhook(body)]);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    const paid = await orderRow(order.orderId);
    expect(paid.status).toBe("paid");
    expect(paid.booking_code).toBeTruthy();
    expect(await countRows("payments", "order_id", order.orderId)).toBe(1);
    const { data: payment } = await admin.from("payments").select("status").eq("order_id", order.orderId).single();
    expect(payment!.status).toBe("PAID");
    expect(await countRows("tickets", "order_id", order.orderId)).toBe(1);
    expect(await outboxKinds(order.orderId)).toEqual(["TICKET_ISSUED"]);
    expect(await countRows("payment_events", "order_code", order.orderCode)).toBe(1);

    // Webhook lặp muộn hơn vẫn không sinh thêm gì.
    expect((await sendWebhook(body)).body.success).toBe(true);
    expect(await countRows("tickets", "order_id", order.orderId)).toBe(1);
    expect(await outboxKinds(order.orderId)).toEqual(["TICKET_ISSUED"]);
  });

  it("tiền về muộn cho đơn expired, ghế còn trống -> paid + vé + 1 email vé", async () => {
    const showtime = await createPricedShowtime();
    const order = await bookPendingOrder(showtime, [0, 1]);
    await expireOrder(order.orderId);

    const res = await sendWebhook(webhookBody(order));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect((await orderRow(order.orderId)).status).toBe("paid");
    expect(await countRows("tickets", "order_id", order.orderId)).toBe(2);
    expect(await outboxKinds(order.orderId)).toEqual(["TICKET_ISSUED"]);
    const { data: payment } = await admin.from("payments").select("status").eq("order_id", order.orderId).single();
    expect(payment!.status).toBe("PAID");
  });

  it("AC-11: tiền về muộn khi ghế đã bán cho người khác -> needs_manual_review, không vé, 1 email khách, hiện cho Admin/Manager", async () => {
    const cinema = await factories.createCinema();
    const showtime = await createPricedShowtime({ cinemaId: cinema.id });
    const late = await bookPendingOrder(showtime, [0]);
    await expireOrder(late.orderId);

    // Người khác mua đúng ghế đó và thanh toán thành công.
    const winner = await bookPendingOrder(showtime, [0]);
    expect((await sendWebhook(webhookBody(winner))).body.success).toBe(true);
    expect((await orderRow(winner.orderId)).status).toBe("paid");

    const res = await sendWebhook(webhookBody(late));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect((await orderRow(late.orderId)).status).toBe("needs_manual_review");
    expect(await countRows("tickets", "order_id", late.orderId)).toBe(0);
    expect(await outboxKinds(late.orderId)).toEqual(["LATE_PAYMENT_MANUAL_REVIEW"]);
    const { data: outbox } = await admin.from("email_outbox").select("to_email").eq("payload->>order_id", late.orderId).single();
    expect(outbox!.to_email).toBe(late.customer.email);
    // Vé của người thắng không bị ảnh hưởng.
    expect(await countRows("tickets", "order_id", winner.orderId)).toBe(1);

    // Webhook lặp: không sinh thêm email.
    await sendWebhook(webhookBody(late));
    expect(await outboxKinds(late.orderId)).toEqual(["LATE_PAYMENT_MANUAL_REVIEW"]);

    // Hiện cho Admin và Manager của rạp; Manager rạp khác không thấy (và bị 403 khi lọc rạp khác).
    const adminUser = await factories.createAdminUser();
    const manager = await factories.createStaffUser(cinema.id, "MANAGER");
    const adminList = await http().get("/admin/orders/needs-manual-review").query({ cinemaId: cinema.id }).set(bearer(adminUser));
    expect(adminList.status).toBe(200);
    expect(adminList.body.items.map((o: { id: string }) => o.id)).toContain(late.orderId);
    const managerList = await http().get("/admin/orders/needs-manual-review").query({ cinemaId: cinema.id }).set(bearer(manager));
    expect(managerList.status).toBe(200);
    expect(managerList.body.items.map((o: { id: string }) => o.id)).toContain(late.orderId);

    const otherCinema = await factories.createCinema();
    const otherManager = await factories.createStaffUser(otherCinema.id, "MANAGER");
    const otherList = await http().get("/admin/orders/needs-manual-review").query({ cinemaId: cinema.id }).set(bearer(otherManager));
    expect(otherList.status).toBe(403);
  });

  it("lệch tiền -> needs_manual_review, không vé, 1 email AMOUNT_MISMATCH", async () => {
    const showtime = await createPricedShowtime();
    const order = await bookPendingOrder(showtime, [0]);

    const res = await sendWebhook(webhookBody(order, { amount: order.total - 1000 }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect((await orderRow(order.orderId)).status).toBe("needs_manual_review");
    expect(await countRows("tickets", "order_id", order.orderId)).toBe(0);
    expect(await outboxKinds(order.orderId)).toEqual(["AMOUNT_MISMATCH_MANUAL_REVIEW"]);
  });

  it("webhook lỡ -> /jobs/reconcile đưa đơn về paid đúng 1 lần (gọi lại / webhook muộn không nhân đôi)", async () => {
    const showtime = await createPricedShowtime();
    const order = await bookPendingOrder(showtime, [0]);

    // Job chỉ hỏi PayOS với payment đã qua ngưỡng chờ webhook (2 phút): lùi created_at.
    const { error } = await admin
      .from("payments")
      .update({ created_at: new Date(Date.now() - 23 * 3_600_000).toISOString() })
      .eq("order_id", order.orderId);
    expect(error).toBeNull();
    payosLedger.set(order.orderCode, {
      status: "PAID",
      amountPaid: order.total,
      reference: `IT-RECON-${scope.runId}-${order.orderCode}`,
      transactionDateTime: "2026-11-14 10:00:00",
    });

    // Không có secret -> 401 (job không mở công khai).
    expect((await http().post("/jobs/reconcile")).status).toBe(401);

    const first = await http().post("/jobs/reconcile").set("x-job-secret", JOB_SECRET);
    expect(first.status).toBe(200);
    expect(first.body.paid).toBeGreaterThanOrEqual(1);
    expect((await orderRow(order.orderId)).status).toBe("paid");
    expect(await countRows("tickets", "order_id", order.orderId)).toBe(1);
    expect(await outboxKinds(order.orderId)).toEqual(["TICKET_ISSUED"]);

    // Lần 2: payment đã PAID không còn là ứng viên -> không đổi gì.
    expect((await http().post("/jobs/reconcile").set("x-job-secret", JOB_SECRET)).status).toBe(200);
    // Webhook tới muộn sau khi đối soát đã bù: vẫn đúng 1 vé / 1 email.
    expect((await sendWebhook(webhookBody(order, {}, `IT-RECON-${scope.runId}-${order.orderCode}`))).body.success).toBe(true);
    expect(await countRows("tickets", "order_id", order.orderId)).toBe(1);
    expect(await outboxKinds(order.orderId)).toEqual(["TICKET_ISSUED"]);
    expect(await countRows("payments", "order_id", order.orderId)).toBe(1);
  });
});
