import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MovieShowtimeSchedule } from "@/components/catalog/movie-showtime-schedule";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/phim/spider-man",
}));

beforeEach(() => {
  push.mockClear();
});
afterEach(() => {
  cleanup();
});

const now = new Date("2026-11-16T02:00:00.000Z"); // 09:00 VN, 16/11

function renderSchedule(props: { selectedDate: string; province?: string }) {
  render(<MovieShowtimeSchedule schedule={[]} now={now} {...props} />);
}

describe("MovieShowtimeSchedule (bug phim-detail: bấm ngày không đổi suất)", () => {
  it("bấm ngày khác điều hướng tới ?date= kèm neo #lich-chieu, không cuộn lên đầu", () => {
    renderSchedule({ selectedDate: "2026-11-16" });
    fireEvent.click(screen.getByRole("button", { name: /18\/11/ }));
    expect(push).toHaveBeenCalledTimes(1);
    const [href, options] = push.mock.calls[0] as [string, { scroll: boolean }];
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/phim/spider-man");
    expect(url.searchParams.get("date")).toBe("2026-11-18");
    expect(url.hash).toBe("#lich-chieu");
    expect(options).toEqual({ scroll: false });
  });

  it("giữ ?province= khi đổi ngày", () => {
    renderSchedule({ selectedDate: "2026-11-16", province: "HN" });
    fireEvent.click(screen.getByRole("button", { name: /19\/11/ }));
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("province")).toBe("HN");
    expect(url.searchParams.get("date")).toBe("2026-11-19");
  });

  it("không có province thì URL không chứa ?province=", () => {
    renderSchedule({ selectedDate: "2026-11-16" });
    fireEvent.click(screen.getByRole("button", { name: /17\/11/ }));
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.has("province")).toBe(false);
  });

  it("đang ở ?date= (prop selectedDate) vẫn bấm sang ngày khác được (D2)", () => {
    renderSchedule({ selectedDate: "2026-11-18" });
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("18/11");
    fireEvent.click(screen.getByRole("button", { name: /19\/11/ }));
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("date")).toBe("2026-11-19");
  });
});
