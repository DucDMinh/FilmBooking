import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type {
  AdminTodoDto,
  OrderDetailDto,
  OrderPaymentDto,
  OrderStatusHistoryItemDto,
  OrderSummaryDto,
  OrderTicketDto,
  ResolveManualReviewInput,
  SearchOrdersQuery,
  ListNeedsManualReviewQuery,
} from "@filmbooking/shared/schemas/orders";
import { AccessService } from "../../common/auth/access.service";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";

interface OrderDbRow {
  id: string;
  booking_code: string | null;
  channel: string;
  cinema_id: string;
  cinema_code: string;
  cinema_name: string;
  showtime_id: string;
  movie_title: string;
  room_name: string;
  showtime_starts_at: string;
  showtime_ends_at: string;
  status: string;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  user_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  manual_review_resolved_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  tickets?: {
    id: string;
    order_seat_id?: string;
    showtime_id?: string;
    cinema_id?: string;
    qr_token?: string;
    checked_in_at?: string | null;
    checked_in_by?: string | null;
    seat_label?: string;
    seat_type?: string;
    price_amount?: number;
  }[];
  payments?: {
    id: string;
    order_code: number;
    amount: number;
    status: string;
    transaction_ref: string | null;
    paid_at: string | null;
    payment_link_id: string | null;
    created_at: string;
  }[];
  order_seats?: {
    id: string;
    seat_id: string;
    seat_label: string;
    seat_type: string;
    price_amount: number;
  }[];
  affected_order_actions?: {
    action: string;
    note: string | null;
    refund_reference: string | null;
    refunded_amount: number | null;
    created_at: string;
  }[];
}

function mapSummaryDto(row: OrderDbRow): OrderSummaryDto {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    channel: row.channel,
    cinemaId: row.cinema_id,
    cinemaCode: row.cinema_code,
    cinemaName: row.cinema_name,
    showtimeId: row.showtime_id,
    movieTitle: row.movie_title,
    roomName: row.room_name,
    showtimeStartsAt: row.showtime_starts_at,
    showtimeEndsAt: row.showtime_ends_at,
    status: row.status as OrderSummaryDto["status"],
    subtotalAmount: row.subtotal_amount,
    discountAmount: row.discount_amount,
    totalAmount: row.total_amount,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    manualReviewResolvedAt: row.manual_review_resolved_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    ticketCount: row.tickets?.length ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  /**
   * Tra cứu đơn hàng (R-103)
   * Staff/Manager chỉ xem rạp mình; Admin xem toàn chuỗi.
   */
  async searchOrders(
    user: AuthUser,
    query: SearchOrdersQuery,
  ): Promise<{ items: OrderSummaryDto[]; total: number; page: number; limit: number }> {
    const access = await this.access.loadForRequest({ user });
    const allowedCinemas = Array.from(access.cinemaRoles.keys());

    if (!access.isAdmin) {
      if (allowedCinemas.length === 0) {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Bạn không có quyền truy cập đơn hàng của rạp nào");
      }
      if (query.cinemaId && !allowedCinemas.includes(query.cinemaId)) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền truy cập rạp này");
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;

    let orderIdsFromTx: string[] | null = null;
    if (query.transactionRef) {
      const { data: pRows } = await this.supabase
        .admin()
        .from("payments")
        .select("order_id")
        .ilike("transaction_ref", `%${query.transactionRef}%`);
      orderIdsFromTx = (pRows ?? []).map((p) => p.order_id as string);
      if (orderIdsFromTx.length === 0) {
        return { items: [], total: 0, page, limit };
      }
    }

    let qb = this.supabase
      .admin()
      .from("orders")
      .select("*, tickets(id)", { count: "exact" });

    if (query.bookingCode) {
      qb = qb.ilike("booking_code", `%${query.bookingCode}%`);
    }
    if (query.email) {
      qb = qb.ilike("contact_email", `%${query.email}%`);
    }
    if (query.phone) {
      qb = qb.ilike("contact_phone", `%${query.phone}%`);
    }
    if (query.showtimeId) {
      qb = qb.eq("showtime_id", query.showtimeId);
    }
    if (query.status) {
      qb = qb.eq("status", query.status);
    }
    if (orderIdsFromTx) {
      qb = qb.in("id", orderIdsFromTx);
    }

    if (query.cinemaId) {
      qb = qb.eq("cinema_id", query.cinemaId);
    } else if (!access.isAdmin) {
      qb = qb.in("cinema_id", allowedCinemas);
    }

    const { data, count, error } = await qb
      .order("created_at", { ascending: false })
      .range(fromIndex, toIndex);

    if (error) throw error;

    const items = ((data ?? []) as OrderDbRow[]).map(mapSummaryDto);
    return {
      items,
      total: count ?? items.length,
      page,
      limit,
    };
  }

  /**
   * Chi tiết đơn + lịch sử trạng thái (R-103, R-104)
   * Staff/Manager xem rạp khác -> 403 FORBIDDEN_CINEMA (AC-16).
   */
  async getOrderDetail(user: AuthUser, orderId: string): Promise<OrderDetailDto> {
    const access = await this.access.loadForRequest({ user });

    const [orderRes, seatsRes, ticketsRes, paymentsRes, actionsRes] = await Promise.all([
      this.supabase.admin().from("orders").select("*").eq("id", orderId).maybeSingle(),
      this.supabase.admin().from("order_seats").select("*").eq("order_id", orderId),
      this.supabase.admin().from("tickets").select("*").eq("order_id", orderId),
      this.supabase.admin().from("payments").select("*").eq("order_id", orderId),
      this.supabase.admin().from("affected_order_actions").select("*").eq("order_id", orderId),
    ]);

    if (orderRes.error) throw orderRes.error;
    if (!orderRes.data) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn hàng");
    }

    const row = orderRes.data as OrderDbRow;

    if (!access.isAdmin && !access.cinemaRoles.has(row.cinema_id)) {
      throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền xem đơn hàng của rạp này");
    }

    interface OrderSeatDbRow {
      id: string;
      seat_id: string;
      seat_label: string;
      seat_type: string;
      price_amount: number;
    }
    const orderSeats = (seatsRes.data ?? []) as OrderSeatDbRow[];
    const seatMap = new Map(orderSeats.map((s) => [s.id, s]));

    interface TicketDbRow {
      id: string;
      order_seat_id?: string;
      seat_label?: string;
      seat_type?: string;
      price_amount?: number;
      qr_token?: string;
      checked_in_at?: string | null;
    }
    const tickets: OrderTicketDto[] = ((ticketsRes.data ?? []) as TicketDbRow[]).map((t) => {
      const seat = t.order_seat_id ? seatMap.get(t.order_seat_id) : undefined;
      return {
        id: t.id,
        orderSeatId: t.order_seat_id ?? "",
        seatId: seat?.seat_id ?? "",
        seatLabel: seat?.seat_label ?? t.seat_label ?? "",
        seatType: seat?.seat_type ?? t.seat_type ?? "",
        priceAmount: seat?.price_amount ?? t.price_amount ?? 0,
        qrToken: t.qr_token ?? "",
        checkedInAt: t.checked_in_at ?? null,
        checkedInByName: null,
      };
    });

    interface PaymentDbRow {
      id: string;
      order_code: number;
      amount: number;
      status: string;
      transaction_ref: string | null;
      paid_at: string | null;
      payment_link_id: string | null;
      created_at: string;
    }
    const payments: OrderPaymentDto[] = ((paymentsRes.data ?? []) as PaymentDbRow[]).map((p) => ({
      id: p.id,
      orderCode: p.order_code,
      amount: p.amount,
      status: p.status,
      transactionRef: p.transaction_ref,
      paidAt: p.paid_at,
      paymentLinkId: p.payment_link_id,
      createdAt: p.created_at,
    }));

    // Build status history
    const statusHistory: OrderStatusHistoryItemDto[] = [
      { status: "holding", timestamp: row.created_at },
    ];

    if (payments.length > 0) {
      const firstPayment = payments[0];
      if (firstPayment) {
        statusHistory.push({ status: "pending_payment", timestamp: firstPayment.createdAt });
      }

      const paidPayment = payments.find((p) => p.status === "PAID");
      if (paidPayment && paidPayment.paidAt) {
        statusHistory.push({ status: "paid", timestamp: paidPayment.paidAt });
      }
    }

    if (row.status === "paid" && !statusHistory.some((s) => s.status === "paid")) {
      statusHistory.push({ status: "paid", timestamp: row.updated_at });
    }

    const checkedInTicket = tickets.find((t) => t.checkedInAt !== null);
    if (checkedInTicket?.checkedInAt) {
      statusHistory.push({ status: "checked_in", timestamp: checkedInTicket.checkedInAt });
    }

    if (row.status === "needs_manual_review") {
      statusHistory.push({ status: "needs_manual_review", timestamp: row.updated_at });
    }
    if (row.manual_review_resolved_at) {
      statusHistory.push({
        status: "needs_manual_review",
        timestamp: row.manual_review_resolved_at,
        note: "Đã xử lý thủ công",
      });
    }

    if (row.cancelled_at || row.status === "cancelled") {
      statusHistory.push({
        status: "cancelled",
        timestamp: row.cancelled_at ?? row.updated_at,
        note: row.cancel_reason ?? undefined,
      });
    }

    if (row.status === "affected") {
      statusHistory.push({ status: "affected", timestamp: row.updated_at });
    }

    interface AffectedActionDbRow {
      action: string;
      note: string | null;
      refund_reference: string | null;
      refunded_amount: number | null;
      created_at: string;
    }
    const affectedActions = (actionsRes.data ?? []) as AffectedActionDbRow[];
    const affectedAction = affectedActions[0];
    if (affectedAction) {
      statusHistory.push({
        status: "refunded_manual",
        timestamp: affectedAction.created_at,
        note: affectedAction.refund_reference ?? undefined,
      });
    }

    statusHistory.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));

    const summary = mapSummaryDto(row);
    return {
      ...summary,
      userId: row.user_id,
      tickets,
      payments,
      statusHistory,
      affectedAction: affectedAction
        ? {
            action: affectedAction.action,
            note: affectedAction.note,
            refundReference: affectedAction.refund_reference,
            refundedAmount: affectedAction.refunded_amount,
            createdAt: affectedAction.created_at,
          }
        : null,
    };
  }

  /**
   * Danh sách đơn needs_manual_review (AC-11)
   * Admin + Manager rạp đó; Manager rạp khác không thấy.
   */
  async listNeedsManualReview(
    user: AuthUser,
    query: ListNeedsManualReviewQuery,
  ): Promise<{ items: OrderSummaryDto[]; total: number; page: number; limit: number }> {
    const access = await this.access.loadForRequest({ user });
    const allowedCinemas = Array.from(access.cinemaRoles.keys());

    if (!access.isAdmin) {
      if (allowedCinemas.length === 0) {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền");
      }
      if (query.cinemaId && !allowedCinemas.includes(query.cinemaId)) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền truy cập rạp này");
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;

    let qb = this.supabase
      .admin()
      .from("orders")
      .select("*, tickets(id)", { count: "exact" })
      .eq("status", "needs_manual_review");

    if (query.cinemaId) {
      qb = qb.eq("cinema_id", query.cinemaId);
    } else if (!access.isAdmin) {
      qb = qb.in("cinema_id", allowedCinemas);
    }

    const { data, count, error } = await qb
      .order("created_at", { ascending: false })
      .range(fromIndex, toIndex);

    if (error) throw error;

    const items = ((data ?? []) as OrderDbRow[]).map(mapSummaryDto);
    return {
      items,
      total: count ?? items.length,
      page,
      limit,
    };
  }

  /**
   * Xử lý đơn needs_manual_review (R-104, AC-11)
   * Staff -> 403 (chỉ đọc). Manager rạp đó + Admin -> OK.
   */
  async resolveManualReview(
    user: AuthUser,
    orderId: string,
    input: ResolveManualReviewInput,
  ): Promise<{ success: true; orderId: string; action: string; resolvedAt: string }> {
    const access = await this.access.loadForRequest({ user });

    const [orderRes, seatsRes] = await Promise.all([
      this.supabase.admin().from("orders").select("*").eq("id", orderId).maybeSingle(),
      this.supabase.admin().from("order_seats").select("*").eq("order_id", orderId),
    ]);

    if (orderRes.error) throw orderRes.error;
    if (!orderRes.data) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn hàng");
    }

    const order = orderRes.data as OrderDbRow;
    interface OrderSeatDbRow {
      id: string;
      seat_id: string;
      seat_label: string;
      seat_type: string;
      price_amount: number;
    }
    const orderSeats = (seatsRes.data ?? []) as OrderSeatDbRow[];

    // Phân quyền: Staff chỉ đọc -> 403 (AC-11)
    if (!access.isAdmin) {
      const heldRole = access.cinemaRoles.get(order.cinema_id);
      if (!heldRole) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền trên rạp này");
      }
      if (heldRole !== "MANAGER") {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Staff chỉ có quyền xem đơn hàng, không được xử lý");
      }
    }

    if (order.status !== "needs_manual_review") {
      throw new AppException(ERROR_CODES.CONFLICT, "Đơn hàng không ở trạng thái cần xem xét thủ công");
    }
    if (order.manual_review_resolved_at) {
      throw new AppException(ERROR_CODES.CONFLICT, "Đơn hàng này đã được xử lý trước đó");
    }

    const nowIso = new Date().toISOString();

    if (input.action === "CONFIRM_SALE") {
      // Kiểm tra ghế còn trống không
      const seatIds = orderSeats.map((s) => s.seat_id);
      if (seatIds.length > 0) {
        const { data: takenSeats, error: seatErr } = await this.supabase
          .admin()
          .from("showtime_seat_states")
          .select("seat_id, order_id, state")
          .eq("showtime_id", order.showtime_id)
          .in("seat_id", seatIds)
          .eq("state", "SOLD");

        if (seatErr) throw seatErr;

        const takenByOthers = (takenSeats ?? []).filter((s) => s.order_id !== order.id);
        if (takenByOthers.length > 0) {
          throw new AppException(ERROR_CODES.SEAT_TAKEN, "Ghế đã bị bán cho khách khác, không thể chốt bán");
        }
      }

      // Đánh dấu ghế SOLD cho đơn này
      for (const seat of orderSeats) {
        await this.supabase
          .admin()
          .from("showtime_seat_states")
          .upsert({
            showtime_id: order.showtime_id,
            seat_id: seat.seat_id,
            cinema_id: order.cinema_id,
            state: "SOLD",
            source: "WEB",
            order_id: order.id,
            expires_at: null,
          });
      }

      // Cập nhật status: 'paid' và manual_review_resolved_at (để checkin_ticket cho phép soát vé)
      const { error: updErr } = await this.supabase
        .admin()
        .from("orders")
        .update({
          status: "paid",
          manual_review_resolved_at: nowIso,
        })
        .eq("id", order.id);

      if (updErr) throw updErr;

      // Sinh vé nếu chưa có
      for (const seat of orderSeats) {
        await this.supabase
          .admin()
          .from("tickets")
          .upsert(
            {
              order_id: order.id,
              order_seat_id: seat.id,
              showtime_id: order.showtime_id,
              cinema_id: order.cinema_id,
            },
            { onConflict: "order_seat_id" },
          );
      }

      // Ghi audit log (action: UPDATE tuân thủ check constraint Postgres audit_logs_action_check)
      const { error: auditErr } = await this.supabase
        .admin()
        .from("audit_logs")
        .insert({
          action: "UPDATE",
          actor_id: user.id,
          cinema_id: order.cinema_id,
          table_name: "orders",
          record_id: order.id,
          after_data: {
            action_detail: "CONFIRM_SALE",
            action: input.action,
            note: input.note,
            resolved_at: nowIso,
          },
        });
      if (auditErr) throw auditErr;
    } else if (input.action === "REFUND_MANUAL") {
      // Đánh dấu đã giải quyết
      const { error: updErr } = await this.supabase
        .admin()
        .from("orders")
        .update({ manual_review_resolved_at: nowIso })
        .eq("id", order.id);

      if (updErr) throw updErr;

      // Ghi nhận vào affected_order_actions
      await this.supabase
        .admin()
        .from("affected_order_actions")
        .insert({
          order_id: order.id,
          cinema_id: order.cinema_id,
          action: "REFUNDED_MANUAL",
          note: input.note ?? null,
          refund_reference: input.refundReference ?? null,
          refunded_amount: input.refundedAmount ?? null,
          performed_by: user.id,
        });

      // Ghi audit log (action: UPDATE tuân thủ check constraint Postgres audit_logs_action_check)
      const { error: auditErr } = await this.supabase
        .admin()
        .from("audit_logs")
        .insert({
          action: "UPDATE",
          actor_id: user.id,
          cinema_id: order.cinema_id,
          table_name: "orders",
          record_id: order.id,
          after_data: {
            action_detail: "REFUND_MANUAL",
            action: input.action,
            note: input.note,
            refund_reference: input.refundReference,
            refunded_amount: input.refundedAmount,
            resolved_at: nowIso,
          },
        });
      if (auditErr) throw auditErr;
    }

    return {
      success: true,
      orderId: order.id,
      action: input.action,
      resolvedAt: nowIso,
    };
  }

  /**
   * GET /admin/todo (D5)
   * Danh sách việc cần làm:
   * 1. Đơn needs_manual_review chưa xử lý
   * 2. Đơn affected chưa xử lý
   * 3. Email lỗi trong outbox
   * 4. Suất sắp bắt đầu trong 30p
   */
  async getAdminTodo(user: AuthUser): Promise<AdminTodoDto> {
    const access = await this.access.loadForRequest({ user });
    const allowedCinemas = Array.from(access.cinemaRoles.keys());

    if (!access.isAdmin && allowedCinemas.length === 0) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền truy cập todo");
    }

    const now = new Date();
    const in30m = new Date(now.getTime() + 30 * 60 * 1000);

    // 1. needs_manual_review
    let nmrQuery = this.supabase
      .admin()
      .from("orders")
      .select("*, tickets(id)", { count: "exact" })
      .eq("status", "needs_manual_review")
      .is("manual_review_resolved_at", null);
    if (!access.isAdmin) {
      nmrQuery = nmrQuery.in("cinema_id", allowedCinemas);
    }
    const nmrPromise = nmrQuery.order("created_at", { ascending: false }).limit(10);

    // 2. affected orders
    let affQuery = this.supabase
      .admin()
      .from("orders")
      .select("*, tickets(id)", { count: "exact" })
      .eq("status", "affected");
    if (!access.isAdmin) {
      affQuery = affQuery.in("cinema_id", allowedCinemas);
    }
    const affPromise = affQuery.order("created_at", { ascending: false }).limit(10);

    // 3. failed emails
    let emailQuery = this.supabase
      .admin()
      .from("email_outbox")
      .select("*", { count: "exact" })
      .eq("status", "FAILED");
    if (!access.isAdmin) {
      emailQuery = emailQuery.in("cinema_id", allowedCinemas);
    }
    const emailPromise = emailQuery.order("created_at", { ascending: false }).limit(10);

    // 4. upcoming showtimes in 30 minutes (không embedding cinemas/rooms trực tiếp vì schema showtimes không có FK direct tới cinemas)
    let stQuery = this.supabase
      .admin()
      .from("showtimes")
      .select("id, cinema_id, room_id, movie_id, format, starts_at, ends_at, status, movies(title_vi)", { count: "exact" })
      .gte("starts_at", now.toISOString())
      .lte("starts_at", in30m.toISOString())
      .neq("status", "CANCELLED");
    if (!access.isAdmin) {
      stQuery = stQuery.in("cinema_id", allowedCinemas);
    }
    const stPromise = stQuery.order("starts_at", { ascending: true }).limit(10);

    const [nmrRes, affRes, emailRes, stRes] = await Promise.all([
      nmrPromise,
      affPromise,
      emailPromise,
      stPromise,
    ]);

    const nmrRows = ((nmrRes.data ?? []) as OrderDbRow[]).map(mapSummaryDto);
    const affRows = ((affRes.data ?? []) as OrderDbRow[]).map(mapSummaryDto);

    interface EmailOutboxRow {
      id: string;
      to_email: string;
      kind: string;
      last_error: string | null;
      attempts: number;
      created_at: string;
    }
    const failedEmails = ((emailRes.data ?? []) as EmailOutboxRow[]).map((e) => ({
      id: e.id,
      toEmail: e.to_email,
      kind: e.kind,
      lastError: e.last_error,
      attempts: e.attempts,
      createdAt: e.created_at,
    }));

    interface RawShowtimeRow {
      id: string;
      cinema_id: string;
      room_id: string;
      movie_id: string;
      format: string;
      starts_at: string;
      ends_at: string;
      movies?: { title_vi: string } | { title_vi: string }[] | null;
    }

    const rawShowtimes = (stRes.data ?? []) as unknown as RawShowtimeRow[];
    const cinemaIds = Array.from(new Set(rawShowtimes.map((s) => s.cinema_id).filter(Boolean)));
    const roomIds = Array.from(new Set(rawShowtimes.map((s) => s.room_id).filter(Boolean)));

    const cinemaMap = new Map<string, string>();
    const roomMap = new Map<string, string>();

    if (cinemaIds.length > 0 || roomIds.length > 0) {
      const [cinemasRes, roomsRes] = await Promise.all([
        cinemaIds.length > 0
          ? this.supabase.admin().from("cinemas").select("id, name").in("id", cinemaIds)
          : Promise.resolve({ data: [] }),
        roomIds.length > 0
          ? this.supabase.admin().from("rooms").select("id, name").in("id", roomIds)
          : Promise.resolve({ data: [] }),
      ]);

      if (Array.isArray(cinemasRes.data)) {
        for (const c of cinemasRes.data as { id: string; name: string }[]) {
          cinemaMap.set(c.id, c.name);
        }
      }
      if (Array.isArray(roomsRes.data)) {
        for (const r of roomsRes.data as { id: string; name: string }[]) {
          roomMap.set(r.id, r.name);
        }
      }
    }

    const upcomingShowtimes = rawShowtimes.map((s) => {
      const movieTitle = Array.isArray(s.movies) ? s.movies[0]?.title_vi : s.movies?.title_vi;
      return {
        id: s.id,
        cinemaId: s.cinema_id,
        cinemaName: cinemaMap.get(s.cinema_id) ?? "",
        movieTitle: movieTitle ?? "",
        roomName: roomMap.get(s.room_id) ?? "",
        format: s.format,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
      };
    });

    return {
      needsManualReviewCount: nmrRes.count ?? nmrRows.length,
      needsManualReviewOrders: nmrRows,
      affectedCount: affRes.count ?? affRows.length,
      affectedOrders: affRows,
      failedEmailCount: emailRes.count ?? failedEmails.length,
      failedEmails,
      upcomingShowtimesCount: stRes.count ?? upcomingShowtimes.length,
      upcomingShowtimes,
    };
  }
}
