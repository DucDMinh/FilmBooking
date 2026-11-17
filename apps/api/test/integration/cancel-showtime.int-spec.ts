import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderTemplate } from "../../src/modules/mail/templates";
import { bootTestApp, drainOutbox } from "./helpers/app-harness";
import { createFactories, mintToken, type TestShowtime, type TestUser } from "./helpers/factories";
import { cleanupScope, createAdminClient, createRunScope, loadLocalSupabaseEnv } from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

const TICKET_PRICE = 100_000;
const PAID_ORDERS = 10;
const CSKH_PHONE = "1900 0000";

interface PaidOrder {
  orderId: string;
  email: string;
  customerId: string;
}

// Docker/Supabase không chạy -> skip (đã cảnh báo ở loadLocalSupabaseEnv), không fail.
describe.skipIf(!supabaseEnv)("integration: huỷ suất + email hàng loạt + đóng rạp (AC-24, AC-25, AC-26)", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let app: INestApplication;
  let factories: ReturnType<typeof createFactories>;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  let customerSeq = 0;
  async function createCustomer(label: string): Promise<{ id: string; email: string; accessToken: string }> {
    // Tạo qua admin API + token HS256 tự ký: tránh dồn nhiều lần đăng nhập GoTrue (30/5 phút/IP, dùng chung với suite khác).
    const email = `${scope.prefix}${label}_${(customerSeq++).toString(36)}@example.com`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { created_via: "nest" } });
    if (created.error || !created.data.user) throw new Error(`createUser ${label} thất bại: ${created.error?.message}`);
    scope.userIds.add(created.data.user.id);
    return { id: created.data.user.id, email, accessToken: await mintToken(env, { id: created.data.user.id, email }) };
  }

  async function addShowtimePrice(showtimeId: string): Promise<void> {
    const { error } = await admin
      .from("price_rules")
      .insert({ scope: "SHOWTIME", showtime_id: showtimeId, seat_type: "NORMAL", amount: TICKET_PRICE });
    if (error) throw new Error(`tạo giá suất thất bại: ${error.message}`);
  }

  /** Khách giữ ghế qua API thật rồi PayOS xác nhận (confirm_paid, service role) -> đơn `paid` + vé. */
  async function createPaidOrder(showtime: TestShowtime, seatId: string): Promise<PaidOrder> {
    const customer = await createCustomer("cust");
    const hold = await request(server)
      .post("/bookings/holds")
      .set("Authorization", `Bearer ${customer.accessToken}`)
      .send({ showtimeId: showtime.id, seatIds: [seatId] });
    expect(hold.status, JSON.stringify(hold.body)).toBe(201);
    const orderId: string = hold.body.orderId;
    const contact = await admin.from("orders").update({ contact_email: customer.email }).eq("id", orderId);
    expect(contact.error).toBeNull();
    const paid = await admin.rpc("confirm_paid", {
      p_order_id: orderId,
      p_amount: hold.body.totalAmount,
      p_transaction_ref: `${scope.prefix}txn_${orderId}`,
    });
    expect(paid.error).toBeNull();
    expect(paid.data).toMatchObject({ success: true });
    return { orderId, email: customer.email, customerId: customer.id };
  }

  async function outboxRowsFor(orderIds: string[]) {
    const { data, error } = await admin
      .from("email_outbox")
      .select("id, kind, to_email, status, payload")
      .eq("kind", "showtime_cancelled")
      .in("payload->>order_id", orderIds);
    if (error) throw error;
    return data ?? [];
  }

  beforeAll(async () => {
    admin = createAdminClient(env);
    factories = createFactories(env, admin, scope);
    ({ app } = await bootTestApp(env));
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    if (!admin) return;
    // Outbox không gắn FK cứng vào đơn (cinema_id set null) -> dọn theo địa chỉ mang prefix scope.
    await admin.from("email_outbox").delete().like("to_email", `${scope.prefix}%`);
    await cleanupScope(admin, scope);
  });

  describe("AC-24 + AC-25: huỷ suất có 10 đơn paid", () => {
    let cinemaId: string;
    let otherCinemaId: string;
    let showtime: TestShowtime;
    let orders: PaidOrder[];
    let holdingOrderId: string;
    let manager: TestUser;
    let otherManager: TestUser;
    let staff: TestUser;
    let adminUser: TestUser;
    let ticketTokens: string[];

    beforeAll(async () => {
      const cinema = await factories.createCinema();
      cinemaId = cinema.id;
      otherCinemaId = (await factories.createCinema()).id;
      showtime = await factories.createShowtime({ cinemaId, rows: 3, cols: 4 }); // 12 ghế: 10 paid + 1 holding (ghế PAID_ORDERS) + 1 probe (ghế PAID_ORDERS+1); không còn ghế trống nên ghế holding là ghế duy nhất được nhả khi huỷ
      await addShowtimePrice(showtime.id);
      manager = await factories.createStaffUser(cinemaId, "MANAGER");
      staff = await factories.createStaffUser(cinemaId, "STAFF");
      otherManager = await factories.createStaffUser(otherCinemaId, "MANAGER");
      adminUser = await factories.createAdminUser();

      orders = [];
      for (let index = 0; index < PAID_ORDERS; index += 1) {
        orders.push(await createPaidOrder(showtime, showtime.seatIds[index]!));
      }
      // 1 đơn đang giữ chỗ (chưa thanh toán) -> huỷ suất phải chuyển `cancelled`, không thành affected.
      const holder = await createCustomer("holder");
      const hold = await request(server)
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${holder.accessToken}`)
        .send({ showtimeId: showtime.id, seatIds: [showtime.seatIds[PAID_ORDERS]!] });
      expect(hold.status, JSON.stringify(hold.body)).toBe(201);
      holdingOrderId = hold.body.orderId;

      const tickets = await admin
        .from("tickets")
        .select("qr_token")
        .in("order_id", orders.map((o) => o.orderId));
      expect(tickets.error).toBeNull();
      ticketTokens = (tickets.data ?? []).map((row) => row.qr_token as string);
    });

    it("tiền điều kiện: 10 đơn paid có vé, ghế đã bán", async () => {
      expect(ticketTokens).toHaveLength(PAID_ORDERS);
      const statuses = await admin.from("orders").select("status").in("id", orders.map((o) => o.orderId));
      expect((statuses.data ?? []).every((row) => row.status === "paid")).toBe(true);
    });

    it("vé chưa huỷ check-in được (đối chứng trước khi huỷ suất)", async () => {
      const probe = await createPaidOrder(showtime, showtime.seatIds[PAID_ORDERS + 1]!);
      const ticket = await admin.from("tickets").select("qr_token, showtime_id").eq("order_id", probe.orderId).single();
      expect(ticket.error).toBeNull();
      // Suất cách 48 giờ -> quá sớm để check-in, nhưng KHÁC `CANCELLED`: chứng minh kết quả sau khi huỷ do huỷ suất gây ra.
      const scan = await request(server)
        .post("/checkin/scan")
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .send({ cinemaId, token: ticket.data!.qr_token });
      expect(scan.status).toBe(200);
      expect(scan.body.result).not.toBe("CANCELLED");
      // Đơn probe là đơn paid thứ 11: ghi vào danh sách để các bước sau tính đủ.
      orders.push(probe);
    });

    it("xem trước huỷ: đếm đúng đơn paid / đơn giữ chỗ", async () => {
      const res = await request(server)
        .post(`/cinemas/${cinemaId}/showtimes/cancel/preview`)
        .set("Authorization", `Bearer ${manager.accessToken}`)
        .send({ showtimeIds: [showtime.id] });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({ showtimesCount: 1, paidOrdersCount: orders.length, holdingOrdersCount: 1 });
    });

    it("quyền: staff không huỷ được; manager rạp khác bị 403; thiếu lý do bị từ chối", async () => {
      const body = { showtimeIds: [showtime.id], reason: "Sự cố máy chiếu" };
      const asStaff = await request(server).post(`/cinemas/${cinemaId}/showtimes/cancel`).set("Authorization", `Bearer ${staff.accessToken}`).send(body);
      expect(asStaff.status).toBe(403);
      const asOther = await request(server).post(`/cinemas/${cinemaId}/showtimes/cancel`).set("Authorization", `Bearer ${otherManager.accessToken}`).send(body);
      expect(asOther.status).toBe(403);
      const noReason = await request(server)
        .post(`/cinemas/${cinemaId}/showtimes/cancel`)
        .set("Authorization", `Bearer ${manager.accessToken}`)
        .send({ showtimeIds: [showtime.id], reason: "   " });
      expect(noReason.status).toBe(400);
      const still = await admin.from("showtimes").select("status").eq("id", showtime.id).single();
      expect(still.data?.status).toBe("ON_SALE");
    });

    it("AC-24: Manager huỷ suất -> suất ngừng bán, đơn paid -> affected, email xếp hàng", async () => {
      const res = await request(server)
        .post(`/cinemas/${cinemaId}/showtimes/cancel`)
        .set("Authorization", `Bearer ${manager.accessToken}`)
        .send({ showtimeIds: [showtime.id], reason: "Sự cố máy chiếu" });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        cancelledShowtimesCount: 1,
        affectedOrdersCount: orders.length,
        cancelledOrdersCount: 1,
        emailsEnqueuedCount: orders.length,
      });

      const st = await admin.from("showtimes").select("status, cancel_reason").eq("id", showtime.id).single();
      expect(st.data).toMatchObject({ status: "CANCELLED", cancel_reason: "Sự cố máy chiếu" });
      const affected = await admin.from("orders").select("id, status").in("id", orders.map((o) => o.orderId));
      expect((affected.data ?? []).every((row) => row.status === "affected")).toBe(true);
      const holding = await admin.from("orders").select("status").eq("id", holdingOrderId).single();
      expect(holding.data?.status).toBe("cancelled");
    });

    it("AC-24: suất ngừng bán trên web (sơ đồ ghế và giữ ghế mới đều bị từ chối)", async () => {
      const seatmap = await request(server).get(`/showtimes/${showtime.id}/seatmap`);
      expect(seatmap.status).toBe(409);
      expect(seatmap.body.error.code).toBe("SHOWTIME_CANCELLED");

      const buyer = await createCustomer("late");
      const hold = await request(server)
        .post("/bookings/holds")
        .set("Authorization", `Bearer ${buyer.accessToken}`)
        .send({ showtimeId: showtime.id, seatIds: [showtime.seatIds[PAID_ORDERS]!] });
      expect(hold.status, JSON.stringify(hold.body)).toBe(409);
      expect(hold.body.error.code).toBe("SHOWTIME_CANCELLED");
      const states = await admin.from("showtime_seat_states").select("id").eq("showtime_id", showtime.id).eq("state", "HELD");
      expect(states.data ?? []).toHaveLength(0);
    });

    it("AC-24: vé của suất bị huỷ không check-in được", async () => {
      for (const token of ticketTokens) {
        const scan = await request(server)
          .post("/checkin/scan")
          .set("Authorization", `Bearer ${staff.accessToken}`)
          .send({ cinemaId, token });
        expect(scan.status).toBe(200);
        expect(scan.body.result).toBe("CANCELLED");
      }
      const checkedIn = await admin.from("tickets").select("id").in("order_id", orders.map((o) => o.orderId)).not("checked_in_at", "is", null);
      expect(checkedIn.data ?? []).toHaveLength(0);
    });

    it("AC-24: mỗi đơn có đúng 1 email xếp hàng; job gửi (SMTP mock) -> SENT; nội dung hướng dẫn liên hệ CSKH", async () => {
      const rows = await outboxRowsFor(orders.map((o) => o.orderId));
      expect(rows).toHaveLength(orders.length);
      expect(new Set(rows.map((row) => row.to_email))).toEqual(new Set(orders.map((o) => o.email)));
      expect(rows.every((row) => row.status === "PENDING")).toBe(true);

      await drainOutbox(app, admin, rows.map((row) => row.id as string));
      const after = await outboxRowsFor(orders.map((o) => o.orderId));
      expect(after.every((row) => row.status === "SENT")).toBe(true);

      // Nội dung: render đúng payload thật của dòng outbox (không phụ thuộc app nào đã gửi hộ).
      const rendered = renderTemplate("showtime_cancelled", after[0]!.payload as Record<string, unknown>);
      expect(rendered.html + rendered.text).toContain(CSKH_PHONE);
      expect(rendered.html.toLowerCase()).not.toContain("đổi suất");
    });

    it("AC-24: màn Đơn bị ảnh hưởng hiển thị trạng thái gửi mail của 10 đơn", async () => {
      const res = await request(server)
        .get(`/cinemas/${cinemaId}/affected-orders?showtimeId=${showtime.id}&limit=50`)
        .set("Authorization", `Bearer ${manager.accessToken}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.total).toBe(orders.length);
      expect(res.body.items).toHaveLength(orders.length);
      for (const item of res.body.items) {
        expect(item.status).toBe("affected");
        expect(item.emailStatus).toBe("SENT");
        expect(item.emailSentAt).toBeTruthy();
      }
    });

    it("huỷ lại cùng suất: idempotent, không tạo thêm email", async () => {
      const again = await request(server)
        .post(`/cinemas/${cinemaId}/showtimes/cancel`)
        .set("Authorization", `Bearer ${manager.accessToken}`)
        .send({ showtimeIds: [showtime.id], reason: "Huỷ lại" });
      expect(again.status).toBe(201);
      expect(again.body).toMatchObject({ cancelledShowtimesCount: 0, affectedOrdersCount: 0, emailsEnqueuedCount: 0 });
      expect(await outboxRowsFor(orders.map((o) => o.orderId))).toHaveLength(orders.length);
    });

    it("gửi lại email: chặn khi đã SENT (chống gửi trùng); cho phép sau khi FAILED", async () => {
      const target = orders[0]!;
      const blocked = await request(server)
        .post(`/affected-orders/${target.orderId}/resend-email`)
        .set("Authorization", `Bearer ${manager.accessToken}`);
      expect(blocked.status).toBe(409);

      const row = (await outboxRowsFor([target.orderId]))[0]!;
      await admin.from("email_outbox").update({ status: "FAILED", last_error: "mô phỏng lỗi SMTP" }).eq("id", row.id);
      const resend = await request(server)
        .post(`/affected-orders/${target.orderId}/resend-email`)
        .set("Authorization", `Bearer ${manager.accessToken}`);
      expect(resend.status, JSON.stringify(resend.body)).toBe(201);
      await drainOutbox(app, admin, [row.id as string]);
      expect((await outboxRowsFor([target.orderId]))[0]!.status).toBe("SENT");
    });

    it("AC-25: ghi nhận hoàn tiền thủ công thiếu số tiền hoặc mã giao dịch -> 422, đơn giữ nguyên affected", async () => {
      const target = orders[1]!;
      const url = `/affected-orders/${target.orderId}/refund`;
      const auth = { Authorization: `Bearer ${manager.accessToken}` };
      for (const body of [
        { refundReference: "VCB-0001" },
        { refundedAmount: TICKET_PRICE },
        { refundedAmount: TICKET_PRICE, refundReference: "   " },
        { refundedAmount: 0, refundReference: "VCB-0001" },
        { refundedAmount: TICKET_PRICE * 5, refundReference: "VCB-0001" },
      ]) {
        const res = await request(server).post(url).set(auth).send(body);
        expect(res.status, JSON.stringify(body)).toBe(422);
      }
      const row = await admin.from("orders").select("status").eq("id", target.orderId).single();
      expect(row.data?.status).toBe("affected");
      const actions = await admin.from("affected_order_actions").select("id").eq("order_id", target.orderId);
      expect(actions.data ?? []).toHaveLength(0);
    });

    it("AC-25: staff rạp khác bị 403 khi ghi hoàn tiền", async () => {
      const res = await request(server)
        .post(`/affected-orders/${orders[1]!.orderId}/refund`)
        .set("Authorization", `Bearer ${otherManager.accessToken}`)
        .send({ refundedAmount: TICKET_PRICE, refundReference: "VCB-0002" });
      expect(res.status).toBe(403);
    });

    it("AC-25: nhập đủ -> refunded_manual, hoàn trùng bị 409, xuất hiện trong báo cáo suất bị huỷ", async () => {
      const target = orders[1]!;
      const url = `/affected-orders/${target.orderId}/refund`;
      const ok = await request(server)
        .post(url)
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .send({ refundedAmount: TICKET_PRICE, refundReference: "VCB-0003", note: "Hoàn qua chuyển khoản" });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      expect(ok.body).toMatchObject({ success: true, status: "refunded_manual", refundedAmount: TICKET_PRICE, refundReference: "VCB-0003" });

      const row = await admin.from("orders").select("status").eq("id", target.orderId).single();
      expect(row.data?.status).toBe("refunded_manual");
      const action = await admin.from("affected_order_actions").select("refund_reference, refunded_amount, performed_by").eq("order_id", target.orderId).single();
      expect(action.data).toMatchObject({ refund_reference: "VCB-0003", refunded_amount: TICKET_PRICE });

      const dup = await request(server).post(url).set("Authorization", `Bearer ${manager.accessToken}`).send({ refundedAmount: TICKET_PRICE, refundReference: "VCB-0004" });
      expect(dup.status).toBe(409);

      const detail = await request(server)
        .get(`/cinemas/${cinemaId}/affected-orders?showtimeId=${showtime.id}&status=refunded_manual`)
        .set("Authorization", `Bearer ${manager.accessToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.items.map((item: { id: string }) => item.id)).toEqual([target.orderId]);

      const report = await request(server)
        .get(`/reports/cancelled-showtimes?cinemaId=${cinemaId}`)
        .set("Authorization", `Bearer ${adminUser.accessToken}`);
      expect(report.status, JSON.stringify(report.body)).toBe(200);
      const line = (report.body as Array<{ showtimeId: string; totalAffectedOrders: number; refundedManualOrders: number; pendingOrders: number; totalRefundedAmount: number }>).find(
        (item) => item.showtimeId === showtime.id,
      );
      expect(line).toMatchObject({
        totalAffectedOrders: orders.length,
        refundedManualOrders: 1,
        pendingOrders: orders.length - 1,
        totalRefundedAmount: TICKET_PRICE,
      });
    });
  });

  describe("AC-26: đóng rạp khi còn suất tương lai đã bán", () => {
    it("chặn đóng rạp (409 + danh sách suất) -> huỷ hàng loạt 3 suất kèm email -> đóng rạp được", async () => {
      const cinema = await factories.createCinema();
      const adminUser = await factories.createAdminUser();
      const manager = await factories.createStaffUser(cinema.id, "MANAGER");
      const showtimes: TestShowtime[] = [];
      const paid: PaidOrder[] = [];
      for (let index = 0; index < 3; index += 1) {
        const showtime = await factories.createShowtime({ cinemaId: cinema.id, startsInHours: 24 + index * 3 });
        await addShowtimePrice(showtime.id);
        showtimes.push(showtime);
        paid.push(await createPaidOrder(showtime, showtime.seatIds[0]!));
      }
      const setStatus = (status: string) =>
        request(server).patch(`/admin/cinemas/${cinema.id}/status`).set("Authorization", `Bearer ${adminUser.accessToken}`).send({ status });

      for (const status of ["TEMP_CLOSED", "CLOSED"]) {
        const blocked = await setStatus(status);
        expect(blocked.status, JSON.stringify(blocked.body)).toBe(409);
        expect([...(blocked.body.error.details.showtimeIds as string[])].sort()).toEqual(showtimes.map((s) => s.id).sort());
      }
      expect((await admin.from("cinemas").select("status").eq("id", cinema.id).single()).data?.status).toBe("OPEN");

      // Manager (không phải Admin) không đổi được trạng thái rạp.
      const asManager = await request(server).patch(`/admin/cinemas/${cinema.id}/status`).set("Authorization", `Bearer ${manager.accessToken}`).send({ status: "TEMP_CLOSED" });
      expect(asManager.status).toBe(403);

      const cancel = await request(server)
        .post(`/cinemas/${cinema.id}/showtimes/cancel`)
        .set("Authorization", `Bearer ${manager.accessToken}`)
        .send({ allFuture: true, reason: "Rạp tạm đóng để bảo trì" });
      expect(cancel.status, JSON.stringify(cancel.body)).toBe(201);
      expect(cancel.body).toMatchObject({ cancelledShowtimesCount: 3, affectedOrdersCount: 3, emailsEnqueuedCount: 3 });

      const mails = await outboxRowsFor(paid.map((o) => o.orderId));
      expect(mails).toHaveLength(3);
      await drainOutbox(app, admin, mails.map((row) => row.id as string));
      expect((await outboxRowsFor(paid.map((o) => o.orderId))).every((row) => row.status === "SENT")).toBe(true);

      const closed = await setStatus("TEMP_CLOSED");
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      expect((await admin.from("cinemas").select("status").eq("id", cinema.id).single()).data?.status).toBe("TEMP_CLOSED");
    });
  });
});
