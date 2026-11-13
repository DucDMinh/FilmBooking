import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { AdminReportController, ReportController, ReportService } from "./report.controller";

@Module({
  imports: [AuthModule],
  controllers: [ReportController, AdminReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
