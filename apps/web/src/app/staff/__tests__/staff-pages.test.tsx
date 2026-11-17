import "@testing-library/jest-dom/vitest";

import type { ScanTicketResponse } from "@filmbooking/shared/schemas/checkin";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const push = vi.fn();
const router = { replace, push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@/lib/api/client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

interface ScannerProps {
  onScan: (text: string) => void;
  paused?: boolean;
}
let scannerProps: ScannerProps = { onScan: () => undefined };
vi.mock("@/components/staff/qr-scanner", () => ({
  QrScanner: (props: ScannerProps) => {
    scannerProps = props;
    return <div data-testid="scanner" data-paused={String(Boolean(props.paused))} />;
  },
}));

import ChooseCinemaPage from "../chon-rap/page";
import ScanTicketPage from "../soat-ve/page";

const cinemas = [
  { id: "a", code: "HN01", name: "CINEMO A", address: "addr A" },
  { id: "b", code: "HN02", name: "CINEMO B", address: "addr B" },
];

function mockApi(me: unknown, scan?: (body: unknown) => Promise<unknown>) {
  apiFetch.mockImplementation((path: string, init?: { json?: unknown }) => {
    if (path === "/me") return Promise.resolve(me);
    if (path === "/cinemas") return Promise.resolve(cinemas);
    if (path === "/checkin/scan" && scan) return scan(init?.json);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const staffOfBoth = {
  isAdmin: false,
  cinemas: [
    { cinemaId: "a", role: "STAFF" },
    { cinemaId: "b", role: "STAFF" },
  ],
};
const staffOfA = { isAdmin: false, cinemas: [{ cinemaId: "a", role: "STAFF" }] };

const okResponse: ScanTicketResponse = {
  result: "OK",
  color: "green",
  message: "",
  order: {
    orderId: "o",
    bookingCode: "HN01-OK1",
    movieTitle: "Phim A",
    cinemaName: "CINEMO A",
    roomName: "P1",
    seats: ["C7", "C8"],
    seatCount: 2,
    startsAt: "2026-11-13T12:30:00Z",
    checkedInAt: "2026-11-13T12:05:00Z",
  },
};

beforeEach(() => {
  apiFetch.mockReset();
  replace.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("ChooseCinemaPage", () => {
  it("chỉ có 1 rạp: tự lưu và chuyển sang soát vé", async () => {
    mockApi(staffOfA);
    render(<ChooseCinemaPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/soat-ve"));
    expect(window.sessionStorage.getItem("staff.cinemaId")).toBe("a");
  });

  it("nhiều rạp: chọn rồi bắt đầu", async () => {
    mockApi(staffOfBoth);
    render(<ChooseCinemaPage />);
    const start = await screen.findByRole("button", { name: "Bắt đầu soát vé" });
    expect(start).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/HN02/));
    expect(start).toBeEnabled();
    await userEvent.click(start);
    expect(window.sessionStorage.getItem("staff.cinemaId")).toBe("b");
    expect(push).toHaveBeenCalledWith("/staff/soat-ve");
  });
});

describe("ScanTicketPage", () => {
  it("chưa chọn rạp (nhiều rạp): chuyển về chọn rạp", async () => {
    mockApi(staffOfBoth);
    render(<ScanTicketPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/chon-rap"));
  });

  it("nhập mã: gửi đúng body, hiện kết quả, lịch sử dùng booking code", async () => {
    window.sessionStorage.setItem("staff.cinemaId", "b");
    const scan = vi.fn().mockResolvedValue(okResponse);
    mockApi(staffOfBoth, scan);
    render(<ScanTicketPage />);
    await userEvent.type(await screen.findByLabelText("Nhập mã vé"), " HN01-OK1 ");
    await userEvent.click(screen.getByRole("button", { name: "Tra cứu vé" }));
    expect(scan).toHaveBeenCalledWith({ cinemaId: "b", bookingCode: "HN01-OK1" });
    expect(await screen.findByRole("heading", { name: "VÉ HỢP LỆ" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Quét vé khác" }));
    expect(screen.queryByRole("heading", { name: "VÉ HỢP LỆ" })).toBeNull();
    expect(screen.getByText(/HN01-OK1 • Hợp lệ/)).toBeInTheDocument();
  });

  it("quét QR: gửi token một lần, khoá scanner, lịch sử không lộ token", async () => {
    window.sessionStorage.setItem("staff.cinemaId", "a");
    const scan = vi.fn().mockResolvedValue({ result: "NOT_FOUND", color: "red", message: "" });
    mockApi(staffOfA, scan);
    render(<ScanTicketPage />);
    await screen.findByTestId("scanner");
    act(() => scannerProps.onScan("SECRET-QR-TOKEN"));
    act(() => scannerProps.onScan("SECRET-QR-TOKEN"));
    await screen.findByRole("heading", { name: "KHÔNG TÌM THẤY VÉ" });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith({ cinemaId: "a", token: "SECRET-QR-TOKEN" });
    await userEvent.click(screen.getByRole("button", { name: "Nhập lại mã" }));
    expect(screen.getByText(/Mã QR • Không tìm thấy/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("SECRET-QR-TOKEN •");
  });

  it("lỗi API: scanner bị khoá (không spam), lỗi hiển thị ổn định, Thử lại mở khoá", async () => {
    window.sessionStorage.setItem("staff.cinemaId", "a");
    const scan = vi.fn().mockRejectedValue(new Error("boom"));
    mockApi(staffOfA, scan);
    render(<ScanTicketPage />);
    await screen.findByTestId("scanner");
    act(() => scannerProps.onScan("bad"));
    await screen.findByText("Không soát được vé. Vui lòng thử lại.");
    expect(screen.getByTestId("scanner")).toHaveAttribute("data-paused", "true");
    act(() => scannerProps.onScan("bad"));
    act(() => scannerProps.onScan("bad"));
    expect(scan).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(screen.getByTestId("scanner")).toHaveAttribute("data-paused", "false");
    act(() => scannerProps.onScan("bad"));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
  });

  it("lịch sử giữ tối đa 5 mục", async () => {
    window.sessionStorage.setItem("staff.cinemaId", "a");
    mockApi(staffOfA, () => Promise.resolve({ result: "EXPIRED", color: "red", message: "" }));
    render(<ScanTicketPage />);
    const input = await screen.findByLabelText("Nhập mã vé");
    for (let i = 1; i <= 7; i++) {
      // fireEvent.change thay userEvent.type (gõ từng ký tự ×7 vòng làm test chậm >5s khi máy tải).
      fireEvent.change(input, { target: { value: `CODE${i}` } });
      await userEvent.click(screen.getByRole("button", { name: "Tra cứu vé" }));
      await userEvent.click(await screen.findByRole("button", { name: "Quét vé khác" }));
    }
    expect(screen.getAllByText(/• Hết hạn/)).toHaveLength(5);
    expect(screen.queryByText(/CODE1 •/)).toBeNull();
    expect(screen.getByText(/CODE7 •/)).toBeInTheDocument();
  });
});
