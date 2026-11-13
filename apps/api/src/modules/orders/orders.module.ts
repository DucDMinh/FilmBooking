import { Module } from "@nestjs/common";
import { AuthModule } from "../../common/auth/auth.module";
import { AdminOrdersController, OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuthModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
