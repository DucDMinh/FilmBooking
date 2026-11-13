import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import {
  bookingIdParamSchema,
  createPaymentBodySchema,
  type CancelPaymentResultDto,
  type CreatePaymentBody,
  type CreatePaymentResultDto,
  type PaymentStatusDto,
} from "@filmbooking/shared/schemas/payment";
import { CurrentUser, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PaymentService } from "./payment.service";

@Controller()
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly paymentService: PaymentService) {}

  /**
   * POST /bookings/:id/payment (R-73, R-82).
   */
  @Post("bookings/:id/payment")
  @HttpCode(HttpStatus.OK)
  async createPayment(
    @Param("id", new ZodValidationPipe(bookingIdParamSchema)) id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPaymentBodySchema)) body?: CreatePaymentBody,
  ): Promise<CreatePaymentResultDto> {
    return this.paymentService.createPayment(id, user, body);
  }

  /**
   * GET /bookings/:id/payment-status (R-74, R-79).
   */
  @Get("bookings/:id/payment-status")
  async getPaymentStatus(
    @Param("id", new ZodValidationPipe(bookingIdParamSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PaymentStatusDto> {
    return this.paymentService.getPaymentStatus(id, user);
  }

  /**
   * POST /bookings/:id/payment/cancel (R-77).
   */
  @Post("bookings/:id/payment/cancel")
  @HttpCode(HttpStatus.OK)
  async cancelPayment(
    @Param("id", new ZodValidationPipe(bookingIdParamSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CancelPaymentResultDto> {
    return this.paymentService.cancelPayment(id, user);
  }
}
