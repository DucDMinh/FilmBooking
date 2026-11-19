import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ getServerAccessToken: async () => "tok" }));

import { CopyLayoutDialog } from "../copy-layout-dialog";
import { loadRoomAccess, rethrowRoomApiError } from "../room-access";
import { RoomLayoutPanel } from "../room-layout-panel";
import { RoomsManager, buildRoomPatch, type RoomListItem } from "../rooms-manager";

beforeEach(() => apiFetch.mockReset());
afterEach(cleanup);

const room = (over: Partial<RoomListItem> = {}): RoomListItem => ({
  id: "r1",
  name: "Phòng 1",
  supportedFormats: ["2D", "3D"],
  status: "ACTIVE",
  gridRows: 5,
  gridCols: 8,
  seatCount: 10,
  ...over,
});

describe("buildRoomPatch", () => {
  it("đổi tên không gửi supportedFormats hay status", () => {
    expect(buildRoomPatch(room(), { name: "Phòng A", formats: ["2D", "3D"], status: "ACTIVE" })).toEqual({
      name: "Phòng A",
    });
  });
  it("không đổi gì thì patch rỗng", () => {
    expect(buildRoomPatch(room(), { name: " Phòng 1 ", formats: ["3D", "2D"], status: "ACTIVE" })).toEqual({});
  });
  it("chỉ gửi định dạng khi định dạng đổi", () => {
    expect(buildRoomPatch(room(), { name: "Phòng 1", formats: ["2D"], status: "MAINTENANCE" })).toEqual({
      supportedFormats: ["2D"],
      status: "MAINTENANCE",
    });
  });
});

describe("RoomsManager", () => {
  it("sửa tên phòng 2D+3D chỉ PATCH {name}", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(undefined);
    render(<RoomsManager cinemaId="c1" rooms={[room()]} canEdit />);
    await user.click(screen.getByRole("button", { name: "Sửa" }));
    expect(screen.getByRole("checkbox", { name: "2D" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "3D" })).toBeChecked();
    const name = screen.getByLabelText("Tên phòng");
    await user.clear(name);
    await user.type(name, "Phòng A");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith("/cinemas/c1/rooms/r1", { method: "PATCH", json: { name: "Phòng A" } });
  });

  it("tạo phòng 2D+3D gửi đủ định dạng và lưới", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(undefined);
    render(<RoomsManager cinemaId="c1" rooms={[]} canEdit />);
    await user.click(screen.getByRole("button", { name: /Thêm phòng/ }));
    await user.type(screen.getByLabelText("Tên phòng"), "Phòng mới");
    await user.click(screen.getByRole("checkbox", { name: "3D" }));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith("/cinemas/c1/rooms", {
      method: "POST",
      json: { name: "Phòng mới", supportedFormats: ["2D", "3D"], status: "ACTIVE", gridRows: 10, gridCols: 12 },
    });
  });

  it("không cho bỏ hết định dạng", async () => {
    const user = userEvent.setup();
    render(<RoomsManager cinemaId="c1" rooms={[]} canEdit />);
    await user.click(screen.getByRole("button", { name: /Thêm phòng/ }));
    await user.type(screen.getByLabelText("Tên phòng"), "X");
    await user.click(screen.getByRole("checkbox", { name: "2D" }));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ít nhất một định dạng");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("hiện - khi không đọc được số ghế; Staff không thấy nút thêm/sửa", () => {
    render(<RoomsManager cinemaId="c1" rooms={[room({ seatCount: null })]} canEdit={false} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sửa" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Thêm phòng/ })).toBeNull();
  });
});

describe("RoomLayoutPanel", () => {
  it("map 409 ROOM_HAS_UPCOMING_SHOWTIMES sang thông báo tiếng Việt", async () => {
    const user = userEvent.setup();
    apiFetch.mockRejectedValueOnce(new ApiError("CONFLICT", "x", 409, { reason: "ROOM_HAS_UPCOMING_SHOWTIMES" }));
    render(
      <RoomLayoutPanel cinemaId="c1" roomId="r1" gridRows={1} gridCols={2} initialCells={[]} canEdit cinemas={[]} />,
    );
    await user.click(screen.getByRole("button", { name: /Lưu sơ đồ/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("còn suất sắp chiếu");
    expect(apiFetch.mock.calls[0]?.[0]).toBe("/cinemas/c1/rooms/r1/seats");
  });

  it("Staff (canEdit=false) không có nút lưu/sao chép", () => {
    render(
      <RoomLayoutPanel cinemaId="c1" roomId="r1" gridRows={1} gridCols={2} initialCells={[]} canEdit={false} cinemas={[]} />,
    );
    expect(screen.queryByRole("button", { name: /Lưu sơ đồ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sao chép/ })).toBeNull();
  });
});

describe("CopyLayoutDialog", () => {
  it("lấy phòng nguồn qua endpoint công khai theo mã rạp (kể cả rạp khác) và cảnh báo lưới", async () => {
    apiFetch.mockResolvedValue({ rooms: [{ id: "r2", name: "Phòng 2" }] });
    render(
      <CopyLayoutDialog
        open
        onOpenChange={vi.fn()}
        cinemaId="c1"
        roomId="r1"
        cinemas={[
          { id: "c1", code: "HN01", name: "Rạp 1" },
          { id: "c2", code: "HN02", name: "Rạp 2" },
        ]}
        onCopied={vi.fn()}
      />,
    );
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/cinemas/HN01"));
    expect(screen.getByText(/kích thước lưới của phòng này sẽ đổi/)).toBeInTheDocument();
  });
});

describe("loadRoomAccess", () => {
  const cinemas = [
    { id: "c1", code: "A", name: "Rạp A" },
    { id: "c2", code: "B", name: "Rạp B" },
  ];
  const setup = (me: unknown) =>
    apiFetch.mockImplementation(async (path: string) => (path === "/me" ? me : cinemas));

  it("Manager đúng rạp sửa được và chọn được nguồn ở rạp khác", async () => {
    setup({ isAdmin: false, cinemas: [{ cinemaId: "c1", role: "MANAGER" }] });
    const access = await loadRoomAccess("c1");
    expect(access.canEdit).toBe(true);
    expect(access.sourceCinemas.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
  it("Manager rạp khác không sửa được", async () => {
    setup({ isAdmin: false, cinemas: [{ cinemaId: "c2", role: "MANAGER" }] });
    expect((await loadRoomAccess("c1")).canEdit).toBe(false);
  });
  it("Staff không sửa được; Admin sửa được", async () => {
    setup({ isAdmin: false, cinemas: [{ cinemaId: "c1", role: "STAFF" }] });
    expect((await loadRoomAccess("c1")).canEdit).toBe(false);
    setup({ isAdmin: true, cinemas: [] });
    expect((await loadRoomAccess("c1")).canEdit).toBe(true);
  });
  it("403 chuyển tới /khong-co-quyen, 404 thành notFound", () => {
    expect(() => rethrowRoomApiError(new ApiError("FORBIDDEN_CINEMA", "x", 403))).toThrow("NEXT_REDIRECT:/khong-co-quyen");
    expect(() => rethrowRoomApiError(new ApiError("NOT_FOUND", "x", 404))).toThrow("NEXT_NOT_FOUND");
  });
});
