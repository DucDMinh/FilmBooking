import "@testing-library/jest-dom/vitest";

import type { PaymentStatusDto } from "@filmbooking/shared/schemas/payment";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KetQuaPage from "@/app/(public)/dat-ve/don/[id]/ket-qua/page";
import ChiTietVePage from "@/app/(public)/ve/[bookingCode]/page";
import VeCuaToiPage from "@/app/(public)/ve/page";
import { PaymentResult } from "@/components/ticket/payment-result";
import { TicketCard, TicketDetail } from "@/components/ticket/ticket-card";
import {
  splitUpcomingAndPast,
  toPaidOrderView,
  type OrderRow,
  type PaidOrderView,
} from "@/components/ticket/ticket-data";
import type * as apiClient from "@/lib/api/client";
import { ApiError, apiFetch } from "@/lib/api/client";
import { isProtectedPath } from "@/proxy";

type ApiClientModule = typeof apiClient;
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<ApiClientModule>()),
  apiFetch: vi.fn(),
}));
const refresh = vi.fn();
const router = { refresh };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// Supabase giả: bảng orders có nhiều chủ; mô phỏng RLS của Admin = thấy hết, nên chỉ filter .eq("user_id") mới cách ly.
let currentUser: { id: string; email_confirmed_at: string | null } | null = null;
const eqCalls: [string, unknown][] = [];
let tables: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => makeBuilder(),
  }),
}));

function makeBuilder() {
  const filters: [string, unknown][] = [];
  const inFilters: [string, unknown[]][] = [];
  const run = () =>
    tables.filter(
      (row) => filters.every(([k, v]) => row[k] === v) && inFilters.every(([k, vs]) => vs.includes(row[k])),
    );
  const builder = {
    select: () => builder,
    in: (column: string, values: unknown[]) => {
      inFilters.push([column, values]);
      return builder;
    },
    order: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      filters.push([column, value]);
      return builder;
    },
    maybeSingle: async () => ({ data: run()[0] ?? null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: run(), error: null }),
  };
  return builder;
}

const mockedFetch = vi.mocked(apiFetch);
const status = (s: PaymentStatusDto["status"]): PaymentStatusDto => ({
  status: s,
  orderStatus: "x",
  bookingCode: null,
});

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    user_id: "u1",
    showtime_id: "st1",
    status: "paid",
    booking_code: "HN01-AAAAAA",
    movie_title: "Phim A",
    cinema_name: "CINEMO Long Biên",
    room_name: "Phòng 03",
    showtime_starts_at: "2099-11-20T12:00:00Z",
    showtime_ends_at: "2099-11-20T14:00:00Z",
    cinemas: { address: "12 Nguyễn Văn Cừ", hotline: "1900 0000" },
    order_seats: [{ id: "s1", seat_label: "F7" }],
    qr_token: "a".repeat(32),
    tickets: [{ order_seat_id: "s1", checked_in_at: null }],
    ...overrides,
  };
}

function order(overrides: Partial<PaidOrderView> = {}): PaidOrderView {
  return {
    id: "o1",
    status: "paid",
    bookingCode: "HN01-7K3P9Q",
    movieTitle: "Phim A",
    cinemaName: "CINEMO Long Biên",
    cinemaAddress: "12 Nguyễn Văn Cừ",
    cinemaHotline: "1900 0000",
    roomName: "Phòng 03",
    startsAt: "2026-11-20T12:00:00Z",
    endsAt: "2026-11-20T14:00:00Z",
    qrToken: "o".repeat(32),
    tickets: [
      { seatLabel: "F7", checkedIn: false },
      { seatLabel: "F8", checkedIn: false },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockedFetch.mockReset();
  refresh.mockReset();
  eqCalls.length = 0;
  tables = [];
  currentUser = { id: "u1", email_confirmed_at: "2026-01-01" };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("PaymentResult polling", () => {
  beforeEach(() => vi.useFakeTimers());

  it("PAID -> refresh; server chưa đọc ra vé thì vẫn poll tiếp tới timeout (không quay mãi)", async () => {
    mockedFetch.mockResolvedValue(status("PAID"));
    render(<PaymentResult orderId="o1" intervalMs={1000} timeoutMs={2500} />);
    await advance(0);
    expect(mockedFetch).toHaveBeenCalledWith("/bookings/o1/payment-status");
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(4000);
    expect(screen.getByText("Chưa nhận được xác nhận thanh toán")).toBeInTheDocument();
  });

  it("EXPIRED -> thất bại, nút chọn lại ghế cùng suất và về trang chủ, dừng poll", async () => {
    mockedFetch.mockResolvedValueOnce(status("AWAITING_PAYMENT")).mockResolvedValue(status("EXPIRED"));
    render(<PaymentResult orderId="o1" showtimeId="st1" intervalMs={1000} timeoutMs={5000} />);
    await advance(0);
    expect(screen.getByText("Đang xác nhận thanh toán")).toBeInTheDocument();
    await advance(1000);
    expect(screen.getByText("Thanh toán không thành công")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chọn lại ghế" })).toHaveAttribute("href", "/dat-ve/st1");
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("hết thời gian chờ -> hướng dẫn liên hệ, ngừng polling", async () => {
    mockedFetch.mockResolvedValue(status("AWAITING_PAYMENT"));
    render(<PaymentResult orderId="o1" intervalMs={1000} timeoutMs={2500} />);
    await advance(4000);
    expect(screen.getByText(/liên hệ rạp/)).toBeInTheDocument();
    const calls = mockedFetch.mock.calls.length;
    await advance(5000);
    expect(mockedFetch).toHaveBeenCalledTimes(calls);
  });

  it("lỗi 403/404 -> báo ngay, không chờ hết timeout", async () => {
    mockedFetch.mockRejectedValue(new ApiError("FORBIDDEN", "x", 403));
    render(<PaymentResult orderId="o1" intervalMs={1000} timeoutMs={60_000} />);
    await advance(0);
    expect(screen.getByText("Không xem được đơn hàng này")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});

describe("TicketDetail", () => {
  it("MỘT QR cho cả đơn dù nhiều ghế: QR chỉ chứa qr_token của đơn; hiện danh sách ghế, mã, rạp + địa chỉ, nhắc không huỷ/đổi/hoàn", () => {
    render(<TicketDetail order={order()} />);
    const qrs = screen.getAllByTestId("ticket-qr");
    expect(qrs.map((q) => q.getAttribute("data-qr-value"))).toEqual(["o".repeat(32)]);
    expect(screen.getByText(/Ghế: F7, F8/)).toBeInTheDocument();
    expect(screen.getByText(/2 ghế/)).toBeInTheDocument();
    expect(screen.getByText(/Một mã QR cho cả đơn/)).toBeInTheDocument();
    expect(screen.getAllByText("HN01-7K3P9Q").length).toBeGreaterThan(0);
    expect(screen.getByText(/CINEMO Long Biên — 12 Nguyễn Văn Cừ/)).toBeInTheDocument();
    expect(screen.getByText(/quét tại rạp/)).toBeInTheDocument();
    expect(screen.getByText("Vé không hỗ trợ huỷ / đổi / hoàn tiền.")).toBeInTheDocument();
    expect(screen.queryByText("Đã soát vé")).not.toBeInTheDocument();
  });

  it("đơn checked_in: hiện 'Đã soát vé' ở mức đơn", () => {
    render(<TicketDetail order={order({ status: "checked_in" })} />);
    expect(screen.getByText("Đã soát vé")).toBeInTheDocument();
  });

  it("mở vé toàn màn hình: QR >= 280px, Wake Lock, đóng bằng Escape", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const user = userEvent.setup();
    render(<TicketDetail order={order()} />);
    await user.click(screen.getAllByRole("button", { name: /Mở vé toàn màn hình/ })[0]!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("bg-white");
    expect(Number(dialog.querySelector("svg")?.getAttribute("width"))).toBeGreaterThanOrEqual(280);
    expect(request).toHaveBeenCalledWith("screen");
    expect(screen.getByRole("button", { name: /Đóng/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(release).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("QR thường >= 240px", () => {
    render(<TicketDetail order={order()} />);
    const svg = screen.getAllByTestId("ticket-qr")[0]!.querySelector("svg");
    expect(Number(svg?.getAttribute("width"))).toBeGreaterThanOrEqual(240);
  });

  it("đơn affected: badge, hướng dẫn liên hệ CSKH, KHÔNG có QR", () => {
    render(<TicketDetail order={order({ status: "affected" })} />);
    expect(screen.getAllByText("Bị ảnh hưởng").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/liên hệ CSKH/);
    expect(screen.queryByTestId("ticket-qr")).not.toBeInTheDocument();
  });
});

describe("pages (AC-17, ma trận quyền)", () => {
  it("/ve: query lọc theo user_id; Admin không thấy đơn người khác", async () => {
    currentUser = { id: "admin", email_confirmed_at: "x" };
    tables = [dbRow({ id: "o1", user_id: "u1" }), dbRow({ id: "o2", user_id: "admin", booking_code: "HN01-BBBBBB" })];
    render(await VeCuaToiPage());
    expect(eqCalls).toContainEqual(["user_id", "admin"]);
    expect(screen.getByText("HN01-BBBBBB")).toBeInTheDocument();
    expect(screen.queryByText("HN01-AAAAAA")).not.toBeInTheDocument();
  });

  it("/ve: khách chưa xác nhận email -> danh sách rỗng, không truy vấn đơn", async () => {
    currentUser = { id: "u1", email_confirmed_at: null };
    tables = [dbRow()];
    render(await VeCuaToiPage());
    expect(screen.getByText("Bạn chưa có vé nào")).toBeInTheDocument();
    expect(screen.queryByText("HN01-AAAAAA")).not.toBeInTheDocument();
    expect(eqCalls).toHaveLength(0);
  });

  it("/ve: hiện đơn affected với badge Bị ảnh hưởng", async () => {
    tables = [dbRow({ status: "affected" })];
    render(await VeCuaToiPage());
    expect(screen.getByText("Bị ảnh hưởng")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/liên hệ CSKH/);
  });

  it("/ve/[code] của chính mình hiện vé; của người khác (kể cả Admin) -> 404", async () => {
    tables = [dbRow()];
    const params = Promise.resolve({ bookingCode: "HN01-AAAAAA" });
    render(await ChiTietVePage({ params }));
    expect(screen.getByTestId("ticket-qr")).toBeInTheDocument();
    cleanup();

    currentUser = { id: "admin", email_confirmed_at: "x" };
    await expect(ChiTietVePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("/ve/[code]: chưa xác nhận email -> 404", async () => {
    currentUser = { id: "u1", email_confirmed_at: null };
    tables = [dbRow()];
    await expect(ChiTietVePage({ params: Promise.resolve({ bookingCode: "HN01-AAAAAA" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("ket-qua: đơn PAID của mình hiện thành công ngay (đơn 0đ); đơn người khác -> 404", async () => {
    tables = [dbRow()];
    const params = Promise.resolve({ id: "o1" });
    render(await KetQuaPage({ params }));
    expect(screen.getByText("Đặt vé thành công")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-qr")).toBeInTheDocument();
    cleanup();

    currentUser = { id: "admin", email_confirmed_at: "x" };
    await expect(KetQuaPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ket-qua: đơn của mình chưa PAID -> màn đang xác nhận (polling)", async () => {
    tables = [dbRow({ status: "pending_payment" })];
    mockedFetch.mockResolvedValue(status("AWAITING_PAYMENT"));
    render(await KetQuaPage({ params: Promise.resolve({ id: "o1" }) }));
    expect(screen.getByText("Đang xác nhận thanh toán")).toBeInTheDocument();
  });
});

describe("ticket data", () => {
  it("toPaidOrderView ghép nhãn ghế theo order_seat_id, lấy địa chỉ + hotline rạp", () => {
    const row: OrderRow = {
      id: "o1",
      status: "paid",
      booking_code: "HN01-AAAAAA",
      movie_title: "P",
      cinema_name: "C",
      room_name: "R",
      showtime_starts_at: "s",
      showtime_ends_at: "e",
      cinemas: [{ address: "Addr", hotline: "19" }],
      order_seats: [
        { id: "s2", seat_label: "A10" },
        { id: "s1", seat_label: "A2" },
      ],
      tickets: [
        { order_seat_id: "s2", checked_in_at: null },
        { order_seat_id: "s1", checked_in_at: "x" },
      ],
      qr_token: "q".repeat(32),
    };
    const view = toPaidOrderView(row);
    expect(view?.cinemaAddress).toBe("Addr");
    expect(view?.cinemaHotline).toBe("19");
    expect(view?.tickets.map((t) => t.seatLabel)).toEqual(["A2", "A10"]);
    expect(view?.qrToken).toBe("q".repeat(32));
    expect(view?.tickets.every((t) => !("qrToken" in t))).toBe(true);
    expect(toPaidOrderView({ ...row, booking_code: null })).toBeNull();
  });

  it("chia sắp tới / đã qua theo giờ kết thúc suất", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    const future = order({ id: "f", endsAt: "2026-11-20T14:00:00Z" });
    const past = order({
      id: "p",
      startsAt: "2026-11-01T10:00:00Z",
      endsAt: "2026-11-01T12:00:00Z",
    });
    const { upcoming, past: pastList } = splitUpcomingAndPast([past, future], now);
    expect(upcoming.map((o) => o.id)).toEqual(["f"]);
    expect(pastList.map((o) => o.id)).toEqual(["p"]);
  });

  it("TicketCard link tới chi tiết theo mã đặt vé", () => {
    render(<TicketCard order={order()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/ve/HN01-7K3P9Q");
  });
});

describe("proxy protected paths", () => {
  it("bảo vệ /ve và đơn hàng, để mở sơ đồ chọn ghế cho khách", () => {
    expect(isProtectedPath("/ve")).toBe(true);
    expect(isProtectedPath("/ve/HN01-AAAAAA")).toBe(true);
    expect(isProtectedPath("/dat-ve/don/abc/ket-qua")).toBe(true);
    expect(isProtectedPath("/dat-ve/showtime-1")).toBe(false);
  });
});
