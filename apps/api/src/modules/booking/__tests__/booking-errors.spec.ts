import { ERROR_CODES, ERROR_HTTP_STATUS, type ErrorCode } from "@filmbooking/shared";
import { describe, expect, it, vi } from "vitest";
import { AppException } from "../../../common/errors/app-exception";
import type { SupabaseService } from "../../../common/supabase/supabase.service";
import type { AccessService } from "../../../common/auth/access.service";
import type { AuthUser } from "../../../common/auth/decorators";
import { handleHoldError, handleVoucherBusinessError } from "../booking.helper";
import { BookingService } from "../booking.service";

function catchAppException(fn: () => unknown): AppException {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return error as AppException;
  }
  throw new Error("Hàm không ném lỗi");
}

describe("handleHoldError: lỗi nghiệp vụ hold_seats có mã riêng (CR-017)", () => {
  const cases: Array<[string, ErrorCode, number]> = [
    ["DOB_REQUIRED: Vui lòng cập nhật ngày sinh trong hồ sơ trước khi đặt vé phim T18", "DOB_REQUIRED", 422],
    ["SEAT_REQUIRED: Chưa chọn ghế", "SEAT_REQUIRED", 422],
    ["DUPLICATE_SEATS: Danh sách ghế bị trùng", "DUPLICATE_SEATS", 422],
    ["INVALID_SEATS: Có ghế không thuộc phòng chiếu của suất này", "INVALID_SEATS", 422],
    ["INVALID_SEATS: Không thể chọn lối đi hoặc ghế hỏng", "INVALID_SEATS", 422],
  ];

  it.each(cases)("%s -> %s", (message, code, status) => {
    const err = catchAppException(() => handleHoldError({ message }));
    expect(err.code).toBe(code);
    expect(err.code).not.toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(err.getStatus()).toBe(status);
  });
});

describe("handleVoucherBusinessError", () => {
  it("VOUCHER_NOT_APPLICABLE_CINEMA -> mã riêng", () => {
    const err = catchAppException(() => handleVoucherBusinessError("VOUCHER_NOT_APPLICABLE_CINEMA"));
    expect(err.code).toBe(ERROR_CODES.VOUCHER_NOT_APPLICABLE_CINEMA);
  });

  it.each(["MA_LA_CHUA_BIET", undefined])("mã lạ %s -> INTERNAL_ERROR, không lộ mã nội bộ, không VALIDATION_ERROR", (code) => {
    const err = catchAppException(() => handleVoucherBusinessError(code));
    expect(err.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(JSON.stringify(err.getResponse())).not.toContain("MA_LA_CHUA_BIET");
  });
});

describe("catalog mã lỗi mới", () => {
  it("HTTP status đúng", () => {
    expect(ERROR_HTTP_STATUS.CONSENT_VERSION_INVALID).toBe(409);
    for (const code of ["DOB_REQUIRED", "SEAT_REQUIRED", "DUPLICATE_SEATS", "INVALID_SEATS"] as const) {
      expect(ERROR_HTTP_STATUS[code]).toBe(422);
    }
  });
});

describe("BookingService", () => {
  const user = { id: "u1", jwt: "jwt" } as unknown as AuthUser;
  const orderRow = { id: "o1", user_id: "u1", status: "holding", hold_expires_at: null };

  function makeService(rpcResult?: { data: unknown; error: { message: string; code?: string } | null }) {
    const userDb = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: orderRow }) }) }) }),
      rpc: vi.fn(async () => rpcResult),
    };
    const supabase = { forUser: () => userDb, admin: () => userDb } as unknown as SupabaseService;
    return new BookingService(supabase, {} as AccessService);
  }

  it("saveConsent với phiên bản lạ -> CONSENT_VERSION_INVALID (409)", async () => {
    const err = await makeService().saveConsent(user, "o1", null, undefined, "0.0.1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe(ERROR_CODES.CONSENT_VERSION_INVALID);
    expect((err as AppException).getStatus()).toBe(409);
  });

  it("applyVoucher: RPC trả ok:false với mã lạ -> INTERNAL_ERROR, không phải VALIDATION_ERROR", async () => {
    const service = makeService({ data: { ok: false, error_code: "MA_LA" }, error: null });
    const err = await service.applyVoucher(user, "o1", "SALE").catch((e: unknown) => e);
    expect((err as AppException).code).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  it("applyVoucher: lỗi RPC không mong đợi -> INTERNAL_ERROR, không phải VALIDATION_ERROR", async () => {
    const service = makeService({ data: null, error: { message: "boom" } });
    const err = await service.applyVoucher(user, "o1", "SALE").catch((e: unknown) => e);
    expect((err as AppException).code).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  it("applyVoucher: VOUCHER_EXPIRED qua nhánh ok:false -> VOUCHER_EXPIRED", async () => {
    const service = makeService({ data: { ok: false, error_code: "VOUCHER_EXPIRED" }, error: null });
    const err = await service.applyVoucher(user, "o1", "SALE").catch((e: unknown) => e);
    expect((err as AppException).code).toBe(ERROR_CODES.VOUCHER_EXPIRED);
  });
});
