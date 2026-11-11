import type { MetadataRoute } from "next";
import { apiFetch } from "@/lib/api/client";
import type { CinemaDto, MovieDto } from "@filmbooking/shared/schemas/catalog";

export const revalidate = 3600;

/**
 * Sinh sitemap.xml tự động cho SEO & AI crawlers (R-46, ai-friendly-web).
 * Liệt kê trang chủ, các trang catalog công khai, điều khoản pháp lý,
 * cùng danh sách các rạp chiếu phim đang hoạt động và phim đang/sắp chiếu.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://filmbooking.local").replace(/\/+$/, "");
  const now = new Date();

  // Danh sách các trang tĩnh công khai
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/phim`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/rap`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/lich-chieu`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/dieu-khoan`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/chinh-sach-bao-mat`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/huong-dan-xoa-du-lieu`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    // Không có API endpoint lúc build tĩnh offline — trả về static routes ngay
    return staticRoutes;
  }

  let cinemaRoutes: MetadataRoute.Sitemap = [];
  try {
    const cinemas = await apiFetch<CinemaDto[]>("/cinemas", {
      signal: AbortSignal.timeout(3000),
    });
    if (Array.isArray(cinemas)) {
      cinemaRoutes = cinemas
        .filter((c) => c.status === "OPEN")
        .map((cinema) => ({
          url: `${siteUrl}/rap/${cinema.code}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.7,
        }));
    }
  } catch {
    // API có thể chưa bật hoặc không phản hồi — fallback an toàn
  }

  let movieRoutes: MetadataRoute.Sitemap = [];
  try {
    const movies = await apiFetch<MovieDto[]>("/movies", {
      signal: AbortSignal.timeout(3000),
    });
    if (Array.isArray(movies)) {
      movieRoutes = movies.map((movie) => ({
        url: `${siteUrl}/phim/${movie.slug}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8,
      }));
    }
  } catch {
    // Fallback an toàn
  }

  return [...staticRoutes, ...cinemaRoutes, ...movieRoutes];
}
