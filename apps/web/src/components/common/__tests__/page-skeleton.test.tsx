import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

import HomeLoading from "@/app/(public)/loading";
import SeatSelectionLoading from "@/app/(public)/dat-ve/loading";
import OrderLoading from "@/app/(public)/dat-ve/don/loading";
import ScheduleLoading from "@/app/(public)/lich-chieu/loading";
import MoviesLoading from "@/app/(public)/phim/loading";
import MovieDetailLoading from "@/app/(public)/phim/[slug]/loading";
import CinemasLoading from "@/app/(public)/rap/loading";
import CinemaDetailLoading from "@/app/(public)/rap/[code]/loading";
import AccountLoading from "@/app/(public)/tai-khoan/loading";
import MyTicketsLoading from "@/app/(public)/ve/loading";
import TicketDetailLoading from "@/app/(public)/ve/[bookingCode]/loading";

import { MovieGridSkeleton, PageSkeleton } from "../page-skeleton";

afterEach(cleanup);

const ROUTE_LOADINGS: ReadonlyArray<readonly [string, ComponentType, string]> = [
  ["trang chủ", HomeLoading, "Đang tải trang chủ…"],
  ["/phim", MoviesLoading, "Đang tải danh sách phim…"],
  ["/phim/[slug]", MovieDetailLoading, "Đang tải thông tin phim…"],
  ["/lich-chieu", ScheduleLoading, "Đang tải lịch chiếu…"],
  ["/rap", CinemasLoading, "Đang tải danh sách rạp…"],
  ["/rap/[code]", CinemaDetailLoading, "Đang tải thông tin rạp…"],
  ["/dat-ve", SeatSelectionLoading, "Đang tải sơ đồ ghế…"],
  ["/dat-ve/don", OrderLoading, "Đang tải đơn hàng…"],
  ["/ve", MyTicketsLoading, "Đang tải danh sách vé…"],
  ["/ve/[bookingCode]", TicketDetailLoading, "Đang tải chi tiết vé…"],
  ["/tai-khoan", AccountLoading, "Đang tải thông tin tài khoản…"],
];

describe("PageSkeleton", () => {
  it("là vùng role=status aria-busy với nhãn sr-only tiếng Việt", () => {
    render(
      <PageSkeleton label="Đang tải thử…">
        <div />
      </PageSkeleton>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Đang tải thử…")).toHaveClass("sr-only");
  });

  it("lưới poster dùng đúng số thẻ và ẩn khỏi trình đọc màn hình", () => {
    const { container } = render(<MovieGridSkeleton count={5} />);
    expect(container.querySelectorAll(".frame")).toHaveLength(5);
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    for (const bone of container.querySelectorAll("[data-slot='skeleton']")) {
      expect(bone).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe.each(ROUTE_LOADINGS)("loading.tsx của %s", (_route, Loading, label) => {
  it("render được, có đúng một vùng role=status và nhãn sr-only", () => {
    const { container } = render(<Loading />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(label)).toHaveClass("sr-only");
    expect(container.querySelector("[data-slot='skeleton']")).not.toBeNull();
  });

  it("không dùng Scrub (hiện tức thì) và không chứa nội dung giả", () => {
    const { container } = render(<Loading />);
    expect(container.querySelector("[data-scrub], [data-scrub-wipe], [data-scrub-rule]")).toBeNull();
    // Ngoài nhãn sr-only và stepper tĩnh, skeleton không có chữ/số giả.
    const status = screen.getByRole("status").cloneNode(true) as HTMLElement;
    status.querySelectorAll("nav").forEach((nav) => nav.remove());
    const visibleText = (status.textContent ?? "").replace(label, "");
    expect(visibleText).not.toMatch(/\d/);
    expect(visibleText.toLowerCase()).not.toContain("lorem");
  });
});
