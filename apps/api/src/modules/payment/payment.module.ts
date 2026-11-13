import { Module } from "@nestjs/common";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import { PayosClient } from "./payos.client";
import { WebhookController } from "./webhook.controller";

@Module({
  controllers: [PaymentController, WebhookController],
  providers: [PaymentService, PayosClient],
  exports: [PaymentService, PayosClient],
})
export class PaymentModule {}
