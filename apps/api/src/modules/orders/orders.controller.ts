import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  listNeedsManualReviewQuerySchema,
  resolveManualReviewSchema,
  searchOrdersQuerySchema,
  uuidSchema,
  type ListNeedsManualReviewQuery,
  type ResolveManualReviewInput,
  type SearchOrdersQuery,
} from "@filmbooking/shared/schemas/orders";
import { CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { OrdersService } from "./orders.service";

const uuidParam = new ZodValidationPipe(uuidSchema);

/**
 * Controller tra cứu và xử lý đơn hàng (R-103, R-104)
 * Staff/Manager xem rạp mình; Admin toàn chuỗi.
 */
@Controller("orders")
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Roles("STAFF", "MANAGER")
  @Get()
  search(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(searchOrdersQuerySchema)) query: SearchOrdersQuery,
  ) {
    return this.ordersService.searchOrders(user, query);
  }

  @Roles("STAFF", "MANAGER")
  @Get("needs-manual-review")
  listNeedsManualReview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listNeedsManualReviewQuerySchema)) query: ListNeedsManualReviewQuery,
  ) {
    return this.ordersService.listNeedsManualReview(user, query);
  }

  @Roles("STAFF", "MANAGER")
  @Get(":id")
  getDetail(@CurrentUser() user: AuthUser, @Param("id", uuidParam) id: string) {
    return this.ordersService.getOrderDetail(user, id);
  }

  @Roles("MANAGER")
  @Post(":id/resolve-manual-review")
  resolveManualReview(
    @CurrentUser() user: AuthUser,
    @Param("id", uuidParam) id: string,
    @Body(new ZodValidationPipe(resolveManualReviewSchema)) body: ResolveManualReviewInput,
  ) {
    return this.ordersService.resolveManualReview(user, id, body);
  }
}

/**
 * Controller alias /admin/orders và /admin/todo (D5)
 */
@Controller("admin")
export class AdminOrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Roles("STAFF", "MANAGER")
  @Get("todo")
  getTodo(@CurrentUser() user: AuthUser) {
    return this.ordersService.getAdminTodo(user);
  }

  @Roles("STAFF", "MANAGER")
  @Get("orders")
  search(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(searchOrdersQuerySchema)) query: SearchOrdersQuery,
  ) {
    return this.ordersService.searchOrders(user, query);
  }

  @Roles("STAFF", "MANAGER")
  @Get("orders/needs-manual-review")
  listNeedsManualReview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listNeedsManualReviewQuerySchema)) query: ListNeedsManualReviewQuery,
  ) {
    return this.ordersService.listNeedsManualReview(user, query);
  }

  @Roles("STAFF", "MANAGER")
  @Get("orders/:id")
  getDetail(@CurrentUser() user: AuthUser, @Param("id", uuidParam) id: string) {
    return this.ordersService.getOrderDetail(user, id);
  }

  @Roles("MANAGER")
  @Post("orders/:id/resolve-manual-review")
  resolveManualReview(
    @CurrentUser() user: AuthUser,
    @Param("id", uuidParam) id: string,
    @Body(new ZodValidationPipe(resolveManualReviewSchema)) body: ResolveManualReviewInput,
  ) {
    return this.ordersService.resolveManualReview(user, id, body);
  }
}
