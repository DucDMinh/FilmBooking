import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleDateNav, ScheduleFilters } from "@/components/catalog/schedule-filters";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/lich-chieu",
}));

beforeEach(() => {
  push.mockClear();
});
afterEach(() => {
  cleanup();
});

const PROVINCES = [
  { code: "HN", name: "Hà Nội" },
  { code: "HCM", name: "TP. Hồ Chí Minh" },
];
const MOVIES = [
  { slug: "nguoi-nhen", titleVi: "Người Nhện", ageRating: "T13" },
  { slug: "lat-mat-7", titleVi: "Lật Mặt 7", ageRating: "K" },
];
const CINEMAS = [
  { code: "HN01", name: "CINEMO Long Biên" },
  { code: "HN02", name: "CINEMO Cầu Giấy" },
];

function renderFilters(values: { province?: string; movie?: string; cinema?: string; date?: string }) {
  render(
    <ScheduleFilters
      provinces={PROVINCES}
      movies={MOVIES}
      cinemas={CINEMAS}
      values={{ province: "", movie: "", cinema: "", date: "2026-11-15", ...values }}
    />,
  );
}

describe("ScheduleFilters (bug lich-chieu: select không điều hướng)", () => {
  it("đổi phim điều hướng tới ?movie= và giữ date", () => {
    renderFilters({});
    fireEvent.change(screen.getByLabelText("Chọn phim"), { target: { value: "lat-mat-7" } });
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.pathname).toBe("/lich-chieu");
    expect(url.searchParams.get("movie")).toBe("lat-mat-7");
    expect(url.searchParams.get("date")).toBe("2026-11-15");
  });

  it("đổi rạp điều hướng tới ?cinema= và giữ phim đang chọn", () => {
    renderFilters({ movie: "lat-mat-7" });
    fireEvent.change(screen.getByLabelText("Chọn rạp"), { target: { value: "HN02" } });
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("cinema")).toBe("HN02");
    expect(url.searchParams.get("movie")).toBe("lat-mat-7");
  });

  it("đổi tỉnh điều hướng tới ?province= và xoá cinema (rạp phụ thuộc tỉnh)", () => {
    renderFilters({ cinema: "HN01", movie: "lat-mat-7" });
    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "HCM" } });
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("province")).toBe("HCM");
    expect(url.searchParams.has("cinema")).toBe(false);
    expect(url.searchParams.get("movie")).toBe("lat-mat-7");
  });

  it("chọn lại 'tất cả' xoá tham số khỏi URL", () => {
    renderFilters({ movie: "lat-mat-7" });
    fireEvent.change(screen.getByLabelText("Chọn phim"), { target: { value: "" } });
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.has("movie")).toBe(false);
  });

  it("hiển thị giá trị đang chọn từ URL", () => {
    renderFilters({ province: "HN", movie: "nguoi-nhen", cinema: "HN01" });
    expect(screen.getByLabelText("Khu vực")).toHaveValue("HN");
    expect(screen.getByLabelText("Chọn phim")).toHaveValue("nguoi-nhen");
    expect(screen.getByLabelText("Chọn rạp")).toHaveValue("HN01");
  });
});

describe("ScheduleDateNav (bug lich-chieu: dải ngày không đổi)", () => {
  const now = new Date("2026-11-15T02:00:00.000Z"); // 09:00 VN, 15/11

  it("bấm ngày khác điều hướng tới ?date= và giữ phim/rạp/tỉnh", () => {
    render(
      <ScheduleDateNav
        values={{ province: "HN", movie: "lat-mat-7", cinema: "HN01", date: "2026-11-15" }}
        now={now}
      />,
    );
    const days = screen.getAllByRole("button");
    expect(days).toHaveLength(7);
    fireEvent.click(days[3]!);
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("date")).toBe("2026-11-18");
    expect(url.searchParams.get("movie")).toBe("lat-mat-7");
    expect(url.searchParams.get("cinema")).toBe("HN01");
    expect(url.searchParams.get("province")).toBe("HN");
  });

  it("nút ngày theo prop date là nút được chọn", () => {
    render(
      <ScheduleDateNav
        values={{ province: "", movie: "", cinema: "", date: "2026-11-17" }}
        now={now}
      />,
    );
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("17/11");
  });
});
