import "@testing-library/jest-dom/vitest";

import type { ProvinceDto } from "@filmbooking/shared/schemas/catalog";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickBookBar } from "../quick-book-bar";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const PROVINCES: ProvinceDto[] = [{ code: "HN", name: "Hà Nội" } as ProvinceDto];
const CINEMAS = [
  { code: "HN1", name: "CINEMO Long Biên", status: "OPEN" as const },
  { code: "HN2", name: "CINEMO Cầu Giấy", status: "TEMP_CLOSED" as const },
];

const FIXED_NOW = new Date("2026-11-19T03:00:00Z");

function showtimeOn(id: string, startsAt: string, status = "ON_SALE") {
  return {
    id,
    roomId: "r1",
    startsAt,
    endsAt: startsAt,
    format: "2D",
    languageMode: "SUBTITLED",
    status,
    movie: { slug: "dao-pho", titleVi: "Đào, Phở và Piano" },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/cinemas/HN1")) {
      return {
        cinema: { status: "OPEN" },
        showtimes: path.endsWith("date=2026-11-19")
          ? [
              showtimeOn("st-1", "2026-11-19T12:30:00Z"),
              showtimeOn("st-closed", "2026-11-19T13:30:00Z", "CLOSED"),
            ]
          : [],
      };
    }
    return { cinema: { status: "OPEN" }, showtimes: [] };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(provinceCode: string | null = "HN") {
  const user = userEvent.setup({ advanceTimers: () => undefined });
  render(<QuickBookBar cinemas={CINEMAS} provinces={PROVINCES} provinceCode={provinceCode ?? undefined} />);
  return user;
}

describe("QuickBookBar (R-138, AC-31)", () => {
  it("có 4 ô chọn gốc kèm nhãn, chỉ liệt kê rạp đang hoạt động", () => {
    setup();
    expect(screen.getByLabelText("Rạp")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText("Phim")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText("Ngày")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText("Giờ chiếu")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole("option", { name: "CINEMO Long Biên" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "CINEMO Cầu Giấy" })).not.toBeInTheDocument();
  });

  it("chọn lần lượt Rạp, Phim, Ngày, Giờ rồi Đặt vé: điều hướng đúng suất, không liệt kê suất Ngừng bán", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Rạp"), "HN1");
    await waitFor(() => expect(screen.getByRole("option", { name: "Đào, Phở và Piano" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Phim"), "dao-pho");
    await user.selectOptions(screen.getByLabelText("Ngày"), "2026-11-19");

    const timeSelect = screen.getByLabelText("Giờ chiếu");
    expect(screen.queryByRole("option", { name: /20:30/ })).not.toBeInTheDocument(); // st-closed (CLOSED)
    await user.selectOptions(timeSelect, "st-1");
    await user.click(screen.getByRole("button", { name: "Đặt vé" }));

    expect(mockPush).toHaveBeenCalledWith("/dat-ve/st-1");
  });

  it("thiếu ô: báo lỗi dưới thanh (aria-live), không điều hướng", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Rạp"), "HN1");
    await user.click(screen.getByRole("button", { name: "Đặt vé" }));

    const alert = screen.getByRole("status");
    await waitFor(() => expect(alert).toHaveTextContent("Vui lòng chọn: Phim, Ngày, Giờ chiếu"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("đổi rạp: các ô sau được đặt lại", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Rạp"), "HN1");
    await waitFor(() => expect(screen.getByRole("option", { name: "Đào, Phở và Piano" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Phim"), "dao-pho");
    expect(screen.getByLabelText("Phim")).toHaveValue("dao-pho");

    await user.selectOptions(screen.getByLabelText("Rạp"), "");
    expect(screen.getByLabelText("Phim")).toHaveValue("");
    expect(screen.getByLabelText("Ngày")).toHaveValue("");
  });

  it("rạp không còn suất nào: ô Phim hiện Chưa có suất", async () => {
    mockApiFetch.mockImplementation(async () => ({ cinema: { status: "OPEN" }, showtimes: [] }));
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Rạp"), "HN1");
    await waitFor(() => expect(within(screen.getByLabelText("Phim")).getByText("Chưa có suất")).toBeInTheDocument());
  });

  it("vùng live luôn có trong DOM; bấm Đặt vé lần hai với cùng lỗi thì xoá rồi gán lại để được đọc lại", async () => {
    const user = setup();
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("");

    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(live.textContent ?? ""));
    observer.observe(live, { childList: true, characterData: true, subtree: true });

    await user.click(screen.getByRole("button", { name: "Đặt vé" }));
    await waitFor(() => expect(live).toHaveTextContent("Vui lòng chọn: Rạp, Phim, Ngày, Giờ chiếu"));
    seen.length = 0;
    await user.click(screen.getByRole("button", { name: "Đặt vé" }));
    await waitFor(() => expect(live).toHaveTextContent("Vui lòng chọn: Rạp, Phim, Ngày, Giờ chiếu"));
    observer.disconnect();

    expect(seen).toContain(""); // đã xoá trước khi gán lại
    expect(seen.at(-1)).toBe("Vui lòng chọn: Rạp, Phim, Ngày, Giờ chiếu");
    expect(screen.getByRole("status")).toBe(live);
  });

  it("chưa chọn tỉnh: Tab qua 4 ô không mở hộp thoại và đi hết thanh sang nút Đặt vé", async () => {
    const user = setup(null);
    await user.tab();
    expect(screen.getByLabelText("Rạp")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Phim")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Ngày")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Giờ chiếu")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Đặt vé" })).toHaveFocus();
    expect(screen.queryByText("Chọn tỉnh / thành phố")).not.toBeInTheDocument();
  });

  it("chưa chọn tỉnh: Enter trên ô mở hộp thoại, Esc đóng và trả focus về đúng ô đã mở", async () => {
    const user = setup(null);
    await user.tab();
    await user.tab();
    const phim = screen.getByLabelText("Phim");
    expect(phim).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Chọn tỉnh / thành phố")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Chọn tỉnh / thành phố")).not.toBeInTheDocument());
    await waitFor(() => expect(phim).toHaveFocus());
  });

  it("chưa chọn tỉnh: bấm vào thanh mở hộp chọn tỉnh, không liệt kê rạp", async () => {
    const user = setup(null);
    expect(screen.queryByRole("option", { name: "CINEMO Long Biên" })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Rạp"));
    expect(await screen.findByText("Chọn tỉnh / thành phố")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
