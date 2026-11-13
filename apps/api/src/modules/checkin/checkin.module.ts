import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { CheckinController } from "./checkin.controller";
import { CheckinService } from "./checkin.service";

/** Soát vé. SupabaseModule là @Global; AuthModule cấp AccessService. Đăng ký vào AppModule ở layer-6-task-01. */
@Module({
  imports: [AuthModule],
  controllers: [CheckinController],
  providers: [CheckinService],
})
export class CheckinModule {}
