import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";

/**
 * Module quản lý bảng giá hai cấp + ngày lễ + báo giá (R-52, R-53, R-57, R-72, AC-15).
 * SupabaseModule là @Global; AuthModule cấp AccessService.
 * Đăng ký vào AppModule ở layer-5-task-09.
 */
@Module({
  imports: [AuthModule],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
