import { describe, expect, it } from "vitest";
import { updateOrderCombosSchema } from "../schemas/booking";

describe("updateOrderCombosSchema", () => {
  it("hợp lệ khi truyền mảng combo rỗng (khách không mua combo)", () => {
    const res = updateOrderCombosSchema.safeParse({ items: [] });
    expect(res.success).toBe(true);
  });

  it("hợp lệ với danh sách combo hợp lệ", () => {
    const res = updateOrderCombosSchema.safeParse({
      items: [
        { comboId: "c0000000-0000-0000-0000-000000000001", quantity: 2 },
        { comboId: "c0000000-0000-0000-0000-000000000002", quantity: 1 },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("từ chối khi số lượng âm", () => {
    const res = updateOrderCombosSchema.safeParse({
      items: [{ comboId: "c0000000-0000-0000-0000-000000000001", quantity: -1 }],
    });
    expect(res.success).toBe(false);
  });

  it("từ chối khi số lượng vượt quá 20", () => {
    const res = updateOrderCombosSchema.safeParse({
      items: [{ comboId: "c0000000-0000-0000-0000-000000000001", quantity: 21 }],
    });
    expect(res.success).toBe(false);
  });

  it("từ chối khi comboId không phải UUID hợp lệ", () => {
    const res = updateOrderCombosSchema.safeParse({
      items: [{ comboId: "not-a-uuid", quantity: 1 }],
    });
    expect(res.success).toBe(false);
  });
});
