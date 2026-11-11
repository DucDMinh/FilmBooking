import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AuthGuard } from "./common/auth/auth.guard";
import { AuthModule } from "./common/auth/auth.module";
import { CinemaScopeGuard } from "./common/auth/cinema-scope.guard";
import { RolesGuard } from "./common/auth/roles.guard";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { AppConfigModule, ENV, type Env } from "./config/env";
import { HealthController } from "./health/health.controller";
import { MeModule } from "./modules/me/me.module";

/**
 * Chỉ task "wiring" được sửa file này; module tính năng tự test bằng TestingModule riêng.
 * Thứ tự APP_GUARD là thứ tự chạy: Auth -> Roles -> CinemaScope -> Throttler.
 */
@Module({
  imports: [AppConfigModule, SupabaseModule, AuthModule, MeModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CinemaScopeGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Sau reverse proxy (Render/Vercel) req.ip phải lấy từ X-Forwarded-For, nếu không throttler gom mọi client vào IP của proxy. */
  onModuleInit(): void {
    const hops = this.env.TRUST_PROXY_HOPS ?? (this.env.NODE_ENV === "production" ? 1 : 0);
    this.adapterHost.httpAdapter.getInstance().set("trust proxy", hops);
  }
}
