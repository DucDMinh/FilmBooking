import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPricedShowtime } from "./helpers/booking-fixtures";
import { createFactories, type TestShowtime, type TestUser } from "./helpers/factories";
import { mapLimit, percentile, postHold, startApi, type HoldAttempt, type RunningApi } from "./helpers/api-app";
import { cleanupScope, createAdminClient, createRunScope, loadLocalSupabaseEnv } from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

// Ngưỡng cấu hình được qua env để chạy nhẹ trên máy tải; mặc định = đúng AC/NFR.
const RACE_ROUNDS = Number(process.env.IT_RACE_ROUNDS ?? 50); // AC-06
const MIXED_CLIENTS = Number(process.env.IT_MIXED_CLIENTS ?? 100);
const LOAD_RATE_PER_SECOND = Number(process.env.IT_LOAD_RATE ?? 20); // NFR-02
const LOAD_SECONDS = Number(process.env.IT_LOAD_SECONDS ?? 30); // NFR-02
const P95_LIMIT_MS = Number(process.env.IT_P95_LIMIT_MS ?? 1000); // NFR-01

const clientIp = (index: number) => `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
const errorCode = (attempt: HoldAttempt) => attempt.body.error?.code;

/** Bản ghi giữ/bán của suất (unique(showtime, seat) ở DB: mỗi ghế tối đa 1 bản ghi). */
async function seatStatesOf(admin: SupabaseClient, showtimeId: string) {
  const { data, error } = await admin
    .from("showtime_seat_states")
    .select("seat_id, state, order_id, expires_at")
    .eq("showtime_id", showtimeId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

describe.skipIf(!supabaseEnv)("integration: tranh ghế web <-> web + tải giữ ghế", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let api: RunningApi;
  let factories: ReturnType<typeof createFactories>;
  let users: TestUser[] = [];

  beforeAll(async () => {
    admin = createAdminClient(env);
    factories = createFactories(env, admin, scope);
    api = await startApi(env);
    users = await mapLimit(Array.from({ length: Math.max(MIXED_CLIENTS, 100) }), 10, () => factories.createUser("c"));
  }, 300_000);

  afterAll(async () => {
    await api?.app.close();
    if (admin) await cleanupScope(admin, scope);
  }, 120_000);

  const token = (user: TestUser) => user.accessToken as string;

  it(`AC-06: 2 khách cùng giữ 1 ghế đồng thời -> đúng 1 thành công (lặp ${RACE_ROUNDS} lần)`, async () => {
    const showtime = await createPricedShowtime(admin, factories, { rows: Math.ceil(RACE_ROUNDS / 2) });
    const [alice, bob] = users as [TestUser, TestUser];

    for (let round = 0; round < RACE_ROUNDS; round++) {
      const seatId = showtime.seatIds[round] as string;
      const payload = { showtimeId: showtime.id, seatIds: [seatId] };
      const attempts = await Promise.all([
        postHold(api.baseUrl, token(alice), clientIp(1), payload),
        postHold(api.baseUrl, token(bob), clientIp(2), payload),
      ]);

      const winners = attempts.filter((a) => a.status === 201);
      const losers = attempts.filter((a) => a.status !== 201);
      expect(winners, `vòng ${round}: ${JSON.stringify(attempts.map((a) => [a.status, a.body]))}`).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]?.status).toBe(409);
      expect(errorCode(losers[0] as HoldAttempt)).toBe("SEAT_TAKEN");

      const holders = (await seatStatesOf(admin, showtime.id)).filter((s) => s.seat_id === seatId);
      expect(holders).toHaveLength(1);
      expect(holders[0]?.order_id).toBe(winners[0]?.body.orderId);
    }
  }, 180_000);

  /** 100 client giữ 1-2 ghế ngẫu nhiên trong 40 ghế (tranh chấp dày); mỗi client đến cách nhau `gapMs`. Kiểm 0 ghế trùng + đúng mã lỗi. */
  async function runMixedClients(gapMs: number) {
    const showtime = await createPricedShowtime(admin, factories, { rows: 20 });
    // Khởi động nguội (JWKS, pool kết nối) không thuộc phép đo: 1 hold khởi động trên suất khác.
    const warmup = await createPricedShowtime(admin, factories, { rows: 1 });
    const warm = await postHold(api.baseUrl, token(users[0] as TestUser), clientIp(99), {
      showtimeId: warmup.id,
      seatIds: [warmup.seatIds[0] as string],
    });
    expect(warm.status).toBe(201);

    const attempts = await Promise.all(
      users.slice(0, MIXED_CLIENTS).map(async (user, index) => {
        if (gapMs > 0) await new Promise((resolve) => setTimeout(resolve, index * gapMs));
        const seatCount = 1 + Math.floor(Math.random() * 2);
        const seatIds = [...showtime.seatIds].sort(() => Math.random() - 0.5).slice(0, seatCount);
        const attempt = await postHold(api.baseUrl, token(user), clientIp(100 + index), { showtimeId: showtime.id, seatIds });
        return { attempt, seatIds };
      }),
    );

    expect(attempts.filter(({ attempt }) => attempt.status >= 500).map(({ attempt }) => attempt.body)).toEqual([]);
    const conflicts = attempts.filter(({ attempt }) => attempt.status !== 201);
    expect(conflicts.every(({ attempt }) => attempt.status === 409 && errorCode(attempt) === "SEAT_TAKEN")).toBe(true);

    const winners = attempts.filter(({ attempt }) => attempt.status === 201);
    expect(winners.length).toBeGreaterThan(0);
    const claimedSeats = winners.flatMap(({ seatIds }) => seatIds);
    expect(new Set(claimedSeats).size).toBe(claimedSeats.length); // không ghế nào thuộc 2 đơn thắng

    const states = await seatStatesOf(admin, showtime.id);
    expect(states.map((s) => s.seat_id).sort()).toEqual([...claimedSeats].sort());
    for (const { attempt, seatIds } of winners) {
      expect(states.filter((s) => s.order_id === attempt.body.orderId)).toHaveLength(seatIds.length);
    }
    return { p95: percentile(attempts.map(({ attempt }) => attempt.ms), 95), winners: winners.length, conflicts: conflicts.length };
  }

  it(`${MIXED_CLIENTS} client đến cùng lúc (burst): 0 ghế giữ/bán trùng, mọi thua cuộc là 409 SEAT_TAKEN`, async () => {
    // Burst 100 request tại cùng 1 thời điểm vượt xa NFR-02 (20/s): chỉ kiểm tính đúng, p95 ghi nhận chứ không chặn.
    const { p95, winners, conflicts } = await runMixedClients(0);
    console.info(`[burst] ${MIXED_CLIENTS} client cùng lúc: ${winners} thắng / ${conflicts} 409, p95=${p95.toFixed(0)}ms (không chặn)`);
  }, 120_000);

  it(`${MIXED_CLIENTS} client đến theo nhịp NFR-02 (${LOAD_RATE_PER_SECOND}/s): 0 ghế trùng, p95 giữ ghế <= ${P95_LIMIT_MS}ms`, async () => {
    const { p95, winners, conflicts } = await runMixedClients(1000 / LOAD_RATE_PER_SECOND);
    console.info(`[NFR-01] ${MIXED_CLIENTS} client @${LOAD_RATE_PER_SECOND}/s: ${winners} thắng / ${conflicts} 409, p95=${p95.toFixed(0)}ms`);
    expect(p95).toBeLessThanOrEqual(P95_LIMIT_MS);
  }, 120_000);

  it(`NFR-02: tải ${LOAD_RATE_PER_SECOND} hold/giây trong ${LOAD_SECONDS}s, p95 <= ${P95_LIMIT_MS}ms`, async () => {
    const showtime: TestShowtime = await createPricedShowtime(admin, factories, { rows: 26 });
    const total = LOAD_RATE_PER_SECOND * LOAD_SECONDS;
    const intervalMs = 1000 / LOAD_RATE_PER_SECOND;
    const startedAt = performance.now();
    const pending: Array<Promise<{ attempt: HoldAttempt; seatId: string }>> = [];

    // Open-loop: phát request theo lịch cố định, không chờ phản hồi (đo đúng tốc độ đến, không tự giảm tải khi server chậm).
    // Mỗi user bị gọi cách nhau users.length / rate giây (>= 5s) nên không tự chồng request lên đơn của chính mình.
    for (let i = 0; i < total; i++) {
      const waitMs = startedAt + i * intervalMs - performance.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      const seatId = showtime.seatIds[Math.floor(Math.random() * showtime.seatIds.length)] as string;
      const user = users[i % users.length] as TestUser;
      pending.push(
        postHold(api.baseUrl, token(user), clientIp(1000 + (i % users.length)), { showtimeId: showtime.id, seatIds: [seatId] }).then(
          (attempt) => ({ attempt, seatId }),
        ),
      );
    }
    const results = await Promise.all(pending);
    const elapsedSeconds = (performance.now() - startedAt) / 1000;

    const ok = results.filter(({ attempt }) => attempt.status === 201);
    const bad = results.filter(({ attempt }) => attempt.status !== 201 && attempt.status !== 409);
    expect(bad.map(({ attempt }) => [attempt.status, attempt.body])).toEqual([]);
    expect(ok.length).toBeGreaterThan(0);

    const states = await seatStatesOf(admin, showtime.id);
    expect(new Set(states.map((s) => s.seat_id)).size).toBe(states.length); // 0 ghế trùng

    const all = results.map(({ attempt }) => attempt.ms);
    const p95 = percentile(all, 95);
    const p95Ok = percentile(ok.map(({ attempt }) => attempt.ms), 95);
    console.info(
      `[NFR-01/02] ${total} hold trong ${elapsedSeconds.toFixed(1)}s (~${(total / elapsedSeconds).toFixed(1)}/s): ` +
        `201=${ok.length}, 409=${results.length - ok.length}, p95(all)=${p95.toFixed(0)}ms, p95(201)=${p95Ok.toFixed(0)}ms, ` +
        `p50=${percentile(all, 50).toFixed(0)}ms, max=${Math.max(...all).toFixed(0)}ms`,
    );
    expect(total / elapsedSeconds).toBeGreaterThanOrEqual(LOAD_RATE_PER_SECOND * 0.9);
    expect(p95).toBeLessThanOrEqual(P95_LIMIT_MS);
  }, 180_000);
});
