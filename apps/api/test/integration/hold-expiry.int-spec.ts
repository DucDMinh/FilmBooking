import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postHold, startApi, type RunningApi } from "./helpers/api-app";
import { createPricedShowtime } from "./helpers/booking-fixtures";
import { createFactories, type TestShowtime, type TestUser } from "./helpers/factories";
import { cleanupScope, createAdminClient, createRunScope, loadLocalSupabaseEnv } from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

describe.skipIf(!supabaseEnv)("integration: hết hạn giữ ghế web (AC-07)", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let api: RunningApi;
  let factories: ReturnType<typeof createFactories>;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    admin = createAdminClient(env);
    factories = createFactories(env, admin, scope);
    api = await startApi(env);
    [alice, bob] = await Promise.all([factories.createUser("alice"), factories.createUser("bob")]);
  }, 120_000);

  afterAll(async () => {
    await api?.app.close();
    if (admin) await cleanupScope(admin, scope);
  }, 120_000);

  async function hold(user: TestUser, showtime: TestShowtime, seatId: string, ip: string) {
    return postHold(api.baseUrl, user.accessToken as string, ip, { showtimeId: showtime.id, seatIds: [seatId] });
  }

  async function seatState(showtime: TestShowtime, seatId: string): Promise<string | undefined> {
    const res = await fetch(`${api.baseUrl}/showtimes/${showtime.id}/seatmap`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seats: Array<{ id: string; state: string }> };
    return body.seats.find((seat) => seat.id === seatId)?.state;
  }

  /** Đẩy hạn giữ của đơn về quá khứ (thay vì đợi TTL thật): tương đương cấu hình TTL rút ngắn mà không đổi app_settings dùng chung. */
  async function backdateHold(orderId: string): Promise<void> {
    const past = new Date(Date.now() - 60_000).toISOString();
    const seats = await admin.from("showtime_seat_states").update({ expires_at: past }).eq("order_id", orderId).eq("state", "HELD");
    expect(seats.error).toBeNull();
    const order = await admin.from("orders").update({ hold_expires_at: past }).eq("id", orderId);
    expect(order.error).toBeNull();
  }

  async function orderStatus(orderId: string): Promise<string | undefined> {
    const { data, error } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(error).toBeNull();
    return data?.status as string | undefined;
  }

  it("hold web đặt hạn theo app_settings.seat_hold_minutes_web (mặc định 10 phút)", async () => {
    const showtime = await createPricedShowtime(admin, factories, { rows: 2 });
    const { data: setting } = await admin.from("app_settings").select("value").eq("key", "seat_hold_minutes_web").maybeSingle();
    const expectedMinutes = typeof setting?.value === "number" ? setting.value : 10;

    const before = Date.now();
    const res = await hold(alice, showtime, showtime.seatIds[0] as string, "10.9.0.1");
    expect(res.status).toBe(201);
    const remainingMs = new Date(res.body.holdExpiresAt as string).getTime() - before;
    expect(remainingMs).toBeGreaterThan((expectedMinutes - 1) * 60_000);
    expect(remainingMs).toBeLessThanOrEqual(expectedMinutes * 60_000 + 5_000);
    expect(await seatState(showtime, showtime.seatIds[0] as string)).toBe("HELD");
  });

  it("AC-07: hold hết hạn -> sơ đồ đọc ghế là trống, sau cron đơn expired và ghế được dọn", async () => {
    const showtime = await createPricedShowtime(admin, factories, { rows: 2 });
    const seatId = showtime.seatIds[0] as string;
    const res = await hold(alice, showtime, seatId, "10.9.0.1");
    expect(res.status).toBe(201);
    const orderId = res.body.orderId as string;
    expect(await seatState(showtime, seatId)).toBe("HELD");

    await backdateHold(orderId);

    // Trước cron: ghế đã quá hạn phải đọc là FREE dù dòng HELD còn trong DB; đơn chưa bị cron đổi trạng thái.
    expect(await seatState(showtime, seatId)).toBe("FREE");
    expect(await orderStatus(orderId)).toBe("holding");

    const cron = await admin.rpc("expire_overdue_holds");
    expect(cron.error).toBeNull();
    expect(cron.data).toBeGreaterThanOrEqual(1);

    expect(await orderStatus(orderId)).toBe("expired");
    const leftovers = await admin.from("showtime_seat_states").select("id").eq("order_id", orderId);
    expect(leftovers.error).toBeNull();
    expect(leftovers.data).toEqual([]);
    expect(await seatState(showtime, seatId)).toBe("FREE");
  });

  it("AC-07: khách khác giữ được ghế đã quá hạn ngay (không cần chờ cron), đơn cũ thành expired", async () => {
    const showtime = await createPricedShowtime(admin, factories, { rows: 2 });
    const seatId = showtime.seatIds[0] as string;
    const first = await hold(alice, showtime, seatId, "10.9.0.1");
    expect(first.status).toBe(201);
    const staleOrderId = first.body.orderId as string;

    // Còn hạn: người thứ hai bị từ chối.
    expect((await hold(bob, showtime, seatId, "10.9.0.2")).status).toBe(409);

    await backdateHold(staleOrderId);
    const second = await hold(bob, showtime, seatId, "10.9.0.2");
    expect(second.status).toBe(201);
    expect(second.body.orderId).not.toBe(staleOrderId);
    expect(await orderStatus(staleOrderId)).toBe("expired");

    const holders = await admin.from("showtime_seat_states").select("order_id").eq("showtime_id", showtime.id).eq("seat_id", seatId);
    expect(holders.data).toEqual([{ order_id: second.body.orderId }]);
  });
});
