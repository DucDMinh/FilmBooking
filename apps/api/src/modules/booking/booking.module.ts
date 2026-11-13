import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import { SeatmapService } from "./seatmap.service";

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [BookingController],
  providers: [BookingService, SeatmapService],
  exports: [BookingService, SeatmapService],
})
export class BookingModule {}
