import type { MetadataRoute } from "next";

/**
 * Cấu hình robots.txt chuẩn Next.js (MetadataRoute.Robots) & ai-friendly-web.
 * Cho phép các công cụ tìm kiếm và AI crawlers truy cập các trang công khai;
 * chặn các khu vực quản trị, nhân sự, POS giả lập, dữ liệu tài khoản và endpoint API nội bộ.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://filmbooking.local").replace(/\/+$/, "");

  const disallowedPaths = [
    "/admin",
    "/admin/*",
    "/staff",
    "/staff/*",
    "/pos",
    "/pos/*",
    "/tai-khoan",
    "/tai-khoan/*",
    "/dat-ve",
    "/dat-ve/*",
    "/checkin",
    "/checkin/*",
    "/quan-tri",
    "/quan-tri/*",
    "/api",
    "/api/*",
  ];

  return {
    rules: [
      {
        userAgent: [
          "GPTBot",
          "ClaudeBot",
          "PerplexityBot",
          "Google-Extended",
          "CCBot",
          "anthropic-ai",
        ],
        allow: ["/", "/phim", "/rap", "/lich-chieu", "/dieu-khoan", "/chinh-sach-bao-mat", "/huong-dan-xoa-du-lieu"],
        disallow: disallowedPaths,
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: disallowedPaths,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
