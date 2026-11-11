import "@testing-library/jest-dom/vitest";

import type { CinemaDto, MovieDto, ProvinceDto } from "@filmbooking/shared/schemas/catalog";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage, { type HomeDto } from "@/app/(public)/page";
import MoviesPage from "@/app/(public)/phim/page";
import { MovieCard } from "../movie-card";
import { MovieFilters } from "../movie-filters";
import {
  PROVINCE_COOKIE_NAME,
  ProvincePickerDialog,
  setProvinceCookie,
} from "../province-picker-dialog";

// ── Mock Next.js navigation ──────────────────────────────────────
const mockPush = vi.fn();
const mockRefresh = vi.fn();
let currentPathname = "/phim";
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => currentPathname,
  useSearchParams: () => currentSearchParams,
}));

// ── Mock next/headers ───────────────────────────────────────────
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookieGet,
  }),
}));

// ── Mock API client ─────────────────────────────────────────────
const mockApiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// ── Mock Data ───────────────────────────────────────────────────
const sampleNowShowingMovie: MovieDto = {
  id: "m-1",
  slug: "dao-pho-va-piano",
  titleVi: "Đào, Phở và Piano",
  titleOriginal: "Peach Blossom, Pho and Piano",
  posterUrl: "https://example.com/dao-pho.jpg",
  bannerUrl: "https://example.com/banner.jpg",
  trailerUrl: "https://youtube.com/watch?v=sample",
  description: "Bộ phim về Hà Nội trong những ngày khói lửa năm 1946.",
  genres: ["Lịch sử", "Tâm lý"],
  durationMinutes: 100,
  director: "Phi Tiến Sơn",
  cast: ["Doãn Quốc Đam", "Cao Thị Thùy Linh"],
  country: "Việt Nam",
  originalLanguage: "Tiếng Việt",
  subtitleLanguages: ["Tiếng Anh"],
  dubbedLanguages: [],
  releaseDate: "2024-02-10",
  ageRating: "T13",
  availability: "now_showing",
};

const sampleComingSoonMovie: MovieDto = {
  id: "m-2",
  slug: "lat-mat-8",
  titleVi: "Lật Mặt 8: Vòng Tay Nắng",
  titleOriginal: null,
  posterUrl: "https://example.com/lat-mat.jpg",
  bannerUrl: null,
  trailerUrl: null,
  description: "Phần tiếp theo của series Lật Mặt.",
  genres: ["Hành động", "Gia đình"],
  durationMinutes: 120,
  director: "Lý Hải",
  cast: ["Lý Hải"],
  country: "Việt Nam",
  originalLanguage: "Tiếng Việt",
  subtitleLanguages: [],
  dubbedLanguages: [],
  releaseDate: "2026-12-25",
  ageRating: "T16",
  availability: "coming_soon",
};

const sampleProvinces: ProvinceDto[] = [
  { code: "HN", name: "Hà Nội" },
  { code: "HCM", name: "Hồ Chí Minh" },
  { code: "DN", name: "Đà Nẵng" },
];

const sampleCinemas: CinemaDto[] = [
  {
    code: "HN01",
    name: "CINEMO Long Biên",
    provinceCode: "HN",
    district: "Long Biên",
    address: "Tầng 4 TTTM Mipec Long Biên, Hà Nội",
    latitude: 21.037,
    longitude: 105.867,
    hotline: "1900 8888",
    email: "longbien@cinemo.vn",
    openingHours: "08:30 - 23:30",
    imageUrl: null,
    amenities: ["2D", "3D", "Dolby Atmos"],
    status: "OPEN",
  },
];

const sampleHomeData: HomeDto = {
  banners: [
    {
      slug: "dao-pho-va-piano",
      titleVi: "Đào, Phở và Piano",
      bannerUrl: "https://example.com/banner-hero.jpg",
    },
  ],
  nowShowing: [sampleNowShowingMovie],
  comingSoon: [sampleComingSoonMovie],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Xoá cookie
  document.cookie = `${PROVINCE_COOKIE_NAME}=; path=/; max-age=0`;
});

beforeEach(() => {
  currentPathname = "/phim";
  currentSearchParams = new URLSearchParams();
  mockCookieGet.mockReturnValue(undefined);
});

describe("MovieCard", () => {
  it("hiển thị poster có alt chuẩn từ tên phim", () => {
    render(<MovieCard movie={sampleNowShowingMovie} />);
    const posterImg = screen.getByRole("img", { name: `Poster phim ${sampleNowShowingMovie.titleVi}` });
    expect(posterImg).toBeInTheDocument();
    expect(posterImg).toHaveAttribute("src", sampleNowShowingMovie.posterUrl);
  });

  it("hiển thị đúng nhãn độ tuổi AgeBadge", () => {
    render(<MovieCard movie={sampleNowShowingMovie} />);
    const ageBadge = screen.getByRole("img", { name: /^Phân loại T13:/ });
    expect(ageBadge).toHaveTextContent("T13");
  });

  it("chứa link dẫn tới chi tiết phim /phim/{slug}", () => {
    render(<MovieCard movie={sampleNowShowingMovie} />);
    const links = screen.getAllByRole("link");
    const hasDetailLink = links.some((link) => link.getAttribute("href") === `/phim/${sampleNowShowingMovie.slug}`);
    expect(hasDetailLink).toBe(true);
  });

  it("phim now_showing: hiển thị nút Đặt vé", () => {
    render(<MovieCard movie={sampleNowShowingMovie} />);
    const bookingLink = screen.getByRole("link", { name: "Đặt vé" });
    expect(bookingLink).toBeInTheDocument();
    expect(bookingLink).toHaveAttribute("href", `/phim/${sampleNowShowingMovie.slug}#lich-chieu`);
  });

  it("phim coming_soon: hiển thị ngày khởi chiếu tiếng Việt và KHÔNG có nút Đặt vé (R-45)", () => {
    render(<MovieCard movie={sampleComingSoonMovie} />);
    expect(screen.getByText("Khởi chiếu 25/12/2026")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đặt vé" })).not.toBeInTheDocument();
  });

  it("variant row hiển thị đúng thông tin", () => {
    render(<MovieCard movie={sampleNowShowingMovie} variant="row" />);
    expect(screen.getByText(sampleNowShowingMovie.titleVi)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đặt vé" })).toBeInTheDocument();
  });
});

describe("ProvincePickerDialog", () => {
  it("lần đầu vào chưa có cookie -> tự động mở dialog", () => {
    render(<ProvincePickerDialog provinces={sampleProvinces} />);
    const dialog = screen.getByTestId("province-picker-dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Chọn tỉnh / thành phố")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hà Nội/ })).toBeInTheDocument();
  });

  it("đã có cookie tỉnh/thành -> không tự động mở dialog", () => {
    setProvinceCookie("HN");
    render(<ProvincePickerDialog provinces={sampleProvinces} />);
    expect(screen.queryByTestId("province-picker-dialog")).not.toBeInTheDocument();
  });

  it("bấm chọn tỉnh: ghi cookie và đóng dialog, gọi callback", async () => {
    const onSelect = vi.fn();
    render(<ProvincePickerDialog provinces={sampleProvinces} onSelectProvince={onSelect} />);

    const hcmButton = screen.getByRole("button", { name: /Hồ Chí Minh/ });
    await userEvent.click(hcmButton);

    expect(document.cookie).toContain(`${PROVINCE_COOKIE_NAME}=HCM`);
    expect(onSelect).toHaveBeenCalledWith("HCM");
    await waitFor(() => {
      expect(screen.queryByTestId("province-picker-dialog")).not.toBeInTheDocument();
    });
  });
});

describe("MovieFilters", () => {
  it("hiển thị các trường lọc từ khoá, thể loại, độ tuổi, trạng thái", () => {
    render(<MovieFilters />);
    expect(screen.getByRole("search", { name: "Bộ lọc phim" })).toBeInTheDocument();
    expect(screen.getByLabelText("Từ khoá")).toBeInTheDocument();
    expect(screen.getByLabelText("Thể loại")).toBeInTheDocument();
    expect(screen.getByLabelText("Độ tuổi")).toBeInTheDocument();
    expect(screen.getByLabelText("Trạng thái")).toBeInTheDocument();
  });

  it("nhập từ khoá và bấm Áp dụng: đẩy query string lên router.push", async () => {
    render(<MovieFilters />);
    const input = screen.getByLabelText("Từ khoá");
    await userEvent.type(input, "Đào phở");

    const submitBtn = screen.getByRole("button", { name: /Áp dụng/ });
    await userEvent.click(submitBtn);

    expect(mockPush).toHaveBeenCalledWith("/phim?q=%C4%90%C3%A0o+ph%E1%BB%9F");
  });

  it("thay đổi select thể loại: cập nhật query param", async () => {
    render(<MovieFilters />);
    const genreSelect = screen.getByLabelText("Thể loại");
    await userEvent.selectOptions(genreSelect, "Hành động");

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("genre=H%C3%A0nh+%C4%91%E1%BB%99ng"));
  });

  it("khi có bộ lọc active: hiển thị nút Xoá bộ lọc và bấm vào sẽ reset", async () => {
    currentSearchParams = new URLSearchParams("q=test&status=now_showing");
    render(<MovieFilters />);

    const resetBtn = screen.getByRole("button", { name: /Xoá bộ lọc/ });
    expect(resetBtn).toBeInTheDocument();

    await userEvent.click(resetBtn);
    expect(mockPush).toHaveBeenCalledWith("/phim");
  });
});

describe("HomePage (SSR)", () => {
  it("render trang chủ thành công với hero banner, tabs phim và rạp khi đã chọn tỉnh", async () => {
    setProvinceCookie("HN");
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/home")) return sampleHomeData;
      if (url === "/provinces") return sampleProvinces;
      if (url.startsWith("/cinemas")) return sampleCinemas;
      return null;
    });

    const jsx = await HomePage({
      searchParams: Promise.resolve({ province: "HN" }),
    });
    render(jsx);

    // Hero banner
    expect(screen.getByText("Phim nổi bật")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: sampleHomeData.banners[0]?.titleVi }),
    ).toBeInTheDocument();

    // Tabs phim
    expect(screen.getByRole("tab", { name: /Phim đang chiếu/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Phim sắp chiếu/ })).toBeInTheDocument();

    // Movie card trong tab đang chiếu
    const movieCard = screen.getByTestId(`movie-card-${sampleNowShowingMovie.slug}`);
    expect(movieCard).toBeInTheDocument();
    expect(movieCard).toHaveTextContent(sampleNowShowingMovie.titleVi);

    // Rạp chiếu
    expect(screen.getByText("CINEMO Long Biên")).toBeInTheDocument();
  });

  it("hiển thị EmptyState khi danh sách phim rỗng", async () => {
    setProvinceCookie("HN");
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/home")) return { banners: [], nowShowing: [], comingSoon: [] };
      if (url === "/provinces") return [];
      if (url.startsWith("/cinemas")) return [];
      return null;
    });

    const jsx = await HomePage({
      searchParams: Promise.resolve({ province: "HN" }),
    });
    render(jsx);

    expect(screen.getByText("Chưa có phim đang chiếu")).toBeInTheDocument();
    expect(screen.getByText("Chưa có cụm rạp tại khu vực này")).toBeInTheDocument();
  });
});

describe("MoviesPage (SSR)", () => {
  it("render trang /phim với bộ lọc và danh sách phim", async () => {
    mockApiFetch.mockResolvedValue([sampleNowShowingMovie, sampleComingSoonMovie]);

    const jsx = await MoviesPage({});
    render(jsx);

    expect(screen.getByRole("heading", { level: 1, name: "Khám phá phim chiếu rạp" })).toBeInTheDocument();
    expect(screen.getByRole("search", { name: "Bộ lọc phim" })).toBeInTheDocument();
    expect(screen.getByText(/Tìm thấy/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(sampleNowShowingMovie.titleVi)).toBeInTheDocument();
    expect(screen.getByText(sampleComingSoonMovie.titleVi)).toBeInTheDocument();
  });

  it("khi không có phim khớp: hiển thị EmptyState và nút Xoá bộ lọc", async () => {
    mockApiFetch.mockResolvedValue([]);

    const jsx = await MoviesPage({
      searchParams: Promise.resolve({ q: "non-existent" }),
    });
    render(jsx);

    expect(screen.getByText("Không tìm thấy phim phù hợp")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xoá bộ lọc tìm kiếm" })).toBeInTheDocument();
  });
});
