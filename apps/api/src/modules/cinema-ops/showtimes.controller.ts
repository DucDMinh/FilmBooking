import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  bulkCreateShowtimesSchema,
  createShowtimeSchema,
  listShowtimesQuerySchema,
  lockSeatsSchema,
  updateCinemaSettingsSchema,
  updateShowtimeSchema,
  uuidSchema,
  type BulkCreateShowtimesInput,
  type CreateShowtimeInput,
  type ListShowtimesQuery,
  type LockSeatsInput,
  type UpdateCinemaSettingsInput,
  type UpdateShowtimeInput,
} from "@filmbooking/shared/schemas/cinema-ops";
import type { AuthenticatedRequest } from "../../common/auth/access.service";
import { CinemaScope, CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ShowtimesService } from "./showtimes.service";

const uuidParam = new ZodValidationPipe(uuidSchema);

/** Suất chiếu, đóng bán, khoá ghế, cấu hình rạp (R-49..R-51, R-54..R-56). */
@Controller()
export class ShowtimesController {
  constructor(@Inject(ShowtimesService) private readonly showtimes: ShowtimesService) {}

  /**
   * Hàng loạt nhiều rạp: không gắn `@CinemaScope` (guard chỉ xử lý một cinemaId) —
   * service kiểm vai trò MANAGER tại TỪNG rạp trong `targets`, Admin qua tất cả.
   */
  @Roles("MANAGER")
  @Post("showtimes/bulk")
  bulkCreate(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(bulkCreateShowtimesSchema)) body: BulkCreateShowtimesInput,
  ) {
    return this.showtimes.bulkCreate(user, request, body);
  }

  @CinemaScope()
  @Roles("STAFF")
  @Get("cinemas/:cinemaId/showtimes")
  list(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Query(new ZodValidationPipe(listShowtimesQuerySchema)) query: ListShowtimesQuery,
  ) {
    return this.showtimes.list(user, cinemaId, query);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Post("cinemas/:cinemaId/showtimes")
  create(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Body(new ZodValidationPipe(createShowtimeSchema)) body: CreateShowtimeInput,
  ) {
    return this.showtimes.create(user, cinemaId, body);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Patch("cinemas/:cinemaId/showtimes/:showtimeId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("showtimeId", uuidParam) showtimeId: string,
    @Body(new ZodValidationPipe(updateShowtimeSchema)) body: UpdateShowtimeInput,
  ) {
    return this.showtimes.update(user, cinemaId, showtimeId, body);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Delete("cinemas/:cinemaId/showtimes/:showtimeId")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("showtimeId", uuidParam) showtimeId: string,
  ): Promise<void> {
    await this.showtimes.remove(user, cinemaId, showtimeId);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Post("cinemas/:cinemaId/showtimes/:showtimeId/close")
  @HttpCode(200)
  close(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("showtimeId", uuidParam) showtimeId: string,
  ) {
    return this.showtimes.close(user, cinemaId, showtimeId);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Post("cinemas/:cinemaId/showtimes/:showtimeId/reopen")
  @HttpCode(200)
  reopen(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("showtimeId", uuidParam) showtimeId: string,
  ) {
    return this.showtimes.reopen(user, cinemaId, showtimeId);
  }

  @CinemaScope()
  @Roles("STAFF")
  @Get("cinemas/:cinemaId/showtimes/:showtimeId/locks")
  listLocks(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("showtimeId", uuidParam) showtimeId: string,
  ) {
    return this.showtimes.listLocks(user, cinemaId, showtimeId);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Post("cinemas/:cinemaId/showtimes/:showtimeId/locks")
  lockSeats(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("showtimeId", uuidParam) showtimeId: string,
    @Body(new ZodValidationPipe(lockSeatsSchema)) body: LockSeatsInput,
  ) {
    return this.showtimes.lockSeats(user, cinemaId, showtimeId, body);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Delete("cinemas/:cinemaId/showtimes/:showtimeId/locks/:seatId")
  @HttpCode(204)
  async unlockSeat(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("showtimeId", uuidParam) showtimeId: string,
    @Param("seatId", uuidParam) seatId: string,
  ): Promise<void> {
    await this.showtimes.unlockSeat(user, cinemaId, showtimeId, seatId);
  }

  @CinemaScope()
  @Roles("STAFF")
  @Get("cinemas/:cinemaId/settings")
  getSettings(@CurrentUser() user: AuthUser, @Param("cinemaId", uuidParam) cinemaId: string) {
    return this.showtimes.getSettings(user, cinemaId);
  }

  @CinemaScope()
  @Roles("MANAGER")
  @Patch("cinemas/:cinemaId/settings")
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Body(new ZodValidationPipe(updateCinemaSettingsSchema)) body: UpdateCinemaSettingsInput,
  ) {
    return this.showtimes.updateSettings(user, cinemaId, body);
  }
}
