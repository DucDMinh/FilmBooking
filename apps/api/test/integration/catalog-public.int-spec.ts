import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
import { ENV, parseEnv } from "../../src/config/env";
import { vnToday } from "../../src/modules/catalog/movies.service";
import { createFactories, type TestUser } from "./helpers/factories";
import {
  cleanupScope,
  createAdminClient,
  createRunScope,
  loadLocalSupabaseEnv,
} from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

interface ScheduleGroup {
  cinema: { code: string; name: string };
  showtimes: Array<{ id: string; roomId: string; startsAt: string; format: string; status: string }>;
}

// Docker/Supabase không chạy -> skip (đã cảnh báo ở loadLocalSupabaseEnv), không fail.
// Test này tồn tại vì unit/e2e catalog mock Supabase nên không bắt được lỗi embed PostgREST trên schema thật
// (GET /movies từng 500: PGRST200 thiếu quan hệ showtimes -> cinemas).
describe.skipIf(!supabaseEnv)("integration catalog public: movies, schedule, cinemas (DB thật)", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  /** Mã tỉnh hợp lệ nhưng không có rạp nào. */
  const emptyProvince = `${scope.provinceCode}_X`;
  let admin: SupabaseClient;
  let app: INestApplication;
  let adminUser: TestUser;

  let cinemaA: { id: string; code: string };
  let cinemaB: { id: string; code: string };
  let movieSlug: string;
  let showtimeAId: string;
  let showtimeBId: string;
  let roomA1Id: string;
  let startsAt: Date;
  let showDate: string;
  let nextDate: string;

  beforeAll(async () => {
    admin = createAdminClient(env);
    const factories = createFactories(env, admin, scope);

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

    // Suất cách 48h: ngày lịch VN của suất không phụ thuộc giờ chạy test (khác "+2h" dễ vắt qua nửa đêm).
    startsAt = new Date(Date.now() + 48 * HOUR_MS);
    showDate = vnToday(startsAt);
    nextDate = new Date(Date.parse(`${showDate}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

    adminUser = await factories.createAdminUser();

    // Rạp A: 2 phòng (1 suất đang bán + 1 suất đã huỷ). Rạp B: 1 phòng, 1 suất đang bán. Cùng tỉnh của scope.
    const a = await factories.createCinema();
    const b = await factories.createCinema();
    cinemaA = { id: a.id, code: a.code };
    cinemaB = { id: b.id, code: b.code };
    roomA1Id = (await factories.createRoomWithSeats(a.id, 2, 4)).roomId;
    const roomA2Id = (await factories.createRoomWithSeats(a.id, 2, 4)).roomId;
    const roomBId = (await factories.createRoomWithSeats(b.id, 2, 4)).roomId;

    // release_date = hôm qua -> đã khởi chiếu, luôn nằm đầu danh sách (sắp xếp release_date giảm dần).
    movieSlug = `${scope.slugPrefix}movie-catalog`;
    const movieRes = await admin
      .from("movies")
      .insert({
        slug: movieSlug,
        title_vi: `${scope.prefix}Phim Test Catalog`,
        title_original: "Catalog Test Movie",
        duration_minutes: 110,
        release_date: new Date(Date.now() - DAY_MS).toISOString().slice(0, 10),
        age_rating: "T13",
        status: "PUBLISHED",
      })
      .select("id")
      .single();
    if (movieRes.error || !movieRes.data) throw new Error(`Tạo phim test thất bại: ${movieRes.error?.message}`);
    const movieId = movieRes.data.id as string;

    const insertShowtime = async (cinemaId: string, roomId: string, status: "ON_SALE" | "CANCELLED") => {
      const res = await admin
        .from("showtimes")
        .insert({
          cinema_id: cinemaId,
          room_id: roomId,
          movie_id: movieId,
          starts_at: startsAt.toISOString(),
          format: "2D",
          language_mode: "SUBTITLED",
          status,
        })
        .select("id")
        .single();
      if (res.error || !res.data) throw new Error(`Tạo suất test thất bại: ${res.error?.message}`);
      return res.data.id as string;
    };
    showtimeAId = await insertShowtime(a.id, roomA1Id, "ON_SALE");
    await insertShowtime(a.id, roomA2Id, "CANCELLED");
    showtimeBId = await insertShowtime(b.id, roomBId, "ON_SALE");
  });

  afterAll(async () => {
    await app?.close();
    if (admin) await cleanupScope(admin, scope);
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it("GET /movies: 200, phim có suất tại rạp OPEN được phân loại now_showing (R-38)", async () => {
    const res = await get(`/movies?q=${scope.runId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      slug: movieSlug,
      titleVi: `${scope.prefix}Phim Test Catalog`,
      durationMinutes: 110,
      ageRating: "T13",
      availability: "now_showing",
    });
  });

  it("GET /movies?status: now_showing có phim, coming_soon thì không", async () => {
    const showing = await get(`/movies?q=${scope.runId}&status=now_showing`);
    expect(showing.status).toBe(200);
    expect(showing.body.map((m: { slug: string }) => m.slug)).toEqual([movieSlug]);

    const upcoming = await get(`/movies?q=${scope.runId}&status=coming_soon`);
    expect(upcoming.status).toBe(200);
    expect(upcoming.body).toEqual([]);
  });

  it("GET /movies?province: lọc theo tỉnh có rạp -> now_showing; tỉnh không có rạp -> không còn suất", async () => {
    const inProvince = await get(`/movies?q=${scope.runId}&province=${scope.provinceCode}`);
    expect(inProvince.status).toBe(200);
    expect(inProvince.body).toHaveLength(1);
    expect(inProvince.body[0].availability).toBe("now_showing");

    const elsewhere = await get(`/movies?q=${scope.runId}&province=${emptyProvince}`);
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.body).toHaveLength(1);
    expect(elsewhere.body[0].availability).toBeNull();
  });

  it("GET /home: nowShowing chứa phim; lọc tỉnh không có rạp thì không chứa", async () => {
    const res = await get(`/home?province=${scope.provinceCode}`);
    expect(res.status).toBe(200);
    expect(res.body.nowShowing.map((m: { slug: string }) => m.slug)).toContain(movieSlug);
    expect(res.body.comingSoon.map((m: { slug: string }) => m.slug)).not.toContain(movieSlug);

    const empty = await get(`/home?province=${emptyProvince}`);
    expect(empty.status).toBe(200);
    expect(empty.body.nowShowing.map((m: { slug: string }) => m.slug)).not.toContain(movieSlug);
  });

  it("GET /movies/:slug: lịch chiếu gom theo rạp, đúng suất, loại suất đã huỷ", async () => {
    const res = await get(`/movies/${movieSlug}?date=${showDate}`);
    expect(res.status).toBe(200);
    expect(res.body.movie).toMatchObject({ slug: movieSlug, availability: "now_showing" });

    const schedule = res.body.schedule as ScheduleGroup[];
    expect(schedule.map((g) => g.cinema.code).sort()).toEqual([cinemaA.code, cinemaB.code].sort());

    const groupA = schedule.find((g) => g.cinema.code === cinemaA.code);
    expect(groupA?.showtimes).toHaveLength(1); // suất CANCELLED của phòng A2 không hiện
    expect(groupA?.showtimes[0]).toMatchObject({
      id: showtimeAId,
      roomId: roomA1Id,
      startsAt: startsAt.toISOString(),
      format: "2D",
      status: "ON_SALE",
    });
    const groupB = schedule.find((g) => g.cinema.code === cinemaB.code);
    expect(groupB?.showtimes.map((s) => s.id)).toEqual([showtimeBId]);
  });

  it("GET /movies/:slug?province: lọc tỉnh qua embed cinemas -> provinces", async () => {
    const inProvince = await get(`/movies/${movieSlug}?date=${showDate}&province=${scope.provinceCode}`);
    expect(inProvince.status).toBe(200);
    expect(inProvince.body.schedule).toHaveLength(2);

    const elsewhere = await get(`/movies/${movieSlug}?date=${showDate}&province=${emptyProvince}`);
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.body.schedule).toEqual([]);
  });

  it("GET /movies/:slug: ngày khác không có suất -> schedule rỗng; slug lạ -> 404", async () => {
    const otherDay = await get(`/movies/${movieSlug}?date=${nextDate}`);
    expect(otherDay.status).toBe(200);
    expect(otherDay.body.schedule).toEqual([]);

    expect((await get(`/movies/${scope.slugPrefix}khong-ton-tai`)).status).toBe(404);
  });

  it("GET /cinemas: danh sách rạp OPEN theo tỉnh", async () => {
    const res = await get(`/cinemas?province=${scope.provinceCode}`);
    expect(res.status).toBe(200);
    expect((res.body as Array<{ code: string }>).map((c) => c.code).sort()).toEqual(
      [cinemaA.code, cinemaB.code].sort(),
    );

    const empty = await get(`/cinemas?province=${emptyProvince}`);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);
  });

  it("GET /cinemas/:code: chi tiết rạp kèm phòng + suất (embed showtimes -> movies), loại suất đã huỷ", async () => {
    const res = await get(`/cinemas/${cinemaA.code}?date=${showDate}`);
    expect(res.status).toBe(200);
    expect(res.body.cinema).toMatchObject({ code: cinemaA.code, provinceCode: scope.provinceCode, status: "OPEN" });
    expect(res.body.rooms).toHaveLength(2);
    expect(res.body.showtimes).toHaveLength(1);
    expect(res.body.showtimes[0]).toMatchObject({
      id: showtimeAId,
      roomId: roomA1Id,
      format: "2D",
      movie: { slug: movieSlug, titleVi: `${scope.prefix}Phim Test Catalog`, durationMinutes: 110, ageRating: "T13" },
    });
  });

  // Sau khi thêm FK showtimes -> cinemas, rooms(count) từ cinemas có thể bị PostgREST coi là mơ hồ
  // (đường trực tiếp + đường many-to-many qua showtimes) nếu không chỉ rõ FK.
  it("GET /admin/cinemas và /admin/cinemas/:id: roomCount đúng (embed rooms(count) không mơ hồ)", async () => {
    const auth = { Authorization: `Bearer ${adminUser.accessToken}` };

    const one = await get(`/admin/cinemas/${cinemaA.id}`).set(auth);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id: cinemaA.id, code: cinemaA.code, roomCount: 2 });

    const list = await get("/admin/cinemas").set(auth);
    expect(list.status).toBe(200);
    const rows = list.body as Array<{ code: string; roomCount: number }>;
    expect(rows.find((c) => c.code === cinemaA.code)?.roomCount).toBe(2);
    expect(rows.find((c) => c.code === cinemaB.code)?.roomCount).toBe(1);
  });
});
