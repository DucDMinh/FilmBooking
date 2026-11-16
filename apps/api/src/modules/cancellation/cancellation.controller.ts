import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  type PipeTransform,
} from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  cancelShowtimesSchema,
  exportAffectedOrdersQuerySchema,
  listAffectedOrdersQuerySchema,
  previewCancelShowtimesSchema,
  recordRefundSchema,
  setCinemaStatusSchema,
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
import { z } from "zod";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import { CinemaScope, CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CancellationService } from "./cancellation.service";

interface HeaderSender {
  setHeader(name: string, value: string): void;
}

const uuidParam = new ZodValidationPipe(z.string().uuid());
/** ID rạp seed (20000000-…) không đúng version/variant RFC -> dùng GUID lỏng như các endpoint cinema khác. */
const cinemaIdParam = new ZodValidationPipe(z.guid());

/**
 * Pipe validate schema cho hoàn tiền thủ công:
 * Bắt buộc số tiền + mã giao dịch ngân hàng (AC-25) -> thiếu ném 422 UNPROCESSABLE_ENTITY.
 */
export class Unprocessable422Pipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));

    throw new HttpException(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Validation failed: missing or invalid refund details",
          details: { issues },
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

@Controller()
export class CancellationController {
  constructor(
    @Inject(CancellationService) private readonly service: CancellationService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  /**
   * Xem trước ảnh hưởng khi huỷ suất chiếu (R-108, AC-24).
   * Manager rạp mình / Admin.
   */
  @Roles("MANAGER")
  @CinemaScope()
  @Post([
    "cinemas/:cinemaId/showtimes/cancel/preview",
    "admin/cinemas/:cinemaId/cancel-showtimes/preview",
    "showtimes/cancel/preview",
  ])
  async previewCancel(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(previewCancelShowtimesSchema)) body: PreviewCancelShowtimesInput,
    @Param("cinemaId") cinemaId?: string,
  ): Promise<PreviewCancelResultDto> {
    const { isAdmin } = await this.access.loadForRequest(request);
    return this.service.previewCancel(user.jwt, cinemaId, body, isAdmin);
  }

  /**
   * Huỷ suất chiếu hàng loạt / tất cả suất tương lai của rạp (R-108, R-109, AC-24).
   * Lý do huỷ là bắt buộc. Manager rạp mình / Admin.
   */
  @Roles("MANAGER")
  @CinemaScope()
  @Post([
    "cinemas/:cinemaId/showtimes/cancel",
    "admin/cinemas/:cinemaId/cancel-showtimes",
    "showtimes/cancel",
  ])
  async cancelShowtimes(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(cancelShowtimesSchema)) body: CancelShowtimesInput,
    @Param("cinemaId") cinemaId?: string,
  ): Promise<CancelShowtimesResultDto> {
    const { isAdmin } = await this.access.loadForRequest(request);
    return this.service.cancelShowtimes(user.jwt, user.id, cinemaId, body, isAdmin);
  }

  /**
   * Đổi trạng thái rạp qua RPC set_cinema_status (R-33, AC-26).
   * Chỉ Admin. Đóng rạp còn suất tương lai đã bán -> 409 CONFLICT kèm showtimeIds.
   */
  @Roles("ADMIN")
  @Patch(["admin/cinemas/:cinemaId/status", "cinemas/:cinemaId/status"])
  async setStatusPatch(
    @Param("cinemaId", cinemaIdParam) cinemaId: string,
    @Body(new ZodValidationPipe(setCinemaStatusSchema)) body: SetCinemaStatusInput,
  ): Promise<{ success: boolean; cinemaId: string; status: string }> {
    return this.service.setCinemaStatus(cinemaId, body);
  }

  @Roles("ADMIN")
  @Post(["admin/cinemas/:cinemaId/status", "cinemas/:cinemaId/status"])
  async setStatusPost(
    @Param("cinemaId", cinemaIdParam) cinemaId: string,
    @Body(new ZodValidationPipe(setCinemaStatusSchema)) body: SetCinemaStatusInput,
  ): Promise<{ success: boolean; cinemaId: string; status: string }> {
    return this.service.setCinemaStatus(cinemaId, body);
  }

  /**
   * Xuất CSV danh sách đơn bị ảnh hưởng (R-110).
   * Phải đặt trước route :orderId để không bị match nhầm.
   */
  @Roles("STAFF")
  @Get([
    "admin/affected-orders/export",
    "affected-orders/export",
    "cinemas/:cinemaId/affected-orders/export",
  ])
  async exportCsv(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HeaderSender,
    @Query(new ZodValidationPipe(exportAffectedOrdersQuerySchema)) query: ExportAffectedOrdersQuery,
    @Param("cinemaId") cinemaId?: string,
  ): Promise<string> {
    const access = await this.access.loadForRequest(request);
    const csv = await this.service.exportCsv(access, cinemaId, query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="don-bi-anh-huong.csv"');
    return csv;
  }

  /**
   * Danh sách đơn bị ảnh hưởng (R-110, AC-24).
   * Lọc theo rạp, suất, trạng thái xử lý; hiển thị trạng thái email outbox.
   */
  @Roles("STAFF")
  @Get([
    "admin/affected-orders",
    "affected-orders",
    "cinemas/:cinemaId/affected-orders",
  ])
  async listAffectedOrders(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listAffectedOrdersQuerySchema)) query: ListAffectedOrdersQuery,
    @Param("cinemaId") cinemaId?: string,
  ): Promise<{ items: AffectedOrderDto[]; total: number }> {
    const access = await this.access.loadForRequest(request);
    return this.service.listAffectedOrders(access, cinemaId, query);
  }

  /**
   * Chi tiết một đơn bị ảnh hưởng (R-110).
   */
  @Roles("STAFF")
  @Get([
    "admin/affected-orders/:orderId",
    "affected-orders/:orderId",
    "orders/:orderId/affected",
  ])
  async getAffectedOrderDetail(
    @Req() request: AuthenticatedRequest,
    @Param("orderId", uuidParam) orderId: string,
  ): Promise<AffectedOrderDetailDto> {
    const access = await this.access.loadForRequest(request);
    return this.service.getAffectedOrderDetail(access, orderId);
  }

  /**
   * Ghi kết quả xử lý hoàn tiền thủ công (R-110, AC-25, quyết định #6).
   * BẮT BUỘC số tiền + mã giao dịch ngân hàng (thiếu -> 422).
   * Staff rạp mình được ghi, Staff rạp khác -> 403.
   */
  @Roles("STAFF")
  @Post([
    "admin/affected-orders/:orderId/refund",
    "affected-orders/:orderId/refund",
    "orders/:orderId/refund",
  ])
  async recordRefund(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Param("orderId", uuidParam) orderId: string,
    @Body(new Unprocessable422Pipe(recordRefundSchema)) body: RecordRefundInput,
  ): Promise<RecordRefundResultDto> {
    const access = await this.access.loadForRequest(request);
    return this.service.recordRefund(user, access, orderId, body);
  }

  /**
   * Gửi lại email thông báo huỷ suất cho đơn bị ảnh hưởng (R-109).
   */
  @Roles("STAFF")
  @Post([
    "admin/affected-orders/:orderId/resend-email",
    "affected-orders/:orderId/resend-email",
    "orders/:orderId/resend-email",
  ])
  async resendEmail(
    @Req() request: AuthenticatedRequest,
    @Param("orderId", uuidParam) orderId: string,
  ): Promise<ResendEmailResultDto> {
    const access = await this.access.loadForRequest(request);
    return this.service.resendEmail(access, orderId);
  }
}
