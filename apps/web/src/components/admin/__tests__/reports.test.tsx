import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportDashboard, isValidRange } from "../report-dashboard";
import { defaultVnRange, defaultVnShowtimeRange, vnDateString } from "../report-utils";
import { aggregateByDay } from "../revenue-report";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/bao-cao",
  useRouter: () => ({ push: vi.fn() }),
}));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const HN01 = "11111111-1111-4111-8111-111111111111";
const HN02 = "22222222-2222-4222-8222-222222222222";

function apiError() {
  return Object.assign(new Error("Không có quyền"), { code: "FORBIDDEN_CINEMA", status: 403 });
}

const REVENUE = [
  { reportDate: "2026-11-13", cinemaId: HN01, cinemaCode: "HN01", cinemaName: "HN01", channel: "WEB", totalOrders: 2, totalTickets: 4, grossRevenue: 500000, totalDiscount: 0, netRevenue: 500000 },
  { reportDate: "2026-11-14", cinemaId: HN01, cinemaCode: "HN01", cinemaName: "HN01", channel: "WEB", totalOrders: 1, totalTickets: 2, grossRevenue: 1234000, totalDiscount: 0, netRevenue: 1234000 },
];
// Suất chiếu 10 ngày sau hôm nay (giờ VN): đúng ca huỷ suất sắp chiếu của AC-25.
const FUTURE_DAY = vnDateString(new Date(Date.now() + 10 * 86_400_000));
const FUTURE_START = `${FUTURE_DAY}T03:00:00Z`;
const CANCELLED = [
  { showtimeId: "s1", cinemaId: HN01, cinemaCode: "HN01", cinemaName: "Rạp HN01", movieTitle: "Phim A", roomName: "P1", startsAt: FUTURE_START, endsAt: FUTURE_START, showtimeStatus: "CANCELLED", totalAffectedOrders: 5, exchangedOrders: 1, refundedManualOrders: 3, pendingOrders: 1, totalRefundedAmount: 750000 },
];

function route(overrides: Record<string, unknown> = {}, me?: unknown) {
  mockApiFetch.mockImplementation(async (path: string) => {
    const base = path.split("?")[0] ?? path;
    if (base === "/me")
      return me ?? { id: "u", email: null, emailConfirmed: true, isAdmin: true, cinemas: [] };
    if (base === "/cinemas") return [{ id: HN01, name: "Rạp HN01" }, { id: HN02, name: "Rạp HN02" }];
    if (base === "/admin/reports/cancelled-showtimes" && Array.isArray(overrides[base])) {
      const q = new URLSearchParams(path.split("?")[1] ?? "");
      const from = q.get("fromDate");
      const to = q.get("toDate");
      return (overrides[base] as { startsAt: string }[]).filter((r) => {
        const day = vnDateString(new Date(r.startsAt));
        return (!from || day >= from) && (!to || day <= to);
      });
    }
    if (base in overrides) {
      const value = overrides[base];
      if (value instanceof Error) throw value;
      return value;
    }
    return [];
  });
}

function reportCalls(): string[] {
  return mockApiFetch.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/admin/reports"));
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockApiFetch.mockReset();
});
afterEach(cleanup);

describe("report helpers", () => {
  it("aggregates rows per day ascending", () => {
    const days = aggregateByDay([REVENUE[1]!, REVENUE[0]!, { ...REVENUE[0]!, channel: "POS", netRevenue: 100000 }]);
    expect(days.map((d) => [d.date, d.netRevenue])).toEqual([
      ["2026-11-13", 600000],
      ["2026-11-14", 1234000],
    ]);
  });

  it("computes the date in Vietnam time, not UTC", () => {
    // 2026-11-13T18:00Z = 01:00 ngày 14/11 giờ VN
    expect(vnDateString(new Date("2026-11-13T18:00:00Z"))).toBe("2026-11-14");
    expect(defaultVnRange(new Date("2026-11-13T18:00:00Z"))).toEqual({ from: "2026-10-16", to: "2026-11-14" });
  });

  it("validates ranges", () => {
    expect(isValidRange("2026-11-01", "2026-11-14")).toBe(true);
    expect(isValidRange("2026-11-15", "2026-11-14")).toBe(false);
    expect(isValidRange("", "2026-11-14")).toBe(false);
  });
});

describe("ReportDashboard", () => {
  it("admin chain scope omits cinemaId and formats VND", async () => {
    route({ "/admin/reports/revenue": REVENUE, "/admin/reports/cancelled-showtimes": CANCELLED });
    render(<ReportDashboard />);
    expect(await screen.findByTestId("revenue-total")).toHaveTextContent("1.734.000 ₫");
    expect(screen.getByText("Toàn chuỗi")).toBeInTheDocument();
    expect(reportCalls().every((p) => !p.includes("cinemaId"))).toBe(true);
    expect(reportCalls().every((p) => p.includes("fromDate=") || p.includes("payos"))).toBe(true);
  });

  it("shows refunded_manual orders in the cancelled showtimes report (AC-25)", async () => {
    route({ "/admin/reports/cancelled-showtimes": CANCELLED });
    render(<ReportDashboard />);
    const section = await screen.findByRole("region", { name: "Suất bị huỷ" });
    const row = await within(section).findByRole("row", { name: /Phim A/ });
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[5]).toBe("3");
    expect(cells[7]).toBe("750.000 ₫");
  });

  it("manager is locked to the cinema they manage, never a staff-only cinema", async () => {
    searchParams = new URLSearchParams({ cinema: HN02 });
    route(
      {},
      {
        id: "u",
        email: null,
        emailConfirmed: true,
        isAdmin: false,
        cinemas: [
          { cinemaId: HN02, role: "STAFF" },
          { cinemaId: HN01, role: "MANAGER" },
        ],
      },
    );
    render(<ReportDashboard />);
    await screen.findByText("Rạp HN01");
    await waitFor(() => expect(reportCalls().length).toBeGreaterThan(0));
    expect(reportCalls().every((p) => p.includes(`cinemaId=${HN01}`))).toBe(true);
    expect(reportCalls().some((p) => p.includes(HN02))).toBe(false);
  });

  it("default cancelled-showtimes request includes upcoming showtimes (AC-25)", async () => {
    route({ "/admin/reports/cancelled-showtimes": CANCELLED });
    render(<ReportDashboard />);
    const section = await screen.findByRole("region", { name: "Suất bị huỷ" });
    expect(await within(section).findByRole("row", { name: /Phim A/ })).toBeInTheDocument();
    const call = reportCalls().find((p) => p.startsWith("/admin/reports/cancelled-showtimes")) ?? "";
    const q = new URLSearchParams(call.split("?")[1]);
    expect(q.get("toDate")! > vnDateString(new Date())).toBe(true);
    expect(q.get("toDate")).toBe(defaultVnShowtimeRange().to);
  });

  it("staff-only user sees a no-permission message without retry", async () => {
    route({}, { id: "u", email: null, emailConfirmed: true, isAdmin: false, cinemas: [{ cinemaId: HN01, role: "STAFF" }] });
    render(<ReportDashboard />);
    expect(await screen.findByText("Không có quyền xem báo cáo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(reportCalls()).toHaveLength(0);
  });

  it("shows empty states when there is no data", async () => {
    route();
    render(<ReportDashboard />);
    expect(await screen.findByText("Chưa có doanh thu")).toBeInTheDocument();
    expect(screen.getByText("Không có giao dịch lệch")).toBeInTheDocument();
    expect(screen.getByText("Không có suất bị huỷ")).toBeInTheDocument();
  });

  it("shows ErrorState (not stale data) when a report fails with the real error shape", async () => {
    route({ "/admin/reports/revenue": apiError(), "/admin/reports/payos-reconciliation": [] });
    render(<ReportDashboard />);
    const section = await screen.findByRole("region", { name: "Doanh thu theo ngày" });
    expect(await within(section).findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("revenue-total")).not.toBeInTheDocument();
  });

  it("an old slow response cannot overwrite a newer filter", async () => {
    let releaseFirst: (rows: unknown[]) => void = () => {};
    let revenueCalls = 0;
    mockApiFetch.mockImplementation(async (path: string, init?: { signal?: AbortSignal }) => {
      const base = path.split("?")[0] ?? path;
      if (base === "/me") return { id: "u", email: null, emailConfirmed: true, isAdmin: true, cinemas: [] };
      if (base === "/cinemas") return [];
      if (base === "/admin/reports/revenue") {
        revenueCalls += 1;
        if (revenueCalls === 1) {
          // Bỏ qua abort để mô phỏng response cũ vẫn về muộn.
          void init;
          return new Promise((resolve) => {
            releaseFirst = resolve;
          });
        }
        return [{ ...REVENUE[0]!, netRevenue: 999000 }];
      }
      return [];
    });
    render(<ReportDashboard />);
    await waitFor(() => expect(revenueCalls).toBe(1));
    fireEvent.change(screen.getByLabelText("Từ ngày (Theo ngày tạo đơn)"), { target: { value: "2026-11-10" } });
    expect(await screen.findByTestId("revenue-total")).toHaveTextContent("999.000 ₫");
    releaseFirst([{ ...REVENUE[0]!, netRevenue: 111000 }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("revenue-total")).toHaveTextContent("999.000 ₫");
  });

  it("blocks requests and warns on an inverted date range", async () => {
    route();
    render(<ReportDashboard />);
    await screen.findByText("Chưa có doanh thu");
    fireEvent.change(screen.getByLabelText("Từ ngày (Theo ngày tạo đơn)"), { target: { value: "2999-01-01" } });
    expect(await screen.findByText(/Khoảng ngày không hợp lệ/)).toBeInTheDocument();
    expect(screen.queryByText("Chưa có doanh thu")).not.toBeInTheDocument();
  });
});
