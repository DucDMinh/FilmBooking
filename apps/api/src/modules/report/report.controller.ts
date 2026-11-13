import {
  Controller,
  Get,
  Inject,
  Injectable,
  Query,
} from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  cancelledShowtimesReportQuerySchema,
  movieShowtimeReportQuerySchema,
  payosReconciliationReportQuerySchema,
  revenueReportQuerySchema,
  type CancelledShowtimeReportItemDto,
  type CancelledShowtimesReportQuery,
  type MovieShowtimeReportItemDto,
  type MovieShowtimeReportQuery,
  type PayosReconciliationItemDto,
  type PayosReconciliationReportQuery,
  type RevenueReportItemDto,
  type RevenueReportQuery,
} from "@filmbooking/shared/schemas/report";
import { AccessService } from "../../common/auth/access.service";
import { CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SupabaseService } from "../../common/supabase/supabase.service";

/**
 * ReportService: Xử lý 4 báo cáo MVP (R-112, R-113, R-116, R-119).
 * Gọi RPC Postgres đã hardening với has_cinema_manager_scope.
 * Manager rạp A gọi rạp B -> 403 (AC-16). Staff -> 403.
 */
@Injectable()
export class ReportService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  private async assertManagerAccess(user: AuthUser, cinemaId?: string) {
    const access = await this.access.loadForRequest({ user });
    if (access.isAdmin) return access;

    const managerCinemas = Array.from(access.cinemaRoles.entries())
      .filter(([, role]) => role === "MANAGER")
      .map(([cid]) => cid);

    if (managerCinemas.length === 0) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Chỉ Manager hoặc Admin mới có quyền xem báo cáo");
    }

    if (cinemaId && !managerCinemas.includes(cinemaId)) {
      throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền xem báo cáo của rạp này");
    }

    return access;
  }

  /**
   * Báo cáo doanh thu theo ngày / rạp / kênh (R-112, AC-16)
   * Chỉ tính đơn paid/checked_in.
   */
  async getRevenueReport(user: AuthUser, query: RevenueReportQuery): Promise<RevenueReportItemDto[]> {
    await this.assertManagerAccess(user, query.cinemaId);

    const client = this.supabase.forUser(user.jwt);
    const { data, error } = await client.rpc("report_revenue", {
      p_cinema_id: query.cinemaId ?? null,
      p_from_date: query.fromDate ?? null,
      p_to_date: query.toDate ?? null,
      p_channel: query.channel ?? null,
    });

    if (error) {
      if (error.code === "42501" || error.message?.includes("FORBIDDEN")) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền xem báo cáo rạp này");
      }
      throw error;
    }

    interface RevenueRpcRow {
      report_date: string;
      cinema_id: string;
      cinema_code: string;
      cinema_name: string;
      channel: string;
      total_orders: number;
      total_tickets: number;
      gross_revenue: number;
      total_discount: number;
      net_revenue: number;
    }

    return ((data ?? []) as RevenueRpcRow[]).map((r) => ({
      reportDate: r.report_date,
      cinemaId: r.cinema_id,
      cinemaCode: r.cinema_code,
      cinemaName: r.cinema_name,
      channel: r.channel,
      totalOrders: Number(r.total_orders ?? 0),
      totalTickets: Number(r.total_tickets ?? 0),
      grossRevenue: Number(r.gross_revenue ?? 0),
      totalDiscount: Number(r.total_discount ?? 0),
      netRevenue: Number(r.net_revenue ?? 0),
    }));
  }

  /**
   * Báo cáo theo phim / suất / rạp (R-113, AC-16)
   */
  async getMovieShowtimeReport(
    user: AuthUser,
    query: MovieShowtimeReportQuery,
  ): Promise<MovieShowtimeReportItemDto[]> {
    await this.assertManagerAccess(user, query.cinemaId);

    const client = this.supabase.forUser(user.jwt);
    const { data, error } = await client.rpc("report_by_movie_showtime", {
      p_cinema_id: query.cinemaId ?? null,
      p_movie_id: query.movieId ?? null,
      p_from_date: query.fromDate ?? null,
      p_to_date: query.toDate ?? null,
    });

    if (error) {
      if (error.code === "42501" || error.message?.includes("FORBIDDEN")) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền xem báo cáo rạp này");
      }
      throw error;
    }

    interface ShowtimeRpcRow {
      showtime_id: string;
      cinema_id: string;
      cinema_code: string;
      cinema_name: string;
      movie_id: string;
      movie_title: string;
      room_id: string;
      room_name: string;
      starts_at: string;
      ends_at: string;
      format: string;
      showtime_status: string;
      room_capacity: number;
      sold_seats: number;
      occupancy_rate: number;
      net_revenue: number;
    }

    return ((data ?? []) as ShowtimeRpcRow[]).map((r) => ({
      showtimeId: r.showtime_id,
      cinemaId: r.cinema_id,
      cinemaCode: r.cinema_code,
      cinemaName: r.cinema_name,
      movieId: r.movie_id,
      movieTitle: r.movie_title,
      roomId: r.room_id,
      roomName: r.room_name,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      format: r.format,
      showtimeStatus: r.showtime_status,
      roomCapacity: Number(r.room_capacity ?? 0),
      soldSeats: Number(r.sold_seats ?? 0),
      occupancyRate: Number(r.occupancy_rate ?? 0),
      netRevenue: Number(r.net_revenue ?? 0),
    }));
  }

  /**
   * Báo cáo đối soát PayOS (R-116, AC-16)
   */
  async getPayosReconciliationReport(
    user: AuthUser,
    query: PayosReconciliationReportQuery,
  ): Promise<PayosReconciliationItemDto[]> {
    await this.assertManagerAccess(user, query.cinemaId);

    const client = this.supabase.forUser(user.jwt);
    const { data, error } = await client.rpc("report_payos_reconciliation", {
      p_cinema_id: query.cinemaId ?? null,
    });

    if (error) {
      if (error.code === "42501" || error.message?.includes("FORBIDDEN")) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền xem báo cáo rạp này");
      }
      throw error;
    }

    interface PayosReconciliationRpcRow {
      payment_id: string;
      order_id: string;
      cinema_id: string;
      cinema_code: string;
      cinema_name: string;
      order_code: number;
      payment_amount: number;
      order_total_amount: number;
      payment_status: string;
      order_status: string;
      transaction_ref: string | null;
      discrepancy_type: string;
      payment_created_at: string;
      order_created_at: string;
    }

    return ((data ?? []) as PayosReconciliationRpcRow[]).map((r) => ({
      paymentId: r.payment_id,
      orderId: r.order_id,
      cinemaId: r.cinema_id,
      cinemaCode: r.cinema_code,
      cinemaName: r.cinema_name,
      orderCode: Number(r.order_code ?? 0),
      paymentAmount: Number(r.payment_amount ?? 0),
      orderTotalAmount: Number(r.order_total_amount ?? 0),
      paymentStatus: r.payment_status,
      orderStatus: r.order_status,
      transactionRef: r.transaction_ref,
      discrepancyType: r.discrepancy_type,
      paymentCreatedAt: r.payment_created_at,
      orderCreatedAt: r.order_created_at,
    }));
  }

  /**
   * Báo cáo suất bị huỷ & đơn ảnh hưởng (R-119 lát MVP)
   */
  async getCancelledShowtimesReport(
    user: AuthUser,
    query: CancelledShowtimesReportQuery,
  ): Promise<CancelledShowtimeReportItemDto[]> {
    await this.assertManagerAccess(user, query.cinemaId);

    const client = this.supabase.forUser(user.jwt);
    const { data, error } = await client.rpc("report_cancelled_showtimes", {
      p_cinema_id: query.cinemaId ?? null,
      p_from_date: query.fromDate ?? null,
      p_to_date: query.toDate ?? null,
    });

    if (error) {
      if (error.code === "42501" || error.message?.includes("FORBIDDEN")) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền xem báo cáo rạp này");
      }
      throw error;
    }

    interface CancelledRpcRow {
      showtime_id: string;
      cinema_id: string;
      cinema_code: string;
      cinema_name: string;
      movie_title: string;
      room_name: string;
      starts_at: string;
      ends_at: string;
      showtime_status: string;
      total_affected_orders: number;
      exchanged_orders: number;
      refunded_manual_orders: number;
      pending_orders: number;
      total_refunded_amount: number;
    }

    return ((data ?? []) as CancelledRpcRow[]).map((r) => ({
      showtimeId: r.showtime_id,
      cinemaId: r.cinema_id,
      cinemaCode: r.cinema_code,
      cinemaName: r.cinema_name,
      movieTitle: r.movie_title,
      roomName: r.room_name,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      showtimeStatus: r.showtime_status,
      totalAffectedOrders: Number(r.total_affected_orders ?? 0),
      exchangedOrders: Number(r.exchanged_orders ?? 0),
      refundedManualOrders: Number(r.refunded_manual_orders ?? 0),
      pendingOrders: Number(r.pending_orders ?? 0),
      totalRefundedAmount: Number(r.total_refunded_amount ?? 0),
    }));
  }
}

/**
 * Controller báo cáo: /reports
 * Manager (rạp mình) và Admin (toàn chuỗi). Staff -> 403.
 */
@Controller("reports")
export class ReportController {
  constructor(@Inject(ReportService) private readonly reportService: ReportService) {}

  @Roles("MANAGER")
  @Get("revenue")
  getRevenue(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(revenueReportQuerySchema)) query: RevenueReportQuery,
  ) {
    return this.reportService.getRevenueReport(user, query);
  }

  @Roles("MANAGER")
  @Get("showtimes")
  getShowtimes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(movieShowtimeReportQuerySchema)) query: MovieShowtimeReportQuery,
  ) {
    return this.reportService.getMovieShowtimeReport(user, query);
  }

  @Roles("MANAGER")
  @Get("payos-reconciliation")
  getPayosReconciliation(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(payosReconciliationReportQuerySchema)) query: PayosReconciliationReportQuery,
  ) {
    return this.reportService.getPayosReconciliationReport(user, query);
  }

  @Roles("MANAGER")
  @Get("cancelled-showtimes")
  getCancelledShowtimes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cancelledShowtimesReportQuerySchema)) query: CancelledShowtimesReportQuery,
  ) {
    return this.reportService.getCancelledShowtimesReport(user, query);
  }
}

/**
 * Controller alias /admin/reports
 */
@Controller("admin/reports")
export class AdminReportController {
  constructor(@Inject(ReportService) private readonly reportService: ReportService) {}

  @Roles("MANAGER")
  @Get("revenue")
  getRevenue(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(revenueReportQuerySchema)) query: RevenueReportQuery,
  ) {
    return this.reportService.getRevenueReport(user, query);
  }

  @Roles("MANAGER")
  @Get("showtimes")
  getShowtimes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(movieShowtimeReportQuerySchema)) query: MovieShowtimeReportQuery,
  ) {
    return this.reportService.getMovieShowtimeReport(user, query);
  }

  @Roles("MANAGER")
  @Get("payos-reconciliation")
  getPayosReconciliation(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(payosReconciliationReportQuerySchema)) query: PayosReconciliationReportQuery,
  ) {
    return this.reportService.getPayosReconciliationReport(user, query);
  }

  @Roles("MANAGER")
  @Get("cancelled-showtimes")
  getCancelledShowtimes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cancelledShowtimesReportQuerySchema)) query: CancelledShowtimesReportQuery,
  ) {
    return this.reportService.getCancelledShowtimesReport(user, query);
  }
}
