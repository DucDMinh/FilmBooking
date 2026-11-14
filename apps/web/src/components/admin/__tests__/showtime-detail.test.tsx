import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Client from "@/lib/api/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShowtimeDetailPage from "@/app/admin/lich-chieu/[id]/page";
import { ApiError } from "@/lib/api/client";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", async (orig) => ({ ...(await orig<typeof Client>()), apiFetch }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "st1" }),
  useSearchParams: () => new URLSearchParams("cinema=c1"),
}));

const seat = (id: string, state: string) => ({
  id, row: "A", col: 1, colSpan: 1, type: "NORMAL", label: id, state, expiresAt: null, price: 1,
});

const FUTURE = new Date(Date.now() + 7 * 86_400_000);

interface Opts {
  status: string;
  states?: string[];
  seatmapError?: ApiError;
  startsAt?: Date;
  onWrite?: (method: string, path: string) => Promise<unknown>;
}

/** Mô phỏng API thật: GET chi tiết admin trả mọi trạng thái; seatmap công khai lỗi với suất đã huỷ. */
function mockApi({ status, states = ["FREE"], seatmapError, startsAt = FUTURE, onWrite }: Opts) {
  apiFetch.mockImplementation((path: string, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    if (method !== "GET" && onWrite) return onWrite(method, path);
    if (path === "/me") return Promise.resolve({ isAdmin: false, cinemas: [{ cinemaId: "c1" }] });
    if (path === "/cinemas") return Promise.resolve([{ id: "c1", code: "HN01", name: "Rạp Hà Nội" }]);
    if (path === "/cinemas/c1/showtimes/st1") {
      return Promise.resolve({
        id: "st1", cinemaId: "c1", roomId: "r1", movieId: "m1", format: "2D", languageMode: "SUBTITLED", status,
        startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 7_200_000).toISOString(),
      });
    }
    if (path.endsWith("/seatmap")) {
      if (status === "CANCELLED" || seatmapError) {
        return Promise.reject(seatmapError ?? new ApiError("SHOWTIME_CANCELLED", "Suất đã huỷ", 410));
      }
      return Promise.resolve({ seats: states.map((s, i) => seat(`s${i}`, s)) });
    }
    if (path.endsWith("/rooms")) {
      return Promise.resolve([
        { id: "r1", name: "Phòng 01", status: "ACTIVE", supportedFormats: ["2D"] },
        { id: "r2", name: "Phòng bảo trì", status: "MAINTENANCE", supportedFormats: ["2D"] },
        { id: "r3", name: "Phòng IMAX", status: "ACTIVE", supportedFormats: ["IMAX"] },
      ]);
    }
    if (path === "/movies") return Promise.resolve([{ id: "m1", titleVi: "Phim A", durationMinutes: 100 }]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(cleanup);

describe("Chi tiết suất (R-54)", () => {
  it("suất đã bán: sửa giờ/phòng và xoá bị disabled kèm lý do", async () => {
    mockApi({ status: "ON_SALE", states: ["SOLD", "FREE"] });
    render(<ShowtimeDetailPage />);
    expect(await screen.findByTestId("edit-lock-reason")).toHaveTextContent("R-54");
    expect(screen.getByLabelText("Giờ bắt đầu")).toBeDisabled();
    expect(screen.getByLabelText("Phòng")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xoá suất" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đóng bán" })).toBeEnabled();
    expect(screen.getByTestId("sold-count")).toHaveTextContent("1/2");
  });

  it("suất chưa bán: cho sửa; dropdown phòng loại phòng bảo trì và phòng không hỗ trợ định dạng", async () => {
    mockApi({ status: "ON_SALE" });
    render(<ShowtimeDetailPage />);
    expect(await screen.findByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
    const options = within(screen.getByLabelText("Phòng")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Phòng 01"]);
  });
});

describe("Suất đã huỷ / rạp đóng (F1)", () => {
  it("suất CANCELLED: seatmap công khai lỗi nhưng trang vẫn hiện badge Đã huỷ và khoá thao tác", async () => {
    mockApi({ status: "CANCELLED" });
    render(<ShowtimeDetailPage />);
    expect(await screen.findByText("Đã huỷ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thử lại/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ suất" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(screen.getByTestId("seats-unavailable")).toHaveTextContent("đã huỷ");
    expect(apiFetch).not.toHaveBeenCalledWith("/showtimes/st1/seatmap", expect.anything());
  });

  it("rạp tạm đóng (seatmap NOT_FOUND): vẫn quản lý được suất, chỉ thiếu sơ đồ ghế", async () => {
    mockApi({ status: "ON_SALE", seatmapError: new ApiError("NOT_FOUND", "x", 404) });
    render(<ShowtimeDetailPage />);
    expect(await screen.findByRole("button", { name: "Đóng bán" })).toBeEnabled();
    expect(screen.getByTestId("seats-unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ suất" })).toBeEnabled();
  });

  it("suất đã qua giờ chiếu: nút Huỷ suất bị disabled (F3)", async () => {
    mockApi({ status: "ON_SALE", startsAt: new Date(Date.now() - 3_600_000) });
    render(<ShowtimeDetailPage />);
    expect(await screen.findByRole("button", { name: "Đóng bán" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Huỷ suất" })).toBeDisabled();
  });
});

describe("Xoá suất (F2)", () => {
  it("API lỗi 409: KHÔNG báo đã xoá, hiện lỗi và giữ trang", async () => {
    mockApi({
      status: "ON_SALE",
      onWrite: () => Promise.reject(new ApiError("CONFLICT", "Suất đã có vé bán", 409, { reason: "SHOWTIME_HAS_SALES" })),
    });
    render(<ShowtimeDetailPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Xoá suất" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Xoá suất" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Suất đã có vé bán");
    expect(screen.queryByText(/Đã xoá suất/)).not.toBeInTheDocument();
  });

  it("API thành công: báo đã xoá và không gọi lại GET suất", async () => {
    mockApi({ status: "ON_SALE", onWrite: () => Promise.resolve(undefined) });
    render(<ShowtimeDetailPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Xoá suất" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Xoá suất" }));
    await waitFor(() => expect(screen.getByText(/Đã xoá suất/)).toBeInTheDocument());
    const detailGets = apiFetch.mock.calls.filter(([p, init]) => p === "/cinemas/c1/showtimes/st1" && !init?.method);
    expect(detailGets).toHaveLength(1);
  });
});
