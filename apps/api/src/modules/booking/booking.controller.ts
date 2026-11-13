import { Body, Controller, Delete, Get, Headers, Inject, Ip, Param, Post, Req } from "@nestjs/common";
import {
  applyVoucherSchema,
  consentSchema,
  holdSeatsSchema,
  uuidSchema,
  type ApplyVoucherInput,
  type ConsentInput,
  type HoldSeatsInput,
} from "@filmbooking/shared/schemas/booking";
import type { AuthenticatedRequest } from "../../common/auth/access.service";
import { CurrentUser, Public, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { BookingService } from "./booking.service";
import { SeatmapService } from "./seatmap.service";

const uuidParam = new ZodValidationPipe(uuidSchema);

@Controller()
export class BookingController {
  constructor(
    @Inject(BookingService) private readonly bookingService: BookingService,
    @Inject(SeatmapService) private readonly seatmapService: SeatmapService,
  ) {}

  /**
   * Sơ đồ ghế công khai (R-59, AC-07).
   */
  @Public()
  @Get("showtimes/:id/seatmap")
  getSeatMap(@Param("id", uuidParam) id: string) {
    return this.seatmapService.getSeatMap(id);
  }

  /**
   * Giữ ghế (chỉ CUSTOMER đã xác nhận email — R-05, R-61..R-67, AC-01, AC-06).
   */
  @Post("bookings/holds")
  hold(
    @CurrentUser() user: AuthUser,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(holdSeatsSchema)) body: HoldSeatsInput,
  ) {
    return this.bookingService.hold(user, req, body);
  }

  /**
   * Nhả ghế đang giữ.
   */
  @Delete("bookings/:id/hold")
  releaseHold(@CurrentUser() user: AuthUser, @Param("id", uuidParam) id: string) {
    return this.bookingService.releaseHold(user, id);
  }

  /**
   * Tóm tắt đơn hàng (R-70).
   */
  @Get("bookings/:id")
  getBooking(@CurrentUser() user: AuthUser, @Param("id", uuidParam) id: string) {
    return this.bookingService.getBooking(user, id);
  }

  /**
   * Xác nhận độ tuổi phim T13+ (R-68).
   */
  @Post("bookings/:id/age-confirm")
  ageConfirm(@CurrentUser() user: AuthUser, @Param("id", uuidParam) id: string) {
    return this.bookingService.ageConfirm(user, id);
  }

  /**
   * Lưu bằng chứng đồng ý chính sách không huỷ/không hoàn (R-71, R-133, AC-08).
   */
  @Post("bookings/:id/consent")
  saveConsent(
    @CurrentUser() user: AuthUser,
    @Param("id", uuidParam) id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Body(new ZodValidationPipe(consentSchema)) body: ConsentInput,
  ) {
    return this.bookingService.saveConsent(user, id, ip || "127.0.0.1", userAgent, body.version);
  }

  /**
   * Áp dụng voucher cho đơn hàng (R-90..R-95).
   */
  @Post("bookings/:id/voucher")
  applyVoucher(
    @CurrentUser() user: AuthUser,
    @Param("id", uuidParam) id: string,
    @Body(new ZodValidationPipe(applyVoucherSchema)) body: ApplyVoucherInput,
  ) {
    return this.bookingService.applyVoucher(user, id, body.code);
  }

  /**
   * Gỡ voucher khỏi đơn hàng.
   */
  @Delete("bookings/:id/voucher")
  removeVoucher(@CurrentUser() user: AuthUser, @Param("id", uuidParam) id: string) {
    return this.bookingService.removeVoucher(user, id);
  }
}
