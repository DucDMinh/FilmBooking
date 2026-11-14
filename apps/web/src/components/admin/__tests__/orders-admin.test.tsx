import "@testing-library/jest-dom/vitest";

import type { AdminTodoDto, OrderDetailDto, OrderSummaryDto } from "@filmbooking/shared/schemas/orders";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderDetail } from "../order-detail";
import { ManualReviewQueue, OrderSearch } from "../orders-list";
import { OrderTimeline } from "../order-timeline";
import { TodoDashboard } from "../todo-widgets";

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/don-hang",
  useRouter: () => ({ push, replace }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const HN01 = "11111111-1111-4111-8111-111111111111";
const HN02 = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";

type Route = { status?: number; body: unknown };
let routes: Record<string, Route | ((init?: RequestInit) => Route)> = {};
const fetchMock = vi.fn();

/** Response đúng dạng API thật: lỗi là `{error:{code,message,details}}`. */
function apiError(status: number, code: string): Route {
  return { status, body: { error: { code, message: "msg", details: {} } } };
}

function me(over: Partial<{ isAdmin: boolean; cinemas: { cinemaId: string; role: "STAFF" | "MANAGER" }[] }>) {
  return { isAdmin: false, cinemas: [], ...over };
}

function summary(over: Partial<OrderSummaryDto> = {}): OrderSummaryDto {
  return {
    id: ORDER_ID,
    bookingCode: "FB123456",
    channel: "WEB",
    cinemaId: HN01,
    cinemaCode: "HN01",
    cinemaName: "Cinemo HN01",
    showtimeId: "s1",
    movieTitle: "Phim A",
    roomName: "P1",
    showtimeStartsAt: "2026-11-20T10:00:00.000Z",
    showtimeEndsAt: "2026-11-20T12:00:00.000Z",
    status: "needs_manual_review",
    subtotalAmount: 100000,
    discountAmount: 0,
    totalAmount: 100000,
    contactEmail: "a@b.vn",
    contactPhone: "0900000000",
    manualReviewResolvedAt: null,
    cancelledAt: null,
    cancelReason: null,
    ticketCount: 1,
    createdAt: "2026-11-14T01:00:00.000Z",
    updatedAt: "2026-11-14T01:00:00.000Z",
    ...over,
  };
}

function detail(over: Partial<OrderDetailDto> = {}): OrderDetailDto {
  return {
    ...summary(),
    userId: null,
    tickets: [],
    payments: [],
    statusHistory: [
      { status: "holding", timestamp: "2026-11-14T01:00:00.000Z" },
      { status: "needs_manual_review", timestamp: "2026-11-14T01:05:00.000Z", note: "Lệch số tiền thanh toán" },
    ],
    affectedAction: null,
    ...over,
  };
}

function todo(over: Partial<AdminTodoDto> = {}): AdminTodoDto {
  return {
    needsManualReviewCount: 1,
    needsManualReviewOrders: [summary()],
    affectedCount: 0,
    affectedOrders: [],
    failedEmailCount: 1,
    failedEmails: [{ id: "e1", toEmail: "x@y.vn", kind: "TICKET", lastError: "smtp", attempts: 3, createdAt: "" }],
    upcomingShowtimesCount: 0,
    upcomingShowtimes: [],
    ...over,
  };
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  searchParams = new URLSearchParams();
  routes = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/proxy", "")}`;
    const hit = routes[key];
    if (!hit) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "x" } }), { status: 404 });
    const route = typeof hit === "function" ? hit(init) : hit;
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TodoDashboard", () => {
  it("Manager thấy đơn cần xử lý và email lỗi", async () => {
    routes["GET /me"] = { body: me({ cinemas: [{ cinemaId: HN01, role: "MANAGER" }] }) };
    routes["GET /admin/todo"] = { body: todo() };
    render(<TodoDashboard />);
    expect(await screen.findByText("Đơn cần xử lý thủ công")).toBeInTheDocument();
    expect(screen.getByText("FB123456")).toBeInTheDocument();
    expect(screen.getByText("x@y.vn")).toBeInTheDocument();
  });

  it("Staff không thấy mục đơn cần xử lý / email lỗi", async () => {
    routes["GET /me"] = { body: me({ cinemas: [{ cinemaId: HN01, role: "STAFF" }] }) };
    routes["GET /admin/todo"] = { body: todo({ needsManualReviewCount: 0, needsManualReviewOrders: [], failedEmailCount: 0, failedEmails: [] }) };
    render(<TodoDashboard />);
    expect(await screen.findByText("Đơn bị ảnh hưởng chưa xử lý")).toBeInTheDocument();
    expect(screen.queryByText("Đơn cần xử lý thủ công")).not.toBeInTheDocument();
    expect(screen.queryByText("Email gửi lỗi")).not.toBeInTheDocument();
  });

  it("lỗi tải: hiện ErrorState, không hiện số liệu", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/todo"] = apiError(500, "INTERNAL_ERROR");
    render(<TodoDashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được dữ liệu");
    expect(screen.queryByText("FB123456")).not.toBeInTheDocument();
  });
});

describe("ManualReviewQueue (AC-11)", () => {
  it("Manager rạp thấy đơn needs_manual_review, lọc theo rạp được gán", async () => {
    routes["GET /me"] = { body: me({ cinemas: [{ cinemaId: HN01, role: "MANAGER" }] }) };
    routes[`GET /admin/orders/needs-manual-review?page=1&limit=20&cinemaId=${HN01}`] = {
      body: { items: [summary()], total: 1, page: 1, limit: 20 },
    };
    render(<ManualReviewQueue />);
    expect(await screen.findByRole("link", { name: "FB123456" })).toHaveAttribute("href", "/admin/don-hang/FB123456");
  });

  it("Admin xem toàn chuỗi (không gửi cinemaId)", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/orders/needs-manual-review?page=1&limit=20"] = {
      body: { items: [summary({ cinemaId: HN02 })], total: 1, page: 1, limit: 20 },
    };
    render(<ManualReviewQueue />);
    expect(await screen.findByRole("link", { name: "FB123456" })).toBeInTheDocument();
  });

  it("mặc định ẩn đơn đã giải quyết; bật toggle thì hiện kèm nhãn Đã xử lý thủ công", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/orders/needs-manual-review?page=1&limit=20"] = {
      body: {
        items: [summary(), summary({ id: "r2", bookingCode: "FB777777", manualReviewResolvedAt: "2026-11-14T02:00:00.000Z" })],
        total: 2,
        page: 1,
        limit: 20,
      },
    };
    render(<ManualReviewQueue />);
    expect(await screen.findByRole("link", { name: "FB123456" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "FB777777" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Hiện cả đơn đã giải quyết"));
    expect(await screen.findByRole("link", { name: "FB777777" })).toBeInTheDocument();
    expect(screen.getByText("Đã xử lý thủ công")).toBeInTheDocument();
  });

  it("Admin chọn rạp (?cinema=) thì gửi cinemaId", async () => {
    searchParams = new URLSearchParams(`cinema=${HN02}`);
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes[`GET /admin/orders/needs-manual-review?page=1&limit=20&cinemaId=${HN02}`] = {
      body: { items: [summary({ cinemaId: HN02 })], total: 1, page: 1, limit: 20 },
    };
    render(<ManualReviewQueue />);
    expect(await screen.findByRole("link", { name: "FB123456" })).toBeInTheDocument();
  });

  it("Staff thuần: báo không có quyền, không gọi API danh sách", async () => {
    routes["GET /me"] = { body: me({ cinemas: [{ cinemaId: HN01, role: "STAFF" }] }) };
    render(<ManualReviewQueue />);
    expect(await screen.findByText("Không có quyền")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("needs-manual-review"))).toBe(false);
  });

  it("lỗi API: ErrorState thay vì danh sách", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/orders/needs-manual-review?page=1&limit=20"] = apiError(500, "INTERNAL_ERROR");
    render(<ManualReviewQueue />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được dữ liệu");
    expect(screen.queryByRole("link", { name: "FB123456" })).not.toBeInTheDocument();
  });
});

describe("OrderSearch", () => {
  it("Admin chọn rạp (?cinema=) thì tra cứu gửi cinemaId", async () => {
    searchParams = new URLSearchParams(`cinema=${HN02}`);
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes[`GET /admin/orders?cinemaId=${HN02}&page=1&limit=20`] = {
      body: { items: [summary({ cinemaId: HN02, status: "paid" })], total: 1, page: 1, limit: 20 },
    };
    render(<OrderSearch />);
    expect(await screen.findByRole("link", { name: "FB123456" })).toBeInTheDocument();
  });

  it("mã đặt vé khớp chính xác (không phân biệt hoa/thường) mở thẳng chi tiết", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/orders?bookingCode=fb123456&page=1&limit=20"] = {
      body: { items: [summary()], total: 1, page: 1, limit: 20 },
    };
    routes["GET /admin/orders?page=1&limit=20"] = { body: { items: [], total: 0, page: 1, limit: 20 } };
    render(<OrderSearch />);
    await userEvent.type(await screen.findByLabelText("Mã đặt vé"), "fb123456");
    await userEvent.click(screen.getByRole("button", { name: "Tìm đơn" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/don-hang/FB123456"));
  });

  it("mã khớp một phần: hiện danh sách, không điều hướng", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/orders?bookingCode=FB12&page=1&limit=20"] = {
      body: { items: [summary(), summary({ id: "x", bookingCode: "FB129999" })], total: 2, page: 1, limit: 20 },
    };
    routes["GET /admin/orders?page=1&limit=20"] = { body: { items: [], total: 0, page: 1, limit: 20 } };
    render(<OrderSearch />);
    await userEvent.type(await screen.findByLabelText("Mã đặt vé"), "FB12");
    await userEvent.click(screen.getByRole("button", { name: "Tìm đơn" }));
    expect(await screen.findByRole("link", { name: "FB129999" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("lỗi tra cứu mã: báo lỗi, không điều hướng", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/orders?bookingCode=FB1&page=1&limit=20"] = apiError(500, "INTERNAL_ERROR");
    routes["GET /admin/orders?page=1&limit=20"] = { body: { items: [], total: 0, page: 1, limit: 20 } };
    render(<OrderSearch />);
    await userEvent.type(await screen.findByLabelText("Mã đặt vé"), "FB1");
    await userEvent.click(screen.getByRole("button", { name: "Tìm đơn" }));
    expect(await screen.findByText("Đã có lỗi xảy ra. Vui lòng thử lại sau.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("OrderDetail", () => {
  const detailRoutes = (d: OrderDetailDto) => {
    routes["GET /admin/orders?bookingCode=FB123456&limit=5"] = { body: { items: [summary()], total: 1, page: 1, limit: 5 } };
    routes[`GET /admin/orders/${ORDER_ID}`] = { body: d };
  };

  it("Manager đúng rạp: có form xử lý; hoàn tiền thiếu mã GD bị chặn phía client", async () => {
    routes["GET /me"] = { body: me({ cinemas: [{ cinemaId: HN01, role: "MANAGER" }] }) };
    detailRoutes(detail());
    render(<OrderDetail code="FB123456" />);
    expect(await screen.findByRole("form", { name: "Xử lý đơn thủ công" })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Hoàn tiền thủ công"));
    await userEvent.click(screen.getByRole("button", { name: "Ghi xử lý" }));
    expect(await screen.findByText("Nhập mã giao dịch ngân hàng của khoản hoàn.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("gửi đúng body, thành công thì tải lại chi tiết", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    let resolved = false;
    routes["GET /admin/orders?bookingCode=FB123456&limit=5"] = { body: { items: [summary()], total: 1, page: 1, limit: 5 } };
    routes[`GET /admin/orders/${ORDER_ID}`] = () => ({
      // RPC thật chỉ set manual_review_resolved_at, KHÔNG đổi status.
      body: resolved ? detail({ manualReviewResolvedAt: "2026-11-14T02:00:00.000Z" }) : detail(),
    });
    let posted: unknown;
    routes[`POST /admin/orders/${ORDER_ID}/resolve-manual-review`] = (init) => {
      posted = JSON.parse(String(init?.body));
      resolved = true;
      return { body: { success: true, orderId: ORDER_ID, action: "CONFIRM_SALE", resolvedAt: "x" } };
    };
    render(<OrderDetail code="FB123456" />);
    await userEvent.click(await screen.findByRole("button", { name: "Ghi xử lý" }));
    await waitFor(() => expect(posted).toEqual({ action: "CONFIRM_SALE" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Xử lý đơn thủ công" })).not.toBeInTheDocument());
    expect(await screen.findByText("Đã xử lý thủ công")).toBeInTheDocument();
    expect(screen.getByText(/Đã giải quyết thủ công lúc/)).toBeInTheDocument();
  });

  it("API lỗi 409: hiện lỗi, không báo thành công", async () => {
    const { toast } = await import("sonner");
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    detailRoutes(detail());
    routes[`POST /admin/orders/${ORDER_ID}/resolve-manual-review`] = apiError(409, "CONFLICT");
    render(<OrderDetail code="FB123456" />);
    await userEvent.click(await screen.findByRole("button", { name: "Ghi xử lý" }));
    expect(await screen.findByText("Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.")).toBeInTheDocument();
    // Chi tiết được tải lại sau 409 (form unmount/mount lại) nhưng thông báo phải còn.
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith(`/admin/orders/${ORDER_ID}`)).length).toBeGreaterThanOrEqual(2));
    await screen.findByRole("form", { name: "Xử lý đơn thủ công" });
    expect(screen.getByText("Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("Staff: xem được chi tiết + timeline nhưng không có nút ghi xử lý", async () => {
    routes["GET /me"] = { body: me({ cinemas: [{ cinemaId: HN01, role: "STAFF" }] }) };
    detailRoutes(detail());
    render(<OrderDetail code="FB123456" />);
    expect(await screen.findByText("Lịch sử trạng thái", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("Lệch số tiền thanh toán")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ghi xử lý" })).not.toBeInTheDocument();
  });

  it("Manager rạp khác (và Staff rạp này): không có nút ghi xử lý", async () => {
    routes["GET /me"] = {
      body: me({
        cinemas: [
          { cinemaId: HN02, role: "MANAGER" },
          { cinemaId: HN01, role: "STAFF" },
        ],
      }),
    };
    detailRoutes(detail());
    render(<OrderDetail code="FB123456" />);
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ghi xử lý" })).not.toBeInTheDocument();
  });

  it("mã không tồn tại: báo không tìm thấy", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes["GET /admin/orders?bookingCode=ZZ&limit=5"] = { body: { items: [], total: 0, page: 1, limit: 5 } };
    render(<OrderDetail code="ZZ" />);
    expect(await screen.findByText("Không tìm thấy đơn")).toBeInTheDocument();
  });

  it("id lỗi tải chi tiết: ErrorState; 403 chuyển trang không có quyền", async () => {
    routes["GET /me"] = { body: me({ isAdmin: true }) };
    routes[`GET /admin/orders/${ORDER_ID}`] = apiError(500, "INTERNAL_ERROR");
    const { unmount } = render(<OrderDetail code={ORDER_ID} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được dữ liệu");
    unmount();
    routes[`GET /admin/orders/${ORDER_ID}`] = apiError(403, "FORBIDDEN_CINEMA");
    render(<OrderDetail code={ORDER_ID} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/khong-co-quyen"));
  });
});

describe("OrderTimeline", () => {
  it("hiện từng mốc theo thứ tự với ghi chú", () => {
    render(<OrderTimeline history={detail().statusHistory} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Đang giữ ghế");
    expect(items[1]).toHaveTextContent("Cần xử lý thủ công");
    expect(items[1]).toHaveTextContent("Lệch số tiền thanh toán");
  });
});
