import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";

/**
 * Sinh đối tượng JSON-LD chuẩn Schema.org MovieTheater (R-46).
 * Giúp search engine và AI agent hiểu thông tin rạp chiếu: tên, địa chỉ, hotline, giờ mở cửa, toạ độ.
 */
export function buildCinemaJsonLd(cinema: CinemaDto, siteUrl = ""): Record<string, unknown> {
  const base = siteUrl.replace(/\/+$/, "");
  const cinemaUrl = base ? `${base}/rap/${cinema.code}` : undefined;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MovieTheater",
    name: cinema.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: cinema.address,
      addressLocality: cinema.district ?? undefined,
      addressRegion: cinema.provinceCode ?? undefined,
      addressCountry: "VN",
    },
  };

  if (cinemaUrl) {
    jsonLd.url = cinemaUrl;
  }
  if (cinema.hotline) {
    jsonLd.telephone = cinema.hotline;
  }
  if (cinema.email) {
    jsonLd.email = cinema.email;
  }
  if (cinema.openingHours) {
    jsonLd.openingHours = cinema.openingHours;
  }
  if (cinema.imageUrl) {
    jsonLd.image = cinema.imageUrl;
  }
  if (typeof cinema.latitude === "number" && typeof cinema.longitude === "number") {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: cinema.latitude,
      longitude: cinema.longitude,
    };
  }

  return jsonLd;
}

/**
 * Chuyển đổi dữ liệu JSON-LD sang chuỗi JSON an toàn, chống Stored XSS khi chèn vào thẻ <script>.
 * Ký tự `<` được escape thành `\u003c` để trình duyệt không hiểu nhầm là đóng thẻ </script>.
 */
export function serializeCinemaJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
