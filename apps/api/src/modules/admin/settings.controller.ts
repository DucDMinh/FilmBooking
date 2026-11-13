import { Body, Controller, Get, Inject, Param, Patch, Put } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  APP_SETTING_VALUE_SCHEMAS,
  settingKeyParamSchema,
  updateSettingSchema,
  type AppSettingDto,
  type AppSettingKey,
  type UpdateSettingInput,
} from "@filmbooking/shared/schemas/admin";
import { CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SupabaseService } from "../../common/supabase/supabase.service";

interface AppSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

@Controller()
export class SettingsController {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  @Roles("ADMIN", "MANAGER")
  @Get("admin/settings")
  async list(@CurrentUser() user: AuthUser): Promise<AppSettingDto[]> {
    const db = this.supabase.forUser(user.jwt);
    const { data, error } = await db
      .from("app_settings")
      .select("key, value, description, updated_at")
      .order("key");

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);

    return ((data ?? []) as AppSettingRow[]).map(toSettingDto);
  }

  @Roles("ADMIN", "MANAGER")
  @Get("admin/settings/:key")
  async get(
    @CurrentUser() user: AuthUser,
    @Param("key", new ZodValidationPipe(settingKeyParamSchema)) key: AppSettingKey,
  ): Promise<AppSettingDto> {
    const db = this.supabase.forUser(user.jwt);
    const { data, error } = await db
      .from("app_settings")
      .select("key, value, description, updated_at")
      .eq("key", key)
      .maybeSingle();

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Setting not found");

    return toSettingDto(data as AppSettingRow);
  }

  @Roles("ADMIN")
  @Put("admin/settings/:key")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("key", new ZodValidationPipe(settingKeyParamSchema)) key: AppSettingKey,
    @Body(new ZodValidationPipe(updateSettingSchema)) body: UpdateSettingInput,
  ): Promise<AppSettingDto> {
    return this.saveSetting(user.jwt, key, body.value);
  }

  @Roles("ADMIN")
  @Patch("admin/settings/:key")
  async patch(
    @CurrentUser() user: AuthUser,
    @Param("key", new ZodValidationPipe(settingKeyParamSchema)) key: AppSettingKey,
    @Body(new ZodValidationPipe(updateSettingSchema)) body: UpdateSettingInput,
  ): Promise<AppSettingDto> {
    return this.saveSetting(user.jwt, key, body.value);
  }

  private async saveSetting(jwt: string, key: AppSettingKey, rawValue: unknown): Promise<AppSettingDto> {
    const valueSchema = APP_SETTING_VALUE_SCHEMAS[key];
    const parsed = valueSchema.safeParse(rawValue);
    if (!parsed.success) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, `Invalid value for setting: ${key}`, {
        errors: parsed.error.issues,
      });
    }

    const db = this.supabase.forUser(jwt);
    const { data, error } = await db
      .from("app_settings")
      .update({
        value: parsed.data as never,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key)
      .select("key, value, description, updated_at")
      .maybeSingle();

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Setting not found");

    return toSettingDto(data as AppSettingRow);
  }
}

function toSettingDto(row: AppSettingRow): AppSettingDto {
  return {
    key: row.key,
    value: row.value as number | string,
    description: row.description,
    updatedAt: row.updated_at,
  };
}
