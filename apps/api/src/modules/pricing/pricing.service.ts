import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES, toVnParts } from "@filmbooking/shared";
import {
  SEAT_PRICING_TYPES,
  type CreateHolidayInput,
  type CreatePriceRuleInput,
  type HolidayDto,
  type ListPriceRulesQuery,
  type PriceDayType,
  type PriceRuleDto,
  type PriceTimeBand,
  type SeatPricingType,
  type SeatQuoteItemDto,
  type ShowtimePricesDto,
  type UpdatePriceRuleInput,
} from "@filmbooking/shared/schemas/pricing";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";

interface PriceRuleDbRow {
  id: string;
  scope: "CHAIN" | "CINEMA" | "SHOWTIME";
  cinema_id: string | null;
  showtime_id: string | null;
  seat_type: SeatPricingType;
  format: "2D" | "3D" | null;
  day_type: PriceDayType | null;
  time_band: PriceTimeBand | null;
  amount: number;
  created_at: string;
  updated_at: string;
}

interface HolidayDbRow {
  holiday_date: string;
  name: string;
  created_at: string;
}

interface ShowtimeDbRow {
  id: string;
  cinema_id: string;
  room_id: string;
  format: "2D" | "3D";
  starts_at: string;
}

function mapPriceRuleDto(row: PriceRuleDbRow): PriceRuleDto {
  return {
    id: row.id,
    scope: row.scope,
    cinemaId: row.cinema_id,
    showtimeId: row.showtime_id,
    seatType: row.seat_type,
    format: row.format,
    dayType: row.day_type,
    timeBand: row.time_band,
    amount: row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PricingService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  // ── Holidays ──────────────────────────────────────────────────────────────
  async listHolidays(): Promise<HolidayDto[]> {
    const { data, error } = await this.supabase
      .admin()
      .from("holidays")
      .select("holiday_date, name, created_at")
      .order("holiday_date", { ascending: true });

    if (error) throw error;
    return (data as HolidayDbRow[]).map((r) => ({
      holidayDate: r.holiday_date,
      name: r.name,
      createdAt: r.created_at,
    }));
  }

  async createHoliday(input: CreateHolidayInput): Promise<HolidayDto> {
    const { data, error } = await this.supabase
      .admin()
      .from("holidays")
      .insert({ holiday_date: input.holidayDate, name: input.name })
      .select("holiday_date, name, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AppException(ERROR_CODES.CONFLICT, "Ngày lễ đã tồn tại");
      }
      throw error;
    }

    const row = data as HolidayDbRow;
    return {
      holidayDate: row.holiday_date,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  async deleteHoliday(date: string): Promise<{ success: true }> {
    const { data, error } = await this.supabase
      .admin()
      .from("holidays")
      .delete()
      .eq("holiday_date", date)
      .select("holiday_date");

    if (error) throw error;
    if (!data || (data as unknown[]).length === 0) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy ngày lễ");
    }

    return { success: true };
  }

  // ── Price Rules ───────────────────────────────────────────────────────────
  async listPriceRules(query: ListPriceRulesQuery): Promise<PriceRuleDto[]> {
    let q = this.supabase
      .admin()
      .from("price_rules")
      .select("id, scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount, created_at, updated_at");

    if (query.scope) q = q.eq("scope", query.scope);
    if (query.cinemaId) q = q.eq("cinema_id", query.cinemaId);
    if (query.showtimeId) q = q.eq("showtime_id", query.showtimeId);

    const { data, error } = await q;
    if (error) throw error;
    return (data as PriceRuleDbRow[]).map(mapPriceRuleDto);
  }

  async createPriceRule(
    user: AuthUser,
    req: AuthenticatedRequest,
    input: CreatePriceRuleInput,
  ): Promise<PriceRuleDto> {
    const access = await this.access.loadForRequest(req);
    let targetCinemaId: string | null = null;

    if (input.scope === "CHAIN") {
      if (!access.isAdmin) {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Chỉ Admin mới có quyền tạo bảng giá chuỗi");
      }
    } else if (input.scope === "CINEMA") {
      targetCinemaId = input.cinemaId ?? null;
      if (!targetCinemaId) {
        throw new AppException(ERROR_CODES.VALIDATION_ERROR, "cinemaId is required for CINEMA scope");
      }
      const isManager = access.cinemaRoles.get(targetCinemaId) === "MANAGER";
      if (!access.isAdmin && !isManager) {
        throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "Không có quyền tạo bảng giá cho rạp này");
      }
    } else if (input.scope === "SHOWTIME") {
      const showtimeId = input.showtimeId;
      if (!showtimeId) {
        throw new AppException(ERROR_CODES.VALIDATION_ERROR, "showtimeId is required for SHOWTIME scope");
      }
      const { data: st, error: stErr } = await this.supabase
        .admin()
        .from("showtimes")
        .select("id, cinema_id")
        .eq("id", showtimeId)
        .single();

      if (stErr || !st) {
        throw new AppException(ERROR_CODES.NOT_FOUND, "Suất chiếu không tồn tại");
      }
      targetCinemaId = (st as { cinema_id: string }).cinema_id;
      const isManager = access.cinemaRoles.get(targetCinemaId) === "MANAGER";
      if (!access.isAdmin && !isManager) {
        throw new AppException(
          ERROR_CODES.FORBIDDEN_CINEMA,
          "Không có quyền tạo bảng giá cho suất chiếu của rạp này",
        );
      }
    }

    const insertPayload = {
      scope: input.scope,
      cinema_id: input.scope === "CHAIN" ? null : targetCinemaId,
      showtime_id: input.scope === "SHOWTIME" ? input.showtimeId : null,
      seat_type: input.seatType,
      format: input.scope === "SHOWTIME" ? null : input.format,
      day_type: input.scope === "SHOWTIME" ? null : input.dayType,
      time_band: input.scope === "SHOWTIME" ? null : input.timeBand,
      amount: input.amount,
    };

    const { data, error } = await this.supabase
      .admin()
      .from("price_rules")
      .insert(insertPayload)
      .select("id, scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount, created_at, updated_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AppException(ERROR_CODES.CONFLICT, "Quy tắc giá đã tồn tại");
      }
      throw error;
    }

    return mapPriceRuleDto(data as PriceRuleDbRow);
  }

  async updatePriceRule(
    user: AuthUser,
    req: AuthenticatedRequest,
    id: string,
    input: UpdatePriceRuleInput,
  ): Promise<PriceRuleDto> {
    const access = await this.access.loadForRequest(req);

    const { data: current, error: findErr } = await this.supabase
      .admin()
      .from("price_rules")
      .select("id, scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount, created_at, updated_at")
      .eq("id", id)
      .single();

    if (findErr || !current) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy quy tắc giá");
    }

    const rule = current as PriceRuleDbRow;
    this.assertRuleMutationAccess(access, rule);

    const { data: updated, error: updErr } = await this.supabase
      .admin()
      .from("price_rules")
      .update({ amount: input.amount, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount, created_at, updated_at")
      .single();

    if (updErr) throw updErr;
    return mapPriceRuleDto(updated as PriceRuleDbRow);
  }

  async deletePriceRule(
    user: AuthUser,
    req: AuthenticatedRequest,
    id: string,
  ): Promise<{ success: true }> {
    const access = await this.access.loadForRequest(req);

    const { data: current, error: findErr } = await this.supabase
      .admin()
      .from("price_rules")
      .select("id, scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount, created_at, updated_at")
      .eq("id", id)
      .single();

    if (findErr || !current) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy quy tắc giá");
    }

    const rule = current as PriceRuleDbRow;
    this.assertRuleMutationAccess(access, rule);

    const { error: delErr } = await this.supabase
      .admin()
      .from("price_rules")
      .delete()
      .eq("id", id);

    if (delErr) throw delErr;
    return { success: true };
  }

  private assertRuleMutationAccess(
    access: { isAdmin: boolean; cinemaRoles: ReadonlyMap<string, string> },
    rule: PriceRuleDbRow,
  ): void {
    if (access.isAdmin) return;

    if (rule.scope === "CHAIN") {
      throw new AppException(
        ERROR_CODES.FORBIDDEN,
        "Chỉ Admin mới có quyền thao tác bảng giá chuỗi",
      );
    }

    const cinemaId = rule.cinema_id;
    const isManager = cinemaId ? access.cinemaRoles.get(cinemaId) === "MANAGER" : false;
    if (!isManager) {
      throw new AppException(
        ERROR_CODES.FORBIDDEN_CINEMA,
        "Không có quyền thao tác quy tắc giá của rạp này",
      );
    }
  }

  // ── Showtime Prices Calculation (AC-15) ───────────────────────────────────
  async getShowtimePrices(showtimeId: string): Promise<ShowtimePricesDto> {
    const { data: stData, error: stErr } = await this.supabase
      .admin()
      .from("showtimes")
      .select("id, cinema_id, room_id, format, starts_at")
      .eq("id", showtimeId)
      .single();

    if (stErr || !stData) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Suất chiếu không tồn tại");
    }

    const st = stData as ShowtimeDbRow;
    const { dayType, timeBand } = await this.resolveDayTypeAndTimeBand(st.starts_at);

    const [stRulesRes, cinRulesRes, chainRulesRes] = await Promise.all([
      this.supabase
        .admin()
        .from("price_rules")
        .select("seat_type, amount")
        .eq("scope", "SHOWTIME")
        .eq("showtime_id", showtimeId),
      this.supabase
        .admin()
        .from("price_rules")
        .select("seat_type, amount")
        .eq("scope", "CINEMA")
        .eq("cinema_id", st.cinema_id)
        .eq("format", st.format)
        .eq("day_type", dayType)
        .eq("time_band", timeBand),
      this.supabase
        .admin()
        .from("price_rules")
        .select("seat_type, amount")
        .eq("scope", "CHAIN")
        .eq("format", st.format)
        .eq("day_type", dayType)
        .eq("time_band", timeBand),
    ]);

    const stRules = (stRulesRes.data ?? []) as Array<{ seat_type: SeatPricingType; amount: number }>;
    const cinRules = (cinRulesRes.data ?? []) as Array<{ seat_type: SeatPricingType; amount: number }>;
    const chainRules = (chainRulesRes.data ?? []) as Array<{ seat_type: SeatPricingType; amount: number }>;

    // Ưu tiên: SHOWTIME > CINEMA > CHAIN
    const prices = SEAT_PRICING_TYPES.map((seatType) => {
      const fromSt = stRules.find((r) => r.seat_type === seatType);
      if (fromSt) return { seatType, amount: Number(fromSt.amount) };

      const fromCin = cinRules.find((r) => r.seat_type === seatType);
      if (fromCin) return { seatType, amount: Number(fromCin.amount) };

      const fromChain = chainRules.find((r) => r.seat_type === seatType);
      if (fromChain) return { seatType, amount: Number(fromChain.amount) };

      return { seatType, amount: null };
    });

    const bySeatType = Object.fromEntries(
      prices.map((p) => [p.seatType, p.amount]),
    ) as Record<SeatPricingType, number | null>;

    return {
      showtimeId: st.id,
      cinemaId: st.cinema_id,
      format: st.format,
      dayType,
      timeBand,
      prices,
      bySeatType,
    };
  }

  async quoteSeats(showtimeId: string, seatIds: string[]): Promise<SeatQuoteItemDto[]> {
    const { data, error } = await this.supabase
      .admin()
      .rpc("price_quote", {
        p_showtime_id: showtimeId,
        p_seat_ids: seatIds,
      });

    if (error) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, error.message);
    }

    return ((data ?? []) as Array<{
      seat_id: string;
      seat_type: SeatPricingType;
      seat_count: number;
      amount: number;
    }>).map((r) => ({
      seatId: r.seat_id,
      seatType: r.seat_type,
      seatCount: r.seat_count,
      amount: r.amount,
    }));
  }

  private async resolveDayTypeAndTimeBand(
    startsAtUtc: string,
  ): Promise<{ dayType: PriceDayType; timeBand: PriceTimeBand }> {
    const startsInstant = new Date(startsAtUtc);
    const parts = toVnParts(startsInstant);
    const pad = (n: number) => String(n).padStart(2, "0");
    const vnDateStr = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;

    const { data: hol } = await this.supabase
      .admin()
      .from("holidays")
      .select("holiday_date")
      .eq("holiday_date", vnDateStr)
      .maybeSingle();

    let dayType: PriceDayType;
    if (hol) {
      dayType = "HOLIDAY";
    } else if (parts.weekday === 0 || parts.weekday === 6) {
      dayType = "WEEKEND";
    } else {
      dayType = "NORMAL";
    }

    const timeBand: PriceTimeBand = parts.hour >= 17 ? "AFTER_17" : "BEFORE_17";
    return { dayType, timeBand };
  }
}
