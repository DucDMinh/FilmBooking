import { Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { AccessService } from "../../../common/auth/access.service";
import type { AuthUser } from "../../../common/auth/decorators";
import type { SupabaseService } from "../../../common/supabase/supabase.service";
import { readNoRefundWarning } from "../booking.helper";
import { BookingService } from "../booking.service";

/** Chuỗi gọi `from("app_settings").select().eq().maybeSingle()` của helper, trả `result` hoặc ném lỗi. */
function settingsDb(result: { data?: unknown; error?: unknown } | Error): SupabaseClient {
  return {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (result instanceof Error) throw result;
            return { data: null, error: null, ...result };
          },
        }),
      }),
    })),
  } as unknown as SupabaseClient;
}

describe("readNoRefundWarning (CR-019, R-106)", () => {
  it("trả đúng nội dung Admin đã lưu, giữ nguyên xuống dòng", async () => {
    const text = "Vé không hoàn.\nKiểm tra kỹ suất chiếu.";
    expect(await readNoRefundWarning(settingsDb({ data: { value: text } }))).toBe(text);
  });

  it("đọc đúng khoá app_settings.no_refund_warning", async () => {
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { value: "x" }, error: null }) }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await readNoRefundWarning({ from } as unknown as SupabaseClient);
    expect(from).toHaveBeenCalledWith("app_settings");
    expect(select).toHaveBeenCalledWith("value");
    expect(eq).toHaveBeenCalledWith("key", "no_refund_warning");
  });

  it.each([
    ["thiếu dòng cấu hình", { data: null }],
    ["giá trị rỗng/chỉ khoảng trắng", { data: { value: "   " } }],
    ["giá trị không phải chuỗi", { data: { value: 15 } }],
  ])("%s -> undefined (web dùng mặc định)", async (_name, result) => {
    expect(await readNoRefundWarning(settingsDb(result))).toBeUndefined();
  });

  it("PostgREST trả lỗi -> undefined và log warn chỉ có thông điệp lỗi", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      expect(await readNoRefundWarning(settingsDb({ data: { value: "Nội dung bí mật" }, error: { message: "boom" } }))).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("boom");
      expect(String(warn.mock.calls[0]?.[0])).not.toContain("Nội dung bí mật");
    } finally {
      warn.mockRestore();
    }
  });

  it("truy vấn ném lỗi -> undefined, log warn, không làm hỏng tóm tắt đơn", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      expect(await readNoRefundWarning(settingsDb(new Error("network")))).toBeUndefined();
      expect(String(warn.mock.calls[0]?.[0])).toContain("network");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("BookingService.getBooking — noRefundWarning (CR-019)", () => {
  const user = { id: "u1", jwt: "jwt" } as unknown as AuthUser;
  const orderRow = {
    id: "o1",
    user_id: "u1",
    status: "holding",
    booking_code: "FB-123456",
    subtotal_amount: 100000,
    discount_amount: 0,
    total_amount: 100000,
    hold_expires_at: new Date(Date.now() + 600000).toISOString(),
    consent_at: null,
    age_confirmed: true,
    cinema_id: "c1",
    cinema_code: "HANOI",
    cinema_name: "CINEMO Hà Nội",
    showtime_id: "st1",
    showtime_starts_at: new Date().toISOString(),
    showtime_ends_at: new Date().toISOString(),
    room_name: "Phòng 1",
    movie_title: "Avatar 3",
  };

  function serviceWithSetting(setting: unknown): BookingService {
    const userDb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => {
            const rows = table === "order_seats" || table === "order_combos" ? [] : undefined;
            const data = table === "orders" ? orderRow : table === "app_settings" ? setting : {};
            return rows
              ? Promise.resolve({ data: rows })
              : { maybeSingle: async () => ({ data, error: null }) };
          },
        }),
      }),
    };
    const supabase = { admin: () => userDb, forUser: () => userDb } as unknown as SupabaseService;
    return new BookingService(supabase, {} as AccessService);
  }

  it("có cấu hình -> summary mang noRefundWarning của Admin", async () => {
    const summary = await serviceWithSetting({ value: "Nội dung Admin" }).getBooking(user, "o1");
    expect(summary.noRefundWarning).toBe("Nội dung Admin");
  });

  it("không có cấu hình -> không có trường noRefundWarning", async () => {
    const summary = await serviceWithSetting(null).getBooking(user, "o1");
    expect(summary).not.toHaveProperty("noRefundWarning");
  });
});
