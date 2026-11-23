import "@testing-library/jest-dom/vitest";

import type { BookingSummaryResponse, ComboDto } from "@filmbooking/shared/schemas/booking";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConcessionSelector } from "@/components/booking/concession-selector";
import { PriceBreakdown } from "@/components/booking/order-summary";
import type * as apiClient from "@/lib/api/client";
import { ApiError, apiFetch } from "@/lib/api/client";

type ApiClientModule = typeof apiClient;
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<ApiClientModule>()),
  apiFetch: vi.fn(),
}));
const mockedFetch = vi.mocked(apiFetch);

const solo: ComboDto = {
  id: "c1",
  name: "Combo Solo",
  description: "1 bắp + 1 nước",
  priceAmount: 99000,
  imageUrl: null,
  isActive: true,
  displayOrder: 1,
};
const couple: ComboDto = { ...solo, id: "c2", name: "Combo Đôi", description: null, priceAmount: 159000, displayOrder: 2 };

function summaryWith(combos: BookingSummaryResponse["combos"]): BookingSummaryResponse {
  return {
    id: "order-1",
    bookingCode: "HN01-7K3P9Q",
    status: "holding",
    holdExpiresAt: null,
    expiresInSeconds: 600,
    movie: { title: "Phim", ageRating: "P", posterUrl: null },
    cinema: { id: "c", code: "HN01", name: "CINEMO", address: "x", district: null },
    showtime: { id: "s1", startsAt: "2026-11-11T12:30:00Z", endsAt: "2026-11-11T14:30:00Z", roomName: "P3", format: "2D" },
    seats: [{ id: "a", label: "F7", type: "standard", price: 150000 }],
    combos,
    pricing: { subtotal: 249000, combosTotal: 99000, discount: 0, total: 249000 },
    voucher: null,
    consent: { consented: false, consentAt: null },
    ageConfirmed: false,
  };
}

beforeEach(() => mockedFetch.mockReset());
afterEach(cleanup);

describe("ConcessionSelector", () => {
  it("tải /combos và hiện tên, giá từng combo", async () => {
    mockedFetch.mockResolvedValueOnce([solo, couple]);
    render(<ConcessionSelector orderId="order-1" onSummaryChanged={vi.fn()} />);

    expect(await screen.findByText("Combo Solo")).toBeInTheDocument();
    expect(screen.getByText("Combo Đôi")).toBeInTheDocument();
    expect(screen.getByText("99.000 ₫")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith("/combos");
  });

  it("không có combo khả dụng (hoặc tải lỗi): không render gì", async () => {
    mockedFetch.mockResolvedValueOnce([]);
    const { container, unmount } = render(<ConcessionSelector orderId="order-1" onSummaryChanged={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(/Đang tải/)).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
    unmount();

    mockedFetch.mockRejectedValueOnce(new ApiError("UNKNOWN", "lỗi", 500));
    const second = render(<ConcessionSelector orderId="order-1" onSummaryChanged={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(/Đang tải/)).not.toBeInTheDocument());
    expect(second.container).toBeEmptyDOMElement();
  });

  it("bấm + gửi PUT với danh sách items mới rồi trả summary server về cho cha", async () => {
    const user = userEvent.setup();
    const updated = summaryWith([{ id: "oc1", comboId: "c1", name: "Combo Solo", quantity: 1, unitPrice: 99000, totalPrice: 99000 }]);
    mockedFetch.mockResolvedValueOnce([solo, couple]).mockResolvedValueOnce(updated);
    const onSummaryChanged = vi.fn();
    render(<ConcessionSelector orderId="order-1" onSummaryChanged={onSummaryChanged} />);

    await user.click(await screen.findByRole("button", { name: "Tăng số lượng Combo Solo" }));

    await waitFor(() => expect(onSummaryChanged).toHaveBeenCalledWith(updated));
    expect(mockedFetch).toHaveBeenLastCalledWith("/bookings/order-1/combos", {
      method: "PUT",
      json: { items: [{ comboId: "c1", quantity: 1 }] },
    });
  });

  it("bấm - giữ nguyên combo khác và bỏ combo về 0 khỏi items", async () => {
    const user = userEvent.setup();
    const selected = [
      { id: "o1", comboId: "c1", name: "Combo Solo", quantity: 1, unitPrice: 99000, totalPrice: 99000 },
      { id: "o2", comboId: "c2", name: "Combo Đôi", quantity: 3, unitPrice: 159000, totalPrice: 477000 },
    ];
    mockedFetch.mockResolvedValueOnce([solo, couple]).mockResolvedValueOnce(summaryWith([]));
    render(<ConcessionSelector orderId="order-1" selectedCombos={selected} onSummaryChanged={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Giảm số lượng Combo Solo" }));

    await waitFor(() =>
      expect(mockedFetch).toHaveBeenLastCalledWith("/bookings/order-1/combos", {
        method: "PUT",
        json: { items: [{ comboId: "c2", quantity: 3 }] },
      }),
    );
  });

  it("API lỗi: hiện thông báo, không gọi onSummaryChanged", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce([solo])
      .mockRejectedValueOnce(new ApiError("HOLD_EXPIRED", "Thời gian giữ chỗ đã hết hạn", 409));
    const onSummaryChanged = vi.fn();
    render(<ConcessionSelector orderId="order-1" onSummaryChanged={onSummaryChanged} />);

    await user.click(await screen.findByRole("button", { name: "Tăng số lượng Combo Solo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Thời gian giữ chỗ đã hết hạn");
    expect(onSummaryChanged).not.toHaveBeenCalled();
  });

  it("disabled: khoá cả hai nút; số lượng tối đa khoá riêng nút +", async () => {
    mockedFetch.mockResolvedValueOnce([solo]);
    const atMax = [{ id: "o1", comboId: "c1", name: "Combo Solo", quantity: 20, unitPrice: 99000, totalPrice: 1980000 }];
    const { rerender } = render(<ConcessionSelector orderId="order-1" selectedCombos={atMax} onSummaryChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Tăng số lượng Combo Solo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Giảm số lượng Combo Solo" })).toBeEnabled();

    const two = [{ ...atMax[0]!, quantity: 2 }];
    rerender(<ConcessionSelector orderId="order-1" selectedCombos={two} onSummaryChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tăng số lượng Combo Solo" })).toBeEnabled();

    rerender(<ConcessionSelector orderId="order-1" selectedCombos={two} onSummaryChanged={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Tăng số lượng Combo Solo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Giảm số lượng Combo Solo" })).toBeDisabled();
  });

  it("đang cập nhật một combo: khoá nút của mọi card cho tới khi server trả lời", async () => {
    const user = userEvent.setup();
    let resolvePut: (value: BookingSummaryResponse) => void = () => undefined;
    mockedFetch
      .mockResolvedValueOnce([solo, couple])
      .mockReturnValueOnce(new Promise<BookingSummaryResponse>((resolve) => (resolvePut = resolve)));
    render(<ConcessionSelector orderId="order-1" onSummaryChanged={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Tăng số lượng Combo Solo" }));
    expect(screen.getByRole("button", { name: "Tăng số lượng Combo Đôi" })).toBeDisabled();

    resolvePut(summaryWith([]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tăng số lượng Combo Đôi" })).toBeEnabled());
  });

  it("combo đã ngừng bán nằm trong đơn: không gửi lại id của nó khi đổi combo khác", async () => {
    const user = userEvent.setup();
    const selected = [
      { id: "o9", comboId: "gone", name: "Combo cũ", quantity: 1, unitPrice: 50000, totalPrice: 50000 },
    ];
    mockedFetch.mockResolvedValueOnce([solo]).mockResolvedValueOnce(summaryWith([]));
    render(<ConcessionSelector orderId="order-1" selectedCombos={selected} onSummaryChanged={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Tăng số lượng Combo Solo" }));

    await waitFor(() =>
      expect(mockedFetch).toHaveBeenLastCalledWith("/bookings/order-1/combos", {
        method: "PUT",
        json: { items: [{ comboId: "c1", quantity: 1 }] },
      }),
    );
  });

  it("PUT trả HOLD_EXPIRED: báo cho trang qua onExpired", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValueOnce([solo]).mockRejectedValueOnce(new ApiError("HOLD_EXPIRED", "Hết giờ giữ ghế", 410));
    const onExpired = vi.fn();
    render(<ConcessionSelector orderId="order-1" onSummaryChanged={vi.fn()} onExpired={onExpired} />);

    await user.click(await screen.findByRole("button", { name: "Tăng số lượng Combo Solo" }));

    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it("ảnh combo: có ảnh thì hiện <img> phủ kín khung; ảnh lỗi (đường dẫn seed không tồn tại) thì quay về biểu tượng", async () => {
    mockedFetch.mockResolvedValueOnce([{ ...solo, imageUrl: "/images/combos/solo.webp" }]);
    render(<ConcessionSelector orderId="order-1" onSummaryChanged={vi.fn()} />);

    const img = await screen.findByRole("img", { name: "Combo Solo" });
    expect(img).toHaveClass("size-full", "object-cover");

    fireEvent.error(img);

    expect(screen.queryByRole("img", { name: "Combo Solo" })).not.toBeInTheDocument();
  });

  it("nút tăng/giảm có vùng chạm tối thiểu 44px", async () => {
    mockedFetch.mockResolvedValueOnce([solo]);
    render(<ConcessionSelector orderId="order-1" onSummaryChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Tăng số lượng Combo Solo" })).toHaveClass("size-11");
    expect(screen.getByRole("button", { name: "Giảm số lượng Combo Solo" })).toHaveClass("size-11");
  });
});

describe("PriceBreakdown có combo", () => {
  it("hiện dòng combo (tên × số lượng, thành tiền) và tổng theo số server", () => {
    const summary = summaryWith([
      { id: "o1", comboId: "c1", name: "Combo Solo", quantity: 1, unitPrice: 99000, totalPrice: 99000 },
    ]);
    render(<PriceBreakdown summary={summary} />);
    expect(screen.getByText("Combo Solo × 1")).toBeInTheDocument();
    expect(screen.getByText("99.000 ₫")).toBeInTheDocument();
    expect(screen.getByTestId("order-total")).toHaveTextContent("249.000 ₫");
  });
});
