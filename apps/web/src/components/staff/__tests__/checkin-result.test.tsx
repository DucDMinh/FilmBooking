import "@testing-library/jest-dom/vitest";

import type { ScanTicketResponse } from "@filmbooking/shared/schemas/checkin";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckinResult } from "../checkin-result";
import { QrScanner } from "../qr-scanner";

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start() {
      return Promise.reject(new Error("NotAllowedError"));
    }
    stop() {
      return Promise.resolve();
    }
  },
}));

afterEach(cleanup);

const base = { message: "", color: "red" as const };

describe("CheckinResult", () => {
  it("OK: nền xanh + chữ + thông tin vé", () => {
    const response: ScanTicketResponse = {
      ...base,
      result: "OK",
      color: "green",
      order: {
        orderId: "o",
        bookingCode: "HN01-AAA",
        movieTitle: "Phim A",
        cinemaName: "CINEMO Long Biên",
        roomName: "Phòng 03",
        seats: ["C7", "C8", "C10"],
        seatCount: 3,
        startsAt: "2026-11-13T12:30:00Z",
        checkedInAt: "2026-11-13T12:05:00Z",
        combos: [{ name: "Combo Solo", quantity: 2 }],
      },
    };
    render(<CheckinResult response={response} onNext={() => undefined} />);
    expect(screen.getByRole("heading", { name: "VÉ HỢP LỆ" })).toBeInTheDocument();
    expect(screen.getByText("C7, C8, C10")).toBeInTheDocument();
    expect(screen.getByText("3 ghế")).toBeInTheDocument();
    expect(screen.getByText("Đã soát 3 ghế của đơn")).toBeInTheDocument();
    expect(screen.getByText("HN01-AAA")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("bg-success-banner");
    expect(screen.getByText("Bắp nước & Combo cần phát")).toBeInTheDocument();
    expect(screen.getByText("Combo Solo × 2")).toBeInTheDocument();
  });

  it("OK không có combo: không hiện khối bắp nước", () => {
    const response: ScanTicketResponse = {
      ...base,
      result: "OK",
      color: "green",
      order: {
        orderId: "o",
        bookingCode: "HN01-AAA",
        movieTitle: "Phim A",
        cinemaName: "CINEMO Long Biên",
        roomName: "Phòng 03",
        seats: ["C7"],
        seatCount: 1,
        startsAt: "2026-11-13T12:30:00Z",
        checkedInAt: "2026-11-13T12:05:00Z",
        combos: [],
      },
    };
    render(<CheckinResult response={response} onNext={() => undefined} />);
    expect(screen.queryByText(/Bắp nước/)).not.toBeInTheDocument();
  });

  it("USED (AC-12): nền đỏ, thời điểm + người soát lần đầu", () => {
    render(
      <CheckinResult
        response={{
          ...base,
          result: "USED",
          used: { checkedInAt: "2026-11-13T12:02:00Z", staffName: "Minh Anh" },
        }}
        onNext={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "VÉ ĐÃ SỬ DỤNG" })).toBeInTheDocument();
    expect(screen.getByText("Minh Anh")).toBeInTheDocument();
    expect(screen.getByText(/19:02/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("bg-danger-banner");
  });

  it("WRONG_CINEMA (AC-13): chỉ tên + địa chỉ rạp đúng; dữ liệu vé/khách rò từ API không được render", () => {
    const leaked = {
      ...base,
      result: "WRONG_CINEMA",
      correctCinema: {
        id: "c",
        code: "HN02",
        name: "CINEMO Cầu Giấy",
        address: "1 Cầu Giấy, Hà Nội",
      },
      order: {
        orderId: "o",
        bookingCode: "HN01-SECRET",
        movieTitle: "Phim A",
        cinemaName: "CINEMO Long Biên",
        roomName: "Phòng 03",
        seats: ["C7", "C8"],
        seatCount: 2,
        startsAt: "2026-11-13T12:30:00Z",
        checkedInAt: "2026-11-13T12:05:00Z",
        combos: [],
      },
      customerName: "Nguyễn Văn Khách",
    } as ScanTicketResponse;
    const { container } = render(<CheckinResult response={leaked} onNext={() => undefined} />);
    expect(screen.getByText("CINEMO Cầu Giấy")).toBeInTheDocument();
    expect(screen.getByText("1 Cầu Giấy, Hà Nội")).toBeInTheDocument();
    expect(screen.getByText("Vé không bị đánh dấu check-in.")).toBeInTheDocument();
    for (const secret of ["C7", "C8", "2 ghế", "Phim A", "Nguyễn Văn Khách", "HN01-SECRET", "Phòng 03"]) {
      expect(container).not.toHaveTextContent(secret);
    }
  });

  it("TOO_EARLY: hiện giờ mở check-in (30 phút trước suất)", () => {
    render(
      <CheckinResult
        response={{ ...base, result: "TOO_EARLY", startsAt: "2026-11-13T12:30:00Z" }}
        onNext={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "CHƯA ĐẾN GIỜ SOÁT VÉ" })).toBeInTheDocument();
    expect(screen.getByText("Mở check-in từ")).toBeInTheDocument();
    expect(screen.getByText(/19:00/)).toBeInTheDocument();
  });

  it.each([
    ["NOT_PAID", "ĐƠN CHƯA THANH TOÁN"],
    ["NOT_FOUND", "KHÔNG TÌM THẤY VÉ"],
  ] as const)("%s: hiện mã đã nhập và nút Nhập lại mã", (result, headline) => {
    render(<CheckinResult response={{ ...base, result }} scannedCode="HN01-XYZ" onNext={() => undefined} />);
    expect(screen.getByRole("heading", { name: headline })).toBeInTheDocument();
    expect(screen.getByText("Mã: HN01-XYZ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhập lại mã" })).toHaveFocus();
  });

  it("CANCELLED: hướng dẫn liên hệ CSKH; focus vào nút tiếp theo", () => {
    render(<CheckinResult response={{ ...base, result: "CANCELLED" }} onNext={() => undefined} />);
    expect(screen.getByText(/liên hệ CSKH/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quét vé khác" })).toHaveFocus();
  });

  it.each([
    ["CANCELLED", "VÉ ĐÃ HUỶ"],
    ["EXPIRED", "VÉ HẾT HẠN"],
  ] as const)("%s: có tiêu đề chữ + icon ẩn khỏi trình đọc", (result, headline) => {
    const { container } = render(<CheckinResult response={{ ...base, result }} onNext={() => undefined} />);
    expect(screen.getByRole("heading", { name: headline })).toBeInTheDocument();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("nút Quét vé khác gọi onNext", async () => {
    const onNext = vi.fn();
    render(<CheckinResult response={{ ...base, result: "EXPIRED" }} onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Quét vé khác" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("QrScanner", () => {
  it("không có quyền camera → báo fallback nhập mã", async () => {
    render(<QrScanner onScan={() => undefined} />);
    expect(await screen.findByText(/Hãy nhập mã vé/)).toBeInTheDocument();
  });
});
