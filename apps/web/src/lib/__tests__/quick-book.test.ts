import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_SELECTION,
  applyFieldChange,
  dateOptions,
  loadCinemaShowtimes,
  missingFieldsMessage,
  movieOptions,
  resolveSelection,
  sellableShowtimes,
  timeOptions,
  type QuickBookShowtime,
} from "../quick-book";

// 19/11/2026 10:00 giờ Việt Nam
const NOW = new Date("2026-11-19T03:00:00Z");

function showtime(id: string, startsAt: string, movie: string, status = "ON_SALE"): QuickBookShowtime {
  return {
    id,
    roomId: "room-1",
    startsAt,
    endsAt: startsAt,
    format: "2D",
    languageMode: "SUBTITLED",
    status,
    movie: { slug: movie, titleVi: `Phim ${movie}` },
  };
}

const ALL: QuickBookShowtime[] = [
  showtime("st-ok-1", "2026-11-19T05:00:00Z", "a"), // 12:00 hôm nay
  showtime("st-late", "2026-11-19T03:05:00Z", "a"), // 10:05, đã quá mốc đóng bán 15 phút
  showtime("st-closed", "2026-11-19T07:00:00Z", "a", "CLOSED"), // Ngừng bán online (R-67)
  showtime("st-cancelled", "2026-11-19T08:00:00Z", "c", "CANCELLED"),
  showtime("st-ok-2", "2026-11-20T12:30:00Z", "b"), // 19:30 ngày mai
  showtime("st-ok-3", "2026-11-20T06:00:00Z", "a"), // 13:00 ngày mai
];

describe("sellableShowtimes (R-138, R-67, R-56)", () => {
  it("loại suất Ngừng bán online, đã huỷ và đã quá mốc đóng bán", () => {
    expect(sellableShowtimes(ALL, NOW).map((s) => s.id)).toEqual(["st-ok-1", "st-ok-2", "st-ok-3"]);
  });
});

describe("danh sách lựa chọn phụ thuộc theo ô", () => {
  const sellable = sellableShowtimes(ALL, NOW);

  it("phim: chỉ phim còn suất bán được", () => {
    expect(movieOptions(sellable).map((o) => o.value)).toEqual(["a", "b"]);
  });

  it("ngày: chỉ ngày trong 7 ngày tới mà phim đã chọn có suất", () => {
    expect(dateOptions(sellable, "a", NOW).map((o) => o.value)).toEqual(["2026-11-19", "2026-11-20"]);
    expect(dateOptions(sellable, "b", NOW).map((o) => o.value)).toEqual(["2026-11-20"]);
    expect(dateOptions(sellable, "", NOW)).toEqual([]);
  });

  it("giờ: đúng suất của phim trong ngày, sắp theo giờ, giá trị là id suất", () => {
    const times = timeOptions(sellable, "a", "2026-11-20");
    expect(times.map((o) => o.value)).toEqual(["st-ok-3"]);
    expect(times[0]?.label).toContain("13:00");
    expect(timeOptions(sellable, "a", "")).toEqual([]);
  });

  it("ngày ngoài 7 ngày tới không được liệt kê", () => {
    const far = [showtime("st-far", "2026-11-30T05:00:00Z", "a")];
    expect(dateOptions(far, "a", NOW)).toEqual([]);
  });
});

describe("applyFieldChange", () => {
  const full = { cinema: "HN1", movie: "a", date: "2026-11-19", showtimeId: "st-ok-1" };

  it("đổi rạp đặt lại phim, ngày, giờ", () => {
    expect(applyFieldChange(full, "cinema", "HN2")).toEqual({ cinema: "HN2", movie: "", date: "", showtimeId: "" });
  });

  it("đổi phim giữ rạp, đặt lại ngày và giờ", () => {
    expect(applyFieldChange(full, "movie", "b")).toEqual({ cinema: "HN1", movie: "b", date: "", showtimeId: "" });
  });

  it("đổi giờ không ảnh hưởng ô nào khác", () => {
    expect(applyFieldChange(full, "showtimeId", "x")).toEqual({ ...full, showtimeId: "x" });
  });
});

describe("resolveSelection", () => {
  it("đủ 4 ô: điều hướng tới màn chọn ghế của đúng suất", () => {
    expect(resolveSelection({ cinema: "HN1", movie: "a", date: "2026-11-19", showtimeId: "st-ok-1" })).toEqual({
      ok: true,
      href: "/dat-ve/st-ok-1",
    });
  });

  it("thiếu ô: liệt kê đúng tên ô thiếu và không có href", () => {
    const result = resolveSelection({ ...EMPTY_SELECTION, cinema: "HN1", movie: "a" });
    expect(result).toEqual({ ok: false, missing: ["Ngày", "Giờ chiếu"] });
    expect(missingFieldsMessage(["Ngày", "Giờ chiếu"])).toBe("Vui lòng chọn: Ngày, Giờ chiếu");
  });
});

describe("loadCinemaShowtimes", () => {
  it("gọi đúng endpoint lịch chiếu R-44 cho 7 ngày và gộp suất, bỏ ngày lỗi", async () => {
    const calls: string[] = [];
    const fetchJson = vi.fn(async (path: string) => {
      calls.push(path);
      if (path.endsWith("date=2026-11-21")) throw new Error("boom");
      return {
        cinema: { status: "OPEN" },
        showtimes: path.endsWith("date=2026-11-19") ? [ALL[0]] : [],
      };
    });
    const loaded = await loadCinemaShowtimes("HN1", NOW, fetchJson);
    expect(calls).toHaveLength(7);
    expect(calls[0]).toBe("/cinemas/HN1?date=2026-11-19");
    expect(loaded.map((s) => s.id)).toEqual(["st-ok-1"]);
  });

  it("rạp không còn hoạt động (R-137) không có suất nào", async () => {
    const fetchJson = vi.fn(async () => ({ cinema: { status: "TEMP_CLOSED" }, showtimes: [ALL[0]] }));
    expect(await loadCinemaShowtimes("HN1", NOW, fetchJson)).toEqual([]);
  });
});

describe("mốc đóng bán online riêng của rạp (R-56, CR-011)", () => {
  // 10:00 VN; suất 10:20 VN còn 20 phút
  const startsIn20Minutes = "2026-11-19T03:20:00Z";

  it("rạp mốc 30 phút: suất còn 20 phút không còn bán, rạp không cấu hình vẫn dùng 15 phút", () => {
    const strictCinema = { ...showtime("st-30", startsIn20Minutes, "a"), onlineCutoffMinutes: 30 };
    const defaultCinema = showtime("st-default", startsIn20Minutes, "a");
    expect(sellableShowtimes([strictCinema, defaultCinema], NOW).map((s) => s.id)).toEqual(["st-default"]);
  });

  it("mốc ngắn hơn mặc định (5 phút) vẫn bán suất còn 10 phút", () => {
    const relaxed = { ...showtime("st-5", "2026-11-19T03:10:00Z", "a"), onlineCutoffMinutes: 5 };
    expect(sellableShowtimes([relaxed], NOW).map((s) => s.id)).toEqual(["st-5"]);
  });

  it("loadCinemaShowtimes gắn effectiveOnlineCutoffMinutes của rạp vào từng suất", async () => {
    const fetchJson = vi.fn(async (path: string) => ({
      cinema: { status: "OPEN", effectiveOnlineCutoffMinutes: 30 },
      showtimes: path.endsWith("date=2026-11-19") ? [{ ...ALL[0], startsAt: startsIn20Minutes }] : [],
    }));
    const loaded = await loadCinemaShowtimes("HN1", NOW, fetchJson);
    expect(loaded[0]?.onlineCutoffMinutes).toBe(30);
    expect(sellableShowtimes(loaded, NOW)).toEqual([]);
  });
});
