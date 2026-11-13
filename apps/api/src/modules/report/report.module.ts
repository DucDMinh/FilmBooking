import { Module } from "@nestjs/common";
import { AdminReportController, ReportController, ReportService } from "./report.controller";

@Module({
  controllers: [ReportController, AdminReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
