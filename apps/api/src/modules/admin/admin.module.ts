import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { AuditController } from "./audit.controller";
import { SettingsController } from "./settings.controller";
import { UsersController } from "./users.controller";
import { VouchersController } from "./vouchers.controller";

@Module({
  imports: [AuthModule],
  controllers: [UsersController, SettingsController, AuditController, VouchersController],
})
export class AdminModule {}
