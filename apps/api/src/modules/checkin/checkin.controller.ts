import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { scanTicketSchema, type ScanTicketInput } from "@filmbooking/shared/schemas/checkin";
import { CinemaScope, CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CheckinService } from "./checkin.service";

/**
 * Soát vé (R-97..R-102). STAFF trở lên (Manager gồm Staff, Admin qua mọi rạp); `cinemaId` trong body
 * phải là rạp user được gán — CinemaScopeGuard từ chối 403 trước khi chạm DB. Mọi kết quả soát (kể cả
 * vé sai rạp/đã dùng) là HTTP 200 với `result` + `color`; chỉ lỗi quyền/đầu vào mới là 4xx.
 */
@Controller("checkin")
export class CheckinController {
  constructor(@Inject(CheckinService) private readonly checkin: CheckinService) {}

  @Roles("STAFF")
  @CinemaScope()
  @HttpCode(200)
  @Post("scan")
  scan(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(scanTicketSchema)) body: ScanTicketInput) {
    return this.checkin.scan(user, body);
  }
}
