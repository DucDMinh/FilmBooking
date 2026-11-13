import { Module } from "@nestjs/common";
import { AppConfigModule } from "../../config/env";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { MailModule } from "../mail/mail.module";
import { PaymentModule } from "../payment/payment.module";
import { PayosPaymentLookup, ReconcileService } from "./reconcile.service";
import { JobsController, JobsService, ReconcileController } from "./jobs.controller";

@Module({
  imports: [AppConfigModule, SupabaseModule, MailModule, PaymentModule],
  controllers: [JobsController, ReconcileController],
  providers: [JobsService, ReconcileService, PayosPaymentLookup],
  exports: [JobsService],
})
export class JobsModule {}
