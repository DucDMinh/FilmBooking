import { describe, expect, it } from "vitest";

import { buildDirectionsUrl } from "../map-links";

describe("buildDirectionsUrl", () => {
  it("có toạ độ hợp lệ: link chỉ đường Google Maps tới lat,lng", () => {
    const url = buildDirectionsUrl({
      latitude: 21.0362,
      longitude: 105.7831,
      name: "CINEMO Cầu Giấy",
      address: "1 Xuân Thủy, Cầu Giấy, Hà Nội",
    });

    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=21.0362,105.7831");
    expect(url).not.toContain("openstreetmap.org");
  });

  it("thiếu toạ độ (null): link tìm kiếm theo tên + địa chỉ đã encode", () => {
    const url = buildDirectionsUrl({
      latitude: null,
      longitude: null,
      name: "Rạp A & B",
      address: "Số 99 Đường Test, Quận 1",
    });

    expect(url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Rạp A & B Số 99 Đường Test, Quận 1")}`,
    );
    expect(url).not.toContain("openstreetmap.org");
  });

  it("toạ độ NaN coi như thiếu toạ độ", () => {
    const url = buildDirectionsUrl({
      latitude: Number.NaN,
      longitude: 105,
      name: "Rạp",
      address: "Địa chỉ",
    });

    expect(url).toContain("https://www.google.com/maps/search/?api=1&query=");
  });
});
