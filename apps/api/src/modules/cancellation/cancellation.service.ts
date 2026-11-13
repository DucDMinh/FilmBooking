import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  type AffectedOrderDetailDto,
  type AffectedOrderDto,
  type CancelShowtimesInput,
  type CancelShowtimesResultDto,
  type ExportAffectedOrdersQuery,
  type ListAffectedOrdersQuery,
  type PreviewCancelResultDto,
  type PreviewCancelShowtimesInput,
  type RecordRefundInput,
  type RecordRefundResultDto,
  type ResendEmailResultDto,
  type SetCinemaStatusInput,
} from "@filmbooking/shared/schemas/cancellation";
import type { UserAccess } from "../../common/auth/access.service";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import {
  buildAffectedOrdersCsv,
  type AffectedOrderCsvRow,
} from "./affected-csv";

@Injectable()
export class CancellationService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
  ) {}

  /**
   * Preview huỷ suất chiếu (R-108, AC-24).
   * Hỗ trợ danh sách showtimeIds cụ thể HOẶC allFuture=true cho một rạp.
   */
  async previewCancel(
    jwt: string,
    cinemaId: string | undefined,
    input: PreviewCancelShowtimesInput,
    isAdmin: boolean,
  ): Promise<PreviewCancelResultDto> {
    const showtimeIds = await this.resolveShowtimeIds(cinemaId, input);
    if (showtimeIds.length === 0) {
      return {
        showtimesCount: 0,
        paidOrdersCount: 0,
        webPaidOrdersCount: 0,
        posPaidOrdersCount: 0,
        holdingOrdersCount: 0,
        soldSeatsCount: 0,
        heldSeatsCount: 0,
        totalRefundAmount: 0,
      };
    }

    const client = isAdmin ? this.supabase.admin() : this.supabase.forUser(jwt);
    const { data, error } = await client.rpc("preview_cancel_showtimes", {
      p_showtime_ids: showtimeIds,
    });

    if (error) {
      if (error.code === "42501" || error.message?.includes("FORBIDDEN")) {
        throw new AppException(
          ERROR_CODES.FORBIDDEN_CINEMA,
          "No access to one or more showtimes",
        );
      }
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, error.message);
    }

    const res = (data ?? {}) as Record<string, unknown>;
    return {
      showtimesCount: Number(res.showtimes_count ?? 0),
      paidOrdersCount: Number(res.paid_orders_count ?? 0),
      webPaidOrdersCount: Number(res.web_paid_orders_count ?? 0),
      posPaidOrdersCount: Number(res.pos_paid_orders_count ?? 0),
      holdingOrdersCount: Number(res.holding_orders_count ?? 0),
      soldSeatsCount: Number(res.sold_seats_count ?? 0),
      heldSeatsCount: Number(res.held_seats_count ?? 0),
      totalRefundAmount: Number(res.total_refund_amount ?? 0),
    };
  }

  /**
   * Huỷ một / nhiều / tất cả suất chiếu tương lai của rạp (R-108, R-109, AC-24).
   * Chuyển đơn paid -> affected, enqueue email thông báo.
   */
  async cancelShowtimes(
    jwt: string,
    actorId: string,
    cinemaId: string | undefined,
    input: CancelShowtimesInput,
    isAdmin: boolean,
  ): Promise<CancelShowtimesResultDto> {
    const reason = input.reason.trim();
    if (!reason) {
      throw new AppException(
        ERROR_CODES.VALIDATION_ERROR,
        "Cancel reason is required",
      );
    }

    const showtimeIds = await this.resolveShowtimeIds(cinemaId, input);
    if (showtimeIds.length === 0) {
      return {
        success: true,
        cancelledShowtimesCount: 0,
        affectedOrdersCount: 0,
        cancelledHoldsCount: 0,
        cancelledOrdersCount: 0,
        emailsEnqueuedCount: 0,
      };
    }

    const client = isAdmin ? this.supabase.admin() : this.supabase.forUser(jwt);
    const { data, error } = await client.rpc("cancel_showtimes", {
      p_showtime_ids: showtimeIds,
      p_reason: reason,
      p_actor_id: actorId,
    });

    if (error) {
      if (error.code === "42501" || error.message?.includes("FORBIDDEN")) {
        throw new AppException(
          ERROR_CODES.FORBIDDEN_CINEMA,
          "No access to one or more showtimes",
        );
      }
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, error.message);
    }

    const res = (data ?? {}) as Record<string, unknown>;
    return {
      success: Boolean(res.success ?? true),
      cancelledShowtimesCount: Number(res.cancelled_showtimes_count ?? 0),
      affectedOrdersCount: Number(res.affected_orders_count ?? 0),
      cancelledHoldsCount: Number(res.cancelled_holds_count ?? 0),
      cancelledOrdersCount: Number(res.cancelled_orders_count ?? 0),
      emailsEnqueuedCount: Number(res.emails_enqueued_count ?? 0),
    };
  }

  /**
   * Đổi trạng thái rạp qua RPC set_cinema_status (R-33, AC-26).
   * Chặn đóng rạp khi còn suất tương lai đã bán vé -> 409 CONFLICT kèm danh sách showtimeIds.
   */
  async setCinemaStatus(
    cinemaId: string,
    input: SetCinemaStatusInput,
  ): Promise<{ success: boolean; cinemaId: string; status: string }> {
    const { data, error } = await this.supabase
      .admin()
      .rpc("set_cinema_status", {
        p_cinema_id: cinemaId,
        p_status: input.status,
      });

    if (error) {
      if (
        error.message?.includes("CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES") ||
        error.code === "23514"
      ) {
        let showtimeIds: string[] = [];
        if (error.details) {
          try {
            const parsed =
              typeof error.details === "string"
                ? JSON.parse(error.details)
                : error.details;
            if (Array.isArray(parsed)) showtimeIds = parsed;
          } catch {
            // bỏ qua lỗi parse json
          }
        }
        if (showtimeIds.length === 0 && error.message) {
          const matches = error.message.match(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
          );
          if (matches) showtimeIds = Array.from(new Set(matches));
        }
        throw new AppException(
          ERROR_CODES.CONFLICT,
          "Cinema has active sold showtimes",
          { showtimeIds },
        );
      }
      if (
        error.message?.includes("CINEMA_NOT_FOUND") ||
        error.code === "P0002"
      ) {
        throw new AppException(ERROR_CODES.NOT_FOUND, "Cinema not found");
      }
      if (
        error.message?.includes("FORBIDDEN") ||
        error.code === "42501"
      ) {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Forbidden");
      }
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }

    const res = (data ?? {}) as Record<string, unknown>;
    return {
      success: Boolean(res.success ?? true),
      cinemaId,
      status: input.status,
    };
  }

  /**
   * Danh sách đơn bị ảnh hưởng (R-110, AC-24).
   * Lọc theo rạp được phân công, trạng thái xử lý, showtimeId.
   */
  async listAffectedOrders(
    access: UserAccess,
    cinemaId: string | undefined,
    query: ListAffectedOrdersQuery,
  ): Promise<{ items: AffectedOrderDto[]; total: number }> {
    const permittedCinemas = this.resolvePermittedCinemas(access, cinemaId ?? query.cinemaId);
    if (permittedCinemas !== null && permittedCinemas.length === 0) {
      return { items: [], total: 0 };
    }

    let dbQuery = this.supabase
      .admin()
      .from("orders")
      .select("*", { count: "exact" });

    if (permittedCinemas !== null) {
      dbQuery = dbQuery.in("cinema_id", permittedCinemas);
    }

    if (query.status) {
      dbQuery = dbQuery.eq("status", query.status);
    } else {
      dbQuery = dbQuery.in("status", ["affected", "refunded_manual"]);
    }

    if (query.showtimeId) {
      dbQuery = dbQuery.eq("showtime_id", query.showtimeId);
    }

    dbQuery = dbQuery
      .order("cancelled_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    const { data: rows, count, error } = await dbQuery;
    if (error) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }

    const orderRows = (rows ?? []) as Array<Record<string, unknown>>;
    if (orderRows.length === 0) {
      return { items: [], total: count ?? 0 };
    }

    const items = await this.enrichAffectedOrders(orderRows);
    return { items, total: count ?? items.length };
  }

  /**
   * Chi tiết một đơn bị ảnh hưởng (R-110).
   */
  async getAffectedOrderDetail(
    access: UserAccess,
    orderId: string,
  ): Promise<AffectedOrderDetailDto> {
    const { data: order, error } = await this.supabase
      .admin()
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }
    if (!order || !["affected", "refunded_manual"].includes(order.status as string)) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Affected order not found");
    }

    if (!access.isAdmin && !access.cinemaRoles.has(order.cinema_id as string)) {
      throw new AppException(
        ERROR_CODES.FORBIDDEN_CINEMA,
        "No access to this cinema",
      );
    }

    const [enriched] = await this.enrichAffectedOrders([order as Record<string, unknown>]);
    if (!enriched) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Affected order not found");
    }

    // Lấy chi tiết ghế
    const { data: seatsData } = await this.supabase
      .admin()
      .from("order_seats")
      .select("seat_id, seat_label, seat_type, price_amount")
      .eq("order_id", orderId);

    // Lấy chi tiết email outbox
    const { data: emailRows } = await this.supabase
      .admin()
      .from("email_outbox")
      .select("id, status, attempts, last_error, sent_at, created_at, payload")
      .eq("kind", "showtime_cancelled");

    const emailMatch = (emailRows ?? []).find((e) => {
      const payload = typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload;
      return payload?.order_id === orderId;
    });

    return {
      ...enriched,
      seats: (seatsData ?? []).map((s) => ({
        seatId: s.seat_id as string,
        seatLabel: s.seat_label as string,
        seatType: s.seat_type as string,
        priceAmount: Number(s.price_amount ?? 0),
      })),
      emailOutbox: emailMatch
        ? {
            id: emailMatch.id as string,
            status: emailMatch.status as "PENDING" | "SENT" | "FAILED",
            attempts: Number(emailMatch.attempts ?? 0),
            lastError: (emailMatch.last_error as string) || null,
            sentAt: (emailMatch.sent_at as string) || null,
            createdAt: (emailMatch.created_at as string) || new Date().toISOString(),
          }
        : null,
    };
  }

  /**
   * Ghi kết quả xử lý hoàn tiền thủ công (R-110, AC-25, quyết định #6).
   * BẮT BUỘC số tiền + mã giao dịch ngân hàng -> thiếu trả 422;
   * Staff rạp mình được ghi, Staff rạp khác -> 403.
   */
  async recordRefund(
    user: AuthUser,
    access: UserAccess,
    orderId: string,
    input: RecordRefundInput,
  ): Promise<RecordRefundResultDto> {
    // Validate AC-25: số tiền + mã GD bắt buộc
    if (
      input.refundedAmount === undefined ||
      input.refundedAmount === null ||
      typeof input.refundedAmount !== "number" ||
      input.refundedAmount <= 0
    ) {
      throw new HttpException(
        {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "refundedAmount is required and must be greater than 0",
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const ref = input.refundReference?.trim();
    if (!ref) {
      throw new HttpException(
        {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "refundReference is required",
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const { data: order, error } = await this.supabase
      .admin()
      .from("orders")
      .select("id, cinema_id, status, total_amount")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }
    if (!order) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Order not found");
    }

    // Kiểm tra quyền theo rạp: Staff HN02 ghi đơn HN01 -> 403, Staff HN01 -> OK
    if (!access.isAdmin && !access.cinemaRoles.has(order.cinema_id as string)) {
      throw new AppException(
        ERROR_CODES.FORBIDDEN_CINEMA,
        "No access to this cinema",
      );
    }

    // Kiểm tra trạng thái đơn: chỉ đơn affected mới ghi nhận hoàn tiền
    if (order.status === "refunded_manual") {
      throw new AppException(
        ERROR_CODES.CONFLICT,
        "Order has already been refunded",
      );
    }
    if (order.status !== "affected") {
      throw new AppException(
        ERROR_CODES.CONFLICT,
        "Order is not in affected status",
      );
    }

    // Kiểm tra đơn đã có dòng REFUNDED_MANUAL trong affected_order_actions chưa (chống race/hoàn trùng)
    const { data: existingAction, error: actionCheckError } = await this.supabase
      .admin()
      .from("affected_order_actions")
      .select("id")
      .eq("order_id", orderId)
      .eq("action", "REFUNDED_MANUAL")
      .maybeSingle();

    if (actionCheckError) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, actionCheckError.message);
    }
    if (existingAction) {
      throw new AppException(
        ERROR_CODES.CONFLICT,
        "Order has already been refunded",
      );
    }

    // Kiểm tra ràng buộc số tiền hoàn: 0 < refundedAmount <= orders.total_amount
    const totalAmount = Number(order.total_amount ?? 0);
    if (input.refundedAmount > totalAmount) {
      throw new HttpException(
        {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `refundedAmount (${input.refundedAmount}) cannot exceed order total amount (${totalAmount})`,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Ghi vào affected_order_actions
    const { error: insertError } = await this.supabase
      .admin()
      .from("affected_order_actions")
      .insert({
        order_id: orderId,
        cinema_id: order.cinema_id,
        action: "REFUNDED_MANUAL",
        refund_reference: ref,
        refunded_amount: input.refundedAmount,
        note: input.note?.trim() ?? null,
        performed_by: user.id,
      });

    if (insertError) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, insertError.message);
    }

    // Cập nhật orders.status sang refunded_manual
    const { error: updateError } = await this.supabase
      .admin()
      .from("orders")
      .update({
        status: "refunded_manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateError) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, updateError.message);
    }

    return {
      success: true,
      orderId,
      status: "refunded_manual",
      refundedAmount: input.refundedAmount,
      refundReference: ref,
    };
  }

  /**
   * Gửi lại email thông báo đơn bị ảnh hưởng (R-109).
   * Chỉ cho phép resend khi email thất bại (status = 'FAILED') hoặc chưa có email.
   * Chặn 409 nếu email đang PENDING hoặc SENT để tránh gửi trùng.
   */
  async resendEmail(
    access: UserAccess,
    orderId: string,
  ): Promise<ResendEmailResultDto> {
    const { data: order, error } = await this.supabase
      .admin()
      .from("orders")
      .select("id, cinema_id, cinema_name, movie_title, room_name, showtime_starts_at, status, contact_email, booking_code, cancel_reason")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }
    if (!order || !["affected", "refunded_manual"].includes(order.status as string)) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Order not found");
    }

    if (!access.isAdmin && !access.cinemaRoles.has(order.cinema_id as string)) {
      throw new AppException(
        ERROR_CODES.FORBIDDEN_CINEMA,
        "No access to this cinema",
      );
    }

    const contactEmail = (order.contact_email as string)?.trim();
    if (!contactEmail) {
      throw new AppException(
        ERROR_CODES.VALIDATION_ERROR,
        "Order has no contact email to resend",
      );
    }

    // Truy vấn trực tiếp DB theo order_id thay vì load toàn bảng
    const { data: emails, error: outboxError } = await this.supabase
      .admin()
      .from("email_outbox")
      .select("id, status, payload")
      .eq("kind", "showtime_cancelled")
      .filter("payload->>order_id", "eq", orderId)
      .order("created_at", { ascending: false });

    if (outboxError) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, outboxError.message);
    }

    const existing = emails && emails.length > 0 ? emails[0] : null;

    if (existing) {
      // Chỉ cho phép resend khi status là FAILED. PENDING và SENT ném 409 CONFLICT để chống gửi trùng
      if (existing.status === "PENDING" || existing.status === "SENT") {
        throw new AppException(
          ERROR_CODES.CONFLICT,
          `Cannot resend email with status ${String(existing.status)}`,
        );
      }

      const { error: updateError } = await this.supabase
        .admin()
        .from("email_outbox")
        .update({
          status: "PENDING",
          next_attempt_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", existing.id);

      if (updateError) {
        throw new AppException(ERROR_CODES.INTERNAL_ERROR, updateError.message);
      }
    } else {
      // Insert bản ghi mới với đầy đủ thông tin rạp/phim/phòng/suất chiếu
      const { error: insertError } = await this.supabase
        .admin()
        .from("email_outbox")
        .insert({
          kind: "showtime_cancelled",
          to_email: contactEmail,
          payload: {
            order_id: order.id,
            booking_code: order.booking_code,
            cinema_id: order.cinema_id,
            cinema_name: order.cinema_name,
            movie_title: order.movie_title,
            room_name: order.room_name,
            showtime_starts_at: order.showtime_starts_at,
            reason: order.cancel_reason,
            template: "showtime_cancelled",
          },
          cinema_id: order.cinema_id,
          status: "PENDING",
          next_attempt_at: new Date().toISOString(),
        });

      if (insertError) {
        throw new AppException(ERROR_CODES.INTERNAL_ERROR, insertError.message);
      }
    }

    return {
      success: true,
      orderId,
      status: "PENDING",
      message: "Email queued for delivery",
    };
  }

  /**
   * Xuất CSV danh sách đơn bị ảnh hưởng (R-110).
   * UTF-8 BOM, tiêu đề tiếng Việt, chỉ xuất dữ liệu rạp được gán.
   */
  async exportCsv(
    access: UserAccess,
    cinemaId: string | undefined,
    query: ExportAffectedOrdersQuery,
  ): Promise<string> {
    const listResult = await this.listAffectedOrders(access, cinemaId, {
      ...query,
      limit: 1000,
      offset: 0,
    });

    const csvRows: AffectedOrderCsvRow[] = listResult.items.map((item) => ({
      bookingCode: item.bookingCode,
      orderId: item.id,
      cinemaName: item.cinemaName,
      movieTitle: item.movieTitle,
      showtimeStartsAt: item.showtimeStartsAt,
      roomName: item.roomName,
      seatLabels: item.seatLabels,
      totalAmount: item.totalAmount,
      contactName: item.contactName,
      contactPhone: item.contactPhone,
      contactEmail: item.contactEmail,
      status: item.status,
      emailStatus: item.emailStatus,
      refundedAmount: item.refundedAmount,
      refundReference: item.refundReference,
      note: item.note,
      refundedAt: item.refundedAt,
      performedBy: item.refundedBy,
    }));

    return buildAffectedOrdersCsv(csvRows);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Tìm danh sách showtimeId theo showtimeIds hoặc allFuture=true.
   */
  private async resolveShowtimeIds(
    cinemaId: string | undefined,
    input: { showtimeIds?: string[]; allFuture?: true },
  ): Promise<string[]> {
    if (input.showtimeIds && input.showtimeIds.length > 0) {
      return input.showtimeIds;
    }

    if (input.allFuture) {
      if (!cinemaId) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          "cinemaId is required when allFuture=true",
        );
      }
      const nowIso = new Date().toISOString();
      const { data, error } = await this.supabase
        .admin()
        .from("showtimes")
        .select("id")
        .eq("cinema_id", cinemaId)
        .neq("status", "CANCELLED")
        .gt("starts_at", nowIso);

      if (error) {
        throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
      }
      return (data ?? []).map((row) => row.id as string);
    }

    return [];
  }

  /**
   * Xác định danh sách rạp mà user được phép truy cập (null = Admin xem tất cả rạp).
   */
  private resolvePermittedCinemas(
    access: UserAccess,
    requestedCinemaId?: string,
  ): string[] | null {
    if (access.isAdmin) {
      return requestedCinemaId ? [requestedCinemaId] : null;
    }

    const assigned = Array.from(access.cinemaRoles.keys());
    if (requestedCinemaId) {
      if (!assigned.includes(requestedCinemaId)) {
        throw new AppException(
          ERROR_CODES.FORBIDDEN_CINEMA,
          "No access to this cinema",
        );
      }
      return [requestedCinemaId];
    }
    return assigned;
  }

  /**
   * Ghép thông tin bổ sung cho đơn bị ảnh hưởng (ghế, hoàn tiền, email outbox).
   */
  private async enrichAffectedOrders(
    orderRows: Array<Record<string, unknown>>,
  ): Promise<AffectedOrderDto[]> {
    const orderIds = orderRows.map((r) => r.id as string);

    // Ghế của đơn
    const { data: seatsData } = await this.supabase
      .admin()
      .from("order_seats")
      .select("order_id, seat_label")
      .in("order_id", orderIds);

    // Giao dịch hoàn tiền
    const { data: actionsData } = await this.supabase
      .admin()
      .from("affected_order_actions")
      .select("order_id, action, refund_reference, refunded_amount, note, created_at, performed_by")
      .in("order_id", orderIds);

    // Email outbox
    const { data: emailRows } = await this.supabase
      .admin()
      .from("email_outbox")
      .select("id, status, sent_at, payload")
      .eq("kind", "showtime_cancelled");

    return orderRows.map((o) => {
      const id = o.id as string;
      const seats = (seatsData ?? []).filter((s) => s.order_id === id);
      const action = (actionsData ?? []).find(
        (a) => a.order_id === id && a.action === "REFUNDED_MANUAL",
      );
      const email = (emailRows ?? []).find((e) => {
        const payload = typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload;
        return payload?.order_id === id;
      });

      return {
        id,
        bookingCode: (o.booking_code as string) ?? "",
        cinemaId: (o.cinema_id as string) ?? "",
        cinemaName: (o.cinema_name as string) ?? "",
        cinemaCode: (o.cinema_code as string) ?? "",
        showtimeId: (o.showtime_id as string) ?? "",
        movieTitle: (o.movie_title as string) ?? "",
        roomName: (o.room_name as string) ?? "",
        showtimeStartsAt: (o.showtime_starts_at as string) ?? "",
        totalAmount: Number(o.total_amount ?? 0),
        status: o.status as "affected" | "refunded_manual",
        cancelReason: (o.cancel_reason as string) || null,
        cancelledAt: (o.cancelled_at as string) || null,
        contactName: (o.contact_name as string) || null,
        contactEmail: (o.contact_email as string) || null,
        contactPhone: (o.contact_phone as string) || null,
        seatLabels: seats.map((s) => s.seat_label as string).filter(Boolean),
        emailStatus: email ? (email.status as "PENDING" | "SENT" | "FAILED") : null,
        emailSentAt: (email?.sent_at as string) || null,
        refundedAmount: action ? Number(action.refunded_amount ?? 0) : null,
        refundReference: (action?.refund_reference as string) || null,
        refundedAt: (action?.created_at as string) || null,
        refundedBy: (action?.performed_by as string) || null,
        note: (action?.note as string) || null,
        createdAt: (o.created_at as string) || new Date().toISOString(),
        updatedAt: (o.updated_at as string) || new Date().toISOString(),
      };
    });
  }
}
