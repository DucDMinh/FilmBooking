import { Module } from "@nestjs/common";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

/** SupabaseModule và ENV là global; AuthGuard gắn global ở task wiring. */
@Module({
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
