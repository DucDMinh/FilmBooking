import "@testing-library/jest-dom/vitest";

import type { PriceRuleDto } from "@filmbooking/shared/schemas/pricing";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HolidayManager, PRICE_INVALID_MESSAGE, PriceMatrix, parseVndAmount } from "../price-matrix";
import { VoucherManager, describeDiscount } from "../voucher-form";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/gia",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));

const HN01 = "11111111-1111-4111-8111-111111111111";
const HN02 = "22222222-2222-4222-8222-222222222222";
const CELL = "VIP 2D Cuối tuần Sau 17h";

function rule(over: Partial<PriceRuleDto>): PriceRuleDto {
  return {
    id: "r1",
    scope: "CHAIN",
    cinemaId: null,
    showtimeId: null,
    seatType: "VIP",
    format: "2D",
    dayType: "WEEKEND",
    timeBand: "AFTER_17",
    amount: 120000,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

function routeApi(overrides: Record<string, unknown>) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path in overrides) return overrides[path];
    if (path === "/cinemas")
      return [
        { id: HN01, name: "HN01" },
        { id: HN02, name: "HN02" },
      ];
    return [];
  });
}

const writeCalls = (method: string) => mockApiFetch.mock.calls.filter(([, init]) => init?.method === method);

beforeEach(() => {
  mockApiFetch.mockReset();
  searchParams = new URLSearchParams();
});
afterEach(cleanup);

describe("parseVndAmount", () => {
  it("chỉ nhận số nguyên không âm", () => {
    expect(parseVndAmount("100000")).toBe(100000);
    expect(parseVndAmount("0")).toBe(0);
    expect(parseVndAmount("-5")).toBeNull();
    expect(parseVndAmount("1.5")).toBeNull();
    expect(parseVndAmount("")).toBeNull();
    expect(parseVndAmount("abc")).toBeNull();
  });
});

describe("PriceMatrix (AC-15)", () => {
  it("HN02 ghi đè VIP 2D cuối tuần sau 17h = 100.000, ô khác kế thừa chuỗi", async () => {
    searchParams = new URLSearchParams(`cinema=${HN02}`);
    routeApi({
      "/price-rules?scope=CHAIN": [rule({ id: "c1" }), rule({ id: "c2", seatType: "NORMAL", amount: 80000 })],
      [`/price-rules?scope=CINEMA&cinemaId=${HN02}`]: [
        rule({ id: "o1", scope: "CINEMA", cinemaId: HN02, amount: 100000 }),
      ],
    });
    render(<PriceMatrix role="MANAGER" memberships={[{ cinemaId: HN02, role: "MANAGER" }]} />);
    expect(await screen.findByLabelText(CELL)).toHaveValue("100000");
    expect(screen.getAllByText("Ghi đè")).toHaveLength(1);
    expect(screen.getByLabelText("Thường 2D Cuối tuần Sau 17h")).toHaveValue("80000");
    expect(screen.getAllByText("Kế thừa").length).toBeGreaterThan(0);
  });

  it("HN01 không ghi đè -> kế thừa 120.000", async () => {
    searchParams = new URLSearchParams(`cinema=${HN01}`);
    routeApi({ "/price-rules?scope=CHAIN": [rule({ id: "c1" })] });
    render(<PriceMatrix role="MANAGER" memberships={[{ cinemaId: HN01, role: "MANAGER" }]} />);
    expect(await screen.findByLabelText(CELL)).toHaveValue("120000");
    expect(screen.queryByText("Ghi đè")).not.toBeInTheDocument();
  });

  it("giá không nguyên / âm -> lỗi, không gọi API ghi", async () => {
    routeApi({ "/price-rules?scope=CHAIN": [rule({ id: "c1" })] });
    render(<PriceMatrix role="ADMIN" memberships={[]} />);
    const input = await screen.findByLabelText(CELL);
    const user = userEvent.setup();
    await screen.findByText("Bảng giá mặc định toàn chuỗi");
    for (const bad of ["1.5", "-100", "2147483648"]) {
      await user.clear(input);
      await user.type(input, bad);
      await user.click(screen.getByRole("button", { name: `Lưu ${CELL}` }));
      expect(await screen.findByText(PRICE_INVALID_MESSAGE)).toBeInTheDocument();
    }
    expect(writeCalls("PATCH")).toHaveLength(0);
  });

  it("Admin sửa giá chuỗi -> PATCH amount nguyên", async () => {
    routeApi({ "/price-rules?scope=CHAIN": [rule({ id: "c1" })] });
    render(<PriceMatrix role="ADMIN" memberships={[]} />);
    const input = await screen.findByLabelText(CELL);
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, "130000");
    await user.click(screen.getByRole("button", { name: `Lưu ${CELL}` }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/price-rules/c1", { method: "PATCH", json: { amount: 130000 } }),
    );
  });

  it("không phải Admin và không ở scope rạp: giá chuỗi chỉ đọc", async () => {
    routeApi({ "/price-rules?scope=CHAIN": [rule({ id: "c1" })] });
    render(<PriceMatrix role="STAFF" memberships={[]} />);
    expect(await screen.findByText(/chỉ có quyền xem/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("Manager ở rạp mình không thấy ô sửa giá chuỗi: chỉ sửa ghi đè rạp (PATCH/POST scope CINEMA)", async () => {
    searchParams = new URLSearchParams(`cinema=${HN01}`);
    routeApi({ "/price-rules?scope=CHAIN": [rule({ id: "c1" })] });
    render(<PriceMatrix role="MANAGER" memberships={[{ cinemaId: HN01, role: "MANAGER" }]} />);
    await screen.findByText("Giá tại HN01");
    const input = await screen.findByLabelText(CELL);
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, "100000");
    await user.click(screen.getByRole("button", { name: `Lưu ${CELL}` }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/price-rules",
        expect.objectContaining({
          method: "POST",
          json: expect.objectContaining({ scope: "CINEMA", cinemaId: HN01, amount: 100000 }),
        }),
      ),
    );
  });

  it("STAFF có rạp gán: chỉ đọc, không có ô nhập", async () => {
    searchParams = new URLSearchParams(`cinema=${HN01}`);
    routeApi({ "/price-rules?scope=CHAIN": [rule({ id: "c1" })] });
    render(<PriceMatrix role="STAFF" memberships={[{ cinemaId: HN01, role: "STAFF" }]} />);
    await screen.findByText("Giá tại HN01");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/chỉ có quyền xem/)).toBeInTheDocument();
  });

  it("MANAGER HN01 + STAFF HN02: sửa được HN01, HN02 chỉ đọc", async () => {
    const memberships = [
      { cinemaId: HN01, role: "MANAGER" as const },
      { cinemaId: HN02, role: "STAFF" as const },
    ];
    routeApi({ "/price-rules?scope=CHAIN": [rule({ id: "c1" })] });

    searchParams = new URLSearchParams(`cinema=${HN01}`);
    const first = render(<PriceMatrix role="MANAGER" memberships={memberships} />);
    await screen.findByText("Giá tại HN01");
    expect(screen.getByLabelText(CELL)).toBeInTheDocument();
    first.unmount();

    searchParams = new URLSearchParams(`cinema=${HN02}`);
    render(<PriceMatrix role="MANAGER" memberships={memberships} />);
    await screen.findByText("Giá tại HN02");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lưu một ô không làm mất chữ đang nhập ở ô khác", async () => {
    routeApi({
      "/price-rules?scope=CHAIN": [rule({ id: "c1" }), rule({ id: "c2", seatType: "NORMAL", amount: 80000 })],
    });
    render(<PriceMatrix role="ADMIN" memberships={[]} />);
    await screen.findByText("Bảng giá mặc định toàn chuỗi");
    const user = userEvent.setup();
    const other = screen.getByLabelText("Thường 2D Cuối tuần Sau 17h");
    await user.clear(other);
    await user.type(other, "90000");
    const vip = screen.getByLabelText(CELL);
    await user.clear(vip);
    await user.type(vip, "130000");
    await user.click(screen.getByRole("button", { name: `Lưu ${CELL}` }));
    await waitFor(() => expect(writeCalls("PATCH")).toHaveLength(1));
    await waitFor(() => expect(mockApiFetch.mock.calls.filter(([p]) => p === "/price-rules?scope=CHAIN")).toHaveLength(2));
    expect(screen.getByLabelText("Thường 2D Cuối tuần Sau 17h")).toHaveValue("90000");
  });
});

describe("HolidayManager", () => {
  it("Manager chỉ xem, không có form thêm", async () => {
    routeApi({ "/holidays": [{ holidayDate: "2026-09-02", name: "Quốc khánh", createdAt: "" }] });
    render(<HolidayManager role="MANAGER" />);
    expect(await screen.findByText("Quốc khánh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm ngày lễ" })).not.toBeInTheDocument();
  });

  it("Admin xoá ngày lễ phải qua xác nhận", async () => {
    routeApi({ "/holidays": [{ holidayDate: "2026-09-02", name: "Quốc khánh", createdAt: "" }] });
    render(<HolidayManager role="ADMIN" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Xoá ngày lễ Quốc khánh" }));
    expect(writeCalls("DELETE")).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: "Xoá" }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/holidays/2026-09-02", { method: "DELETE" }),
    );
  });

  it("Admin thêm ngày lễ -> POST", async () => {
    routeApi({ "/holidays": [] });
    render(<HolidayManager role="ADMIN" />);
    const user = userEvent.setup();
    await screen.findByText("Chưa có ngày lễ");
    await user.type(screen.getByLabelText("Ngày"), "2026-09-02");
    await user.type(screen.getByLabelText("Tên ngày lễ"), "Quốc khánh");
    await user.click(screen.getByRole("button", { name: "Thêm ngày lễ" }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/holidays", {
        method: "POST",
        json: { holidayDate: "2026-09-02", name: "Quốc khánh" },
      }),
    );
  });
});

const voucher = {
  id: "v1",
  code: "SALE20",
  discountType: "PERCENT" as const,
  discountValue: 20,
  maxDiscount: 50000,
  appliesTo: "ORDER" as const,
  validFrom: null,
  validTo: null,
  minOrderAmount: 0,
  totalUsesLimit: null,
  perUserLimit: null,
  movieId: null,
  active: true,
  createdAt: "",
  updatedAt: "",
};

describe("VoucherManager", () => {
  const listPath = "/admin/vouchers?page=1&pageSize=20";
  const empty = { items: [], page: 1, pageSize: 20, total: 0 };

  it("mô tả giảm giá", () => {
    expect(describeDiscount(voucher)).toContain("20%");
    expect(describeDiscount({ discountType: "FIXED", discountValue: 50000, maxDiscount: null })).toContain("50.000");
  });

  it("voucher có validFrom tương lai hiện Sắp chạy", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    routeApi({ [listPath]: { items: [{ ...voucher, validFrom: future }], page: 1, pageSize: 20, total: 1 } });
    render(<VoucherManager role="MANAGER" />);
    expect(await screen.findByText("Sắp chạy")).toBeInTheDocument();
  });

  it("Manager chỉ xem: ẩn nút tạo/sửa", async () => {
    routeApi({ [listPath]: { items: [voucher], page: 1, pageSize: 20, total: 1 } });
    render(<VoucherManager role="MANAGER" />);
    expect(await screen.findByText("SALE20")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tạo voucher/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sửa voucher/ })).not.toBeInTheDocument();
  });

  it("Admin tạo voucher -> POST /admin/vouchers", async () => {
    routeApi({ [listPath]: empty });
    render(<VoucherManager role="ADMIN" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Tạo voucher/ }));
    await user.type(await screen.findByLabelText("Mã voucher *"), "tet2027");
    await user.type(screen.getByLabelText("Giá trị giảm (%)"), "10");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/admin/vouchers",
        expect.objectContaining({
          method: "POST",
          json: expect.objectContaining({ code: "TET2027", discountValue: 10 }),
        }),
      ),
    );
  });

  it("Admin nhập % > 100 -> lỗi, không gọi API", async () => {
    routeApi({ [listPath]: empty });
    render(<VoucherManager role="ADMIN" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Tạo voucher/ }));
    await user.type(await screen.findByLabelText("Mã voucher *"), "BAD100");
    await user.type(screen.getByLabelText("Giá trị giảm (%)"), "150");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText(/tối đa 100/)).toBeInTheDocument();
    expect(writeCalls("POST")).toHaveLength(0);
  });
});
