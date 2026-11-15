import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  Logger,
  Post,
} from "@nestjs/common";
import {
  payosWebhookEnvelopeSchema,
  type PayosWebhookEnvelope,
} from "@filmbooking/shared/schemas/payment";
import { Public } from "../../common/auth/decorators";
import { reportAlert } from "../../common/monitoring/sentry";
import { PayosClient } from "./payos.client";
import { PaymentService } from "./payment.service";

@Controller()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(PayosClient) private readonly payosClient: PayosClient,
    @Inject(PaymentService) private readonly paymentService: PaymentService,
  ) {}

  /**
   * POST /payos/webhook (R-74, R-75, AC-09, AC-10, AC-11).
   * Webhook công khai từ PayOS server.
   */
  @Public()
  @Post("payos/webhook")
  @HttpCode(HttpStatus.OK)
  async handlePayosWebhook(@Body() body: unknown): Promise<{ success: boolean; message?: string }> {
    const parseEnvelope = payosWebhookEnvelopeSchema.safeParse(body);
    if (!parseEnvelope.success) {
      const rawData = (body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      const orderCode = rawData?.orderCode;
      this.logger.warn(`PayOS webhook envelope invalid for orderCode=${orderCode}`);
      return { success: false, message: "Invalid webhook envelope" };
    }

    const envelope: PayosWebhookEnvelope = parseEnvelope.data;
    const orderCode = envelope.data?.orderCode;

    // AC-09: verify checksum HMAC; sai -> 200/400 theo chuẩn PayOS, đơn không đổi, log cảnh báo có orderCode.
    const verifiedData = await this.payosClient.verifyWebhook(envelope);
    if (!verifiedData) {
      this.logger.warn(`PayOS webhook signature invalid for orderCode=${orderCode}`);
      reportAlert({ alert: "webhook_invalid_signature", message: "PayOS webhook sai chữ ký", extra: { orderCode: String(orderCode) } });
      return { success: false, message: "Invalid signature" };
    }

    const webhookResult = await this.paymentService.handleWebhook(verifiedData);
    if (!webhookResult.success) {
      this.logger.error(
        `PayOS webhook processing failed for orderCode=${orderCode}: ${JSON.stringify(webhookResult)}`,
      );
      throw new InternalServerErrorException("Lỗi xử lý webhook, vui lòng thử lại sau");
    }

    return { success: true };
  }
}
