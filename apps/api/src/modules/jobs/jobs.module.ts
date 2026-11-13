import { Module } from "@nestjs/common";
import { AppConfigModule } from "../../config/env";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { MailModule } from "../mail/mail.module";
import { JobsController, JobsService } from "./jobs.controller";

@Module({
  imports: [AppConfigModule, SupabaseModule, MailModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
