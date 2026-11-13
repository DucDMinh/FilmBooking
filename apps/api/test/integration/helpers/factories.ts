import type { SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { createAnonClient, type LocalSupabaseEnv, type RunScope } from "./supabase-test";

const TEST_PASSWORD = "It-Passw0rd!2026";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** JWT thật do GoTrue cấp (null khi email chưa xác nhận vì GoTrue không cho đăng nhập). */
  accessToken: string | null;
}

export interface TestCinema {
  id: string;
  code: string;
  provinceId: string;
}

export interface TestShowtime {
  id: string;
  cinemaId: string;
  roomId: string;
  seatIds: string[];
}

function unwrap<D>(result: { data: D; error: { message: string } | null }, action: string): NonNullable<D> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${action} thất bại: ${result.error?.message ?? "không có dữ liệu"}`);
  }
  return result.data;
}

/** Hộp công cụ gắn với 1 scope: mọi bản ghi tạo ra đều mang prefix của scope để `cleanupScope` dọn được. */
export function createFactories(env: LocalSupabaseEnv, admin: SupabaseClient, scope: RunScope) {
  let counter = 0;
  const nextSuffix = () => (counter++).toString(36);

  /** Tạo user qua GoTrue admin API (hook before_user_created yêu cầu app_metadata.created_via='nest'). */
  async function createUser(label: string, options: { confirmed?: boolean } = {}): Promise<TestUser> {
    const confirmed = options.confirmed ?? true;
    const email = `${scope.prefix}${label}_${nextSuffix()}@example.com`;
    const created = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: confirmed,
      app_metadata: { created_via: "nest" },
    });
    if (created.error || !created.data.user) {
      throw new Error(`createUser ${label} thất bại: ${created.error?.message}`);
    }
    scope.userIds.add(created.data.user.id); // ghi ngay để cleanup kể cả khi signIn lỗi
    let accessToken: string | null = null;
    if (confirmed) {
      const session = await createAnonClient(env).auth.signInWithPassword({ email, password: TEST_PASSWORD });
      if (session.error) throw new Error(`signIn ${label} thất bại: ${session.error.message}`);
      accessToken = session.data.session?.access_token ?? null;
    }
    return { id: created.data.user.id, email, password: TEST_PASSWORD, accessToken };
  }

  async function createAdminUser(): Promise<TestUser> {
    const user = await createUser("admin");
    const { error } = await admin.from("user_roles").insert({ user_id: user.id, role: "ADMIN" });
    if (error) throw new Error(`gán ADMIN thất bại: ${error.message}`);
    return user;
  }

  async function createStaffUser(cinemaId: string, role: "STAFF" | "MANAGER"): Promise<TestUser> {
    const user = await createUser(role.toLowerCase());
    const { error } = await admin.from("staff_assignments").insert({ user_id: user.id, cinema_id: cinemaId, role });
    if (error) throw new Error(`gán ${role} thất bại: ${error.message}`);
    return user;
  }

  async function createCinema(): Promise<TestCinema> {
    // 1 tỉnh/scope (code unique).
    const existing = await admin.from("provinces").select("id").eq("code", scope.provinceCode).maybeSingle();
    const provinceId: string =
      existing.data?.id ??
      unwrap(
        await admin
          .from("provinces")
          .insert({ code: scope.provinceCode, name: `${scope.prefix}province` })
          .select("id")
          .single(),
        "tạo tỉnh",
      ).id;
    const code = `${scope.cinemaCodeBase}${nextSuffix()}`.slice(0, 10).toUpperCase();
    const cinema = unwrap(
      await admin
        .from("cinemas")
        .insert({ code, name: `${scope.prefix}cinema_${code}`, province_id: provinceId, address: `${scope.prefix}address` })
        .select("id")
        .single(),
      "tạo rạp",
    );
    return { id: cinema.id as string, code, provinceId };
  }

  /** Phòng + lưới ghế NORMAL `rows x cols` (mặc định 2x4 = 8 ghế, đủ cho test tranh ghế). */
  async function createRoomWithSeats(cinemaId: string, rows = 2, cols = 4) {
    const room = unwrap(
      await admin
        .from("rooms")
        .insert({ cinema_id: cinemaId, name: `${scope.prefix}room_${nextSuffix()}`, grid_rows: rows, grid_cols: cols })
        .select("id")
        .single(),
      "tạo phòng",
    );
    const seatRows = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        room_id: room.id,
        cinema_id: cinemaId,
        row_label: String.fromCharCode(65 + r),
        col_number: c + 1,
        seat_type: "NORMAL",
      })),
    ).flat();
    const seats = unwrap(await admin.from("seats").insert(seatRows).select("id"), "tạo ghế");
    return { roomId: room.id as string, seatIds: seats.map((seat) => seat.id as string) };
  }

  async function createMovie(durationMinutes = 100): Promise<string> {
    const movie = unwrap(
      await admin
        .from("movies")
        .insert({
          slug: `${scope.slugPrefix}movie-${nextSuffix()}`,
          title_vi: `${scope.prefix}movie`,
          duration_minutes: durationMinutes,
          release_date: "2026-01-01",
          age_rating: "P",
          status: "PUBLISHED",
        })
        .select("id")
        .single(),
      "tạo phim",
    );
    return movie.id as string;
  }

  /** Suất ON_SALE ở phòng mới (rạp lấy từ tham số hoặc tạo mới), bắt đầu `startsInHours` giờ nữa. */
  async function createShowtime(
    options: { cinemaId?: string; startsInHours?: number; rows?: number; cols?: number } = {},
  ): Promise<TestShowtime> {
    const cinemaId = options.cinemaId ?? (await createCinema()).id;
    const { roomId, seatIds } = await createRoomWithSeats(cinemaId, options.rows, options.cols);
    const movieId = await createMovie();
    const startsAt = new Date(Date.now() + (options.startsInHours ?? 48) * 3_600_000).toISOString();
    const showtime = unwrap(
      await admin
        .from("showtimes")
        .insert({ cinema_id: cinemaId, room_id: roomId, movie_id: movieId, starts_at: startsAt, format: "2D" })
        .select("id")
        .single(),
      "tạo suất",
    );
    return { id: showtime.id as string, cinemaId, roomId, seatIds };
  }

  return { createUser, createAdminUser, createStaffUser, createCinema, createRoomWithSeats, createMovie, createShowtime };
}

/** Ký JWT HS256 giống GoTrue cho user bất kỳ (kể cả chưa xác nhận email, vốn không đăng nhập được). */
export async function mintToken(env: LocalSupabaseEnv, user: { id: string; email: string }): Promise<string> {
  return new SignJWT({ email: user.email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${env.url}/auth/v1`)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.jwtSecret));
}
