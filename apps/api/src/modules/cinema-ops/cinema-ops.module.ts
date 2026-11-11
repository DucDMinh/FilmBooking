import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { RoomsController } from "./rooms.controller";
import { SeatLayoutService } from "./seat-layout.service";
import { ShowtimesController } from "./showtimes.controller";
import { ShowtimesService } from "./showtimes.service";

/** Vận hành rạp. SupabaseModule là @Global; AuthModule cấp AccessService. Đăng ký vào AppModule ở layer-4-task-07. */
@Module({
  imports: [AuthModule],
  controllers: [RoomsController, ShowtimesController],
  providers: [SeatLayoutService, ShowtimesService],
})
export class CinemaOpsModule {}
