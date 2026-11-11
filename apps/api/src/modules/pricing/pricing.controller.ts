import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  type PipeTransform,
} from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  createHolidaySchema,
  createPriceRuleSchema,
  holidayDateSchema,
  listPriceRulesQuerySchema,
  quoteSeatsBodySchema,
  updatePriceRuleSchema,
  type CreateHolidayInput,
  type CreatePriceRuleInput,
  type ListPriceRulesQuery,
  type QuoteSeatsBody,
  type UpdatePriceRuleInput,
} from "@filmbooking/shared/schemas/pricing";
import type { z } from "zod";
import type { AuthenticatedRequest } from "../../common/auth/access.service";
import { CurrentUser, Public, Roles, type AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PricingService } from "./pricing.service";

/**
 * Pipe validate schema cho pricing:
 * Khi giá (amount) âm hoặc không nguyên -> trả status 422 với code VALIDATION_ERROR (AC: "Giá âm/không nguyên -> 422").
 */
export class Unprocessable422Pipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));

    const isPriceAmountError = result.error.issues.some(
      (issue) =>
        issue.path.includes("amount") ||
        issue.message.toLowerCase().includes("amount") ||
        issue.message.toLowerCase().includes("integer"),
    );

    if (isPriceAmountError) {
      throw new HttpException(
        {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Validation failed: amount must be a non-negative integer",
            details: { issues },
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Validation failed", { issues });
  }
}

@Controller()
export class PricingController {
  constructor(@Inject(PricingService) private readonly pricingService: PricingService) {}

  // ── Holidays ──────────────────────────────────────────────────────────────
  @Public()
  @Get("holidays")
  listHolidays() {
    return this.pricingService.listHolidays();
  }

  @Roles("ADMIN")
  @Post("holidays")
  createHoliday(@Body(new ZodValidationPipe(createHolidaySchema)) body: CreateHolidayInput) {
    return this.pricingService.createHoliday(body);
  }

  @Roles("ADMIN")
  @Delete("holidays/:date")
  deleteHoliday(@Param("date", new ZodValidationPipe(holidayDateSchema)) date: string) {
    return this.pricingService.deleteHoliday(date);
  }

  // ── Price Rules ───────────────────────────────────────────────────────────
  @Roles("STAFF")
  @Get("price-rules")
  listPriceRules(@Query(new ZodValidationPipe(listPriceRulesQuerySchema)) query: ListPriceRulesQuery) {
    return this.pricingService.listPriceRules(query);
  }

  @Roles("MANAGER")
  @Post("price-rules")
  createPriceRule(
    @CurrentUser() user: AuthUser,
    @Req() req: AuthenticatedRequest,
    @Body(new Unprocessable422Pipe(createPriceRuleSchema)) body: CreatePriceRuleInput,
  ) {
    return this.pricingService.createPriceRule(user, req, body);
  }

  @Roles("MANAGER")
  @Patch("price-rules/:id")
  updatePriceRule(
    @CurrentUser() user: AuthUser,
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new Unprocessable422Pipe(updatePriceRuleSchema)) body: UpdatePriceRuleInput,
  ) {
    return this.pricingService.updatePriceRule(user, req, id, body);
  }

  @Roles("MANAGER")
  @Delete("price-rules/:id")
  deletePriceRule(
    @CurrentUser() user: AuthUser,
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.pricingService.deletePriceRule(user, req, id);
  }

  // ── Showtime Prices (AC-15) & Seat Quote ───────────────────────────────────
  @Public()
  @Get("showtimes/:showtimeId/prices")
  getShowtimePrices(@Param("showtimeId") showtimeId: string) {
    return this.pricingService.getShowtimePrices(showtimeId);
  }

  @Public()
  @Post("showtimes/:showtimeId/price-quote")
  @HttpCode(HttpStatus.OK)
  quoteSeats(
    @Param("showtimeId") showtimeId: string,
    @Body(new ZodValidationPipe(quoteSeatsBodySchema)) body: QuoteSeatsBody,
  ) {
    return this.pricingService.quoteSeats(showtimeId, body.seatIds);
  }
}
