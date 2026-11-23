import "@testing-library/jest-dom/vitest";

import type { BookingSummaryResponse } from "@filmbooking/shared/schemas/booking";
import type { ErrorCode } from "@filmbooking/shared/errors";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrderConfirmPage from "@/app/(public)/dat-ve/don/[id]/xac-nhan/page";
import { VoucherInput } from "@/components/booking/voucher-input";
import type * as apiClient from "@/lib/api/client";
import { ApiError, apiFetch } from "@/lib/api/client";

type ApiClientModule = typeof apiClient;
import { ERROR_MESSAGES } from "@/lib/api/error-messages";

// Giữ ApiError + apiFetch thật để map mã lỗi → tiếng Việt chạy qua code production.
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<ApiClientModule>()),
  apiFetch: vi.fn(),
}));

const push = vi.fn();
const replace = vi.fn();
// Next trả router ổn định giữa các lần render; mock phải giống vậy để effect tải đơn không chạy lại.
const router = { push, replace };
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order-1" }),
  useRouter: () => router,
}));

const mockedFetch = vi.mocked(apiFetch);

function makeSummary(overrides: Partial<BookingSummaryResponse> = {}): BookingSummaryResponse {
  return {
    id: "order-1",
    bookingCode: "HN01-7K3P9Q",
    status: "holding",
    holdExpiresAt: null,
    expiresInSeconds: 600,
    movie: { title: "Vệt sáng cuối cùng", ageRating: "P", posterUrl: null },
    cinema: { id: "c1", code: "HN01", name: "CINEMO Long Biên", address: "12 Nguyễn Văn Cừ, Long Biên", district: null },
    // 12:30Z = 19:30 giờ VN, 11/11/2026
    showtime: { id: "s1", startsAt: "2026-11-11T12:30:00Z", endsAt: "2026-11-11T14:30:00Z", roomName: "Phòng 03", format: "2D" },
    seats: [
      { id: "a", label: "F7", type: "standard", price: 150000 },
      { id: "b", label: "F8", type: "standard", price: 175000 },
    ],
    pricing: { subtotal: 325000, discount: 0, total: 325000 },
    voucher: null,
    consent: { consented: false, consentAt: null },
    ageConfirmed: false,
    ...overrides,
  };
}

function apiErrorOf(code: ErrorCode) {
  return new ApiError(code, ERROR_MESSAGES[code], 422);
}

/** Chạy apiFetch THẬT với fetch trả lỗi API đúng dạng, để kiểm map mã → thông điệp. */
async function useRealApiFetchReturning(code: ErrorCode, status = 422) {
  const actual = await vi.importActual<ApiClientModule>("@/lib/api/client");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: "raw" } }), { status })),
  );
  mockedFetch.mockImplementation(actual.apiFetch);
}

beforeEach(() => {
  mockedFetch.mockReset();
  push.mockReset();
  replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrderConfirmPage", () => {
  it("hiển thị tóm tắt, tổng VND không thập phân, không có nút huỷ đơn (R-131)", async () => {
    mockedFetch.mockResolvedValueOnce(makeSummary());
    render(<OrderConfirmPage />);

    expect(await screen.findByText("Xác nhận đơn hàng")).toBeInTheDocument();
    expect(screen.getByText("CINEMO Long Biên")).toBeInTheDocument();
    expect(screen.getByTestId("order-total")).toHaveTextContent("325.000 ₫");
    expect(screen.queryByRole("button", { name: /huỷ|hủy/i })).not.toBeInTheDocument();
  });

  it("chưa tick thì nút Thanh toán disabled; tick xong mới enable", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValueOnce(makeSummary());
    render(<OrderConfirmPage />);

    const payButton = await screen.findByRole("button", { name: /Thanh toán 325\.000/ });
    expect(payButton).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    expect(payButton).toBeEnabled();
  });

  it("AlertDialog ghi đúng tên + địa chỉ rạp; xác nhận gọi consent rồi payment rồi chuyển tới checkoutUrl", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, origin: "http://localhost", assign });
    mockedFetch
      .mockResolvedValueOnce(makeSummary())
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ status: "AWAITING_PAYMENT", checkoutUrl: "https://pay.example/abc" });
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    await user.click(screen.getByRole("button", { name: /Thanh toán 325\.000/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("CINEMO Long Biên")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("12 Nguyễn Văn Cừ, Long Biên");
    expect(dialog).toHaveTextContent("19:30");
    expect(dialog).toHaveTextContent("11/11/2026");

    await user.click(within(dialog).getByRole("button", { name: "Đồng ý và thanh toán" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.example/abc"));
    const paths = mockedFetch.mock.calls.map(([path]) => path);
    expect(paths).toEqual(["/bookings/order-1", "/bookings/order-1/consent", "/bookings/order-1/payment"]);
    // version do server quyết: body consent không chứa version
    expect(mockedFetch.mock.calls[1]?.[1]).toMatchObject({ method: "POST", json: {} });
    expect(mockedFetch.mock.calls[2]?.[1]).toMatchObject({
      json: {
        returnUrl: "http://localhost/dat-ve/don/order-1/ket-qua",
        cancelUrl: "http://localhost/dat-ve/don/order-1/xac-nhan",
      },
    });
    vi.unstubAllGlobals();
  });

  it("đơn 0đ không có checkoutUrl: chuyển thẳng sang màn kết quả", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(makeSummary({ pricing: { subtotal: 100000, discount: 100000, total: 0 } }))
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ status: "PAID", checkoutUrl: null });
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    await user.click(screen.getByRole("button", { name: /Thanh toán 0 ₫/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Đồng ý và thanh toán" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dat-ve/don/order-1/ket-qua"));
  });

  it("phim T13+ chưa xác nhận tuổi: cần tick thêm và gọi age-confirm trước consent", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(makeSummary({ movie: { title: "X", ageRating: "T13", posterUrl: null } }))
      .mockResolvedValue({ status: "PAID", checkoutUrl: null });
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    const payButton = screen.getByRole("button", { name: /Thanh toán/ });
    expect(payButton).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /đủ độ tuổi/ }));
    await user.click(payButton);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Đồng ý và thanh toán" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(mockedFetch.mock.calls.map(([path]) => path).slice(1)).toEqual([
      "/bookings/order-1/age-confirm",
      "/bookings/order-1/consent",
      "/bookings/order-1/payment",
    ]);
  });

  it("tạo thanh toán lỗi: hiện thông báo, giữ đơn và không chuyển hướng", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(makeSummary())
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new ApiError("UNKNOWN", "Đã có lỗi xảy ra. Vui lòng thử lại sau.", 500));
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    await user.click(screen.getByRole("button", { name: /Thanh toán 325\.000/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Đồng ý và thanh toán" }));

    expect(await screen.findByText("Không tạo được thanh toán. Thử lại.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("consent OK nhưng payment trả HOLD_EXPIRED: chuyển sang trạng thái hết hạn, có nút Chọn lại ghế", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(makeSummary())
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(apiErrorOf("HOLD_EXPIRED"));
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    await user.click(screen.getByRole("button", { name: /Thanh toán 325\.000/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Đồng ý và thanh toán" }));

    expect(await screen.findByText("Đơn hàng không còn hiệu lực")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chọn lại ghế" })).toHaveAttribute("href", "/dat-ve/s1");
    expect(screen.queryByRole("button", { name: /Thanh toán/ })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("payment lỗi CONFLICT: hiện thông điệp tiếng Việt của mã, giữ nút Thanh toán", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(makeSummary())
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(apiErrorOf("CONFLICT"));
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    await user.click(screen.getByRole("button", { name: /Thanh toán 325\.000/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Đồng ý và thanh toán" }));

    expect(await screen.findByText(ERROR_MESSAGES.CONFLICT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thanh toán 325\.000/ })).toBeEnabled();
  });

  it("consent lỗi CONSENT_VERSION_INVALID: hiện đúng thông báo điều khoản, không phải 'Dữ liệu chưa hợp lệ'", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValueOnce(makeSummary()).mockRejectedValueOnce(apiErrorOf("CONSENT_VERSION_INVALID"));
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    await user.click(screen.getByRole("button", { name: /Thanh toán 325\.000/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Đồng ý và thanh toán" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ERROR_MESSAGES.CONSENT_VERSION_INVALID);
    expect(alert).not.toHaveTextContent("Dữ liệu chưa hợp lệ");
  });

  it("lỗi DOB_REQUIRED: hiện thông báo thiếu ngày sinh kèm link tới /tai-khoan", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(makeSummary({ movie: { title: "X", ageRating: "T18", posterUrl: null } }))
      .mockRejectedValueOnce(apiErrorOf("DOB_REQUIRED"));
    render(<OrderConfirmPage />);

    await user.click(await screen.findByRole("checkbox", { name: /đồng ý điều kiện vé/ }));
    await user.click(screen.getByRole("checkbox", { name: /đủ độ tuổi/ }));
    await user.click(screen.getByRole("button", { name: /Thanh toán 325\.000/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Đồng ý và thanh toán" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR_MESSAGES.DOB_REQUIRED);
    expect(screen.getByRole("link", { name: "Cập nhật hồ sơ" })).toHaveAttribute("href", "/tai-khoan");
  });

  it("có link Đổi ghế về chọn ghế của cùng suất và nhãn loại ghế tiếng Việt", async () => {
    mockedFetch.mockResolvedValueOnce(makeSummary());
    render(<OrderConfirmPage />);
    expect(await screen.findByRole("link", { name: /Đổi ghế/ })).toHaveAttribute("href", "/dat-ve/s1");
    expect(screen.getByText(/Ghế F7 \(Thường\)/)).toBeInTheDocument();
  });

  it("đơn đã hết hạn giữ ghế: không cho thanh toán", async () => {
    mockedFetch.mockResolvedValueOnce(makeSummary({ status: "expired" }));
    render(<OrderConfirmPage />);
    expect(await screen.findByText("Đơn hàng không còn hiệu lực")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thanh toán/ })).not.toBeInTheDocument();
  });
});

describe("VoucherInput", () => {
  it.each([
    ["VOUCHER_EXPIRED", "Mã giảm giá đã hết hạn."],
    ["VOUCHER_EXHAUSTED", "Mã giảm giá đã hết lượt sử dụng."],
    ["VOUCHER_MIN_ORDER", "Đơn hàng chưa đạt giá trị tối thiểu để dùng mã này."],
    ["VOUCHER_NOT_FOUND", "Mã giảm giá không tồn tại."],
    ["VOUCHER_NOT_APPLICABLE_SHOWTIME", "Mã giảm giá không áp dụng cho suất chiếu này."],
  ] as const)("lỗi %s đi qua apiFetch thật và hiện đúng thông điệp", async (code, message) => {
    const user = userEvent.setup();
    await useRealApiFetchReturning(code);
    const onChanged = vi.fn();
    render(<VoucherInput orderId="order-1" appliedCode={null} onChanged={onChanged} />);

    await user.type(screen.getByLabelText("Mã giảm giá"), "SALE10");
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("nhấn Enter khi ô trống: hiện thông báo riêng, không gọi API", async () => {
    const user = userEvent.setup();
    render(<VoucherInput orderId="order-1" appliedCode={null} onChanged={vi.fn()} />);

    await user.type(screen.getByLabelText("Mã giảm giá"), "{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Vui lòng nhập mã giảm giá.");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("mã quá 50 ký tự: báo tối đa 50 ký tự, không gọi API", async () => {
    const user = userEvent.setup();
    render(<VoucherInput orderId="order-1" appliedCode={null} onChanged={vi.fn()} />);

    await user.type(screen.getByLabelText("Mã giảm giá"), "A".repeat(51));
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Mã giảm giá tối đa 50 ký tự.");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("áp dụng thành công gọi onChanged; có mã thì hiện nút gỡ", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValueOnce({});
    const onChanged = vi.fn();
    const { rerender } = render(<VoucherInput orderId="order-1" appliedCode={null} onChanged={onChanged} />);

    await user.type(screen.getByLabelText("Mã giảm giá"), "SALE10");
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockedFetch).toHaveBeenCalledWith("/bookings/order-1/voucher", { method: "POST", json: { code: "SALE10" } });

    rerender(<VoucherInput orderId="order-1" appliedCode="SALE10" onChanged={onChanged} />);
    expect(screen.getByRole("button", { name: "Gỡ mã giảm giá" })).toBeInTheDocument();
  });
});
