import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { CinemaMap } from "@/components/catalog/cinema-map";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { ApiError, apiFetch } from "@/lib/api/client";
import { buildCinemaJsonLd, serializeCinemaJsonLd } from "@/lib/seo/cinema-jsonld";
import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/rap/HN01",
}));

vi.mock("@/lib/api/client", () => {
  class MockApiError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
      public details?: Record<string, unknown>,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  return {
    apiFetch: vi.fn(),
    ApiError: MockApiError,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sampleCinema: CinemaDto = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "HN01",
  name: "CINEMO Cầu Giấy",
  provinceCode: "HN",
  district: "Cầu Giấy",
  address: "1 Xuân Thủy, Cầu Giấy, Hà Nội",
  latitude: 21.0362,
  longitude: 105.7831,
  hotline: "1900 1234",
  email: "caugiay@cinemo.vn",
  openingHours: "08:00 - 23:30",
  imageUrl: "https://images.unsplash.com/photo-cinema",
  amenities: ["IMAX", "Dolby Atmos", "Bắp nước"],
  status: "OPEN",
};

describe("FavoriteButton", () => {
  it("chưa đăng nhập: bấm nút chuyển hướng sang /dang-nhap?next=... (R-16)", async () => {
    const user = userEvent.setup();
    render(
      <FavoriteButton
        cinemaId={sampleCinema.id}
        cinemaCode={sampleCinema.code}
        cinemaName={sampleCinema.name}
        isAuthenticated={false}
      />,
    );

    const button = screen.getByRole("button", { name: `Yêu thích ${sampleCinema.name}` });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(mockPush).toHaveBeenCalledWith("/dang-nhap?next=%2Frap%2FHN01");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("đã đăng nhập và chưa yêu thích: bấm nút gọi PUT /me/favorites/:cinemaId và đổi trạng thái", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true });

    render(
      <FavoriteButton
        cinemaId={sampleCinema.id}
        cinemaCode={sampleCinema.code}
        cinemaName={sampleCinema.name}
        isAuthenticated={true}
        initialFavorite={false}
        showLabel={true}
      />,
    );

    const button = screen.getByRole("button", { name: `Yêu thích ${sampleCinema.name}` });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Yêu thích")).toBeInTheDocument();

    await user.click(button);

    expect(apiFetch).toHaveBeenCalledWith(`/me/favorites/${sampleCinema.id}`, { method: "PUT" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Đã yêu thích")).toBeInTheDocument();
  });

  it("đã yêu thích: bấm nút gọi DELETE /me/favorites/:cinemaId và bỏ trạng thái yêu thích", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true });

    render(
      <FavoriteButton
        cinemaId={sampleCinema.id}
        cinemaCode={sampleCinema.code}
        cinemaName={sampleCinema.name}
        isAuthenticated={true}
        initialFavorite={true}
        showLabel={true}
      />,
    );

    const button = screen.getByRole("button", { name: `Bỏ yêu thích ${sampleCinema.name}` });
    expect(button).toHaveAttribute("aria-pressed", "true");

    await user.click(button);

    expect(apiFetch).toHaveBeenCalledWith(`/me/favorites/${sampleCinema.id}`, { method: "DELETE" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("khi API trả về lỗi 401 thì chuyển hướng sang trang đăng nhập", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn", 401),
    );

    render(
      <FavoriteButton
        cinemaId={sampleCinema.id}
        cinemaCode={sampleCinema.code}
        cinemaName={sampleCinema.name}
        isAuthenticated={true}
        initialFavorite={false}
      />,
    );

    const button = screen.getByRole("button", { name: `Yêu thích ${sampleCinema.name}` });
    await user.click(button);

    expect(mockPush).toHaveBeenCalledWith("/dang-nhap?next=%2Frap%2FHN01");
  });
});

describe("CinemaMap", () => {
  it("render trạng thái fallback an toàn khi toạ độ null hoặc không hợp lệ", () => {
    render(
      <CinemaMap
        latitude={null}
        longitude={null}
        cinemaName="Rạp chưa có toạ độ"
        address="Số 99 Đường Test, Quận 1"
      />,
    );

    expect(screen.getByText("Vị trí rạp")).toBeInTheDocument();
    expect(screen.getByText("Số 99 Đường Test, Quận 1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Tìm địa chỉ trên OpenStreetMap/i }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("https://www.openstreetmap.org/search?query="),
    );
  });
});

describe("buildCinemaJsonLd & serializeCinemaJsonLd (SEO & XSS)", () => {
  it("sinh đúng đối tượng Schema.org MovieTheater", () => {
    const jsonLd = buildCinemaJsonLd(sampleCinema, "https://cinemo.vn");

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("MovieTheater");
    expect(jsonLd.name).toBe("CINEMO Cầu Giấy");
    expect(jsonLd.url).toBe("https://cinemo.vn/rap/HN01");
    expect(jsonLd.telephone).toBe("1900 1234");
    expect(jsonLd.email).toBe("caugiay@cinemo.vn");
    expect(jsonLd.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "1 Xuân Thủy, Cầu Giấy, Hà Nội",
      addressLocality: "Cầu Giấy",
      addressRegion: "HN",
      addressCountry: "VN",
    });
    expect(jsonLd.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 21.0362,
      longitude: 105.7831,
    });
  });

  it("serializeCinemaJsonLd escape ký tự < để chống Stored XSS trong thẻ script", () => {
    const maliciousPayload = {
      "@context": "https://schema.org",
      "@type": "MovieTheater",
      name: "</script><script>alert('xss')</script>",
      address: {
        "@type": "PostalAddress",
        streetAddress: "<img src=x onerror=alert(1)>",
      },
    };

    const serialized = serializeCinemaJsonLd(maliciousPayload);

    // Ký tự < phải được chuyển thành \u003c
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script>\\u003cscript>alert('xss')\\u003c/script>");
    expect(serialized).toContain("\\u003cimg src=x onerror=alert(1)>");
  });
});

describe("robots & sitemap", () => {
  it("robots() chặn đầy đủ các endpoint nhạy cảm và cho phép bot AI", () => {
    const config = robots();

    expect(config.sitemap).toContain("/sitemap.xml");
    expect(config.rules).toBeDefined();

    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const generalRule = rules.find((r) => r.userAgent === "*");
    expect(generalRule).toBeDefined();

    const disallowed = (generalRule?.disallow as string[]) ?? [];
    expect(disallowed).toContain("/admin");
    expect(disallowed).toContain("/staff");
    expect(disallowed).toContain("/pos");
    expect(disallowed).toContain("/tai-khoan");
    expect(disallowed).toContain("/dat-ve");
    expect(disallowed).toContain("/checkin");
    expect(disallowed).toContain("/quan-tri");
    expect(disallowed).toContain("/api");

    const aiRule = rules.find(
      (r) => Array.isArray(r.userAgent) && r.userAgent.includes("GPTBot"),
    );
    expect(aiRule).toBeDefined();
    expect(aiRule?.allow).toContain("/rap");
    expect(aiRule?.allow).toContain("/phim");
  });

  it("sitemap() trả về danh sách các URL tĩnh công khai", async () => {
    const entries = await sitemap();

    expect(Array.isArray(entries)).toBe(true);
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/rap"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/phim"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/lich-chieu"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/dieu-khoan"))).toBe(true);
  });
});
