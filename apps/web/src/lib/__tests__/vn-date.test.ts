import { describe, expect, it } from "vitest";
import { getVnDateString, resolveScheduleDate } from "@/lib/vn-date";

// 09:00 VN ngày 15/11/2026
const NOW = new Date("2026-11-15T02:00:00.000Z");

describe("resolveScheduleDate", () => {
  it("thiếu giá trị → hôm nay", () => {
    expect(resolveScheduleDate(undefined, NOW)).toBe("2026-11-15");
    expect(resolveScheduleDate("", NOW)).toBe("2026-11-15");
  });

  it("nhận hôm nay đến hôm nay+6", () => {
    expect(resolveScheduleDate("2026-11-15", NOW)).toBe("2026-11-15");
    expect(resolveScheduleDate("2026-11-21", NOW)).toBe("2026-11-21");
  });

  it("hôm nay+7, ngày đã qua, ngày không tồn tại, rác → hôm nay", () => {
    for (const bad of ["2026-11-22", "2026-11-14", "2026-13-45", "2026-02-30", "abc", "2026-11-16x", "../x"]) {
      expect(resolveScheduleDate(bad, NOW)).toBe("2026-11-15");
    }
  });

  it("tính theo giờ VN sát nửa đêm: 16:59Z còn 15/11, 17:00Z đã sang 16/11", () => {
    const before = new Date("2026-11-15T16:59:00.000Z");
    const after = new Date("2026-11-15T17:00:00.000Z");
    expect(getVnDateString(before)).toBe("2026-11-15");
    expect(getVnDateString(after)).toBe("2026-11-16");
    expect(resolveScheduleDate("2026-11-15", before)).toBe("2026-11-15");
    // Sau nửa đêm VN, ngày 15/11 đã qua → rơi về hôm nay (16/11); +6 = 22/11 là biên mới
    expect(resolveScheduleDate("2026-11-15", after)).toBe("2026-11-16");
    expect(resolveScheduleDate("2026-11-22", after)).toBe("2026-11-22");
  });
});
