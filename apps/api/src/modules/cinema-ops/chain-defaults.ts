import type { SupabaseClient } from "@supabase/supabase-js";
import { throwDbError } from "./seat-layout.service";

export const FALLBACK_CLEANING_MINUTES = 15;
export const FALLBACK_ONLINE_CUTOFF_MINUTES = 15;

/** Mặc định chuỗi (app_settings) cho dọn phòng / mốc đóng bán online; thiếu thì dùng 15 phút. */
export async function readChainDefaults(db: SupabaseClient): Promise<{ cleaning: number; onlineCutoff: number }> {
  const { data, error } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["default_cleaning_minutes", "default_online_cutoff_minutes"]);
  if (error) throwDbError(error);
  const byKey = new Map<string, unknown>((data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
  const asMinutes = (key: string, fallback: number) => {
    const value = Number(byKey.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    cleaning: asMinutes("default_cleaning_minutes", FALLBACK_CLEANING_MINUTES),
    onlineCutoff: asMinutes("default_online_cutoff_minutes", FALLBACK_ONLINE_CUTOFF_MINUTES),
  };
}

/** R-56/R-67: mốc riêng của rạp, nếu không cấu hình thì mặc định chuỗi. */
export function effectiveOnlineCutoff(cinemaCutoff: number | null | undefined, chainDefault: number): number {
  return cinemaCutoff ?? chainDefault;
}
