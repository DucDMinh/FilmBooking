import type { SupabaseClient } from "@supabase/supabase-js";
import type { createFactories, TestShowtime } from "./factories";

/** Giá mỗi ghế NORMAL của suất test (giá cấp SHOWTIME: ưu tiên cao nhất, không đụng bảng giá chuỗi dùng chung). */
const TEST_SEAT_PRICE = 80_000;

/**
 * Suất ON_SALE + giá ghế NORMAL (hold_seats báo P0002 nếu suất chưa có giá).
 * Mặc định lưới `rows x 2`: hàng <= 2 ghế không bao giờ vi phạm quy tắc ghế lẻ (ORPHAN_SEAT), nên tranh chấp ngẫu nhiên
 * chỉ có thể bị từ chối vì SEAT_TAKEN. Tối đa 26 hàng (nhãn A..Z).
 */
export async function createPricedShowtime(
  admin: SupabaseClient,
  factories: ReturnType<typeof createFactories>,
  options: { rows: number; cols?: number; startsInHours?: number },
): Promise<TestShowtime> {
  const showtime = await factories.createShowtime({ rows: options.rows, cols: options.cols ?? 2, startsInHours: options.startsInHours });
  const { error } = await admin
    .from("price_rules")
    .insert({ scope: "SHOWTIME", showtime_id: showtime.id, seat_type: "NORMAL", amount: TEST_SEAT_PRICE });
  if (error) throw new Error(`tạo giá suất thất bại: ${error.message}`);
  return showtime;
}
