import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type {
  AdminTodoDto,
  OrderDetailDto,
  OrderPaymentDto,
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
import { extractStatusHistory, mapSummaryDto } from "./orders-history.helper";
import { resolveUpcomingShowtimes } from "./orders-todo.helper";
import type {
  AffectedActionDbRow,
  AuditDbRow,
  EmailOutboxRow,
  OrderDbRow,
  OrderSeatDbRow,
  PaymentDbRow,
  RawShowtimeRow,
  TicketDbRow,
} from "./orders.types";

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

    if (!access.isAdmin && allowedCinemas.length === 0) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Bạn không có quyền truy cập đơn hàng của rạp nào");
    }
    if (!access.isAdmin && query.cinemaId && !allowedCinemas.includes(query.cinemaId)) {
      throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền truy cập rạp này");
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

    if (query.bookingCode) qb = qb.ilike("booking_code", `%${query.bookingCode}%`);
    if (query.email) qb = qb.ilike("contact_email", `%${query.email}%`);
    if (query.phone) qb = qb.ilike("contact_phone", `%${query.phone}%`);
    if (query.showtimeId) qb = qb.eq("showtime_id", query.showtimeId);
    if (query.status) qb = qb.eq("status", query.status);
    if (orderIdsFromTx) qb = qb.in("id", orderIdsFromTx);

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
    return { items, total: count ?? items.length, page, limit };
  }

  /**
   * Chi tiết đơn hàng đầy đủ (R-103)
   */
  async getOrderDetail(user: AuthUser, orderId: string): Promise<OrderDetailDto> {
    const access = await this.access.loadForRequest({ user });
    const { orderRes, seatsRes, ticketsRes, paymentsRes, actionsRes, auditRes } =
      await this.fetchOrderDetailData(orderId);

    if (orderRes.error) throw orderRes.error;
    if (!orderRes.data) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn hàng");
    }

    const row = orderRes.data as OrderDbRow;
    if (!access.isAdmin && !access.cinemaRoles.has(row.cinema_id)) {
      throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền xem đơn hàng của rạp này");
    }

    return this.buildOrderDetailDto(
      row,
      (seatsRes.data ?? []) as OrderSeatDbRow[],
      (ticketsRes.data ?? []) as TicketDbRow[],
      (paymentsRes.data ?? []) as PaymentDbRow[],
      (actionsRes.data ?? []) as AffectedActionDbRow[],
      (auditRes.data ?? []) as AuditDbRow[],
    );
  }

  /** Lấy dữ liệu 6 bảng liên quan tới đơn hàng */
  private async fetchOrderDetailData(orderId: string) {
    const admin = this.supabase.admin();
    const [orderRes, seatsRes, ticketsRes, paymentsRes, actionsRes, auditRes] = await Promise.all([
      admin.from("orders").select("*").eq("id", orderId).maybeSingle(),
      admin.from("order_seats").select("*").eq("order_id", orderId),
      admin.from("tickets").select("*").eq("order_id", orderId),
      admin.from("payments").select("*").eq("order_id", orderId),
      admin.from("affected_order_actions").select("*").eq("order_id", orderId),
      admin.from("audit_logs").select("*").eq("table_name", "orders").eq("record_id", orderId).order("occurred_at", { ascending: true }),
    ]);
    return { orderRes, seatsRes, ticketsRes, paymentsRes, actionsRes, auditRes };
  }

  /** Tổ chức dữ liệu DTO chi tiết đơn */
  private buildOrderDetailDto(
    row: OrderDbRow,
    orderSeats: OrderSeatDbRow[],
    rawTickets: TicketDbRow[],
    rawPayments: PaymentDbRow[],
    affectedActions: AffectedActionDbRow[],
    auditRows: AuditDbRow[],
  ): OrderDetailDto {
    const seatMap = new Map(orderSeats.map((s) => [s.id, s]));
    const tickets: OrderTicketDto[] = rawTickets.map((t) => {
      const seat = t.order_seat_id ? seatMap.get(t.order_seat_id) : undefined;
      return {
        id: t.id,
        orderSeatId: t.order_seat_id ?? "",
        seatId: seat?.seat_id ?? "",
        seatLabel: seat?.seat_label ?? t.seat_label ?? "",
        seatType: seat?.seat_type ?? t.seat_type ?? "",
        priceAmount: seat?.price_amount ?? t.price_amount ?? 0,
        checkedIn: t.checked_in_at != null,
        checkedInAt: t.checked_in_at ?? null,
        checkedInByName: null,
      };
    });

    const payments: OrderPaymentDto[] = rawPayments.map((p) => ({
      id: p.id,
      orderCode: p.order_code,
      amount: p.amount,
      status: p.status,
      transactionRef: p.transaction_ref,
      paidAt: p.paid_at,
      paymentLinkId: p.payment_link_id,
      createdAt: p.created_at,
    }));

    const statusHistory = extractStatusHistory(auditRows, row);
    const affectedAction = affectedActions[0];

    return {
      ...mapSummaryDto(row),
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
   */
  async listNeedsManualReview(
    user: AuthUser,
    query: ListNeedsManualReviewQuery,
  ): Promise<{ items: OrderSummaryDto[]; total: number; page: number; limit: number }> {
    const access = await this.access.loadForRequest({ user });
    const managerCinemas = access.isAdmin
      ? []
      : Array.from(access.cinemaRoles.entries()).filter(([, r]) => r === "MANAGER").map(([c]) => c);

    if (!access.isAdmin) {
      if (managerCinemas.length === 0) throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền");
      if (query.cinemaId && !managerCinemas.includes(query.cinemaId)) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền truy cập rạp này");
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;

    let qb = this.supabase.admin().from("orders").select("*, tickets(id)", { count: "exact" }).eq("status", "needs_manual_review");
    if (query.cinemaId) {
      qb = qb.eq("cinema_id", query.cinemaId);
    } else if (!access.isAdmin) {
      qb = qb.in("cinema_id", managerCinemas);
    }

    const { data, count, error } = await qb.order("created_at", { ascending: false }).range(fromIndex, toIndex);
    if (error) throw error;

    const items = ((data ?? []) as OrderDbRow[]).map(mapSummaryDto);
    return { items, total: count ?? items.length, page, limit };
  }

  /**
   * Xử lý đơn needs_manual_review (R-104, AC-11, SPECIFICATIONS.md:311)
   */
  async resolveManualReview(
    user: AuthUser,
    orderId: string,
    input: ResolveManualReviewInput,
  ): Promise<{ success: true; orderId: string; action: string; resolvedAt: string }> {
    const access = await this.access.loadForRequest({ user });
    await this.validateManualReviewAccess(access, orderId);

    const { data, error } = await this.supabase.forUser(user.jwt).rpc("resolve_manual_review", {
      p_order_id: orderId,
      p_action: input.action,
      p_note: input.note ?? null,
      p_refund_reference: input.refundReference ?? null,
      p_refunded_amount: input.refundedAmount ?? null,
    });

    if (error) this.handleResolveManualReviewError(error);

    const res = (data as { success: boolean; order_id: string; resolved_at: string } | null) ?? null;
    return {
      success: true,
      orderId,
      action: input.action,
      resolvedAt: res?.resolved_at ?? new Date().toISOString(),
    };
  }

  /** Xác thực quyền và trạng thái đơn trước khi resolve */
  private async validateManualReviewAccess(access: Awaited<ReturnType<AccessService["loadForRequest"]>>, orderId: string) {
    const { data: order, error } = await this.supabase
      .admin()
      .from("orders")
      .select("id, cinema_id, status, manual_review_resolved_at")
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn hàng");

    if (!access.isAdmin) {
      const heldRole = access.cinemaRoles.get(order.cinema_id);
      if (!heldRole) throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền trên rạp này");
      if (heldRole !== "MANAGER") throw new AppException(ERROR_CODES.FORBIDDEN, "Staff chỉ có quyền xem đơn hàng, không được xử lý");
    }

    if (order.status !== "needs_manual_review") throw new AppException(ERROR_CODES.CONFLICT, "Đơn hàng không ở trạng thái cần xem xét thủ công");
    if (order.manual_review_resolved_at) throw new AppException(ERROR_CODES.CONFLICT, "Đơn hàng này đã được xử lý trước đó");
  }

  /** Xử lý mã lỗi từ RPC resolve_manual_review */
  private handleResolveManualReviewError(error: { code?: string; message?: string }): never {
    if (error.code === "42501" || error.message?.includes("FORBIDDEN_SCOPE")) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền xử lý đơn hàng này");
    }
    if (error.code === "P0002" || error.message?.includes("ORDER_NOT_FOUND")) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn hàng");
    }
    if (error.code === "P0003" || error.message?.includes("INVALID_ORDER_STATUS")) {
      throw new AppException(ERROR_CODES.CONFLICT, "Đơn hàng không ở trạng thái cần xem xét thủ công");
    }
    if (error.code === "P0004" || error.message?.includes("ALREADY_RESOLVED")) {
      throw new AppException(ERROR_CODES.CONFLICT, "Đơn hàng này đã được xử lý trước đó");
    }
    throw error;
  }

  /**
   * GET /admin/todo (D5)
   */
  async getAdminTodo(user: AuthUser): Promise<AdminTodoDto> {
    const access = await this.access.loadForRequest({ user });
    const allowedCinemas = Array.from(access.cinemaRoles.keys());

    if (!access.isAdmin && allowedCinemas.length === 0) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền truy cập todo");
    }

    const managerCinemas = access.isAdmin
      ? []
      : Array.from(access.cinemaRoles.entries()).filter(([, r]) => r === "MANAGER").map(([c]) => c);
    const isManagerOrAdmin = access.isAdmin || managerCinemas.length > 0;

    const { nmrRes, affRes, emailRes, stRes } = await this.queryTodoBatches(access, allowedCinemas, managerCinemas, isManagerOrAdmin);

    const nmrRows = ((nmrRes.data ?? []) as OrderDbRow[]).map(mapSummaryDto);
    const affRows = ((affRes.data ?? []) as OrderDbRow[]).map(mapSummaryDto);
    const failedEmails = ((emailRes.data ?? []) as EmailOutboxRow[]).map((e) => ({
      id: e.id,
      toEmail: e.to_email,
      kind: e.kind,
      lastError: e.last_error,
      attempts: e.attempts,
      createdAt: e.created_at,
    }));

    const upcomingShowtimes = await resolveUpcomingShowtimes(this.supabase, (stRes.data ?? []) as unknown as RawShowtimeRow[]);

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

  /** Thực hiện 4 truy vấn song song cho admin todo */
  private async queryTodoBatches(
    access: Awaited<ReturnType<AccessService["loadForRequest"]>>,
    allowedCinemas: string[],
    managerCinemas: string[],
    isManagerOrAdmin: boolean,
  ) {
    const now = new Date();
    const in30m = new Date(now.getTime() + 30 * 60 * 1000);
    const admin = this.supabase.admin();

    const nmrPromise = isManagerOrAdmin
      ? (() => {
          let q = admin.from("orders").select("*, tickets(id)", { count: "exact" }).eq("status", "needs_manual_review").is("manual_review_resolved_at", null);
          if (!access.isAdmin) q = q.in("cinema_id", managerCinemas);
          return q.order("created_at", { ascending: false }).limit(10);
        })()
      : Promise.resolve({ data: [] as OrderDbRow[], count: 0, error: null });

    let affQuery = admin.from("orders").select("*, tickets(id)", { count: "exact" }).eq("status", "affected");
    if (!access.isAdmin) affQuery = affQuery.in("cinema_id", allowedCinemas);
    const affPromise = affQuery.order("created_at", { ascending: false }).limit(10);

    const emailPromise = isManagerOrAdmin
      ? (() => {
          let q = admin.from("email_outbox").select("*", { count: "exact" }).eq("status", "FAILED");
          if (!access.isAdmin) q = q.in("cinema_id", managerCinemas);
          return q.order("created_at", { ascending: false }).limit(10);
        })()
      : Promise.resolve({ data: [] as EmailOutboxRow[], count: 0, error: null });

    let stQuery = admin.from("showtimes").select("id, cinema_id, room_id, movie_id, format, starts_at, ends_at, status, movies(title_vi)", { count: "exact" }).gte("starts_at", now.toISOString()).lte("starts_at", in30m.toISOString()).neq("status", "CANCELLED");
    if (!access.isAdmin) stQuery = stQuery.in("cinema_id", allowedCinemas);
    const stPromise = stQuery.order("starts_at", { ascending: true }).limit(10);

    const [nmrRes, affRes, emailRes, stRes] = await Promise.all([nmrPromise, affPromise, emailPromise, stPromise]);
    return { nmrRes, affRes, emailRes, stRes };
  }
}
