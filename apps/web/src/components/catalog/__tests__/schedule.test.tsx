import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MovieDto, ShowtimeDto } from "@filmbooking/shared/schemas/catalog";
import { BookingStepper } from "@/components/booking/booking-stepper";
import {
  ShowtimeSchedule,
  formatVnTime,
  getVnDateString,
  isShowtimeOnlineClosed,
} from "@/components/catalog/showtime-schedule";
import { buildMovieJsonLd, serializeJsonLd } from "@/lib/seo/movie-jsonld";

afterEach(() => {
  cleanup();
});

const MOCK_MOVIE: MovieDto = {
  id: "mov-001",
  slug: "lat-mat-7",
  titleVi: "Lật Mặt 7: Một Điều Ước",
  titleOriginal: "Face Off 7: One Wish",
  posterUrl: "https://example.com/poster.jpg",
  bannerUrl: "https://example.com/banner.jpg",
  trailerUrl: "https://youtube.com/watch?v=123",
  description: "Câu chuyện gia đình cảm động của bà Hai và các con.",
  genres: ["Tâm lý", "Gia đình"],
  durationMinutes: 138,
  director: "Lý Hải",
  cast: ["Thanh Hiền", "Trương Minh Cường", "Đinh Y Nhung"],
  country: "Việt Nam",
  originalLanguage: "vi",
  subtitleLanguages: ["en"],
  dubbedLanguages: [],
  releaseDate: "2026-04-26",
  ageRating: "K",
  availability: "now_showing",
};

describe("SEO & JSON-LD (movie-jsonld.ts)", () => {
  it("sinh đối tượng JSON-LD chuẩn Schema.org Movie", () => {
    const jsonLd = buildMovieJsonLd(MOCK_MOVIE);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Movie");
    expect(jsonLd.name).toBe("Lật Mặt 7: Một Điều Ước");
    expect(jsonLd.alternateName).toBe("Face Off 7: One Wish");
    expect(jsonLd.duration).toBe("PT138M");
    expect(jsonLd.contentRating).toBe("K");
    expect(jsonLd.director).toEqual({ "@type": "Person", name: "Lý Hải" });
    expect(jsonLd.actor).toHaveLength(3);
    expect(jsonLd.actor?.[0]).toEqual({ "@type": "Person", name: "Thanh Hiền" });
  });

  it("tạo ScreeningEvent cho các suất chiếu đang mở bán", () => {
    const mockShowtimes: ShowtimeDto[] = [
      {
        id: "st-1",
        roomId: "room-1",
        startsAt: "2026-11-15T12:30:00.000Z",
        endsAt: "2026-11-15T14:48:00.000Z",
        format: "2D",
        languageMode: "SUBTITLED",
        status: "ON_SALE",
      },
      {
        id: "st-2",
        roomId: "room-1",
        startsAt: "2026-11-15T15:00:00.000Z",
        endsAt: "2026-11-15T17:18:00.000Z",
        format: "2D",
        languageMode: "SUBTITLED",
        status: "CANCELLED", // Bị huỷ -> Không đưa vào JSON-LD
      },
    ];

    const jsonLd = buildMovieJsonLd(MOCK_MOVIE, [
      {
        cinema: { code: "HN01", name: "CINEMO Long Biên" },
        showtimes: mockShowtimes,
      },
    ]);

    expect(jsonLd.event).toBeDefined();
    expect(jsonLd.event).toHaveLength(1);
    expect(jsonLd.event?.[0]).toMatchObject({
      "@type": "ScreeningEvent",
      startDate: "2026-11-15T12:30:00.000Z",
      location: {
        "@type": "MovieTheater",
        name: "CINEMO Long Biên",
      },
      videoFormat: "2D",
      subtitleLanguage: "SUBTITLED",
    });
  });

  it("serializeJsonLd thoát ký tự < thành \\u003c an toàn chống XSS", () => {
    const malicious = {
      title: "Movie </script><script>alert('xss')</script>",
    };
    const serialized = serializeJsonLd(malicious);

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
    // JSON parse lại vẫn nhận được đúng giá trị gốc
    const parsed = JSON.parse(serialized);
    expect(parsed.title).toBe("Movie </script><script>alert('xss')</script>");
  });
});

describe("BookingStepper (booking-stepper.tsx)", () => {
  it("gắn đúng aria-current='step' ở bước hiện tại", () => {
    const { rerender } = render(<BookingStepper currentStep={1} />);

    const step1 = screen.getByRole("listitem", { current: "step" });
    expect(step1).toHaveTextContent("Chọn suất");

    rerender(<BookingStepper currentStep={2} />);
    const step2 = screen.getByRole("listitem", { current: "step" });
    expect(step2).toHaveTextContent("Chọn ghế");
  });

  it("render đủ 4 bước đặt vé với tên chuẩn", () => {
    render(<BookingStepper currentStep={1} />);

    expect(screen.getByText("Chọn suất")).toBeInTheDocument();
    expect(screen.getByText("Chọn ghế")).toBeInTheDocument();
    expect(screen.getByText("Xác nhận")).toBeInTheDocument();
    expect(screen.getByText("Thanh toán")).toBeInTheDocument();
  });
});

describe("ShowtimeSchedule (showtime-schedule.tsx)", () => {
  const fixedNow = new Date("2026-11-15T02:00:00.000Z"); // 09:00 VN
  const todayVnStr = getVnDateString(fixedNow); // "2026-11-15"

  it("định dạng giờ đúng theo múi giờ Asia/Ho_Chi_Minh", () => {
    // 03:30Z = 10:30 VN
    expect(formatVnTime("2026-11-15T03:30:00.000Z")).toBe("10:30");
    // 12:45Z = 19:45 VN
    expect(formatVnTime("2026-11-15T12:45:00.000Z")).toBe("19:45");
  });

  it("kiểm tra mốc đóng bán online 15 phút trước giờ chiếu", () => {
    const startsAt = "2026-11-15T10:00:00.000Z";
    // Lúc 09:40Z (20 phút trước) -> Còn mở bán
    const timeBefore20m = new Date("2026-11-15T09:40:00.000Z");
    expect(isShowtimeOnlineClosed(startsAt, "ON_SALE", 15, timeBefore20m)).toBe(false);

    // Lúc 09:46Z (14 phút trước) -> Đã đóng bán
    const timeBefore14m = new Date("2026-11-15T09:46:00.000Z");
    expect(isShowtimeOnlineClosed(startsAt, "ON_SALE", 15, timeBefore14m)).toBe(true);

    // Status CLOSED -> Luôn đóng bán
    expect(isShowtimeOnlineClosed(startsAt, "CLOSED", 15, timeBefore20m)).toBe(true);
  });

  it("suất còn hạn trỏ tới /dat-ve/[showtimeId] và suất qua hạn hiển thị 'Mua tại quầy'", () => {
    const validShowtime: ShowtimeDto = {
      id: "st-open",
      roomId: "room-1",
      startsAt: "2026-11-15T08:00:00.000Z", // 15:00 VN (cách fixedNow 6 tiếng)
      endsAt: "2026-11-15T10:18:00.000Z",
      format: "2D",
      languageMode: "SUBTITLED",
      status: "ON_SALE",
    };

    const closedShowtime: ShowtimeDto = {
      id: "st-closed",
      roomId: "room-1",
      startsAt: "2026-11-15T02:10:00.000Z", // 09:10 VN (cách fixedNow 10 phút < 15 phút cutoff)
      endsAt: "2026-11-15T04:28:00.000Z",
      format: "2D",
      languageMode: "SUBTITLED",
      status: "ON_SALE",
    };

    render(
      <ShowtimeSchedule
        schedule={[
          {
            cinema: { code: "HN01", name: "CINEMO Long Biên", address: "Hà Nội" },
            showtimes: [validShowtime, closedShowtime],
          },
        ]}
        selectedDate={todayVnStr}
        now={fixedNow}
      />,
    );

    // Suất còn hạn có link đặt vé
    const bookingLink = screen.getByRole("link", { name: /Đặt vé suất 15:00/i });
    expect(bookingLink).toBeInTheDocument();
    expect(bookingLink).toHaveAttribute("href", "/dat-ve/st-open");

    // Suất hết hạn không có link đặt vé và có nhãn "Mua tại quầy"
    expect(screen.queryByRole("link", { name: /Đặt vé suất 09:10/i })).not.toBeInTheDocument();
    expect(screen.getByText("Mua tại quầy")).toBeInTheDocument();
  });

  it("phim sắp chiếu chưa có suất hiển thị thông báo 'Sắp chiếu — Lịch chiếu sẽ được cập nhật sớm' (R-45)", () => {
    const comingSoonMovie: MovieDto = {
      ...MOCK_MOVIE,
      availability: "coming_soon",
      releaseDate: "2026-12-01",
    };

    render(
      <ShowtimeSchedule
        movie={comingSoonMovie}
        schedule={[]}
        selectedDate={todayVnStr}
        now={fixedNow}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Sắp chiếu — Lịch chiếu sẽ được cập nhật sớm" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Đặt vé/i })).not.toBeInTheDocument();
  });
});
