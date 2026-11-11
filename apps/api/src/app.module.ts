import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { AppConfigModule } from "./config/env";
import { HealthController } from "./health/health.controller";

/** Chỉ task "wiring" được sửa file này; module tính năng tự test bằng TestingModule riêng. */
@Module({
  imports: [AppConfigModule, SupabaseModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
