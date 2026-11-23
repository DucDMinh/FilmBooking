import { describe, expect, it } from "vitest";

import { ERROR_MESSAGES, GENERIC_ERROR_MESSAGE, messageForErrorCode } from "../error-messages";

describe("thông báo lỗi đặt vé riêng cho từng nguyên nhân (CR-017)", () => {
  it("DOB_REQUIRED nêu cần cập nhật ngày sinh trong hồ sơ", () => {
    expect(messageForErrorCode("DOB_REQUIRED")).toContain("ngày sinh");
    expect(messageForErrorCode("DOB_REQUIRED")).toContain("hồ sơ");
  });

  it.each(["DOB_REQUIRED", "SEAT_REQUIRED", "DUPLICATE_SEATS", "INVALID_SEATS", "CONSENT_VERSION_INVALID"] as const)(
    "%s không rơi về thông báo biểu mẫu chung",
    (code) => {
      expect(messageForErrorCode(code)).toBe(ERROR_MESSAGES[code]);
      expect(messageForErrorCode(code)).not.toBe(ERROR_MESSAGES.VALIDATION_ERROR);
      expect(messageForErrorCode(code)).not.toBe(GENERIC_ERROR_MESSAGE);
    },
  );

  it("các thông báo mới khác nhau từng đôi một", () => {
    const codes = ["DOB_REQUIRED", "SEAT_REQUIRED", "DUPLICATE_SEATS", "INVALID_SEATS", "CONSENT_VERSION_INVALID"] as const;
    expect(new Set(codes.map((c) => ERROR_MESSAGES[c])).size).toBe(codes.length);
  });

  it("mã lạ rơi về thông báo chung, không phải 'Dữ liệu chưa hợp lệ'", () => {
    expect(messageForErrorCode("MA_LA")).toBe(GENERIC_ERROR_MESSAGE);
    expect(GENERIC_ERROR_MESSAGE).not.toContain("Dữ liệu chưa hợp lệ");
  });
});
