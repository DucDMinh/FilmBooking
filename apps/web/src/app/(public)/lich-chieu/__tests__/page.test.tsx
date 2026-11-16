import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVnDateString } from "@/lib/vn-date";
import LichChieuPage from "../page";

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (path: string) => apiFetch(path) as Promise<unknown>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/lich-chieu",
}));

// 09:00 VN ngày 15/11/2026
const FIXED_NOW = new Date("2026-11-15T02:00:00.000Z");

function movie(slug: string, titleVi: string) {
  return { slug, titleVi, ageRating: "K", availability: "now_showing", durationMinutes: 100 };
}

function showtime(id: string, startsAt: string) {
  return {
    id,
    roomId: "room-1",
    startsAt,
    endsAt: "2026-11-15T10:00:00.000Z",
    format: "2D",
    languageMode: "SUBTITLED",
    status: "ON_SALE",
  };
}

const CINEMA = { code: "HN01", name: "CINEMO Long Biên" };
const MOVIES = [movie("phim-a", "Phim A"), movie("phim-b", "Phim B"), movie("phim-c", "Phim C")];

/** Phim A và C có suất ngày 15/11; phim B chỉ có suất ngày 16/11. */
const SCHEDULES: Record<string, ReturnType<typeof showtime>[]> = {
  "phim-a": [showtime("st-a", "2026-11-15T08:00:00.000Z")],
  "phim-b": [showtime("st-b", "2026-11-16T08:00:00.000Z")],
  "phim-c": [showtime("st-c", "2026-11-15T09:00:00.000Z")],
};

/** Suất thuộc đúng ngày VN `date` — giống `vnDayRange` ở movies.service của API thật. */
function onVnDate<T extends { startsAt: string }>(list: T[], date: string | null): T[] {
  return date ? list.filter((st) => getVnDateString(new Date(st.startsAt)) === date) : list;
}

/**
 * Mock API bám hợp đồng thật: parse path như `fetch` (dot-segment bị chuẩn hoá nên `/movies/.`
 * rơi vào route danh sách), `/movies/:slug` và `/cinemas/:code` chỉ trả suất của đúng ngày `date`.
 */
function mockApi(schedules = SCHEDULES) {
  apiFetch.mockImplementation((path: string) => {
    const url = new URL(path, "http://api.test");
    const date = url.searchParams.get("date");
    if (url.pathname === "/provinces") return Promise.resolve([{ code: "HN", name: "Hà Nội" }]);
    if (url.pathname === "/movies/") return Promise.resolve(MOVIES);
    if (url.pathname === "/movies") return Promise.resolve(MOVIES);
    if (url.pathname === "/cinemas" || url.pathname === "/cinemas/") return Promise.resolve([CINEMA]);
    const movieSlug = /^\/movies\/([^/]+)$/.exec(url.pathname)?.[1];
    const found = MOVIES.find((m) => m.slug === movieSlug);
    if (found) {
      return Promise.resolve({
        movie: found,
        schedule: [{ cinema: CINEMA, showtimes: onVnDate(schedules[found.slug] ?? [], date) }],
      });
    }
    if (url.pathname === "/cinemas/HN01") {
      const all = MOVIES.flatMap((m) =>
        (schedules[m.slug] ?? []).map((st) => ({ ...st, movie: { ...m, posterUrl: null } })),
      );
      return Promise.resolve({ cinema: CINEMA, showtimes: onVnDate(all, date) });
    }
    return Promise.reject(new Error(`unmocked ${path}`));
  });
}

async function renderPage(params: Record<string, string> = {}) {
  render(await LichChieuPage({ searchParams: Promise.resolve(params) }));
}

const h2Titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
const calledPaths = () => apiFetch.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  apiFetch.mockReset();
  mockApi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("/lich-chieu page (bug lich-chieu: chỉ hiện 1 phim, ngày không đổi)", () => {
  it("mặc định hiện mọi phim đang chiếu có suất trong ngày và bỏ phim không có suất", async () => {
    await renderPage();
    expect(h2Titles()).toEqual(["Phim A", "Phim C"]);
  });

  it("chỉ hiện đúng một dải 7 ngày dù có nhiều khối phim", async () => {
    await renderPage();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(6);
  });

  it("chọn phim thì chỉ hiện phim đó và chỉ gọi API cho phim đó", async () => {
    await renderPage({ movie: "phim-c" });
    expect(h2Titles()).toEqual(["Phim C"]);
    expect(calledPaths().filter((p) => p.startsWith("/movies/"))).toEqual(["/movies/phim-c?date=2026-11-15"]);
  });

  it("không chọn phim thì gọi API chi tiết cho từng phim với date hôm nay", async () => {
    await renderPage();
    expect(calledPaths()).toEqual(
      expect.arrayContaining([
        "/movies/phim-a?date=2026-11-15",
        "/movies/phim-b?date=2026-11-15",
        "/movies/phim-c?date=2026-11-15",
      ]),
    );
  });

  it("đổi ngày → fetch lại với date mới → kết quả đổi", async () => {
    await renderPage();
    expect(h2Titles()).toEqual(["Phim A", "Phim C"]);
    cleanup();
    apiFetch.mockClear();

    await renderPage({ date: "2026-11-16" });
    expect(calledPaths()).toContain("/movies/phim-b?date=2026-11-16");
    expect(h2Titles()).toEqual(["Phim B"]);
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("16/11");
  });

  it("chọn tỉnh thì truyền province cho /movies/:slug và /cinemas", async () => {
    await renderPage({ province: "HN", movie: "phim-a" });
    expect(calledPaths()).toEqual(
      expect.arrayContaining(["/movies/phim-a?date=2026-11-15&province=HN", "/cinemas?province=HN"]),
    );
    expect(screen.getByLabelText("Khu vực")).toHaveValue("HN");
  });

  it("?date= ngoài 7 ngày hoặc sai định dạng rơi về hôm nay và gọi API với hôm nay", async () => {
    await renderPage({ date: "2020-01-01" });
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("15/11");
    expect(calledPaths()).toContain("/movies/phim-a?date=2026-11-15");
    cleanup();
    await renderPage({ date: "khong-hop-le" });
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("15/11");
  });

  it("không phim nào có suất thì hiện một EmptyState chung", async () => {
    mockApi({});
    await renderPage();
    expect(h2Titles()).toEqual(["Chưa có lịch chiếu"]);
  });

  it("chọn rạp thì gọi /cinemas/:code?date= và lọc thêm theo phim đã chọn", async () => {
    await renderPage({ cinema: "HN01", movie: "phim-c" });
    expect(calledPaths()).toContain("/cinemas/HN01?date=2026-11-15");
    expect(screen.getByRole("heading", { level: 2, name: "CINEMO Long Biên" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Phim C" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Phim A" })).not.toBeInTheDocument();
  });

  it("chọn rạp + ngày khác thì suất đổi theo ngày (API lọc đúng ngày VN)", async () => {
    await renderPage({ cinema: "HN01", date: "2026-11-16" });
    expect(calledPaths()).toContain("/cinemas/HN01?date=2026-11-16");
    expect(screen.getByRole("link", { name: "Phim B" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Phim A" })).not.toBeInTheDocument();
  });
});

describe("/lich-chieu page — tham số URL rác không gây lỗi 500", () => {
  const BAD_VALUES = [".", "..", "%2e", "../../x", "", "A B", "x".repeat(200)];

  it.each(BAD_VALUES)("movie=%j coi như chưa chọn, không gọi API với giá trị đó", async (bad) => {
    await renderPage({ movie: bad });
    expect(h2Titles()).toEqual(["Phim A", "Phim C"]);
    expect(calledPaths().some((p) => p.startsWith("/movies/?") || p.startsWith("/movies/."))).toBe(false);
    expect(calledPaths().some((p) => p.includes(encodeURIComponent(bad)) && bad !== "")).toBe(false);
  });

  it.each(BAD_VALUES)("cinema=%j coi như chưa chọn, không gọi /cinemas/<giá trị>", async (bad) => {
    await renderPage({ cinema: bad });
    expect(h2Titles()).toEqual(["Phim A", "Phim C"]);
    expect(calledPaths().some((p) => p.startsWith("/cinemas/"))).toBe(false);
  });

  it.each(BAD_VALUES)("province=%j bị bỏ, không đưa vào query API", async (bad) => {
    await renderPage({ province: bad });
    expect(h2Titles()).toEqual(["Phim A", "Phim C"]);
    expect(calledPaths().some((p) => p.includes("province="))).toBe(false);
  });

  it("tham số lặp (mảng ở runtime) coi như chưa chọn", async () => {
    render(
      await LichChieuPage({
        searchParams: Promise.resolve({ movie: ["phim-a", "phim-b"], cinema: ["HN01"] } as unknown as Record<string, string>),
      }),
    );
    expect(h2Titles()).toEqual(["Phim A", "Phim C"]);
  });

  it("API trả sai dạng (mảng thay vì chi tiết phim) thì không sập trang", async () => {
    apiFetch.mockImplementation((path: string) => {
      const pathname = new URL(path, "http://api.test").pathname;
      if (pathname === "/provinces") return Promise.resolve([]);
      return Promise.resolve(MOVIES);
    });
    await renderPage({ movie: "phim-a" });
    expect(h2Titles()).toEqual(["Chưa có lịch chiếu"]);
  });

  it("API rạp trả sai dạng (mảng) thì hiện EmptyState, không sập trang", async () => {
    apiFetch.mockImplementation((path: string) => {
      const pathname = new URL(path, "http://api.test").pathname;
      if (pathname === "/provinces") return Promise.resolve([]);
      return Promise.resolve(MOVIES);
    });
    await renderPage({ cinema: "HN01" });
    expect(h2Titles()).toEqual(["Chưa có lịch chiếu"]);
  });
});
