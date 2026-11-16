import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
import { ENV, parseEnv } from "../../src/config/env";
import { createFactories, type TestCinema, type TestShowtime, type TestUser } from "./helpers/factories";
import {
  cleanupScope,
  createAdminClient,
  createRunScope,
  loadLocalSupabaseEnv,
  signInClients,
} from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

/** Dữ liệu 1 rạp: nhân sự, suất, 1 đơn paid của 1 khách (kèm vé + thanh toán + khoá ghế). */
interface CinemaFixture {
  cinema: TestCinema;
  showtime: TestShowtime;
  manager: TestUser;
  staff: TestUser;
  customer: TestUser;
  orderId: string;
  bookingCode: string;
  ticketId: string;
  qrToken: string;
  /** Chuỗi chỉ xuất hiện trong dữ liệu khách của rạp này — dùng để dò rò rỉ PII. */
  piiMarker: string;
}

// Docker/Supabase không chạy -> skip, không fail (xem loadLocalSupabaseEnv).
describe.skipIf(!supabaseEnv)("RLS + Nest guard: cách ly theo rạp & dữ liệu khách (AC-13, AC-16, AC-17)", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let app: INestApplication;
  let factories: ReturnType<typeof createFactories>;
  let a: CinemaFixture;
  let b: CinemaFixture;
  /** Client Supabase đăng nhập thật (JWT GoTrue) — truy vấn trực tiếp, bỏ qua Nest. */
  let managerAClient: SupabaseClient;
  let staffAClient: SupabaseClient;
  let customerAClient: SupabaseClient;

  const http = () => request(app.getHttpServer());
  const asUser = (user: TestUser) => `Bearer ${user.accessToken}`;
  const errorCode = (body: unknown) => (body as { error?: { code?: string } }).error?.code;

  async function seedCinema(label: string): Promise<CinemaFixture> {
    const cinema = await factories.createCinema();
    const showtime = await factories.createShowtime({ cinemaId: cinema.id });
    const [manager, staff, customer] = [
      await factories.createStaffUser(cinema.id, "MANAGER"),
      await factories.createStaffUser(cinema.id, "STAFF"),
      await factories.createUser(`cust${label}`),
    ];
    const piiMarker = `${scope.prefix}pii_${label}`;
    const bookingCode = `${cinema.code}-${scope.runId.toUpperCase()}`;
    const seatId = showtime.seatIds[0]!;
    const order = await admin
      .from("orders")
      .insert({
        channel: "WEB",
        showtime_id: showtime.id,
        user_id: customer.id,
        status: "paid",
        subtotal_amount: 100000,
        total_amount: 100000,
        booking_code: bookingCode,
        contact_email: `${piiMarker}@example.com`,
        contact_phone: "0900000000",
      })
      .select("id")
      .single();
    if (order.error) throw new Error(`tạo đơn ${label}: ${order.error.message}`);
    const orderId = order.data.id as string;
    const orderSeat = await admin
      .from("order_seats")
      .insert({ order_id: orderId, seat_id: seatId, seat_label: "A1", seat_type: "NORMAL", price_amount: 100000 })
      .select("id")
      .single();
    if (orderSeat.error) throw new Error(`tạo order_seat ${label}: ${orderSeat.error.message}`);
    const ticket = await admin
      .from("tickets")
      .insert({ order_id: orderId, order_seat_id: orderSeat.data.id, showtime_id: showtime.id })
      .select("id, qr_token")
      .single();
    if (ticket.error) throw new Error(`tạo vé ${label}: ${ticket.error.message}`);
    const payment = await admin.from("payments").insert({
      order_id: orderId,
      cinema_id: cinema.id,
      order_code: Number.parseInt(scope.runId, 16) * 10 + (label === "a" ? 1 : 2),
      amount: 100000,
      status: "PAID",
    });
    if (payment.error) throw new Error(`tạo payment ${label}: ${payment.error.message}`);
    const lock = await admin
      .from("showtime_seat_locks")
      .insert({ showtime_id: showtime.id, seat_id: showtime.seatIds[1]!, reason: "GUEST" });
    if (lock.error) throw new Error(`tạo khoá ghế ${label}: ${lock.error.message}`);
    return {
      cinema,
      showtime,
      manager,
      staff,
      customer,
      orderId,
      bookingCode,
      ticketId: ticket.data.id as string,
      qrToken: ticket.data.qr_token as string,
      piiMarker,
    };
  }

  beforeAll(async () => {
    admin = createAdminClient(env);
    factories = createFactories(env, admin, scope);
    const apiEnv = parseEnv({
      WEB_ORIGIN: "https://filmbooking.example.com",
      SUPABASE_URL: env.url,
      SUPABASE_ANON_KEY: env.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
      SUPABASE_JWT_SECRET: env.jwtSecret,
      SUPABASE_JWKS_URL: `${env.url}/auth/v1/.well-known/jwks.json`,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(apiEnv)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, apiEnv);
    await app.init();

    a = await seedCinema("a");
    b = await seedCinema("b");
    const clients = await signInClients(env, [a.manager, a.staff, a.customer]);
    managerAClient = clients[0]!;
    staffAClient = clients[1]!;
    customerAClient = clients[2]!;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (admin) await cleanupScope(admin, scope);
  });

  // ---------------------------------------------------------------------------
  // AC-16 — qua API: Nest guard (CinemaScopeGuard / vai trò) chặn rạp lạ
  // ---------------------------------------------------------------------------
  describe("AC-16: Manager rạp A gọi API dữ liệu rạp B -> 403", () => {
    const forbiddenCinema = (res: request.Response) => {
      expect(res.status).toBe(403);
      expect(errorCode(res.body)).toBe("FORBIDDEN_CINEMA");
    };

    it("đọc danh sách suất / chi tiết suất rạp B", async () => {
      forbiddenCinema(await http().get(`/cinemas/${b.cinema.id}/showtimes`).set("Authorization", asUser(a.manager)));
      forbiddenCinema(
        await http()
          .get(`/cinemas/${b.cinema.id}/showtimes/${b.showtime.id}`)
          .set("Authorization", asUser(a.manager)),
      );
    });

    it("ghi suất rạp B: sửa, đóng bán, xoá", async () => {
      const base = `/cinemas/${b.cinema.id}/showtimes/${b.showtime.id}`;
      forbiddenCinema(await http().patch(base).set("Authorization", asUser(a.manager)).send({ format: "3D" }));
      forbiddenCinema(await http().post(`${base}/close`).set("Authorization", asUser(a.manager)).send({}));
      forbiddenCinema(await http().delete(base).set("Authorization", asUser(a.manager)));
    });

    it("khoá ghế rạp B: đọc, thêm, gỡ", async () => {
      const base = `/cinemas/${b.cinema.id}/showtimes/${b.showtime.id}/locks`;
      forbiddenCinema(await http().get(base).set("Authorization", asUser(a.manager)));
      forbiddenCinema(
        await http()
          .post(base)
          .set("Authorization", asUser(a.manager))
          .send({ seatIds: [b.showtime.seatIds[2]], reason: "GUEST" }),
      );
      forbiddenCinema(await http().delete(`${base}/${b.showtime.seatIds[1]}`).set("Authorization", asUser(a.manager)));
    });

    it("cấu hình rạp B", async () => {
      forbiddenCinema(await http().get(`/cinemas/${b.cinema.id}/settings`).set("Authorization", asUser(a.manager)));
      forbiddenCinema(
        await http().patch(`/cinemas/${b.cinema.id}/settings`).set("Authorization", asUser(a.manager)).send({}),
      );
    });

    it("báo cáo rạp B (doanh thu, suất, đối soát, suất huỷ)", async () => {
      for (const report of ["revenue", "showtimes", "payos-reconciliation", "cancelled-showtimes"]) {
        const res = await http()
          .get(`/reports/${report}`)
          .query({ cinemaId: b.cinema.id })
          .set("Authorization", asUser(a.manager));
        forbiddenCinema(res);
      }
    });

    it("đơn rạp B: chi tiết, và giải quyết thủ công", async () => {
      forbiddenCinema(await http().get(`/orders/${b.orderId}`).set("Authorization", asUser(a.manager)));
      forbiddenCinema(await http().get(`/admin/orders/${b.orderId}`).set("Authorization", asUser(a.manager)));
    });

    it("giải quyết thủ công đơn needs_manual_review của rạp B -> 403 FORBIDDEN_CINEMA, đơn không đổi", async () => {
      // Đơn ở đúng trạng thái cần xem xét: kiểm rạp là lý do duy nhất có thể từ chối (không phải 409 sai trạng thái).
      const review = await admin
        .from("orders")
        .insert({
          channel: "WEB",
          showtime_id: b.showtime.id,
          user_id: b.customer.id,
          status: "needs_manual_review",
          subtotal_amount: 100000,
          total_amount: 100000,
          booking_code: `${b.cinema.code}-${scope.runId.toUpperCase().split("").reverse().join("")}`,
        })
        .select("id")
        .single();
      expect(review.error).toBeNull();
      const reviewId = review.data!.id as string;
      forbiddenCinema(
        await http()
          .post(`/orders/${reviewId}/resolve-manual-review`)
          .set("Authorization", asUser(a.manager))
          .send({ action: "CONFIRM_SALE", note: "x" }),
      );
      forbiddenCinema(
        await http()
          .post(`/admin/orders/${reviewId}/resolve-manual-review`)
          .set("Authorization", asUser(a.manager))
          .send({ action: "CONFIRM_SALE", note: "x" }),
      );
      const after = await admin.from("orders").select("status, manual_review_resolved_at").eq("id", reviewId).single();
      expect(after.data).toEqual({ status: "needs_manual_review", manual_review_resolved_at: null });
    });

    it("tìm đơn theo mã đặt vé của rạp B không trả dữ liệu rạp B", async () => {
      const res = await http()
        .get("/orders")
        .query({ bookingCode: b.bookingCode })
        .set("Authorization", asUser(a.manager));
      // Không truyền cinemaId: service lọc theo rạp được gán -> 200 với danh sách rỗng.
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(JSON.stringify(res.body)).not.toContain(b.piiMarker);
      // Đối chứng dương: cùng truy vấn với mã của rạp A tìm thấy đơn A.
      const own = await http().get("/orders").query({ bookingCode: a.bookingCode }).set("Authorization", asUser(a.manager));
      expect(own.status).toBe(200);
      expect(own.body.items).toHaveLength(1);
    });

    it("đơn bị ảnh hưởng (affected orders) của rạp B: danh sách, xuất CSV, hoàn tiền", async () => {
      forbiddenCinema(await http().get(`/cinemas/${b.cinema.id}/affected-orders`).set("Authorization", asUser(a.manager)));
      const own = await http().get(`/cinemas/${a.cinema.id}/affected-orders`).set("Authorization", asUser(a.manager));
      expect(own.status).toBe(200);
      forbiddenCinema(
        await http().get("/admin/affected-orders/export").query({ cinemaId: b.cinema.id }).set("Authorization", asUser(a.manager)),
      );
      // Body hợp lệ theo recordRefundSchema để request tới được kiểm rạp (không dừng ở 422).
      forbiddenCinema(
        await http()
          .post(`/orders/${b.orderId}/refund`)
          .set("Authorization", asUser(a.manager))
          .send({ refundedAmount: 100000, refundReference: "VIB123" }),
      );
      const actions = await admin.from("affected_order_actions").select("id").eq("order_id", b.orderId);
      expect(actions.data).toEqual([]);
    });

    it("huỷ suất / đổi trạng thái rạp B", async () => {
      forbiddenCinema(
        await http()
          .post(`/cinemas/${b.cinema.id}/showtimes/cancel/preview`)
          .set("Authorization", asUser(a.manager))
          .send({ all: true }),
      );
      const status = await http()
        .patch(`/admin/cinemas/${b.cinema.id}/status`)
        .set("Authorization", asUser(a.manager))
        .send({ status: "CLOSED" });
      expect(status.status).toBe(403);
    });

    it("nhân sự rạp B (chỉ Admin hoặc Manager rạp B)", async () => {
      forbiddenCinema(await http().get(`/admin/cinemas/${b.cinema.id}/staff`).set("Authorization", asUser(a.manager)));
    });

    it("đối chứng: Manager A vẫn dùng được dữ liệu rạp A (guard không chặn nhầm)", async () => {
      const showtimes = await http().get(`/cinemas/${a.cinema.id}/showtimes`).set("Authorization", asUser(a.manager));
      expect(showtimes.status).toBe(200);
      const order = await http().get(`/orders/${a.orderId}`).set("Authorization", asUser(a.manager));
      expect(order.status).toBe(200);
    });

    it("Staff rạp A cũng bị chặn rạp B, và không vào được báo cáo của chính rạp mình", async () => {
      forbiddenCinema(await http().get(`/cinemas/${b.cinema.id}/showtimes`).set("Authorization", asUser(a.staff)));
      const report = await http().get("/reports/revenue").query({ cinemaId: a.cinema.id }).set("Authorization", asUser(a.staff));
      expect(report.status).toBe(403);
    });

    it("khách thường không vào được API quản trị", async () => {
      const res = await http().get(`/cinemas/${a.cinema.id}/showtimes`).set("Authorization", asUser(a.customer));
      expect(res.status).toBe(403);
      expect((await http().get("/admin/orders").set("Authorization", asUser(a.customer))).status).toBe(403);
    });

    it("không token -> 401", async () => {
      expect((await http().get(`/cinemas/${b.cinema.id}/showtimes`)).status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-16 — truy vấn trực tiếp Supabase bằng JWT (bỏ qua Nest): RLS tự chặn
  // ---------------------------------------------------------------------------
  describe("AC-16: truy vấn trực tiếp Supabase bằng JWT Manager/Staff rạp A", () => {

    it("Manager A đọc dữ liệu vận hành rạp B -> 0 dòng; đọc rạp A vẫn thấy (đối chứng)", async () => {
      const own = await managerAClient.from("orders").select("id").eq("cinema_id", a.cinema.id);
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);

      for (const table of ["orders", "tickets", "payments"] as const) {
        const { data, error } = await managerAClient.from(table).select("id").eq("cinema_id", b.cinema.id);
        expect(error, table).toBeNull();
        expect(data, table).toEqual([]);
      }
      const byOrder = await managerAClient.from("order_seats").select("id").eq("order_id", b.orderId);
      expect(byOrder.data).toEqual([]);
      const actions = await managerAClient.from("affected_order_actions").select("id").eq("order_id", b.orderId);
      expect(actions.data).toEqual([]);
      const states = await managerAClient.from("showtime_seat_states").select("id").eq("cinema_id", b.cinema.id);
      expect(states.data).toEqual([]);
      const checkins = await managerAClient.from("checkin_logs").select("id").eq("scanner_cinema_id", b.cinema.id);
      expect(checkins.data).toEqual([]);
      const settings = await managerAClient.from("cinema_settings").select("key").eq("cinema_id", b.cinema.id);
      expect(settings.data).toEqual([]);
      const staff = await managerAClient.from("staff_assignments").select("user_id").eq("cinema_id", b.cinema.id);
      expect(staff.data).toEqual([]);
    });

    it("Manager A không đọc được đơn B theo id/mã đặt vé (không lộ qua lọc khác)", async () => {
      const byId = await managerAClient.from("orders").select("id, contact_email").eq("id", b.orderId);
      expect(byId.data).toEqual([]);
      const byCode = await managerAClient.from("orders").select("id").eq("booking_code", b.bookingCode);
      expect(byCode.data).toEqual([]);
      const all = await managerAClient.from("orders").select("id, cinema_id");
      expect((all.data ?? []).every((row) => row.cinema_id === a.cinema.id)).toBe(true);
    });

    it("Manager A ghi suất/phòng/khoá ghế/cấu hình/đơn rạp B -> bị chặn, dữ liệu B nguyên vẹn", async () => {
      const updateShowtime = await managerAClient
        .from("showtimes")
        .update({ status: "CLOSED" })
        .eq("id", b.showtime.id)
        .select("id");
      expect(updateShowtime.data ?? []).toEqual([]);

      const deleteShowtime = await managerAClient.from("showtimes").delete().eq("id", b.showtime.id).select("id");
      expect(deleteShowtime.data ?? []).toEqual([]);

      const insertShowtime = await managerAClient.from("showtimes").insert({
        cinema_id: b.cinema.id,
        room_id: b.showtime.roomId,
        movie_id: (await admin.from("showtimes").select("movie_id").eq("id", b.showtime.id).single()).data!.movie_id,
        starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        format: "2D",
      });
      expect(insertShowtime.error?.code).toBe("42501");

      const insertLock = await managerAClient
        .from("showtime_seat_locks")
        .insert({ showtime_id: b.showtime.id, seat_id: b.showtime.seatIds[3]!, reason: "GUEST" });
      expect(insertLock.error?.code).toBe("42501");

      const deleteLock = await managerAClient
        .from("showtime_seat_locks")
        .delete()
        .eq("showtime_id", b.showtime.id)
        .select("id");
      expect(deleteLock.data ?? []).toEqual([]);

      const insertRoom = await managerAClient
        .from("rooms")
        .insert({ cinema_id: b.cinema.id, name: `${scope.prefix}lau`, grid_rows: 1, grid_cols: 1 });
      expect(insertRoom.error?.code).toBe("42501");

      const updateOrder = await managerAClient.from("orders").update({ contact_phone: "0" }).eq("id", b.orderId).select("id");
      expect(updateOrder.data ?? []).toEqual([]);

      const updateSettings = await managerAClient
        .from("cinema_settings")
        .update({ value: 1 })
        .eq("cinema_id", b.cinema.id)
        .select("key");
      expect(updateSettings.data ?? []).toEqual([]);

      // Đối chứng bằng service role: B nguyên vẹn.
      const showtimeB = await admin.from("showtimes").select("status").eq("id", b.showtime.id).single();
      expect(showtimeB.data?.status).toBe("ON_SALE");
      const orderB = await admin.from("orders").select("contact_phone").eq("id", b.orderId).single();
      expect(orderB.data?.contact_phone).toBe("0900000000");
      const locksB = await admin.from("showtime_seat_locks").select("id").eq("showtime_id", b.showtime.id);
      expect(locksB.data).toHaveLength(1);
    });

    it("Staff A đọc đơn B -> 0 dòng; không ghi được khoá ghế rạp A (chỉ Manager)", async () => {
      const orders = await staffAClient.from("orders").select("id").eq("cinema_id", b.cinema.id);
      expect(orders.data).toEqual([]);
      const own = await staffAClient.from("orders").select("id").eq("cinema_id", a.cinema.id);
      expect(own.data).toHaveLength(1);
      const lock = await staffAClient
        .from("showtime_seat_locks")
        .insert({ showtime_id: a.showtime.id, seat_id: a.showtime.seatIds[3]!, reason: "GUEST" });
      expect(lock.error?.code).toBe("42501");
    });
  });

  // ---------------------------------------------------------------------------
  // AC-17 — khách A không thấy đơn/vé khách B
  // ---------------------------------------------------------------------------
  describe("AC-17: khách A truy vấn dữ liệu khách B -> rỗng", () => {
    it("trực tiếp Supabase: đơn, ghế đơn, vé, thanh toán, hồ sơ", async () => {
      const mine = await customerAClient.from("orders").select("id");
      expect(mine.data?.map((row) => row.id)).toEqual([a.orderId]);

      const orderB = await customerAClient.from("orders").select("id").eq("id", b.orderId);
      expect(orderB.error).toBeNull();
      expect(orderB.data).toEqual([]);
      expect((await customerAClient.from("orders").select("id").eq("booking_code", b.bookingCode)).data).toEqual([]);
      expect((await customerAClient.from("orders").select("id").eq("contact_email", `${b.piiMarker}@example.com`)).data).toEqual([]);
      expect((await customerAClient.from("order_seats").select("id").eq("order_id", b.orderId)).data).toEqual([]);
      expect((await customerAClient.from("tickets").select("id").eq("id", b.ticketId)).data).toEqual([]);
      expect((await customerAClient.from("tickets").select("id").eq("qr_token", b.qrToken)).data).toEqual([]);
      expect((await customerAClient.from("payments").select("id").eq("order_id", b.orderId)).data).toEqual([]);
      expect((await customerAClient.from("profiles").select("id").eq("id", b.customer.id)).data).toEqual([]);
      expect((await customerAClient.from("consents").select("id").eq("user_id", b.customer.id)).data).toEqual([]);
      // Đối chứng: vé của chính A hiện ra.
      expect((await customerAClient.from("tickets").select("id").eq("id", a.ticketId)).data).toHaveLength(1);
    });

    it("trực tiếp Supabase: không sửa/xoá đơn khách B, không ghi consent thay B", async () => {
      const update = await customerAClient.from("orders").update({ contact_phone: "0" }).eq("id", b.orderId).select("id");
      expect(update.data ?? []).toEqual([]);
      const remove = await customerAClient.from("orders").delete().eq("id", b.orderId).select("id");
      expect(remove.data ?? []).toEqual([]);
      const consent = await customerAClient
        .from("consents")
        .insert({ user_id: b.customer.id, consent_type: "PRIVACY_POLICY", version: "v1" });
      expect(consent.error?.code).toBe("42501");
      const orderB = await admin.from("orders").select("contact_phone, status").eq("id", b.orderId).single();
      expect(orderB.data).toEqual({ contact_phone: "0900000000", status: "paid" });
    });

    it("qua API: khách A xem đơn khách B -> không 200, không lộ dữ liệu B", async () => {
      const res = await http().get(`/bookings/${b.orderId}`).set("Authorization", asUser(a.customer));
      expect(res.status).not.toBe(200);
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.body)).not.toContain(b.bookingCode);
      expect(JSON.stringify(res.body)).not.toContain(b.piiMarker);
    });

    it("qua API: khách A không dùng được API tra cứu đơn của nhân viên", async () => {
      const res = await http().get(`/orders/${b.orderId}`).set("Authorization", asUser(a.customer));
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(b.piiMarker);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-13 — soát vé sai rạp: WRONG_CINEMA, không lộ PII
  // ---------------------------------------------------------------------------
  describe("AC-13: Staff rạp B quét vé rạp A", () => {
    it("quét bằng QR token -> 200 WRONG_CINEMA, chỉ trả thông tin rạp đúng, không PII", async () => {
      const res = await http()
        .post("/checkin/scan")
        .set("Authorization", asUser(b.staff))
        .send({ cinemaId: b.cinema.id, token: a.qrToken });
      expect(res.status).toBe(200);
      expect(res.body.result).toBe("WRONG_CINEMA");
      expect(res.body.correctCinema).toMatchObject({ id: a.cinema.id, code: a.cinema.code });
      expect(res.body.ticket).toBeUndefined();
      const raw = JSON.stringify(res.body);
      for (const secret of [a.piiMarker, a.customer.email, a.bookingCode, a.qrToken, a.ticketId, a.orderId, "0900000000"]) {
        expect(raw, `không được lộ ${secret}`).not.toContain(secret);
      }
    });

    it("quét bằng mã đặt vé -> WRONG_CINEMA, không PII, vé không bị đánh dấu đã dùng", async () => {
      const res = await http()
        .post("/checkin/scan")
        .set("Authorization", asUser(b.staff))
        .send({ cinemaId: b.cinema.id, bookingCode: a.bookingCode });
      expect(res.status).toBe(200);
      expect(res.body.result).toBe("WRONG_CINEMA");
      expect(JSON.stringify(res.body)).not.toContain(a.piiMarker);
      const ticket = await admin.from("tickets").select("checked_in_at").eq("id", a.ticketId).single();
      expect(ticket.data?.checked_in_at).toBeNull();
    });

    it("ghi nhận checkin_logs WRONG_CINEMA cho lần quét sai rạp (kiểm bằng service role)", async () => {
      const logs = await admin.from("checkin_logs").select("result, scanner_cinema_id").eq("ticket_id", a.ticketId);
      expect(logs.data?.filter((row) => row.scanner_cinema_id === b.cinema.id).length).toBeGreaterThanOrEqual(1);
      expect(logs.data?.every((row) => row.result === "WRONG_CINEMA" || row.scanner_cinema_id === a.cinema.id)).toBe(true);
    });

    it("Staff B khai cinemaId = rạp A để quét vé A -> 403 (guard chặn trước khi chạm DB)", async () => {
      const res = await http()
        .post("/checkin/scan")
        .set("Authorization", asUser(b.staff))
        .send({ cinemaId: a.cinema.id, token: a.qrToken });
      expect(res.status).toBe(403);
      expect(errorCode(res.body)).toBe("FORBIDDEN_CINEMA");
      expect(JSON.stringify(res.body)).not.toContain(a.piiMarker);
    });

    it("gọi thẳng RPC checkin_ticket bằng JWT Staff B với cinema_id rạp A -> bị từ chối", async () => {
      const [staffBClient] = await signInClients(env, [b.staff]);
      const { data, error } = await staffBClient!.rpc("checkin_ticket", {
        p_token_or_code: a.qrToken,
        p_cinema_id: a.cinema.id,
        p_staff_id: b.staff.id,
      });
      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    });

    it("khách thường không quét được vé -> 403", async () => {
      const res = await http()
        .post("/checkin/scan")
        .set("Authorization", asUser(a.customer))
        .send({ cinemaId: a.cinema.id, token: a.qrToken });
      expect(res.status).toBe(403);
    });
  });
});
