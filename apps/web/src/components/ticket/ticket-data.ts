import type { SupabaseClient } from "@supabase/supabase-js";

/** Ghế của đơn. Mã QR nằm ở cấp đơn (`PaidOrderView.qrToken`), không còn QR riêng từng ghế. */
export interface TicketView {
  seatLabel: string;
  checkedIn: boolean;
}

export type TicketOrderStatus = "paid" | "checked_in" | "affected";

export interface PaidOrderView {
  id: string;
  status: TicketOrderStatus;
  bookingCode: string;
  movieTitle: string;
  cinemaName: string;
  cinemaAddress: string;
  cinemaHotline: string | null;
  roomName: string;
  startsAt: string;
  endsAt: string;
  /** QR của cả đơn (R-85): chuỗi ngẫu nhiên 128-bit, không chứa PII. */
  qrToken: string;
  tickets: TicketView[];
}

interface CinemaRow {
  address: string;
  hotline: string | null;
}

export interface OrderRow {
  id: string;
  status: TicketOrderStatus;
  booking_code: string | null;
  movie_title: string;
  cinema_name: string;
  room_name: string;
  showtime_starts_at: string;
  showtime_ends_at: string;
  qr_token: string;
  cinemas: CinemaRow | CinemaRow[] | null;
  order_seats: { id: string; seat_label: string }[] | null;
  tickets: { order_seat_id: string; checked_in_at: string | null }[] | null;
}

const ORDER_COLUMNS =
  "id, status, booking_code, movie_title, cinema_name, room_name, showtime_starts_at, showtime_ends_at, qr_token, " +
  "cinemas(address, hotline), order_seats(id, seat_label), tickets(order_seat_id, checked_in_at)";

// `affected` (suất bị rạp huỷ) vẫn hiện để khách biết đơn đã trả tiền cần hoàn (design màn 11).
const VISIBLE_STATUSES: TicketOrderStatus[] = ["paid", "checked_in", "affected"];

export function toPaidOrderView(row: OrderRow): PaidOrderView | null {
  if (!row.booking_code) return null;
  const cinema = Array.isArray(row.cinemas) ? row.cinemas[0] : row.cinemas;
  const labelBySeat = new Map((row.order_seats ?? []).map((s) => [s.id, s.seat_label]));
  const tickets = (row.tickets ?? [])
    .map((t) => ({
      seatLabel: labelBySeat.get(t.order_seat_id) ?? "",
      checkedIn: t.checked_in_at !== null,
    }))
    .sort((a, b) => a.seatLabel.localeCompare(b.seatLabel, "vi", { numeric: true }));
  return {
    id: row.id,
    status: row.status,
    bookingCode: row.booking_code,
    movieTitle: row.movie_title,
    cinemaName: row.cinema_name,
    cinemaAddress: cinema?.address ?? "",
    cinemaHotline: cinema?.hotline ?? null,
    roomName: row.room_name,
    startsAt: row.showtime_starts_at,
    endsAt: row.showtime_ends_at,
    qrToken: row.qr_token,
    tickets,
  };
}

/** Chia theo giờ kết thúc suất: chưa kết thúc = sắp tới (gần nhất trước), đã kết thúc = đã qua (mới nhất trước). */
export function splitUpcomingAndPast(orders: PaidOrderView[], now: Date) {
  const upcoming = orders.filter((o) => new Date(o.endsAt) >= now);
  const past = orders.filter((o) => new Date(o.endsAt) < now);
  upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  past.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}

/**
 * Mọi truy vấn vé BẮT BUỘC lọc user_id: RLS còn cho Admin/Staff/Manager xem đơn của người khác,
 * nhưng "Vé của tôi" chỉ được hiện đơn của chính người đang đăng nhập (AC-17).
 */
export async function fetchMyOrders(supabase: SupabaseClient, userId: string): Promise<PaidOrderView[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("user_id", userId)
    .in("status", VISIBLE_STATUSES)
    .order("showtime_starts_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as OrderRow[]).map(toPaidOrderView).filter((o): o is PaidOrderView => o !== null);
}

export type OrderLookup = { bookingCode: string } | { id: string };

export async function fetchMyOrder(
  supabase: SupabaseClient,
  userId: string,
  lookup: OrderLookup,
): Promise<PaidOrderView | null> {
  const query = supabase.from("orders").select(ORDER_COLUMNS).eq("user_id", userId).in("status", VISIBLE_STATUSES);
  const { data } =
    "id" in lookup
      ? await query.eq("id", lookup.id).maybeSingle()
      : await query.eq("booking_code", lookup.bookingCode).maybeSingle();
  return data ? toPaidOrderView(data as unknown as OrderRow) : null;
}

/** Suất của đơn thuộc về userId (null = không tồn tại hoặc của người khác -> 404). */
export async function fetchMyOrderShowtimeId(
  supabase: SupabaseClient,
  userId: string,
  orderId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("orders")
    .select("showtime_id")
    .eq("user_id", userId)
    .eq("id", orderId)
    .maybeSingle();
  return (data as { showtime_id: string } | null)?.showtime_id ?? null;
}

/** Người dùng đang đăng nhập (từ session server) và đã xác nhận email chưa. */
export async function getSessionUser(
  supabase: SupabaseClient,
): Promise<{ id: string; emailConfirmed: boolean } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, emailConfirmed: Boolean(data.user.email_confirmed_at) };
}
