import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { CancellationController } from "./cancellation.controller";
import { CancellationService } from "./cancellation.service";

/**
 * Module API huỷ suất chiếu / đóng rạp / xử lý đơn bị ảnh hưởng (R-33, R-108..R-110, R-134, AC-24..AC-26).
 * SupabaseModule là @Global; AuthModule cấp AccessService.
 * Đăng ký vào AppModule ở layer-6-task-01.
 */
@Module({
  imports: [AuthModule],
  controllers: [CancellationController],
  providers: [CancellationService],
  exports: [CancellationService],
})
export class CancellationModule {}
