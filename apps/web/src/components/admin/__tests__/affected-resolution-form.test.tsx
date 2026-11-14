import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AffectedOrderDetail } from "../affected-order-detail";
import { AffectedOrdersList } from "../affected-orders-list";
import { AffectedResolutionForm } from "../affected-resolution-form";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/don-bi-anh-huong",
  useRouter: () => ({ push: vi.fn() }),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<{ ApiError: unknown }>("@/lib/api/client");
  return { ApiError: actual.ApiError, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from "@/lib/api/client";

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function order(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    bookingCode: "FB123456",
    cinemaId: "c1",
    cinemaName: "FB Hà Nội",
    cinemaCode: "HN01",
    showtimeId: "s1",
    movieTitle: "Phim A",
    roomName: "P1",
    showtimeStartsAt: "2026-12-01T12:00:00.000Z",
    totalAmount: 200000,
    status: "affected",
    cancelReason: "Sự cố kỹ thuật",
    cancelledAt: null,
    contactName: "Khách",
    contactEmail: "k@example.com",
    contactPhone: null,
    seatLabels: ["A1"],
    emailStatus: "FAILED",
    emailSentAt: null,
    refundedAmount: null,
    refundReference: null,
    refundedAt: null,
    refundedBy: null,
    note: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const postCalls = () => mockApiFetch.mock.calls.filter(([, init]) => init?.method === "POST");

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockApiFetch.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});
afterEach(cleanup);

describe("AffectedResolutionForm", () => {
  it("thiếu số tiền hoặc mã GD -> không gọi API, báo từng field (AC-25)", async () => {
    const onResolved = vi.fn();
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={200000} onResolved={onResolved} />);
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    expect(await screen.findByText(/Nhập số tiền đã hoàn/)).toBeInTheDocument();
    expect(screen.getByText(/Nhập mã giao dịch ngân hàng/)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("đủ dữ liệu -> POST đúng body rồi gọi onResolved", async () => {
    mockApiFetch.mockResolvedValue({ success: true });
    const onResolved = vi.fn();
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={200000} onResolved={onResolved} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), "200000");
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "VCB123");
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenCalledWith(`/admin/affected-orders/${ORDER_ID}/refund`, {
      method: "POST",
      json: { refundedAmount: 200000, refundReference: "VCB123" },
    });
  });

  it("API 422 -> báo lỗi theo field, KHÔNG báo thành công", async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422, {
        issues: [{ path: "refundReference", message: "Too small" }],
      }),
    );
    const onResolved = vi.fn();
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={200000} onResolved={onResolved} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), "1000");
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "X");
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    expect(await screen.findByText(/Nhập mã giao dịch ngân hàng/)).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("API 403 (rạp khác) -> hiện lỗi chung, không báo thành công", async () => {
    mockApiFetch.mockRejectedValue(new ApiError("FORBIDDEN_CINEMA", "Bạn không có quyền với rạp này", 403));
    const onResolved = vi.fn();
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={200000} onResolved={onResolved} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), "1000");
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "VCB1");
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bạn không có quyền với rạp này");
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("chống double-submit: bấm 2 lần chỉ 1 POST", async () => {
    let resolve!: (v: unknown) => void;
    mockApiFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={200000} onResolved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), "1000");
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "VCB1");
    const button = screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ });
    await userEvent.dblClick(button);
    expect(postCalls()).toHaveLength(1);
    resolve({ success: true });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it.each(["200.000", "200,000", "200000"])("số tiền %s -> 200000 đồng, có preview định dạng", async (typed) => {
    mockApiFetch.mockResolvedValue({ success: true });
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={300000} onResolved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), typed);
    expect(screen.getByText(/Sẽ ghi nhận:/)).toHaveTextContent(/200\.000/);
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "VCB1");
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(mockApiFetch.mock.calls[0]?.[1].json.refundedAmount).toBe(200000);
  });

  it.each(["1e5", "0x10", "-5", "1.5", "20.00", "abc"])("số tiền %s -> chặn, không gọi API", async (typed) => {
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={300000} onResolved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), typed);
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "VCB1");
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    expect(await screen.findByText(/Chỉ nhập chữ số/)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("số tiền vượt giá trị đơn -> chặn ở client, báo ở ô số tiền", async () => {
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={200000} onResolved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), "200001");
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "VCB1");
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    expect(await screen.findByText(/không được vượt giá trị đơn/)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("API 422 không kèm issues -> gắn vào ô số tiền", async () => {
    mockApiFetch.mockRejectedValue(new ApiError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422));
    render(<AffectedResolutionForm orderId={ORDER_ID} totalAmount={200000} onResolved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Số tiền đã hoàn/), "1000");
    await userEvent.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), "VCB1");
    await userEvent.click(screen.getByRole("button", { name: /Xác nhận đã hoàn tiền/ }));
    expect(await screen.findByText(/vượt giá trị đơn/)).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

const ME_ADMIN = { id: "u", email: null, emailConfirmed: true, isAdmin: true, cinemas: [] };
const CINEMA_A = "11111111-1111-4111-8111-111111111111";
const CINEMA_B = "22222222-2222-4222-8222-222222222222";

type ListReply = { items: unknown[]; total: number } | Error;

/** Route theo path: /me và danh sách; POST resend tuỳ chọn. */
function routeApi(list: ListReply | ((path: string) => ListReply), me: unknown = ME_ADMIN, post?: () => unknown) {
  mockApiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === "/me") return me;
    if (init?.method === "POST") {
      if (post) return post();
      return { success: true };
    }
    const reply = typeof list === "function" ? list(path) : list;
    if (reply instanceof Error) throw reply;
    return reply;
  });
}
const listCalls = () => mockApiFetch.mock.calls.map(([path]) => String(path)).filter((p) => p.startsWith("/admin/affected-orders?"));

describe("AffectedOrdersList", () => {
  it("hiện trạng thái email Đã gửi/Lỗi; nút gửi lại chỉ ở dòng Lỗi (AC-24)", async () => {
    routeApi({
      items: [
        order(),
        order({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", bookingCode: "FB999999", emailStatus: "SENT" }),
        order({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", bookingCode: "FB777777", emailStatus: "PENDING" }),
      ],
      total: 3,
    });
    render(<AffectedOrdersList />);
    expect(await screen.findByText("FB123456")).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Lỗi")).toBeInTheDocument();
    expect(table.getByText("Đã gửi")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Gửi lại email đơn/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Gửi lại email đơn FB123456" })).toBeInTheDocument();
  });

  it("chưa có email: chỉ hiện nút gửi lại khi đơn có contactEmail", async () => {
    routeApi({
      items: [
        order({ emailStatus: null }),
        order({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", bookingCode: "FB555555", emailStatus: null, contactEmail: null }),
      ],
      total: 2,
    });
    render(<AffectedOrdersList />);
    await screen.findByText("FB123456");
    expect(screen.getAllByRole("button", { name: /Gửi lại email đơn/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Gửi lại email đơn FB123456" })).toBeInTheDocument();
  });

  it("lỗi tải -> ErrorState, không render dữ liệu cũ", async () => {
    routeApi(new ApiError("INTERNAL_ERROR", "Lỗi máy chủ", 500));
    render(<AffectedOrdersList />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("FB123456")).not.toBeInTheDocument();
  });

  it("gửi lại email 409 -> toast đúng nghĩa, không toast thành công", async () => {
    routeApi({ items: [order()], total: 1 }, ME_ADMIN, () => {
      throw new ApiError("CONFLICT", "Dữ liệu vừa thay đổi", 409);
    });
    render(<AffectedOrdersList />);
    await userEvent.click(await screen.findByRole("button", { name: /Gửi lại email đơn FB123456/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("đang chờ gửi hoặc đã gửi")));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("lọc theo trạng thái xử lý gọi API với status + phân trang", async () => {
    routeApi({ items: [order()], total: 1 });
    render(<AffectedOrdersList />);
    await screen.findByText("FB123456");
    await userEvent.selectOptions(screen.getByLabelText("Trạng thái xử lý"), "refunded_manual");
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        "/admin/affected-orders?limit=20&offset=0&status=refunded_manual",
        expect.anything(),
      ),
    );
  });

  it("phân trang: Trang sau gọi offset=20, hiển thị khoảng đơn / tổng", async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      order({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`, bookingCode: `FB${i}` }),
    );
    routeApi((path) => (path.includes("offset=20") ? { items: [order({ bookingCode: "FBLAST" })], total: 21 } : { items: many, total: 21 }));
    render(<AffectedOrdersList />);
    expect(await screen.findByText(/Đơn 1–20 \/ 21/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(await screen.findByText("FBLAST")).toBeInTheDocument();
    expect(screen.getByText(/Đơn 21–21 \/ 21/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  });

  it("lọc email không có kết quả trong trang -> thông báo trong-trang, không EmptyState sai", async () => {
    routeApi({ items: [order({ emailStatus: "SENT" })], total: 50 });
    render(<AffectedOrdersList />);
    await screen.findByText("FB123456");
    await userEvent.selectOptions(screen.getByLabelText("Trạng thái email"), "FAILED");
    expect(screen.getByText(/trong trang này khớp trạng thái email/)).toBeInTheDocument();
    expect(screen.queryByText("Không có đơn bị ảnh hưởng")).not.toBeInTheDocument();
  });

  it("?cinema= hợp lệ của Admin được gửi cho list và CSV; 'all' thì không", async () => {
    searchParams = new URLSearchParams({ cinema: CINEMA_A });
    routeApi({ items: [order()], total: 1 });
    const fetchMock = vi.fn().mockResolvedValue(new Response("a,b", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    render(<AffectedOrdersList />);
    await screen.findByText("FB123456");
    expect(listCalls().at(-1)).toContain(`cinemaId=${CINEMA_A}`);
    await userEvent.click(screen.getByRole("button", { name: "Tải CSV" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`cinemaId=${CINEMA_A}`);
    vi.unstubAllGlobals();
  });

  it("Staff: ?cinema= ngoài rạp được gán bị bỏ qua; rạp được gán thì gửi", async () => {
    const staff = { ...ME_ADMIN, isAdmin: false, cinemas: [{ cinemaId: CINEMA_A, role: "STAFF" }] };
    searchParams = new URLSearchParams({ cinema: CINEMA_B });
    routeApi({ items: [order()], total: 1 }, staff);
    const first = render(<AffectedOrdersList />);
    await screen.findByText("FB123456");
    expect(listCalls().at(-1)).not.toContain("cinemaId");
    first.unmount();

    mockApiFetch.mockClear();
    searchParams = new URLSearchParams({ cinema: CINEMA_A });
    routeApi({ items: [order()], total: 1 }, staff);
    render(<AffectedOrdersList />);
    await screen.findByText("FB123456");
    expect(listCalls().at(-1)).toContain(`cinemaId=${CINEMA_A}`);
  });

  it("tải CSV qua proxy; lỗi HTTP -> toast lỗi, không tạo file", async () => {
    routeApi({ items: [order()], total: 1 });
    const createUrl = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue(new Response("err", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AffectedOrdersList />);
    await screen.findByText("FB123456");
    await userEvent.click(screen.getByRole("button", { name: "Tải CSV" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/proxy/admin/affected-orders/export", expect.anything());
    expect(createUrl).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("AffectedOrderDetail", () => {
  it("đơn đã hoàn -> không còn form xử lý, hiện mã giao dịch", async () => {
    mockApiFetch.mockResolvedValue(
      order({ status: "refunded_manual", refundedAmount: 200000, refundReference: "VCB123", emailOutbox: null }),
    );
    render(<AffectedOrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByText("VCB123")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Ghi kết quả xử lý" })).not.toBeInTheDocument();
  });

  it("lỗi tải chi tiết -> ErrorState", async () => {
    mockApiFetch.mockRejectedValue(new ApiError("FORBIDDEN_CINEMA", "Không có quyền", 403));
    render(<AffectedOrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("FB123456")).not.toBeInTheDocument();
  });

  it("nút gửi lại ở chi tiết: chỉ khi email Lỗi", async () => {
    mockApiFetch.mockResolvedValue(order({ emailStatus: "SENT", emailOutbox: null }));
    const first = render(<AffectedOrderDetail orderId={ORDER_ID} />);
    await screen.findByText("Đơn FB123456");
    expect(screen.queryByRole("button", { name: "Gửi lại email" })).not.toBeInTheDocument();
    first.unmount();
    mockApiFetch.mockResolvedValue(order({ emailStatus: "FAILED", emailOutbox: null }));
    render(<AffectedOrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByRole("button", { name: "Gửi lại email" })).toBeInTheDocument();
  });
});
