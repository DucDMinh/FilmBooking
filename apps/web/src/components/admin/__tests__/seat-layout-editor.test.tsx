import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SeatLayoutEditor,
  applyTool,
  summarizeLayout,
  toCells,
  toLayoutMap,
} from "../seat-layout-editor";

afterEach(cleanup);

describe("applyTool", () => {
  it("đặt Sweetbox chiếm 2 ô liền kề", () => {
    const { layout, error } = applyTool(toLayoutMap([]), "A", 3, "sweetbox", 6);
    expect(error).toBeUndefined();
    expect(toCells(layout)).toEqual([{ row: "A", col: 3, type: "sweetbox" }]);
  });

  it("báo lỗi và không đổi gì khi Sweetbox ở ô cuối hàng", () => {
    const start = toLayoutMap([{ row: "A", col: 6, type: "standard" }]);
    const result = applyTool(start, "A", 6, "sweetbox", 6);
    expect(result.error).toMatch(/2 ô liền kề/);
    expect(result.layout).toBe(start);
  });

  it("đè lên một nửa Sweetbox thì gỡ cả Sweetbox, không để lại ghế đôi lẻ", () => {
    const start = toLayoutMap([{ row: "A", col: 2, type: "sweetbox" }]);
    const { layout } = applyTool(start, "A", 3, "standard", 6);
    expect(toCells(layout)).toEqual([{ row: "A", col: 3, type: "standard" }]);
  });

  it("đặt Sweetbox đè lên ô kế bên sẽ thay thế ô đó", () => {
    const start = toLayoutMap([{ row: "A", col: 2, type: "vip" }]);
    const { layout } = applyTool(start, "A", 1, "sweetbox", 6);
    expect(toCells(layout)).toEqual([{ row: "A", col: 1, type: "sweetbox" }]);
  });

  it("empty xoá ô", () => {
    const start = toLayoutMap([{ row: "B", col: 1, type: "vip" }]);
    expect(toCells(applyTool(start, "B", 1, "empty", 6).layout)).toEqual([]);
  });
});

it("summarizeLayout chỉ đếm ghế bán được", () => {
  const layout = toLayoutMap([
    { row: "A", col: 1, type: "standard" },
    { row: "A", col: 2, type: "vip" },
    { row: "A", col: 3, type: "sweetbox" },
    { row: "A", col: 5, type: "aisle" },
    { row: "A", col: 6, type: "broken" },
  ]);
  expect(summarizeLayout(layout)).toEqual({ seats: 3, vip: 1, sweetbox: 1 });
});

describe("SeatLayoutEditor", () => {
  it("chọn ô bằng bàn phím, đổi loại bằng phím số và lưu đúng payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SeatLayoutEditor gridRows={2} gridCols={4} initialCells={[]} onSave={onSave} />);

    screen.getByRole("gridcell", { name: "A1 ô trống" }).focus();
    await user.keyboard("2"); // A1 = VIP
    await user.keyboard("{ArrowRight}{ArrowRight}3"); // A3 = Sweetbox (A3-A4)
    await user.keyboard("{ArrowDown}1"); // B3 chỉ ArrowDown từ A3 giữ cột 3 -> thường

    expect(screen.getByText(/Tổng: 3 ghế • 1 VIP • 1 Sweetbox/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lưu sơ đồ/ }));
    expect(onSave).toHaveBeenCalledWith([
      { row: "A", col: 1, type: "vip" },
      { row: "A", col: 3, type: "sweetbox" },
      { row: "B", col: 3, type: "standard" },
    ]);
  });

  it("hiện lỗi tại chỗ khi Sweetbox không đủ 2 ô, và không lưu ô đó", async () => {
    const user = userEvent.setup();
    render(<SeatLayoutEditor gridRows={1} gridCols={2} initialCells={[]} onSave={vi.fn()} />);
    screen.getByRole("gridcell", { name: "A2 ô trống" }).focus();
    await user.keyboard("3");
    expect(screen.getByRole("alert")).toHaveTextContent(/2 ô liền kề/);
    expect(screen.getByRole("gridcell", { name: "A2 ô trống" })).toBeInTheDocument();
  });

  it("chế độ chỉ xem: không có bảng công cụ, nút lưu, và phím không đổi ô", async () => {
    const user = userEvent.setup();
    render(<SeatLayoutEditor gridRows={1} gridCols={2} initialCells={[]} readOnly onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Lưu sơ đồ/ })).toBeNull();
    screen.getByRole("gridcell", { name: "A1 ô trống" }).focus();
    await user.keyboard("1");
    expect(screen.getByRole("gridcell", { name: "A1 ô trống" })).toBeInTheDocument();
  });

  it("hiển thị lỗi lưu từ server", () => {
    render(<SeatLayoutEditor gridRows={1} gridCols={1} initialCells={[]} saveError="Phòng còn suất" onSave={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Phòng còn suất");
  });
});
