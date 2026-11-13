import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  createVoucherSchema,
  listVouchersQuerySchema,
  updateVoucherSchema,
  voucherIdParamSchema,
  type CreateVoucherInput,
  type ListVouchersQuery,
  type PagedDto,
  type UpdateVoucherInput,
  type VoucherDto,
} from "@filmbooking/shared/schemas/admin";
import { CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SupabaseService } from "../../common/supabase/supabase.service";

interface VoucherRow {
  id: string;
  code: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  max_discount: number | null;
  applies_to: "TICKET" | "COMBO" | "ORDER";
  valid_from: string | null;
  valid_to: string | null;
  min_order_amount: number;
  total_uses_limit: number | null;
  per_user_limit: number | null;
  movie_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const VOUCHER_COLUMNS =
  "id, code, discount_type, discount_value, max_discount, applies_to, valid_from, valid_to, min_order_amount, total_uses_limit, per_user_limit, movie_id, active, created_at, updated_at";

@Controller()
export class VouchersController {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  @Roles("ADMIN", "MANAGER")
  @Get("admin/vouchers")
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listVouchersQuerySchema)) query: ListVouchersQuery,
  ): Promise<PagedDto<VoucherDto>> {
    const db = this.supabase.forUser(user.jwt);
    let builder = db.from("vouchers").select(VOUCHER_COLUMNS, { count: "exact" });

    if (query.q) {
      builder = builder.ilike("code", `%${query.q}%`);
    }
    if (query.active !== undefined) {
      builder = builder.eq("active", query.active === "true");
    }

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    const { data, count, error } = await builder.order("created_at", { ascending: false }).range(from, to);

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);

    const items = ((data ?? []) as VoucherRow[]).map(toVoucherDto);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? items.length,
    };
  }

  @Roles("ADMIN", "MANAGER")
  @Get("admin/vouchers/:id")
  async get(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(voucherIdParamSchema)) id: string,
  ): Promise<VoucherDto> {
    const db = this.supabase.forUser(user.jwt);
    const { data, error } = await db.from("vouchers").select(VOUCHER_COLUMNS).eq("id", id).maybeSingle();

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Voucher not found");

    return toVoucherDto(data as VoucherRow);
  }

  @Roles("ADMIN")
  @Post("admin/vouchers")
  @HttpCode(201)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVoucherSchema)) body: CreateVoucherInput,
  ): Promise<VoucherDto> {
    const db = this.supabase.forUser(user.jwt);
    const insertPayload = {
      code: body.code,
      discount_type: body.discountType,
      discount_value: body.discountValue,
      max_discount: body.maxDiscount ?? null,
      applies_to: body.appliesTo,
      valid_from: body.validFrom ?? null,
      valid_to: body.validTo ?? null,
      min_order_amount: body.minOrderAmount,
      total_uses_limit: body.totalUsesLimit ?? null,
      per_user_limit: body.perUserLimit ?? null,
      movie_id: body.movieId ?? null,
      active: body.active,
    };

    const { data, error } = await db.from("vouchers").insert(insertPayload).select(VOUCHER_COLUMNS).single();

    if (error) {
      if (error.code === "23505") {
        throw new AppException(ERROR_CODES.CONFLICT, "Mã voucher đã tồn tại", { field: "code" });
      }
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }

    return toVoucherDto(data as VoucherRow);
  }

  @Roles("ADMIN")
  @Patch("admin/vouchers/:id")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(voucherIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateVoucherSchema)) body: UpdateVoucherInput,
  ): Promise<VoucherDto> {
    return this.saveUpdate(user.jwt, id, body);
  }

  @Roles("ADMIN")
  @Put("admin/vouchers/:id")
  async put(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(voucherIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateVoucherSchema)) body: UpdateVoucherInput,
  ): Promise<VoucherDto> {
    return this.saveUpdate(user.jwt, id, body);
  }

  @Roles("ADMIN")
  @Delete("admin/vouchers/:id")
  async delete(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(voucherIdParamSchema)) id: string,
  ): Promise<{ success: boolean }> {
    const db = this.supabase.forUser(user.jwt);
    const { data, error } = await db.from("vouchers").delete().eq("id", id).select("id").maybeSingle();

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Voucher not found");

    return { success: true };
  }

  private async saveUpdate(jwt: string, id: string, body: UpdateVoucherInput): Promise<VoucherDto> {
    const db = this.supabase.forUser(jwt);
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.code !== undefined) updatePayload.code = body.code;
    if (body.discountType !== undefined) updatePayload.discount_type = body.discountType;
    if (body.discountValue !== undefined) updatePayload.discount_value = body.discountValue;
    if (body.maxDiscount !== undefined) updatePayload.max_discount = body.maxDiscount;
    if (body.appliesTo !== undefined) updatePayload.applies_to = body.appliesTo;
    if (body.validFrom !== undefined) updatePayload.valid_from = body.validFrom;
    if (body.validTo !== undefined) updatePayload.valid_to = body.validTo;
    if (body.minOrderAmount !== undefined) updatePayload.min_order_amount = body.minOrderAmount;
    if (body.totalUsesLimit !== undefined) updatePayload.total_uses_limit = body.totalUsesLimit;
    if (body.perUserLimit !== undefined) updatePayload.per_user_limit = body.perUserLimit;
    if (body.movieId !== undefined) updatePayload.movie_id = body.movieId;
    if (body.active !== undefined) updatePayload.active = body.active;

    const { data, error } = await db
      .from("vouchers")
      .update(updatePayload)
      .eq("id", id)
      .select(VOUCHER_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        throw new AppException(ERROR_CODES.CONFLICT, "Mã voucher đã tồn tại", { field: "code" });
      }
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Voucher not found");

    return toVoucherDto(data as VoucherRow);
  }
}

function toVoucherDto(row: VoucherRow): VoucherDto {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    maxDiscount: row.max_discount,
    appliesTo: row.applies_to,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    minOrderAmount: row.min_order_amount,
    totalUsesLimit: row.total_uses_limit,
    perUserLimit: row.per_user_limit,
    movieId: row.movie_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
