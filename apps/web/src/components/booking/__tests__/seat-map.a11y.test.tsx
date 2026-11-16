import "@testing-library/jest-dom/vitest";

import type { BookingSummaryResponse, SeatMapItem } from "@filmbooking/shared/schemas/booking";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import OrderConfirmPage from "@/app/(public)/dat-ve/don/[id]/xac-nhan/page";
import { LoginForm } from "@/components/auth/login-form";
import { apiFetch } from "@/lib/api/client";
import { SeatMap } from "../seat-map";

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

/**
 * NFR-12: 0 vi phạm serious/critical. Lưu ý: jsdom không tính layout/màu nên axe tự bỏ qua rule
 * color-contrast — tương phản được đảm bảo bằng design tokens (skills/react-nodejs/design-tokens.md) và Lighthouse.
 */
async function seriousViolations(container: HTMLElement) {
  const results = await axe(container);
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

function seat(row: string, col: number, over: Partial<SeatMapItem> = {}): SeatMapItem {
  return { id: `${row}${col}`, row, col, colSpan: 1, type: "NORMAL", label: `${row}${col}`, state: "FREE", expiresAt: null, price: 100000, ...over };
}

describe("a11y (axe)", () => {
  it("SeatMap: ghế trống / đã chọn / đã bán / đang giữ", async () => {
    const seats = [
      seat("A", 1),
      seat("A", 2, { state: "SOLD" }),
      seat("A", 3, { state: "HELD" }),
      seat("A", 4, { type: "VIP" }),
      seat("B", 1),
    ];
    const { container } = render(
      <SeatMap seats={seats} selectedIds={new Set(["B1"])} orphanIds={new Set()} onSeatActivate={() => {}} />,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("Form đăng nhập", async () => {
    const { container } = render(<LoginForm onLogin={async () => ({ success: true })} />);
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("Trang xác nhận đơn", async () => {
    const summary: BookingSummaryResponse = {
      id: "order-1",
      bookingCode: "HN01-7K3P9Q",
      status: "holding",
      holdExpiresAt: null,
      expiresInSeconds: 600,
      movie: { title: "Vệt sáng cuối cùng", ageRating: "P", posterUrl: null },
      cinema: { id: "c1", code: "HN01", name: "CINEMO Long Biên", address: "12 Nguyễn Văn Cừ", district: null },
      showtime: { id: "s1", startsAt: "2026-11-11T12:30:00Z", endsAt: "2026-11-11T14:30:00Z", roomName: "Phòng 03", format: "2D" },
      seats: [{ id: "a", label: "F7", type: "standard", price: 150000 }],
      pricing: { subtotal: 150000, discount: 0, total: 150000 },
      voucher: null,
      consent: { consented: false, consentAt: null },
      ageConfirmed: false,
    };
    vi.mocked(apiFetch).mockResolvedValueOnce(summary);
    const { container } = render(<OrderConfirmPage />);
    await screen.findByText("Xác nhận đơn hàng");
    expect(await seriousViolations(container)).toEqual([]);
  });
});
