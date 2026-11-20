import { describe, expect, it } from "vitest";
import {
  REFUND_METHODS,
  REFUND_METHOD_LABEL,
  recordRefundSchema,
  vnTodayIsoDate,
} from "../schemas/cancellation";

const VALID = {
  refundedAmount: 150000,
  refundReference: "VCB-0001",
  refundMethod: "BANK_TRANSFER",
  refundedAt: "2026-11-14",
} as const;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("recordRefundSchema (R-110: số tiền, ngày, phương thức, mã GD bắt buộc)", () => {
  it("chấp nhận đủ trường", () => {
    expect(recordRefundSchema.safeParse(VALID).success).toBe(true);
  });

  it("thiếu refundMethod -> lỗi tại path refundMethod", () => {
    const rest: Record<string, unknown> = { ...VALID };
    delete rest.refundMethod;
    const result = recordRefundSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "refundMethod")).toBe(true);
  });

  it("refundMethod ngoài enum -> lỗi", () => {
    expect(recordRefundSchema.safeParse({ ...VALID, refundMethod: "PAYPAL" }).success).toBe(false);
  });

  it("chấp nhận cả 4 phương thức, mỗi phương thức có nhãn tiếng Việt", () => {
    expect([...REFUND_METHODS]).toEqual(["BANK_TRANSFER", "E_WALLET", "CASH", "OTHER"]);
    for (const method of REFUND_METHODS) {
      expect(recordRefundSchema.safeParse({ ...VALID, refundMethod: method }).success).toBe(true);
      expect(REFUND_METHOD_LABEL[method].length).toBeGreaterThan(0);
    }
    expect(REFUND_METHOD_LABEL.BANK_TRANSFER).toBe("Chuyển khoản ngân hàng");
  });

  it("thiếu refundedAt -> lỗi tại path refundedAt", () => {
    const rest: Record<string, unknown> = { ...VALID };
    delete rest.refundedAt;
    const result = recordRefundSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "refundedAt")).toBe(true);
  });

  it("refundedAt sai định dạng hoặc ngày không có thật -> lỗi", () => {
    for (const refundedAt of ["14/11/2026", "2026-13-01", "2026-02-30", "", "hôm nay"]) {
      expect(recordRefundSchema.safeParse({ ...VALID, refundedAt }).success).toBe(false);
    }
  });

  it("refundedAt hôm nay (giờ VN) hợp lệ, ngày mai (tương lai) bị từ chối", () => {
    const today = vnTodayIsoDate();
    expect(recordRefundSchema.safeParse({ ...VALID, refundedAt: today }).success).toBe(true);
    const future = recordRefundSchema.safeParse({ ...VALID, refundedAt: addDays(today, 1) });
    expect(future.success).toBe(false);
    expect(future.error?.issues.some((i) => i.path[0] === "refundedAt")).toBe(true);
  });

  it("vẫn bắt buộc số tiền + mã giao dịch", () => {
    expect(recordRefundSchema.safeParse({ ...VALID, refundedAmount: 0 }).success).toBe(false);
    expect(recordRefundSchema.safeParse({ ...VALID, refundReference: "   " }).success).toBe(false);
  });
});
