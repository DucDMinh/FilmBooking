import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVnDateString } from "@/lib/vn-date";
import MovieDetailPage from "../page";

const apiFetch = vi.fn();
const push = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (path: string) => apiFetch(path) as Promise<unknown>,
  ApiError: class ApiError extends Error {
    status = 0;
    code = "";
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/phim/spider-man",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// 09:00 VN ngày 16/11/2026
const FIXED_NOW = new Date("2026-11-16T02:00:00.000Z");

const CINEMA = { code: "HN01", name: "CINEMO Long Biên" };

function movie(availability: string) {
  return {
    id: "m1",
    slug: "spider-man",
    titleVi: "Người Nhện",
    titleOriginal: null,
    posterUrl: null,
    trailerUrl: null,
    description: null,
    genres: [],
    durationMinutes: 100,
    director: null,
    cast: [],
    country: null,
    releaseDate: "2026-11-01",
    ageRating: "K",
    availability,
  };
}

function showtime(id: string, startsAt: string) {
  return {
    id,
    roomId: "room-1",
    startsAt,
    endsAt: "2026-11-30T10:00:00.000Z",
    format: "2D",
    languageMode: "SUBTITLED",
    status: "ON_SALE",
  };
}

/** Mỗi ngày 1 suất lúc 15:00 VN — id mang theo ngày để assert đúng ngày được hiển thị. */
const ALL_SHOWTIMES = [16, 17, 18, 19].map((d) => showtime(`st-${d}`, `2026-11-${d}T08:00:00.000Z`));

/**
 * Mock API bám hợp đồng thật của `/movies/:slug`: parse path như `fetch`, chỉ trả suất của đúng
 * ngày VN `date` (mặc định hôm nay) — giống `vnDayRange` ở movies.service của API.
 */
function mockApi(availability = "now_showing", showtimes = ALL_SHOWTIMES) {
  apiFetch.mockImplementation((path: string) => {
    const url = new URL(path, "http://api.test");
    if (url.pathname !== "/movies/spider-man") return Promise.reject(new Error(`unmocked ${path}`));
    const date = url.searchParams.get("date") ?? getVnDateString(new Date());
    const inDay = showtimes.filter((st) => getVnDateString(new Date(st.startsAt)) === date);
    return Promise.resolve({ movie: movie(availability), schedule: [{ cinema: CINEMA, showtimes: inDay }] });
  });
}

async function renderPage(searchParams: Record<string, string | string[]> = {}) {
  render(await MovieDetailPage({ params: Promise.resolve({ slug: "spider-man" }), searchParams: Promise.resolve(searchParams) }));
}

const calledPaths = () => apiFetch.mock.calls.map((c) => c[0] as string);
const showtimeLinks = () => screen.queryAllByRole("link", { name: /Đặt vé suất/ }).map((a) => a.getAttribute("href"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  apiFetch.mockReset();
  push.mockClear();
  mockApi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("/phim/[slug] page (bug phim-detail: 6 ngày còn lại luôn rỗng, đổi ngày không chạy)", () => {
  it("không có ?date= thì gọi API đúng ngày hôm nay và hiện suất hôm nay", async () => {
    await renderPage();
    expect(calledPaths()).toContain("/movies/spider-man?date=2026-11-16");
    expect(showtimeLinks()).toEqual(["/dat-ve/st-16"]);
  });

  it("?date= trong 7 ngày: gọi API theo ngày đó và hiện suất ngày đó", async () => {
    await renderPage({ date: "2026-11-18" });
    expect(calledPaths()).toContain("/movies/spider-man?date=2026-11-18");
    expect(showtimeLinks()).toEqual(["/dat-ve/st-18"]);
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("18/11");
  });

  it("?date=abc rơi về hôm nay, không lỗi", async () => {
    await renderPage({ date: "abc" });
    expect(calledPaths()).toContain("/movies/spider-man?date=2026-11-16");
    expect(calledPaths().some((p) => p.includes("abc"))).toBe(false);
    expect(showtimeLinks()).toEqual(["/dat-ve/st-16"]);
  });

  it("?date= ngoài 7 ngày rơi về hôm nay", async () => {
    await renderPage({ date: "2030-01-01" });
    expect(calledPaths()).toContain("/movies/spider-man?date=2026-11-16");
    expect(calledPaths().some((p) => p.includes("2030"))).toBe(false);
    expect(showtimeLinks()).toEqual(["/dat-ve/st-16"]);
  });

  it("?date= lặp tham số (mảng) coi như không chọn → hôm nay", async () => {
    await renderPage({ date: ["2026-11-18", "2026-11-19"] });
    expect(calledPaths()).toContain("/movies/spider-man?date=2026-11-16");
  });

  it("chuyển ?province= xuống API cùng với date", async () => {
    await renderPage({ date: "2026-11-17", province: "HN" });
    expect(calledPaths()).toContain("/movies/spider-man?date=2026-11-17&province=HN");
  });

  it("bấm ngày khác điều hướng tới ?date= giữ province và neo #lich-chieu (cả khi đang có ?date=)", async () => {
    await renderPage({ date: "2026-11-17", province: "HN" });
    fireEvent.click(screen.getByRole("button", { name: /19\/11/ }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.pathname).toBe("/phim/spider-man");
    expect(url.searchParams.get("date")).toBe("2026-11-19");
    expect(url.searchParams.get("province")).toBe("HN");
    expect(url.hash).toBe("#lich-chieu");
  });

  it("phim sắp chiếu chưa có suất vẫn hiện EmptyState 'Sắp chiếu'", async () => {
    mockApi("coming_soon", []);
    await renderPage();
    expect(screen.getByText(/Sắp chiếu - Lịch chiếu sẽ được cập nhật sớm/)).toBeInTheDocument();
  });
});
