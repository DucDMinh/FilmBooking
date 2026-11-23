import "@testing-library/jest-dom/vitest";

import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as Promise<unknown>,
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/rap/HN01",
}));
vi.mock("@/lib/supabase/server", () => ({ getServerAccessToken: () => Promise.resolve(null) }));
vi.mock("@/lib/monitoring/cinema-tag", () => ({ CinemaTag: () => null }));
vi.mock("@/components/catalog/cinema-map", () => ({ CinemaMap: () => <div data-testid="cinema-map" /> }));

import { ApiError } from "@/lib/api/client";
import CinemaDetailPage, { generateMetadata } from "../page";

const CINEMA: CinemaDto = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "HN01",
  name: "CINEMO Long Biên",
  provinceCode: "HN",
  district: null,
  address: "1 Long Biên, Hà Nội",
  latitude: 21.04,
  longitude: 105.88,
  hotline: "1900 1234",
  email: null,
  openingHours: null,
  imageUrl: null,
  amenities: [],
  status: "OPEN",
  scheduledStatus: null,
  scheduledEffectiveAt: null,
  effectiveOnlineCutoffMinutes: 15,
};

function mockDetail(overrides: Partial<CinemaDto>) {
  const cinema = { ...CINEMA, ...overrides };
  const open = cinema.status === "OPEN";
  apiFetch.mockResolvedValue({
    cinema,
    rooms: [],
    showtimes: open
      ? [
          {
            id: "st-1",
            roomId: "r1",
            startsAt: "2026-11-18T08:00:00.000Z",
            endsAt: "2026-11-18T10:00:00.000Z",
            format: "2D",
            languageMode: "SUBTITLED",
            status: "ON_SALE",
            movie: { slug: "dune", titleVi: "Dune", ageRating: "T13", posterUrl: null, durationMinutes: 150 },
          },
        ]
      : [],
  });
}

async function renderPage() {
  render(await CinemaDetailPage({ params: Promise.resolve({ code: "HN01" }), searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
  apiFetch.mockReset();
  notFound.mockClear();
});
afterEach(cleanup);

describe("/rap/[code] — rạp không hoạt động (R-137, AC-27)", () => {
  it.each([
    ["CLOSED", "Rạp CINEMO Long Biên đã đóng cửa"],
    ["TEMP_CLOSED", "Rạp CINEMO Long Biên đang tạm đóng cửa"],
    ["COMING_SOON", "Rạp CINEMO Long Biên sắp khai trương"],
  ] as const)("%s: hiện thông báo, không notFound, không lịch chiếu/bản đồ/yêu thích", async (status, heading) => {
    mockDetail({ status });
    await renderPage();

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByText("1 Long Biên, Hà Nội")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1900 1234" })).toHaveAttribute("href", "tel:1900 1234");
    expect(screen.getByRole("link", { name: "Xem các rạp khác" })).toHaveAttribute("href", "/rap");

    expect(screen.queryByText("Lịch chiếu phim")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cinema-map")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yêu thích/ })).not.toBeInTheDocument();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it.each([
    ["TEMP_CLOSED", /mở cửa trở lại từ ngày 25\/11\/2026/],
    ["CLOSED", /mở cửa trở lại từ ngày 25\/11\/2026/],
    ["COMING_SOON", /khai trương và mở cửa từ ngày 25\/11\/2026/],
  ] as const)("%s đã hẹn sang OPEN: nêu ngày mở theo giờ VN, đúng văn phong", async (status, text) => {
    // 17:30 UTC 24/11 = 00:30 VN 25/11
    mockDetail({ status, scheduledStatus: "OPEN", scheduledEffectiveAt: "2026-11-24T17:30:00.000Z" });
    await renderPage();
    expect(document.body).toHaveTextContent(text);
    if (status === "COMING_SOON") expect(document.body).not.toHaveTextContent("trở lại");
  });

  it("mã rạp sai (API 404 thật): notFound()", async () => {
    apiFetch.mockRejectedValue(new ApiError("NOT_FOUND", "Không tìm thấy", 404));
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("lỗi 5xx hiện tại cũng thành notFound() (hành vi cũ được giữ nguyên, task chủ động không đổi)", async () => {
    apiFetch.mockRejectedValue(new ApiError("UNKNOWN", "Lỗi máy chủ", 500));
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("metadata: tiêu đề theo trạng thái + noindex; rạp OPEN không noindex", async () => {
    mockDetail({ status: "CLOSED" });
    const closed = await generateMetadata({ params: Promise.resolve({ code: "HN01" }), searchParams: Promise.resolve({}) });
    expect(closed.title).toBe("Rạp CINEMO Long Biên đã đóng cửa | CINEMO");
    expect(closed.robots).toEqual({ index: false, follow: true });

    mockDetail({ status: "OPEN" });
    const open = await generateMetadata({ params: Promise.resolve({ code: "HN01" }), searchParams: Promise.resolve({}) });
    expect(open.robots).toBeUndefined();
  });
});

describe("/rap/[code] — mã sai: bot nhận 404 qua generateMetadata (R-137, AC-28, spec 3.6.1)", () => {
  const meta = () => generateMetadata({ params: Promise.resolve({ code: "SAI" }), searchParams: Promise.resolve({}) });

  it("API trả 404: generateMetadata gọi notFound()", async () => {
    apiFetch.mockRejectedValue(new ApiError("NOT_FOUND", "Không tìm thấy", 404));
    await expect(meta()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("lỗi 5xx hoặc lỗi mạng: KHÔNG notFound, trả metadata mặc định", async () => {
    apiFetch.mockRejectedValue(new ApiError("UNKNOWN", "Lỗi máy chủ", 500));
    await expect(meta()).resolves.toMatchObject({ title: "Không tìm thấy rạp | CINEMO" });
    apiFetch.mockRejectedValue(new TypeError("fetch failed"));
    await expect(meta()).resolves.toMatchObject({ title: "Không tìm thấy rạp | CINEMO" });
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each(["CLOSED", "TEMP_CLOSED", "COMING_SOON"] as const)("rạp %s vẫn có metadata (200 + noindex), không notFound", async (status) => {
    mockDetail({ status });
    await expect(meta()).resolves.toMatchObject({ robots: { index: false, follow: true } });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("chỉ 1 request API cho metadata (dùng chung fetch đã cache, không thêm request)", async () => {
    mockDetail({});
    await meta();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("/rap/[code] — rạp OPEN có lịch đổi trạng thái (R-136, AC-30)", () => {
  it("lịch đóng cửa: banner nêu ngày hiệu lực theo giờ VN + hướng dẫn hoàn tiền trước hạn", async () => {
    mockDetail({ scheduledStatus: "CLOSED", scheduledEffectiveAt: "2026-11-24T17:30:00.000Z" });
    await renderPage();

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Rạp sẽ đóng cửa từ ngày 25/11/2026");
    expect(banner).toHaveTextContent("trước ngày 25/11/2026");
    expect(banner).toHaveTextContent("sẽ không giải quyết hoàn tiền");
    // Rạp vẫn OPEN: lịch chiếu vẫn hiện.
    expect(screen.getByText("Lịch chiếu phim")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dune" })).toBeInTheDocument();
  });

  it("lịch tạm đóng cửa: banner tạm đóng + hoàn tiền", async () => {
    mockDetail({ scheduledStatus: "TEMP_CLOSED", scheduledEffectiveAt: "2026-11-25T03:00:00.000Z" });
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Rạp sẽ tạm đóng cửa từ ngày 25/11/2026");
    expect(screen.getByRole("status")).toHaveTextContent("trước ngày 25/11/2026");
  });

  it("lịch sang sắp khai trương: banner + hoàn tiền", async () => {
    mockDetail({ scheduledStatus: "COMING_SOON", scheduledEffectiveAt: "2026-11-25T03:00:00.000Z" });
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Rạp sẽ chuyển sang sắp khai trương từ ngày 25/11/2026");
  });

  it("rạp OPEN không có lịch: không banner", async () => {
    mockDetail({});
    await renderPage();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Lịch chiếu phim")).toBeInTheDocument();
  });
});

describe("/rap/[code] — suất đã quá mốc đóng bán online của rạp (R-67, R-56, CR-011)", () => {
  const NOW = new Date("2026-11-18T03:00:00.000Z"); // 10:00 VN

  function mockShowtimeIn20Minutes(overrides: Partial<CinemaDto>) {
    apiFetch.mockResolvedValue({
      cinema: { ...CINEMA, ...overrides },
      rooms: [],
      showtimes: [
        {
          id: "st-20",
          roomId: "r1",
          startsAt: "2026-11-18T03:20:00.000Z", // còn 20 phút
          endsAt: "2026-11-18T05:20:00.000Z",
          format: "2D",
          languageMode: "SUBTITLED",
          status: "ON_SALE",
          movie: { slug: "dune", titleVi: "Dune", ageRating: "T13", posterUrl: null, durationMinutes: 150 },
        },
      ],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rạp mốc 30 phút: suất còn 20 phút không là link /dat-ve, hiện 'Mua tại quầy'", async () => {
    mockShowtimeIn20Minutes({ effectiveOnlineCutoffMinutes: 30 });
    await renderPage();
    expect(document.querySelector('a[href^="/dat-ve/"]')).toBeNull();
    expect(screen.getByText("Mua tại quầy")).toBeInTheDocument();
  });

  it("rạp mốc 15 phút: suất còn 20 phút vẫn là link /dat-ve", async () => {
    mockShowtimeIn20Minutes({ effectiveOnlineCutoffMinutes: 15 });
    await renderPage();
    expect(document.querySelector('a[href="/dat-ve/st-20"]')).not.toBeNull();
    expect(screen.queryByText("Mua tại quầy")).not.toBeInTheDocument();
  });
});
