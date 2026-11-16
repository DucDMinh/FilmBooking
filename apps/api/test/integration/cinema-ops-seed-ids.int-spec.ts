import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "./helpers/app-harness";
import { createFactories, type TestUser } from "./helpers/factories";
import { cleanupScope, createAdminClient, createRunScope, loadLocalSupabaseEnv } from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

// Bug admin-ux: ID đặt tay kiểu seed (20000000-0000-0000-…) không đúng version/variant RFC 4122
// nên `z.uuid()` từng trả 400 "Invalid UUID" ở danh sách phòng / sơ đồ ghế.
describe.skipIf(!supabaseEnv)("integration: ID rạp/phòng kiểu seed (không chuẩn RFC) vẫn dùng được", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let app: INestApplication;
  let adminUser: TestUser;
  let cinemaId: string;
  let roomId: string;
  let showtimeId: string;
  let seatCount: number;

  const bearer = () => `Bearer ${adminUser.accessToken}`;

  beforeAll(async () => {
    admin = createAdminClient(env);
    const factories = createFactories(env, admin, scope);
    ({ app } = await bootTestApp(env));
    adminUser = await factories.createAdminUser();

    // Rạp mang id kiểu seed nhưng riêng cho lần chạy này (không phụ thuộc/không đụng dữ liệu seed demo).
    cinemaId = `20000000-0000-0000-ffff-${scope.runId.padStart(12, "0")}`;
    const { provinceId } = await factories.createCinema();
    const inserted = await admin
      .from("cinemas")
      .insert({ id: cinemaId, code: `${scope.cinemaCodeBase}Z`, name: `${scope.prefix}cinema_seed_id`, province_id: provinceId, address: `${scope.prefix}address` });
    if (inserted.error) throw new Error(`tạo rạp id seed thất bại: ${inserted.error.message}`);
    // Phòng cũng mang id kiểu seed (30000000-…), đúng ID gây bug gốc ở /rooms/:roomId/seats.
    roomId = `30000000-0000-0000-ffff-${scope.runId.padStart(12, "0")}`;
    const room = await admin.from("rooms").insert({ id: roomId, cinema_id: cinemaId, name: `${scope.prefix}room_seed_id`, grid_rows: 2, grid_cols: 3 });
    if (room.error) throw new Error(`tạo phòng id seed thất bại: ${room.error.message}`);
    const seatRows = [1, 2, 3].flatMap((col) =>
      ["A", "B"].map((rowLabel) => ({ room_id: roomId, cinema_id: cinemaId, row_label: rowLabel, col_number: col, seat_type: "NORMAL" })),
    );
    const seats = await admin.from("seats").insert(seatRows).select("id");
    if (seats.error) throw new Error(`tạo ghế thất bại: ${seats.error.message}`);
    seatCount = seatRows.length;

    // Suất mang id kiểu suất demo Live (50000000-…); đổi id ngay sau khi tạo (chưa có hold/order tham chiếu).
    const showtime = await factories.createShowtime({ cinemaId });
    showtimeId = `50000000-0000-0000-ffff-${scope.runId.padStart(12, "0")}`;
    const renamed = await admin.from("showtimes").update({ id: showtimeId }).eq("id", showtime.id);
    if (renamed.error) throw new Error(`đổi id suất thất bại: ${renamed.error.message}`);
  });

  afterAll(async () => {
    await app?.close();
    if (admin) await cleanupScope(admin, scope);
  });

  it("GET /cinemas/:id/rooms -> 200 + có phòng", async () => {
    const res = await request(app.getHttpServer()).get(`/cinemas/${cinemaId}/rooms`).set("Authorization", bearer());
    expect(res.status).toBe(200);
    expect(res.body.map((room: { id: string }) => room.id)).toContain(roomId);
  });

  it("GET /cinemas/:id/rooms/:roomId/seats -> 200 + có ghế", async () => {
    const res = await request(app.getHttpServer()).get(`/cinemas/${cinemaId}/rooms/${roomId}/seats`).set("Authorization", bearer());
    expect(res.status).toBe(200);
    expect(res.body.room.id).toBe(roomId);
    expect(res.body.cells).toHaveLength(seatCount);
  });

  it("GET /showtimes/:id/seatmap (public) với id suất kiểu seed -> 200", async () => {
    const res = await request(app.getHttpServer()).get(`/showtimes/${showtimeId}/seatmap`);
    expect(res.status).toBe(200);
  });

  it("ID không phải GUID (abc) vẫn 400 VALIDATION_ERROR", async () => {
    const res = await request(app.getHttpServer()).get("/cinemas/abc/rooms").set("Authorization", bearer());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
