import "@testing-library/jest-dom/vitest";

import type { SeatMapItem } from "@filmbooking/shared/schemas/booking";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Client from "@/lib/api/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

import { CancelShowtimesDialog } from "../cancel-showtimes-dialog";
import { splitSelection } from "../seat-lock-panel";
import { ShowtimeBulkForm } from "../showtime-bulk-form";
import { dateRange, hasSoldSeats, nextDateKey, overlapConflicts } from "../showtime-utils";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", async (orig) => {
  const actual = await orig<typeof Client>();
  return { ...actual, apiFetch };
});

beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(cleanup);

const seat = (over: Partial<SeatMapItem>): SeatMapItem => ({
  id: "s1", row: "A", col: 1, colSpan: 1, type: "NORMAL", label: "A1", state: "FREE", expiresAt: null, price: 1, ...over,
});

describe("showtime-utils", () => {
  it("dateRange gồm cả hai đầu và nextDateKey qua tháng", () => {
    expect(dateRange("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(nextDateKey("2026-12-31")).toBe("2027-01-01");
  });

  it("overlapConflicts chỉ nhận 409 SHOWTIME_OVERLAP", () => {
    const conflicts = [{ roomId: "r", conflictsWith: [] }];
    const overlap = new ApiError("CONFLICT", "x", 409, { reason: "SHOWTIME_OVERLAP", conflicts });
    expect(overlapConflicts(overlap)).toEqual(conflicts);
    expect(overlapConflicts(new ApiError("CONFLICT", "x", 409, { reason: "SHOWTIME_HAS_SALES" }))).toBeNull();
    expect(overlapConflicts(new Error("x"))).toBeNull();
  });

  it("hasSoldSeats (R-54) chỉ tính ghế SOLD", () => {
    expect(hasSoldSeats([{ state: "HELD" }, { state: "FREE" }])).toBe(false);
    expect(hasSoldSeats([{ state: "SOLD" }])).toBe(true);
  });
});

describe("splitSelection (R-55)", () => {
  it("chỉ khoá ghế trống, mở khoá ghế LOCKED, bỏ ghế đã bán", () => {
    const seats = [seat({ id: "a" }), seat({ id: "b", state: "LOCKED" }), seat({ id: "c", state: "SOLD" })];
    const { toLock, toUnlock } = splitSelection(seats, new Set(["a", "b", "c"]));
    expect(toLock.map((s) => s.id)).toEqual(["a"]);
    expect(toUnlock.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("CancelShowtimesDialog (AC-24)", () => {
  it("lý do → preview → gõ mã rạp → huỷ", async () => {
    const user = userEvent.setup();
    const onCancelled = vi.fn();
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/preview")
          ? { showtimesCount: 3, paidOrdersCount: 10, webPaidOrdersCount: 10, posPaidOrdersCount: 0, holdingOrdersCount: 2, soldSeatsCount: 18, heldSeatsCount: 0, totalRefundAmount: 0 }
          : { success: true, cancelledShowtimesCount: 3, affectedOrdersCount: 10, cancelledHoldsCount: 0, cancelledOrdersCount: 2, emailsEnqueuedCount: 10 },
      ),
    );
    render(
      <CancelShowtimesDialog open onOpenChange={() => {}} cinemaId="c1" cinemaCode="HN01" target={{ allFuture: true }} scopeLabel="Tất cả" onCancelled={onCancelled} />,
    );

    const preview = screen.getByRole("button", { name: "Xem trước ảnh hưởng" });
    expect(preview).toBeDisabled();
    await user.type(screen.getByLabelText(/Lý do huỷ/), "Sự cố kỹ thuật");
    await user.click(preview);

    expect(apiFetch).toHaveBeenCalledWith("/cinemas/c1/showtimes/cancel/preview", { method: "POST", json: { allFuture: true } });
    expect(await screen.findByText(/10 đơn đã thanh toán sẽ chuyển sang/)).toBeInTheDocument();
    expect(screen.getByText(/10 email sẽ được gửi/)).toBeInTheDocument();
    expect(screen.getByText(/Không đổi suất/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
    const confirm = screen.getByRole("button", { name: /Huỷ 3 suất chiếu/ });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/Gõ mã rạp/), "hn01");
    await user.click(confirm);

    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenLastCalledWith("/cinemas/c1/showtimes/cancel", {
      method: "POST",
      json: { allFuture: true, reason: "Sự cố kỹ thuật" },
    });
  });
});

describe("ShowtimeBulkForm (AC-14)", () => {
  it("409 SHOWTIME_OVERLAP hiển thị suất xung đột", async () => {
    const user = userEvent.setup();
    const conflict = {
      cinemaId: "c1", roomId: "r1", startsAt: "2026-11-14T12:00:00.000Z", endsAt: "2026-11-14T14:15:00.000Z",
      conflictsWith: [{ id: "x", cinemaId: "c1", roomId: "r1", movieId: "m2", startsAt: "2026-11-14T11:30:00.000Z", endsAt: "2026-11-14T13:30:00.000Z", format: "2D", languageMode: "SUBTITLED", status: "ON_SALE" }],
    };
    apiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path.endsWith("/rooms")) return Promise.resolve([{ id: "r1", name: "Phòng 01", status: "ACTIVE", supportedFormats: ["2D"] }]);
      if (path === "/movies") return Promise.resolve([{ id: "m1", titleVi: "Phim A", durationMinutes: 100 }, { id: "m2", titleVi: "Phim B", durationMinutes: 100 }]);
      if (init?.method === "POST") return Promise.reject(new ApiError("CONFLICT", "Dữ liệu vừa thay đổi", 409, { reason: "SHOWTIME_OVERLAP", conflicts: [conflict] }));
      return Promise.resolve(undefined);
    });
    render(<ShowtimeBulkForm cinemaId="c1" onCreated={vi.fn()} />);

    await screen.findByText("Phòng 01");
    await user.selectOptions(screen.getByLabelText(/Phim/), "m1");
    await user.click(screen.getByLabelText("Phòng 01"));
    await user.click(screen.getByRole("button", { name: /Tạo 1 suất chiếu/ }));

    const list = await screen.findByTestId("conflict-list");
    expect(list).toHaveTextContent("Phòng 01");
    expect(list).toHaveTextContent("Phim B 18:30–20:30");
  });
});
