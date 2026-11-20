// API giả tối thiểu cho bộ kiểm chuyển động theo cuộn (AC-32). Chỉ phục vụ các endpoint công khai
// mà trang khách gọi, không cần Supabase/Postgres. Chạy: `node e2e/scrub/mock-api.mjs` (cổng SCRUB_API_PORT, mặc định 4010).
import { createServer } from "node:http";

const PORT = Number(process.env.SCRUB_API_PORT ?? 4010);
const ORIGIN = `http://localhost:${PORT}`;

const PROVINCES = [
  { code: "HCM", name: "TP. Hồ Chí Minh" },
  { code: "HN", name: "Hà Nội" },
  { code: "DN", name: "Đà Nẵng" },
];

const CINEMAS = [
  ["SGN1", "CINEMO Quận 1", "HCM", "Quận 1", "12 Lê Lợi, Quận 1, TP. HCM"],
  ["HAN1", "CINEMO Cầu Giấy", "HN", "Cầu Giấy", "88 Xuân Thủy, Cầu Giấy, Hà Nội"],
  ["DAD1", "CINEMO Hải Châu", "DN", "Hải Châu", "5 Bạch Đằng, Hải Châu, Đà Nẵng"],
].map(([code, name, provinceCode, district, address], i) => ({
  id: `00000000-0000-4000-8000-00000000010${i}`,
  code,
  name,
  provinceCode,
  district,
  address,
  latitude: 10.77 + i,
  longitude: 106.7 + i,
  hotline: `1900 00${i}${i}`,
  email: null,
  openingHours: "09:00 - 23:00",
  imageUrl: null,
  amenities: ["IMAX", "Ghế đôi", "Bãi đỗ xe"],
  status: "OPEN",
  scheduledStatus: null,
  scheduledEffectiveAt: null,
  effectiveOnlineCutoffMinutes: 15,
}));

const TITLES = [
  "Đêm Neon Cuối Cùng",
  "Hành Trình Qua Dải Ngân Hà Vô Tận Và Những Điều Chưa Kể",
  "Bóng Ma Phố Cổ",
  "Mùa Hè Của Những Con Sóng",
  "Cuộc Săn Lúc Nửa Đêm",
  "Tình Yêu Ở Thời Đại Số",
  "Vệ Binh Thiên Hà",
  "Nhà Hàng Của Quỷ",
  "Khu Vườn Bí Mật",
  "Người Giữ Lửa",
  "Thành Phố Dưới Lòng Đất",
  "Ngày Mai Sẽ Khác",
  "Lời Thì Thầm Của Biển",
  "Kẻ Đánh Cắp Giấc Mơ",
];

const AGE = ["P", "K", "T13", "T16", "T18"];

const MOVIES = TITLES.map((titleVi, i) => ({
  id: `00000000-0000-4000-8000-${String(200 + i).padStart(12, "0")}`,
  slug: `phim-${i + 1}`,
  titleVi,
  titleOriginal: i % 3 === 0 ? `Original Title ${i + 1}` : null,
  posterUrl: `${ORIGIN}/img/poster-${(i % 6) + 1}.svg`,
  bannerUrl: `${ORIGIN}/img/banner-${(i % 3) + 1}.svg`,
  trailerUrl: null,
  description: "Một bộ phim giả dùng cho bộ kiểm chuyển động theo cuộn. Nội dung đủ dài để mô tả chiếm vài dòng trên trang chi tiết.",
  genres: ["Hành động", "Khoa học viễn tưởng"],
  durationMinutes: 95 + i * 3,
  director: "Đạo diễn Giả",
  cast: ["Diễn viên A", "Diễn viên B", "Diễn viên C"],
  country: "Việt Nam",
  originalLanguage: "Tiếng Việt",
  subtitleLanguages: ["Tiếng Anh"],
  dubbedLanguages: [],
  releaseDate: "2026-10-01",
  ageRating: AGE[i % AGE.length],
  status: "PUBLISHED",
  availability: i < 10 ? "now_showing" : "coming_soon",
}));

const NOW_SHOWING = MOVIES.filter((m) => m.availability === "now_showing");
const COMING_SOON = MOVIES.filter((m) => m.availability === "coming_soon");

function svg(width, height, hue, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 22%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 70% 10%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" fill="#fff" fill-opacity=".5" font-size="${Math.round(width / 12)}" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;
}

function todayVn() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Suất giả cho một ngày: nếu là hôm nay thì dời vào tương lai để còn đặt được. */
function showtimesFor(cinemaIndex, date, movieFilter) {
  const rows = [];
  const base = date === todayVn() ? Date.now() + 60 * 60_000 : Date.parse(`${date}T08:00:00+07:00`);
  let n = 0;
  for (const [mi, movie] of NOW_SHOWING.entries()) {
    if (movieFilter && movie.slug !== movieFilter) continue;
    for (let k = 0; k < 3; k++) {
      const start = base + (mi * 17 + k * 150) * 60_000;
      rows.push({
        id: `st-${cinemaIndex}-${mi}-${k}`,
        roomId: `room-${cinemaIndex}`,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + movie.durationMinutes * 60_000).toISOString(),
        format: k === 1 ? "3D" : "2D",
        languageMode: "SUBTITLED",
        status: "SCHEDULED",
        movie: {
          slug: movie.slug,
          titleVi: movie.titleVi,
          ageRating: movie.ageRating,
          posterUrl: movie.posterUrl,
          durationMinutes: movie.durationMinutes,
        },
      });
      n++;
    }
  }
  return { rows, n };
}

function seatMap(showtimeId) {
  const [, cinemaIndex = "0", movieIndex = "0"] = showtimeId.split("-");
  const cinema = CINEMAS[Number(cinemaIndex)] ?? CINEMAS[0];
  const movie = NOW_SHOWING[Number(movieIndex)] ?? NOW_SHOWING[0];
  const rows = "ABCDEFGH".split("");
  const cols = 12;
  const seats = [];
  for (const [ri, row] of rows.entries()) {
    for (let col = 1; col <= cols; col++) {
      const type = ri >= 6 ? "SWEETBOX" : ri >= 4 ? "VIP" : "STANDARD";
      const sold = (ri * 5 + col * 3) % 11 === 0;
      seats.push({
        id: `seat-${row}${col}`,
        row,
        col,
        colSpan: type === "SWEETBOX" ? 1 : 1,
        type,
        label: `${row}${col}`,
        state: sold ? "SOLD" : "FREE",
        expiresAt: null,
        price: type === "VIP" ? 120000 : type === "SWEETBOX" ? 180000 : 90000,
      });
    }
  }
  const start = Date.now() + 2 * 3600_000;
  return {
    showtime: {
      id: showtimeId,
      cinemaId: cinema.id,
      roomId: `room-${cinemaIndex}`,
      movieId: movie.id,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + movie.durationMinutes * 60_000).toISOString(),
      format: "2D",
      status: "SCHEDULED",
    },
    room: { id: `room-${cinemaIndex}`, name: "Phòng 1", gridRows: rows.length, gridCols: cols },
    pricing: { STANDARD: 90000, VIP: 120000, SWEETBOX: 180000 },
    seats,
  };
}

function route(url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const date = url.searchParams.get("date") ?? todayVn();
  const province = url.searchParams.get("province");
  const status = url.searchParams.get("status");

  if (path === "/health") return { body: { ok: true } };
  if (path === "/provinces") return { body: PROVINCES };
  if (path === "/home") {
    return {
      body: {
        // Phim nổi bật đầu tiên có tên dài (3 dòng) để thử hero ở màn thấp.
        banners: [NOW_SHOWING[1], NOW_SHOWING[0], NOW_SHOWING[2]].map((m) => ({ slug: m.slug, titleVi: m.titleVi, bannerUrl: m.bannerUrl })),
        nowShowing: NOW_SHOWING,
        comingSoon: COMING_SOON,
      },
    };
  }
  if (path === "/cinemas") {
    // Tỉnh lạ (cookie "ALL" của bộ kiểm để khỏi bật hộp chọn tỉnh) = không lọc.
    const known = PROVINCES.some((p) => p.code === province);
    return { body: known ? CINEMAS.filter((c) => c.provinceCode === province) : CINEMAS };
  }
  const cinema = /^\/cinemas\/([^/]+)$/.exec(path);
  if (cinema) {
    const index = CINEMAS.findIndex((c) => c.code === decodeURIComponent(cinema[1]));
    if (index < 0) return { status: 404, body: { error: { code: "NOT_FOUND", message: "NOT_FOUND" } } };
    return {
      body: {
        cinema: CINEMAS[index],
        rooms: [{ id: `room-${index}`, name: "Phòng 1", supportedFormats: ["2D", "3D"], status: "ACTIVE" }],
        showtimes: showtimesFor(index, date).rows,
      },
    };
  }
  if (path === "/movies") {
    const list = status === "now_showing" ? NOW_SHOWING : status === "coming_soon" ? COMING_SOON : MOVIES;
    return { body: list };
  }
  const movie = /^\/movies\/([^/]+)$/.exec(path);
  if (movie) {
    const slug = decodeURIComponent(movie[1]);
    const found = MOVIES.find((m) => m.slug === slug);
    if (!found) return { status: 404, body: { error: { code: "NOT_FOUND", message: "NOT_FOUND" } } };
    return {
      body: {
        movie: found,
        schedule: CINEMAS.map((c, index) => ({
          cinema: { code: c.code, name: c.name, effectiveOnlineCutoffMinutes: c.effectiveOnlineCutoffMinutes },
          showtimes: showtimesFor(index, date, slug).rows.map((row) => ({ ...row, movie: undefined })),
        })),
      },
    };
  }
  const seat = /^\/showtimes\/([^/]+)\/seatmap$/.exec(path);
  if (seat) return { body: seatMap(decodeURIComponent(seat[1])) };
  return { status: 404, body: { error: { code: "NOT_FOUND", message: "NOT_FOUND" } } };
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", ORIGIN);
  const image = /^\/img\/(poster|banner)-(\d+)\.svg$/.exec(url.pathname);
  if (image) {
    const banner = image[1] === "banner";
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" });
    res.end(svg(banner ? 1600 : 400, banner ? 900 : 600, Number(image[2]) * 47, banner ? "BANNER" : "POSTER"));
    return;
  }
  const { status = 200, body } = route(url);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`mock API http://localhost:${PORT}`));
