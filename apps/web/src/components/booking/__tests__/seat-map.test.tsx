import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { SeatMapItem, SeatMapResponse } from "@filmbooking/shared/schemas/booking";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api/client";
import type { SeatChannelClient } from "@/lib/realtime/use-showtime-seats";
import { HoldCountdown } from "../hold-countdown";
import { HoldExpiredDialog } from "../hold-expired-dialog";
import { SeatMap } from "../seat-map";
import { findOrphanSeatIds, seatAriaLabel } from "../seat-rules";
import { SeatPicker } from "../seat-picker";

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const NOW = new Date("2026-11-14T10:00:00.000Z");
const SHOWTIME_ID = "11111111-1111-4111-8111-111111111111";

function seat(row: string, col: number, over: Partial<SeatMapItem> = {}): SeatMapItem {
  return {
    id: `${row}${col}`,
    row,
    col,
    colSpan: 1,
    type: "NORMAL",
    label: `${row}${col}`,
    state: "FREE",
    expiresAt: null,
    price: 100000,
    ...over,
  };
}

function range(row: string, count: number, over: Partial<SeatMapItem> = {}): SeatMapItem[] {
  return Array.from({ length: count }, (_, i) => seat(row, i + 1, over));
}

function seatMapOf(seats: SeatMapItem[]): SeatMapResponse {
  return {
    showtime: {
      id: SHOWTIME_ID,
      cinemaId: "c",
      roomId: "r",
      movieId: "m",
      startsAt: "2026-11-20T12:00:00.000Z",
      endsAt: "2026-11-20T14:00:00.000Z",
      format: "2D",
      status: "SCHEDULED",
    },
    room: { id: "r", name: "Phòng 1", gridRows: 3, gridCols: 10 },
    pricing: { NORMAL: 100000, VIP: 120000, SWEETBOX: 320000 },
    seats,
  };
}

/** Mock kênh Realtime: lưu callback để test phát sự kiện. */
function fakeRealtime() {
  let handler: ((payload: unknown) => void) | undefined;
  let statusCb: ((status: string) => void) | undefined;
  const client = {
    channel: vi.fn(() => ({
      on: (_type: string, _filter: unknown, cb: (payload: unknown) => void) => {
        handler = cb;
        return {
          subscribe: (cb2?: (status: string) => void) => {
            statusCb = cb2;
            cb2?.("SUBSCRIBED");
            return {};
          },
        };
      },
    })),
    removeChannel: vi.fn(),
  } as unknown as SeatChannelClient;
  return {
    client,
    emit: (payload: unknown) => act(() => handler?.(payload)),
    status: (s: string) => act(() => statusCb?.(s)),
  };
}

function renderPicker(
  seats: SeatMapItem[],
  opts: {
    auth?: "guest" | "unconfirmed" | "ready";
    age?: "T16" | null;
    ageUnknown?: boolean;
    rt?: ReturnType<typeof fakeRealtime>;
  } = {},
) {
  const rt = opts.rt ?? fakeRealtime();
  const view = render(
    <SeatPicker
      showtimeId={SHOWTIME_ID}
      initialSeatMap={seatMapOf(seats)}
      ageRating={opts.age ?? null}
      ageUnknown={opts.ageUnknown}
      auth={opts.auth ?? "ready"}
      createRealtimeClient={() => rt.client}
    />,
  );
  return Object.assign(rt, { unmount: view.unmount });
}

/** waitFor của RTL treo khi dùng fake timers: đẩy microtask/timer thủ công. */
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(50)));

const seatButton = (name: RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("seat-rules", () => {
  it("aria-label đúng định dạng NFR-12 và sweetbox ghi 2 số ghế", () => {
    expect(seatAriaLabel(seat("E", 5, { type: "VIP", price: 120000 }), false)).toBe(
      "Hàng E ghế 5, VIP, 120.000 đồng, trống",
    );
    expect(seatAriaLabel(seat("H", 7, { type: "SWEETBOX", colSpan: 2, price: 320000 }), false)).toBe(
      "Hàng H ghế 7-8, Sweetbox, 320.000 đồng, trống",
    );
    expect(seatAriaLabel(seat("A", 1, { state: "SOLD" }), false)).toContain("đã bán");
    expect(seatAriaLabel(seat("A", 1, { state: "HELD" }), false)).toContain("đang giữ");
    expect(seatAriaLabel(seat("A", 1, { state: "LOCKED" }), false)).toContain("khoá");
    expect(seatAriaLabel(seat("A", 1, { type: "BROKEN" }), false)).toContain("hỏng");
    expect(seatAriaLabel(seat("A", 1), true)).toContain("đang chọn");
  });

  it("phát hiện ghế lẻ chỉ khi việc chọn tạo ra nó", () => {
    const row = range("E", 5);
    expect(findOrphanSeatIds(row, new Set(["E2"]))).toEqual(["E1"]);
    expect(findOrphanSeatIds(row, new Set(["E1", "E2"]))).toEqual([]);
    expect(findOrphanSeatIds(row, new Set(["E3"]))).toEqual([]);
    // ghế lẻ có sẵn từ trước (không do mình chọn) không bị tính
    const preexisting = [seat("E", 1), seat("E", 2, { state: "SOLD" }), seat("E", 3)];
    expect(findOrphanSeatIds(preexisting, new Set())).toEqual([]);
  });

  it("mirror server: đoạn <= 2 ghế giữa barrier, chọn 1 ghế vẫn cho qua", () => {
    const row = [seat("E", 1, { state: "LOCKED" }), seat("E", 2), seat("E", 3), seat("E", 4, { type: "BROKEN" })];
    expect(findOrphanSeatIds(row, new Set(["E2"]))).toEqual([]);
    // đoạn 3 ghế giữa barrier: chọn ghế đầu để lại 1 ghế lẻ ở giữa là không có; chọn ghế 2/3 -> ghế còn lại lẻ
    const wide = [seat("E", 1, { state: "LOCKED" }), seat("E", 2), seat("E", 3), seat("E", 4), seat("E", 5, { state: "LOCKED" })];
    expect(findOrphanSeatIds(wide, new Set(["E3"]))).toEqual(["E2", "E4"]);
    // lối đi (thiếu cột) cũng ngắt đoạn
    const gap = [seat("E", 1), seat("E", 2), seat("E", 4), seat("E", 5)];
    expect(findOrphanSeatIds(gap, new Set(["E1"]))).toEqual([]);
  });

  it("sweetbox không phải barrier và không bị coi là ghế lẻ", () => {
    const row = [seat("E", 1), seat("E", 2), seat("E", 3), seat("E", 4, { type: "SWEETBOX", colSpan: 2 })];
    expect(findOrphanSeatIds(row, new Set(["E1", "E2", "E4"]))).toEqual(["E3"]);
  });
});

describe("SeatMap a11y", () => {
  it("mỗi ghế là button có aria-label; ghế không chọn được có aria-disabled", () => {
    render(
      <SeatMap
        seats={[seat("E", 5, { type: "VIP", price: 120000 }), seat("E", 6, { state: "SOLD" })]}
        selectedIds={new Set()}
        onSeatActivate={() => undefined}
      />,
    );
    expect(screen.getByRole("grid", { name: "Sơ đồ ghế" })).toBeInTheDocument();
    expect(seatButton(/^Hàng E ghế 5, VIP, 120\.000 đồng, trống$/)).toHaveAttribute("aria-pressed", "false");
    expect(seatButton(/ghế 6.*đã bán/)).toHaveAttribute("aria-disabled", "true");
  });

  it("điều hướng bằng phím mũi tên (roving tabindex) và chọn bằng Enter", () => {
    const onActivate = vi.fn();
    render(
      <SeatMap
        seats={[...range("A", 3), ...range("B", 3)]}
        selectedIds={new Set()}
        onSeatActivate={onActivate}
      />,
    );
    const a1 = seatButton(/Hàng A ghế 1,/);
    expect(a1).toHaveAttribute("tabindex", "0");
    expect(seatButton(/Hàng A ghế 2,/)).toHaveAttribute("tabindex", "-1");

    a1.focus();
    fireEvent.keyDown(a1, { key: "ArrowRight" });
    expect(seatButton(/Hàng A ghế 2,/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(seatButton(/Hàng B ghế 2,/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(seatButton(/Hàng B ghế 1,/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(seatButton(/Hàng A ghế 1,/)).toHaveFocus();
    expect(seatButton(/Hàng A ghế 1,/)).toHaveAttribute("tabindex", "0");

    // button native: Enter/Space kích hoạt click
    fireEvent.click(document.activeElement as Element);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "A1" }));
  });
});

describe("SeatPicker — ràng buộc chọn ghế", () => {
  it("chặn ghế thứ 9 và báo thông điệp, không gọi API", () => {
    renderPicker(range("A", 10));
    for (let c = 1; c <= 8; c++) fireEvent.click(seatButton(new RegExp(`Hàng A ghế ${c},`)));
    expect(screen.getByRole("list", { name: "Danh sách ghế đã chọn" }).children).toHaveLength(8);

    fireEvent.click(seatButton(/Hàng A ghế 9,/));
    expect(toastMock.error).toHaveBeenCalledWith("Tối đa 8 ghế mỗi đơn");
    expect(screen.getByRole("list", { name: "Danh sách ghế đã chọn" }).children).toHaveLength(8);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sweetbox tính 2 ghế vào giới hạn 8", () => {
    renderPicker([...range("A", 6), seat("B", 1, { type: "SWEETBOX", colSpan: 2 }), seat("B", 3, { type: "SWEETBOX", colSpan: 2 })]);
    for (let c = 1; c <= 6; c++) fireEvent.click(seatButton(new RegExp(`Hàng A ghế ${c},`)));
    fireEvent.click(seatButton(/Hàng B ghế 1-2,/)); // 6 + 2 = 8
    fireEvent.click(seatButton(/Hàng B ghế 3-4,/)); // 10 > 8
    expect(toastMock.error).toHaveBeenCalledWith("Tối đa 8 ghế mỗi đơn");
  });

  it("chọn tạo ghế lẻ -> báo trước và khoá Tiếp tục, chưa gọi API", () => {
    renderPicker(range("E", 5));
    fireEvent.click(seatButton(/Hàng E ghế 2,/));
    expect(screen.getByText(/Không để trống 1 ghế lẻ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("phim T16: phải tick xác nhận độ tuổi mới được Tiếp tục", () => {
    renderPicker(range("E", 5), { age: "T16" });
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tất cả người xem đủ tuổi theo quy định" }));
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeEnabled();
  });
});

describe("SeatPicker — xác thực", () => {
  it("khách chưa đăng nhập bấm ghế -> LoginRequiredDialog giữ next", () => {
    renderPicker(range("E", 5), { auth: "guest" });
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Đăng nhập để chọn ghế")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      `/dang-nhap?next=${encodeURIComponent(`/dat-ve/${SHOWTIME_ID}`)}`,
    );
  });

  it("chưa xác nhận email: hiện banner và chặn chọn", () => {
    renderPicker(range("E", 5), { auth: "unconfirmed" });
    expect(screen.getByText(/cần xác nhận email/)).toBeInTheDocument();
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    expect(toastMock.info).toHaveBeenCalled();
    expect(screen.getByText(/Chọn ít nhất 1 ghế/)).toBeInTheDocument();
  });
});

describe("SeatPicker — realtime (AC-06, AC-07)", () => {
  it("sự kiện realtime đổi trạng thái ô ghế ngay (≤ 2s)", () => {
    const rt = renderPicker(range("E", 5));
    expect(rt.client.channel).toHaveBeenCalledWith(`seats:${SHOWTIME_ID}`);
    const expiresAt = new Date(NOW.getTime() + 60_000).toISOString();
    rt.emit({ eventType: "UPDATE", new: { showtime_id: SHOWTIME_ID, seat_id: "E3", state: "HELD", expires_at: expiresAt }, old: {} });
    expect(seatButton(/Hàng E ghế 3,.*đang giữ/)).toHaveAttribute("aria-disabled", "true");
    rt.emit({ eventType: "DELETE", new: {}, old: { showtime_id: SHOWTIME_ID, seat_id: "E3" } });
    expect(seatButton(/Hàng E ghế 3,.*trống/)).not.toHaveAttribute("aria-disabled");
  });

  it("ghế HELD hết expires_at tự thành trống ở client trong ≤ 2s, không cần sự kiện", () => {
    const expiresAt = new Date(NOW.getTime() + 3_000).toISOString();
    renderPicker([seat("E", 1, { state: "HELD", expiresAt }), ...range("E", 5).slice(1).map((s) => ({ ...s }))]);
    expect(seatButton(/Hàng E ghế 1,.*đang giữ/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2_000));
    expect(seatButton(/Hàng E ghế 1,.*đang giữ/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2_000)); // đã qua expires_at 1s
    expect(seatButton(/Hàng E ghế 1,.*trống/)).toBeInTheDocument();
  });

  it("ghế mình đang chọn bị người khác giữ -> bỏ chọn + toast", () => {
    const rt = renderPicker(range("E", 5));
    fireEvent.click(seatButton(/Hàng E ghế 5,/));
    expect(screen.getByRole("list", { name: "Danh sách ghế đã chọn" })).toHaveTextContent("E5");
    rt.emit({
      eventType: "INSERT",
      new: { showtime_id: SHOWTIME_ID, seat_id: "E5", state: "HELD", expires_at: new Date(NOW.getTime() + 60_000).toISOString() },
      old: {},
    });
    expect(toastMock.warning).toHaveBeenCalledWith("E5 vừa có người chọn");
    expect(screen.getByText(/Chọn ít nhất 1 ghế/)).toBeInTheDocument();
  });

  it("bỏ qua sự kiện của suất khác (DELETE không áp filter) — ghế SOLD giữ nguyên", () => {
    const rt = renderPicker([seat("E", 1, { state: "SOLD" }), ...range("E", 5).slice(1)]);
    rt.emit({ eventType: "DELETE", new: {}, old: { showtime_id: "other-showtime", seat_id: "E1" } });
    expect(seatButton(/Hàng E ghế 1,.*đã bán/)).toBeInTheDocument();
  });

  it("unmount gỡ kênh Realtime", () => {
    const rt = renderPicker(range("E", 5));
    rt.unmount();
    expect(rt.client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("mất kênh -> cảnh báo offline", () => {
    const rt = renderPicker(range("E", 5));
    rt.status("CHANNEL_ERROR");
    expect(screen.getByText(/Mất kết nối/)).toBeInTheDocument();
  });
});

describe("SeatPicker — giữ ghế", () => {
  it("giữ thành công -> chuyển sang màn xác nhận đơn", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      orderId: "ord-1",
      holdExpiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    });
    renderPicker(range("E", 5));
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await flush();
    expect(mockPush).toHaveBeenCalledWith("/dat-ve/don/ord-1/xac-nhan");
    expect(apiFetch).toHaveBeenCalledWith(
      "/bookings/holds",
      expect.objectContaining({ method: "POST", json: { showtimeId: SHOWTIME_ID, seatIds: ["E3"] } }),
    );
  });

  it("ghế chuyển HELD do chính hold của mình: không toast, không bỏ chọn", async () => {
    let resolveHold: (v: unknown) => void = () => undefined;
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise((r) => (resolveHold = r)));
    const rt = renderPicker(range("E", 5));
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    rt.emit({
      eventType: "INSERT",
      new: { showtime_id: SHOWTIME_ID, seat_id: "E3", state: "HELD", expires_at: new Date(NOW.getTime() + 60_000).toISOString() },
      old: {},
    });
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "Danh sách ghế đã chọn" })).toHaveTextContent("E3");
    resolveHold({ orderId: "ord-9", holdExpiresAt: new Date(NOW.getTime() + 600_000).toISOString() });
    await flush();
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/dat-ve/don/ord-9/xac-nhan");
  });

  it("age-confirm lỗi -> nhả ghế vừa giữ và báo lỗi, không chuyển trang", async () => {
    const { ApiError } = await import("@/lib/api/client");
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ orderId: "ord-7", holdExpiresAt: new Date(NOW.getTime() + 600_000).toISOString() })
      .mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "Đã có lỗi xảy ra.", 500))
      .mockResolvedValueOnce(undefined);
    renderPicker(range("E", 5), { age: "T16" });
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Tất cả người xem đủ tuổi theo quy định" }));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await flush();
    expect(apiFetch).toHaveBeenCalledWith("/bookings/ord-7/hold", { method: "DELETE" });
    expect(toastMock.error).toHaveBeenCalledWith("Đã có lỗi xảy ra.");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("luôn có dòng nhắc không huỷ / hoàn vé", () => {
    renderPicker(range("E", 5));
    expect(screen.getByText("Không hỗ trợ huỷ / hoàn vé")).toBeInTheDocument();
  });

  it("không biết phân loại tuổi phim -> chặn Tiếp tục và báo", () => {
    renderPicker(range("E", 5), { ageUnknown: true });
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    expect(screen.getByText(/Không xác định được phân loại độ tuổi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled();
  });

  it("SEAT_TAKEN: nạp lại sơ đồ, ghế chuyển Đang giữ và bị bỏ khỏi lựa chọn (AC-06)", async () => {
    const { ApiError } = await import("@/lib/api/client");
    const taken = range("E", 5).map((s) =>
      s.id === "E5" ? { ...s, state: "HELD" as const, expiresAt: new Date(NOW.getTime() + 60_000).toISOString() } : s,
    );
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new ApiError("SEAT_TAKEN", "Ghế vừa có người giữ.", 409))
      .mockResolvedValueOnce(seatMapOf(taken));
    renderPicker(range("E", 5));
    fireEvent.click(seatButton(/Hàng E ghế 5,/));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await flush();
    expect(toastMock.warning).toHaveBeenCalledWith("E5 vừa có người chọn");
    expect(seatButton(/Hàng E ghế 5,.*đang giữ/)).toBeInTheDocument();
    expect(screen.getByText(/Chọn ít nhất 1 ghế/)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("DOB_REQUIRED: toast nêu rõ cần cập nhật ngày sinh, kèm nút tới hồ sơ (CR-017, R-68)", async () => {
    const { ApiError } = await import("@/lib/api/client");
    const message = "Vui lòng cập nhật ngày sinh trong hồ sơ trước khi đặt vé phim có giới hạn độ tuổi.";
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError("DOB_REQUIRED", message, 422));
    renderPicker(range("E", 5));
    fireEvent.click(seatButton(/Hàng E ghế 3,/));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await flush();

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const [shownMessage, options] = toastMock.error.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(shownMessage).toBe(message);
    expect(shownMessage).not.toMatch(/chưa hợp lệ/i);
    expect(options.action.label).toBe("Cập nhật hồ sơ");
    expect(mockPush).not.toHaveBeenCalled();

    options.action.onClick();
    expect(mockPush).toHaveBeenCalledWith("/tai-khoan");
  });
});

describe("HoldCountdown", () => {
  it("đếm ngược theo expires_at và gọi onExpire đúng 1 lần khi hết giờ", () => {
    const onExpire = vi.fn();
    render(<HoldCountdown expiresAt={new Date(NOW.getTime() + 3_000).toISOString()} onExpire={onExpire} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:03");
    act(() => void vi.advanceTimersByTime(2_000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:01");
    expect(onExpire).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe("HoldExpiredDialog", () => {
  it("hết giờ giữ: hiện dialog và nút Chọn lại ghế quay về sơ đồ", () => {
    const onBack = vi.fn();
    render(<HoldExpiredDialog open onBackToSeatMap={onBack} />);
    expect(screen.getByText("Hết thời gian giữ ghế")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chọn lại ghế" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
