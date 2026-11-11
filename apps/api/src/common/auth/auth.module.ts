import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AccessService } from "./access.service";
import { AuthGuard } from "./auth.guard";
import { CinemaScopeGuard } from "./cinema-scope.guard";
import { JobSecretGuard } from "./job-secret.guard";
import { RolesGuard } from "./roles.guard";

/**
 * Throttler mặc định theo IP (ThrottlerGuard dùng req.ip làm tracker): 100 req/phút.
 * Các guard KHÔNG đăng ký global ở đây; task wiring (layer-3) gắn APP_GUARD theo thứ tự
 * AuthGuard -> RolesGuard -> CinemaScopeGuard -> ThrottlerGuard.
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
  providers: [AccessService, AuthGuard, RolesGuard, CinemaScopeGuard, JobSecretGuard],
  exports: [ThrottlerModule, AccessService, AuthGuard, RolesGuard, CinemaScopeGuard, JobSecretGuard],
})
export class AuthModule {}
