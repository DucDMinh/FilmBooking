import { ERROR_CODES } from "@filmbooking/shared";
import { describe, expect, it, vi } from "vitest";
import { AppException } from "../../../common/errors/app-exception";
import type { AccessService } from "../../../common/auth/access.service";
import type { AuthUser } from "../../../common/auth/decorators";
import type { SupabaseService } from "../../../common/supabase/supabase.service";
import { buildBookingSummary } from "../booking.helper";
import { BookingService } from "../booking.service";

describe("BookingService — Combos bắp nước (CR-018)", () => {
  const user = { id: "u1", jwt: "jwt" } as unknown as AuthUser;
  const orderRow = {
    id: "o1",
    user_id: "u1",
    status: "holding",
    booking_code: "FB-123456",
    subtotal_amount: 199000,
    discount_amount: 0,
    total_amount: 199000,
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

  it("getCombos: trả về danh sách combo đang hoạt động", async () => {
    const mockCombos = [
      {
        id: "combo-1",
        name: "Combo Solo",
        description: "1 bắp + 1 nước",
        price_amount: 69000,
        image_url: "/solo.png",
        is_active: true,
        display_order: 1,
      },
    ];

    const userDb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: mockCombos, error: null })),
          })),
        })),
      })),
    };

    const supabase = {
      admin: () => userDb,
      forUser: () => userDb,
    } as unknown as SupabaseService;

    const service = new BookingService(supabase, {} as AccessService);
    const combos = await service.getCombos();

    expect(combos).toHaveLength(1);
    expect(combos[0]).toEqual({
      id: "combo-1",
      name: "Combo Solo",
      description: "1 bắp + 1 nước",
      priceAmount: 69000,
      imageUrl: "/solo.png",
      isActive: true,
      displayOrder: 1,
    });
  });

  it("updateCombos: gọi RPC sync_order_combos và trả về summary", async () => {
    const mockRpc = vi.fn(async () => ({ data: { ok: true }, error: null }));

    const userDb = {
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: async () => ({ data: orderRow }),
              })),
            })),
          };
        }
        if (table === "order_seats") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ seat_id: "s1", seat_label: "A1", seat_type: "NORMAL", price_amount: 100000 }],
              })),
            })),
          };
        }
        if (table === "order_combos") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [
                  {
                    id: "oc-1",
                    combo_id: "combo-1",
                    combo_name: "Combo Solo",
                    quantity: 1,
                    unit_price: 69000,
                    total_price: 69000,
                  },
                ],
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: async () => ({ data: {} }),
            })),
          })),
        };
      }),
      rpc: mockRpc,
    };

    const supabase = {
      admin: () => userDb,
      forUser: () => userDb,
    } as unknown as SupabaseService;

    const service = new BookingService(supabase, {} as AccessService);
    const summary = await service.updateCombos(user, "o1", {
      items: [{ comboId: "combo-1", quantity: 1 }],
    });

    expect(mockRpc).toHaveBeenCalledWith("sync_order_combos", {
      p_order_id: "o1",
      p_items: [{ combo_id: "combo-1", quantity: 1 }],
    });
    expect(summary.combos).toHaveLength(1);
    expect(summary.combos?.[0]?.name).toBe("Combo Solo");
    expect(summary.pricing.combosTotal).toBe(69000);
  });

  it("updateCombos: báo lỗi khi đơn không còn giữ chỗ (ORDER_NOT_HOLDING)", async () => {
    const userDb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: orderRow }),
          }),
        }),
      }),
      rpc: vi.fn(async () => ({ data: null, error: { message: "ORDER_NOT_HOLDING" } })),
    };

    const supabase = {
      admin: () => userDb,
      forUser: () => userDb,
    } as unknown as SupabaseService;

    const service = new BookingService(supabase, {} as AccessService);

    const err = await service
      .updateCombos(user, "o1", { items: [{ comboId: "c1", quantity: 1 }] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe(ERROR_CODES.HOLD_EXPIRED);
  });

  it("buildBookingSummary: tính tổng tiền combos và map vào summary", () => {
    const summary = buildBookingSummary({
      order: orderRow,
      cinema: { address: "123 Phố Huế", district: "Hai Bà Trưng" },
      showtime: { format: "2D", movies: { age_rating: "P", poster_url: "/p.png" } },
      seats: [{ seat_id: "s1", seat_label: "A1", seat_type: "NORMAL", price_amount: 100000 }],
      combos: [
        {
          id: "oc-1",
          combo_id: "c-1",
          combo_name: "Combo Solo",
          quantity: 2,
          unit_price: 69000,
          total_price: 138000,
        },
      ],
      voucher: null,
    });

    expect(summary.combos).toHaveLength(1);
    expect(summary.combos?.[0]?.quantity).toBe(2);
    expect(summary.pricing.combosTotal).toBe(138000);
    expect(summary.pricing.subtotal).toBe(199000);
  });

  it("buildBookingSummary: nhiều combo + voucher — subtotal/discount/total lấy từ server, combosTotal = tổng các dòng", () => {
    const summary = buildBookingSummary({
      order: { ...orderRow, subtotal_amount: 337000, discount_amount: 10000, total_amount: 327000 },
      cinema: { address: "123 Phố Huế", district: null },
      showtime: { format: "2D", movies: null },
      seats: [{ seat_id: "s1", seat_label: "A1", seat_type: "NORMAL", price_amount: 100000 }],
      combos: [
        { id: "oc-1", combo_id: "c-1", combo_name: "Combo Solo", quantity: 2, unit_price: 69000, total_price: 138000 },
        { id: "oc-2", combo_id: "c-2", combo_name: "Combo Đôi", quantity: 1, unit_price: 99000, total_price: 99000 },
      ],
      voucher: { code: "SALE10K", discount: 10000 },
    });

    expect(summary.combos?.map((c) => `${c.name} × ${c.quantity}`)).toEqual(["Combo Solo × 2", "Combo Đôi × 1"]);
    expect(summary.pricing).toEqual({ subtotal: 337000, combosTotal: 237000, discount: 10000, total: 327000 });
    expect(summary.voucher).toEqual({ code: "SALE10K", discount: 10000 });
  });

  it("buildBookingSummary: đơn không combo — combos rỗng, combosTotal 0, subtotal chỉ là tiền ghế", () => {
    const summary = buildBookingSummary({
      order: { ...orderRow, subtotal_amount: 100000, total_amount: 100000 },
      cinema: null,
      showtime: null,
      seats: [{ seat_id: "s1", seat_label: "A1", seat_type: "NORMAL", price_amount: 100000 }],
      combos: [],
      voucher: null,
    });

    expect(summary.combos).toEqual([]);
    expect(summary.pricing.combosTotal).toBe(0);
    expect(summary.pricing.subtotal).toBe(100000);
  });
});
