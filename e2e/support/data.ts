import { createHmac, randomBytes } from "node:crypto";

// Root không khai @supabase/supabase-js (pnpm strict, task không được sửa package.json) -> dùng bản đã cài cho apps/api.
import {
  createClient,
  type SupabaseClient,
} from "../../apps/api/node_modules/@supabase/supabase-js";

/** Mọi dữ liệu e2e mang tiền tố cố định này -> global teardown quét theo tiền tố, kể cả phần sót của lượt chạy hỏng. */
export const E2E_EMAIL_PREFIX = "e2e_";
export const E2E_SLUG_PREFIX = "e2e-";
export const E2E_CINEMA_CODE_PREFIX = "E2E";
export const E2E_PROVINCE_PREFIX = "E2E_";
export const E2E_PASSWORD = "E2e-Passw0rd!2026";

const SEAT_PRICE = 80_000;

export const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3100";
export const API_URL = process.env.E2E_API_URL ?? "http://localhost:3101";

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Thiếu ${name}: playwright.config.ts phải nạp khoá Supabase local trước khi chạy spec.`,
    );
  return value;
}

export function supabaseUrl(): string {
  const url = required("E2E_SUPABASE_URL");
  // Chốt an toàn: e2e tạo/xoá dữ liệu thật, chỉ được chạy với Supabase local.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url))
    throw new Error(`E2E chỉ chạy với Supabase local, nhận ${url}`);
  return url;
}

export function adminClient(): SupabaseClient {
  return createClient(supabaseUrl(), required("E2E_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(supabaseUrl(), required("E2E_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const randomId = (): string => randomBytes(4).toString("hex");

function unwrap<D>(
  result: { data: D; error: { message: string } | null },
  action: string,
): NonNullable<D> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${action} thất bại: ${result.error?.message ?? "không có dữ liệu"}`);
  }
  return result.data;
}

function unwrapError(result: { error: { message: string } | null }, action: string): void {
  if (result.error) throw new Error(`${action} thất bại: ${result.error.message}`);
}

export interface E2eUser {
  id: string;
  email: string;
  password: string;
}

/** Tạo user đã xác nhận email qua GoTrue admin (hook before_user_created yêu cầu app_metadata.created_via='nest'). */
export async function createUser(admin: SupabaseClient, label: string): Promise<E2eUser> {
  const email = `${E2E_EMAIL_PREFIX}${label}_${randomId()}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
    app_metadata: { created_via: "nest" },
  });
  if (created.error || !created.data.user)
    throw new Error(`createUser ${label} thất bại: ${created.error?.message}`);
  return { id: created.data.user.id, email, password: E2E_PASSWORD };
}

export async function createAdminUser(admin: SupabaseClient): Promise<E2eUser> {
  const user = await createUser(admin, "admin");
  unwrapError(
    await admin.from("user_roles").insert({ user_id: user.id, role: "ADMIN" }),
    "gán ADMIN",
  );
  return user;
}

export async function createStaffUser(admin: SupabaseClient, cinemaId: string): Promise<E2eUser> {
  const user = await createUser(admin, "staff");
  unwrapError(
    await admin
      .from("staff_assignments")
      .insert({ user_id: user.id, cinema_id: cinemaId, role: "STAFF" }),
    "gán STAFF",
  );
  return user;
}

export interface E2eCinema {
  id: string;
  code: string;
  name: string;
}

async function createProvince(admin: SupabaseClient): Promise<string> {
  const code = `${E2E_PROVINCE_PREFIX}${randomId().toUpperCase()}`;
  return unwrap(
    await admin
      .from("provinces")
      .insert({ code, name: `e2e province ${code}` })
      .select("id")
      .single(),
    "tạo tỉnh",
  ).id as string;
}

export async function createCinema(admin: SupabaseClient): Promise<E2eCinema> {
  const provinceId = await createProvince(admin);
  const code = `${E2E_CINEMA_CODE_PREFIX}${randomId().toUpperCase()}`.slice(0, 10);
  const name = `e2e rap ${code}`;
  const row = unwrap(
    await admin
      .from("cinemas")
      .insert({ code, name, province_id: provinceId, address: `e2e address ${code}` })
      .select("id")
      .single(),
    "tạo rạp",
  );
  return { id: row.id as string, code, name };
}

export async function createMovie(admin: SupabaseClient): Promise<{ id: string; title: string }> {
  const title = `e2e phim ${randomId()}`;
  const row = unwrap(
    await admin
      .from("movies")
      .insert({
        slug: `${E2E_SLUG_PREFIX}${randomId()}`,
        title_vi: title,
        duration_minutes: 100,
        release_date: "2026-01-01",
        age_rating: "P",
        status: "PUBLISHED",
      })
      .select("id")
      .single(),
    "tạo phim",
  );
  return { id: row.id as string, title };
}

/** Phòng + lưới ghế NORMAL `rows x cols`. */
export async function createRoomWithSeats(
  admin: SupabaseClient,
  cinemaId: string,
  rows = 2,
  cols = 4,
) {
  const room = unwrap(
    await admin
      .from("rooms")
      .insert({
        cinema_id: cinemaId,
        name: `e2e phong ${randomId()}`,
        grid_rows: rows,
        grid_cols: cols,
      })
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
  unwrap(await admin.from("seats").insert(seatRows).select("id"), "tạo ghế");
  return { roomId: room.id as string };
}

export interface E2eShowtime {
  id: string;
  cinema: E2eCinema;
  movieTitle: string;
}

/** Suất ON_SALE + giá SHOWTIME cho ghế NORMAL (thiếu giá thì hold_seats lỗi). Mặc định lưới 2x4. */
export async function createPricedShowtime(
  admin: SupabaseClient,
  options: { cinema?: E2eCinema; rows?: number; cols?: number; startsInHours?: number } = {},
): Promise<E2eShowtime> {
  const cinema = options.cinema ?? (await createCinema(admin));
  const { roomId } = await createRoomWithSeats(admin, cinema.id, options.rows, options.cols);
  const movie = await createMovie(admin);
  const startsAt = new Date(Date.now() + (options.startsInHours ?? 48) * 3_600_000).toISOString();
  const showtime = unwrap(
    await admin
      .from("showtimes")
      .insert({
        cinema_id: cinema.id,
        room_id: roomId,
        movie_id: movie.id,
        starts_at: startsAt,
        format: "2D",
      })
      .select("id")
      .single(),
    "tạo suất",
  );
  unwrapError(
    await admin.from("price_rules").insert({
      scope: "SHOWTIME",
      showtime_id: showtime.id,
      seat_type: "NORMAL",
      amount: SEAT_PRICE,
    }),
    "tạo giá suất",
  );
  return { id: showtime.id as string, cinema, movieTitle: movie.title };
}

/** Chữ ký PayOS: sort key alphabet, `k=v&...`, HMAC-SHA256 hex (độc lập với PayosClient của API). */
function signPayos(data: Record<string, unknown>): string {
  const query = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] === null || data[k] === undefined ? "" : String(data[k])}`)
    .join("&");
  return createHmac("sha256", required("E2E_PAYOS_CHECKSUM_KEY")).update(query).digest("hex");
}

/** Mô phỏng PayOS báo thanh toán thành công cho đơn: POST webhook có chữ ký thật tới API. */
export async function sendPayosSuccessWebhook(
  admin: SupabaseClient,
  orderId: string,
): Promise<void> {
  const payment = unwrap(
    await admin.from("payments").select("order_code, amount").eq("order_id", orderId).single(),
    "đọc payment",
  );
  const orderCode = Number(payment.order_code);
  const data: Record<string, unknown> = {
    orderCode,
    amount: Number(payment.amount),
    description: "E2E webhook",
    accountNumber: "0000000000",
    reference: `E2E-TX-${randomId()}-${orderCode}`,
    transactionDateTime: "2026-11-14 10:00:00",
    currency: "VND",
    paymentLinkId: `mock_link_${orderCode}`,
    code: "00",
    desc: "success",
  };
  const response = await fetch(`${API_URL}/payos/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: "00",
      desc: "success",
      success: true,
      data,
      signature: signPayos(data),
    }),
  });
  if (!response.ok)
    throw new Error(`webhook PayOS lỗi ${response.status}: ${await response.text()}`);
}

/** Gọi API Nest như một user (JWT thật do GoTrue cấp); throw khi không 2xx. */
export async function apiAs<T = Record<string, unknown>>(
  user: E2eUser,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const session = await anonClient().auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (session.error || !session.data.session)
    throw new Error(`đăng nhập ${user.email} thất bại: ${session.error?.message}`);
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.data.session.access_token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`${method} ${path} lỗi ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** Id các ghế đầu tiên (hàng A -> ...) của phòng thuộc suất. */
export async function firstSeatIds(
  admin: SupabaseClient,
  showtimeId: string,
  count: number,
): Promise<string[]> {
  const showtime = unwrap(
    await admin.from("showtimes").select("room_id").eq("id", showtimeId).single(),
    "đọc suất",
  );
  const seats = unwrap(
    await admin
      .from("seats")
      .select("id")
      .eq("room_id", showtime.room_id)
      .order("row_label")
      .order("col_number")
      .limit(count),
    "đọc ghế",
  );
  return seats.map((seat) => seat.id as string);
}

/** Đặt + thanh toán 1 đơn qua API thật (giữ ghế -> đồng ý -> link PayOS giả -> webhook ký); trả orderId + mã đặt vé. */
export async function bookPaidOrder(
  admin: SupabaseClient,
  customer: E2eUser,
  showtimeId: string,
  seatCount = 1,
): Promise<{ orderId: string; bookingCode: string }> {
  const seatIds = await firstSeatIds(admin, showtimeId, seatCount);
  const { orderId } = await apiAs<{ orderId: string }>(customer, "POST", "/bookings/holds", {
    showtimeId,
    seatIds,
  });
  await apiAs(customer, "POST", `/bookings/${orderId}/consent`, {});
  await apiAs(customer, "POST", `/bookings/${orderId}/payment`, {});
  await sendPayosSuccessWebhook(admin, orderId);
  const order = unwrap(
    await admin.from("orders").select("booking_code").eq("id", orderId).single(),
    "đọc đơn",
  );
  return { orderId, bookingCode: order.booking_code as string };
}

/** Dọn mọi bản ghi mang tiền tố e2e theo thứ tự FK. Không động tới seed/dữ liệu khác. */
export async function cleanupE2eData(admin: SupabaseClient): Promise<void> {
  const failures: string[] = [];
  const check = (step: string, error: { message: string } | null) => {
    if (error) failures.push(`${step}: ${error.message}`);
  };
  const ids = (rows: Array<{ id: string }> | null) => (rows ?? []).map((row) => row.id);

  const cinemas = await admin
    .from("cinemas")
    .select("id")
    .like("code", `${E2E_CINEMA_CODE_PREFIX}%`);
  check("select cinemas", cinemas.error);
  const cinemaIds = ids(cinemas.data);
  if (cinemaIds.length > 0) {
    const orders = await admin.from("orders").select("id").in("cinema_id", cinemaIds);
    check("select orders", orders.error);
    const orderIds = ids(orders.data);
    if (orderIds.length > 0) {
      check(
        "delete affected_order_actions",
        (await admin.from("affected_order_actions").delete().in("order_id", orderIds)).error,
      );
      check(
        "delete payments",
        (await admin.from("payments").delete().in("order_id", orderIds)).error,
      );
      check("delete orders", (await admin.from("orders").delete().in("id", orderIds)).error);
    }
    check(
      "delete price_rules cinema",
      (await admin.from("price_rules").delete().in("cinema_id", cinemaIds)).error,
    );
    check(
      "delete showtimes",
      (await admin.from("showtimes").delete().in("cinema_id", cinemaIds)).error,
    );
    check("delete cinemas", (await admin.from("cinemas").delete().in("id", cinemaIds)).error);
  }
  check(
    "delete movies",
    (await admin.from("movies").delete().like("slug", `${E2E_SLUG_PREFIX}%`)).error,
  );
  check(
    "delete provinces",
    (await admin.from("provinces").delete().like("code", `${E2E_PROVINCE_PREFIX}%`)).error,
  );

  const users = await admin.auth.admin.listUsers({ perPage: 1000 });
  check("listUsers", users.error);
  for (const user of users.data?.users ?? []) {
    if (user.email?.startsWith(E2E_EMAIL_PREFIX))
      check(`deleteUser ${user.email}`, (await admin.auth.admin.deleteUser(user.id)).error);
  }
  if (failures.length > 0) throw new Error(`cleanupE2eData còn sót:\n${failures.join("\n")}`);
}
