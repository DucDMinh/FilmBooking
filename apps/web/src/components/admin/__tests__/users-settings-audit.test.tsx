import "@testing-library/jest-dom/vitest";

import type { AdminUserDto, AppSettingDto, AuditLogDto } from "@filmbooking/shared/schemas/admin";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditLogAdminPage, buildAuditQuery, diffAuditData } from "../audit-log-view";
import { RoleAssignDialog, assignableRoles } from "../role-assign-dialog";
import { SettingsAdminPage, changedKeys } from "../settings-form";
import { UsersAdminPage } from "../users-admin";

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
      readonly details?: Record<string, unknown>,
    ) {
      super(message);
    }
  },
}));

const HN01 = "11111111-1111-4111-8111-111111111111";
const HN02 = "22222222-2222-4222-8222-222222222222";
const SELF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const CINEMAS = [
  { id: HN01, name: "Rạp HN01", code: "HN01" },
  { id: HN02, name: "Rạp HN02", code: "HN02" },
];

async function apiError(code: string, message: string, status: number) {
  const { ApiError } = await import("@/lib/api/client");
  return new ApiError(code as never, message, status);
}

type Handler = (init: { method?: string; json?: unknown }) => unknown;

/** Route theo "METHOD path"; không có handler -> lỗi để test biết ngay endpoint thật bị thiếu. */
function routeApi(routes: Record<string, Handler | unknown>) {
  mockApiFetch.mockImplementation(async (path: string, init: { method?: string; json?: unknown } = {}) => {
    const key = `${init.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`unexpected request ${key}`);
    const handler = routes[key];
    const result = typeof handler === "function" ? await (handler as Handler)(init) : handler;
    if (result instanceof Error) throw result;
    return result;
  });
}

const adminMe = { id: SELF, email: "admin@x.vn", emailConfirmed: true, isAdmin: true, cinemas: [] };
const managerMe = {
  id: SELF,
  email: "m@x.vn",
  emailConfirmed: true,
  isAdmin: false,
  cinemas: [{ cinemaId: HN01, role: "MANAGER" }],
};

function user(over: Partial<AdminUserDto>): AdminUserDto {
  return {
    id: OTHER,
    email: "khach@x.vn",
    fullName: "Nguyễn Văn A",
    phone: null,
    createdAt: "2026-11-01T00:00:00Z",
    isAdmin: false,
    locked: false,
    assignments: [],
    ...over,
  };
}

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 20, total: items.length });

beforeEach(() => {
  mockApiFetch.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});
afterEach(cleanup);

describe("RoleAssignDialog (AC-16)", () => {
  it("Manager chỉ thấy vai trò Staff, không thấy Manager/Admin", () => {
    expect(assignableRoles("MANAGER")).toEqual(["STAFF"]);
    render(
      <RoleAssignDialog open onOpenChange={() => {}} viewerRole="MANAGER" cinemas={[{ id: HN01, name: "Rạp HN01" }]} fixedCinemaId={HN01} onDone={() => {}} />,
    );
    const roleSelect = screen.getByLabelText(/Vai trò/);
    const options = within(roleSelect).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Nhân viên (Staff)"]);
    expect(screen.queryByText(/Admin/)).not.toBeInTheDocument();
  });

  it("Admin thấy Staff và Manager", () => {
    render(
      <RoleAssignDialog open onOpenChange={() => {}} viewerRole="ADMIN" cinemas={[{ id: HN01, name: "Rạp HN01" }]} user={user({})} onDone={() => {}} />,
    );
    const options = within(screen.getByLabelText(/Vai trò/)).getAllByRole("option");
    expect(options).toHaveLength(2);
  });

  it("gán bằng email: POST đúng body, đóng dialog và báo thành công", async () => {
    routeApi({ [`POST /admin/cinemas/${HN01}/staff`]: { userId: OTHER } });
    const onDone = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <RoleAssignDialog open onOpenChange={onOpenChange} viewerRole="MANAGER" cinemas={[{ id: HN01, name: "Rạp HN01" }]} fixedCinemaId={HN01} onDone={onDone} />,
    );
    await userEvent.type(screen.getByLabelText(/Email/), "NV@X.vn");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(`/admin/cinemas/${HN01}/staff`, {
      method: "POST",
      json: { email: "nv@x.vn", role: "STAFF" },
    });
    expect(toastSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("API lỗi (403): hiện lỗi, không báo thành công, không đóng", async () => {
    routeApi({ [`POST /admin/cinemas/${HN01}/staff`]: await apiError("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này", 403) });
    const onOpenChange = vi.fn();
    const onDone = vi.fn();
    render(
      <RoleAssignDialog open onOpenChange={onOpenChange} viewerRole="MANAGER" cinemas={[{ id: HN01, name: "Rạp HN01" }]} fixedCinemaId={HN01} onDone={onDone} />,
    );
    await userEvent.type(screen.getByLabelText(/Email/), "nv@x.vn");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bạn không có quyền");
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("email sai định dạng: không gọi API", async () => {
    render(
      <RoleAssignDialog open onOpenChange={() => {}} viewerRole="MANAGER" cinemas={[{ id: HN01, name: "Rạp HN01" }]} fixedCinemaId={HN01} onDone={() => {}} />,
    );
    await userEvent.type(screen.getByLabelText(/Email/), "khong-phai-email");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("email hợp lệ");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("Admin đổi vai trò người đã có gán ở rạp: PATCH", async () => {
    routeApi({ [`PATCH /admin/cinemas/${HN01}/staff/${OTHER}`]: {} });
    render(
      <RoleAssignDialog
        open
        onOpenChange={() => {}}
        viewerRole="ADMIN"
        cinemas={[{ id: HN01, name: "Rạp HN01" }]}
        user={user({ assignments: [{ cinemaId: HN01, role: "STAFF" }] })}
        onDone={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Vai trò/), "MANAGER");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/admin/cinemas/${HN01}/staff/${OTHER}`, { method: "PATCH", json: { role: "MANAGER" } }),
    );
  });

  it("user đang là Manager: chọn sẵn Manager, Lưu bị khoá, không PATCH hạ xuống Staff; đổi rạp thì đồng bộ vai trò", async () => {
    mockApiFetch.mockReset();
    render(
      <RoleAssignDialog
        open
        onOpenChange={() => {}}
        viewerRole="ADMIN"
        cinemas={CINEMAS}
        user={user({ assignments: [{ cinemaId: HN01, role: "MANAGER" }] })}
        onDone={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Vai trò/)).toHaveValue("MANAGER");
    const save = screen.getByRole("button", { name: "Lưu" });
    expect(save).toBeDisabled();
    await userEvent.click(save);
    expect(mockApiFetch).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText(/^Rạp/), HN02);
    expect(screen.getByLabelText(/Vai trò/)).toHaveValue("STAFF");
    expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled();
  });
});

describe("UsersAdminPage", () => {
  it("Manager: liệt kê Staff rạp mình, dòng Manager không có nút gỡ, gỡ Staff gọi DELETE", async () => {
    const staffList = [
      { userId: OTHER, cinemaId: HN01, role: "STAFF", email: "nv@x.vn", fullName: "NV", createdAt: "" },
      { userId: SELF, cinemaId: HN01, role: "MANAGER", email: "m@x.vn", fullName: "QL", createdAt: "" },
    ];
    routeApi({
      "GET /me": managerMe,
      "GET /admin/cinemas": CINEMAS,
      [`GET /admin/cinemas/${HN01}/staff`]: staffList,
      [`DELETE /admin/cinemas/${HN01}/staff/${OTHER}`]: { success: true },
    });
    render(<UsersAdminPage />);
    expect(await screen.findByText("nv@x.vn")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gỡ m@x.vn" })).not.toBeInTheDocument();
    // Manager không gọi API chỉ dành Admin.
    expect(mockApiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/admin/users"), expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "Gỡ nv@x.vn" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Đã gỡ nhân sự"));
  });

  it("Manager: gỡ Staff lỗi 403 thì không báo thành công", async () => {
    routeApi({
      "GET /me": managerMe,
      "GET /admin/cinemas": CINEMAS,
      [`GET /admin/cinemas/${HN01}/staff`]: [{ userId: OTHER, cinemaId: HN01, role: "STAFF", email: "nv@x.vn", fullName: null, createdAt: "" }],
      [`DELETE /admin/cinemas/${HN01}/staff/${OTHER}`]: await apiError("FORBIDDEN", "Không có quyền", 403),
    });
    render(<UsersAdminPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Gỡ nv@x.vn" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Không có quyền");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("Admin: tìm kiếm gửi q; khoá người khác PATCH lock; không tự khoá/gỡ Admin chính mình", async () => {
    const users = [user({ id: SELF, email: "admin@x.vn", isAdmin: true }), user({})];
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/users?page=1&pageSize=20": page(users),
      "GET /admin/users?page=1&pageSize=20&q=khach": page([users[1]]),
      [`PATCH /admin/users/${OTHER}/lock`]: { success: true, locked: true },
    });
    render(<UsersAdminPage />);
    expect(await screen.findByText("khach@x.vn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Khoá admin@x.vn" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gỡ quyền Admin admin@x.vn" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Tìm người dùng"), "khach");
    await userEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    await waitFor(() => expect(screen.queryByText("admin@x.vn")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Khoá khach@x.vn" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Khoá" }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/admin/users/${OTHER}/lock`, { method: "PATCH", json: { locked: true } }),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Đã khoá tài khoản");
  });

  it("Admin gỡ người khỏi rạp (cả Manager): DELETE đúng rạp, toast khi thành công", async () => {
    const mgr = user({ assignments: [{ cinemaId: HN01, role: "MANAGER" }] });
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/users?page=1&pageSize=20": page([mgr]),
      [`DELETE /admin/cinemas/${HN01}/staff/${OTHER}`]: { success: true },
    });
    render(<UsersAdminPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Gỡ khach@x.vn khỏi Rạp HN01" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Đã gỡ khỏi rạp"));
    expect(mockApiFetch).toHaveBeenCalledWith(`/admin/cinemas/${HN01}/staff/${OTHER}`, { method: "DELETE" });
  });

  it("Admin gỡ khỏi rạp lỗi 403: hiện lỗi, không toast thành công", async () => {
    const mgr = user({ assignments: [{ cinemaId: HN01, role: "STAFF" }] });
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/users?page=1&pageSize=20": page([mgr]),
      [`DELETE /admin/cinemas/${HN01}/staff/${OTHER}`]: await apiError("FORBIDDEN", "Không có quyền", 403),
    });
    render(<UsersAdminPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Gỡ khach@x.vn khỏi Rạp HN01" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Không có quyền");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("lỗi tải danh sách -> ErrorState", async () => {
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/users?page=1&pageSize=20": await apiError("INTERNAL_ERROR", "Lỗi hệ thống", 500),
    });
    render(<UsersAdminPage />);
    expect(await screen.findByText("Không tải được dữ liệu")).toBeInTheDocument();
  });

  it("Staff không có quyền", async () => {
    routeApi({ "GET /me": { ...managerMe, cinemas: [{ cinemaId: HN01, role: "STAFF" }] } });
    render(<UsersAdminPage />);
    expect(await screen.findByText("Không có quyền")).toBeInTheDocument();
  });
});

const SETTINGS: AppSettingDto[] = [
  { key: "seat_hold_minutes_web", value: 10, description: null, updatedAt: "" },
  { key: "default_cleaning_minutes", value: 15, description: null, updatedAt: "" },
  { key: "default_online_cutoff_minutes", value: 30, description: null, updatedAt: "" },
  { key: "no_refund_warning", value: "Không hoàn tiền", description: null, updatedAt: "" },
  { key: "terms_version", value: "1.0", description: null, updatedAt: "" },
];

describe("SettingsAdminPage", () => {
  it("changedKeys chỉ trả key đã đổi", () => {
    expect(changedKeys(SETTINGS, { seat_hold_minutes_web: "10", terms_version: "1.1" })).toEqual(["terms_version"]);
  });

  it("GET lỗi -> ErrorState và không có form ghi", async () => {
    routeApi({ "GET /me": adminMe, "GET /admin/settings": await apiError("INTERNAL_ERROR", "x", 500) });
    render(<SettingsAdminPage />);
    expect(await screen.findByText("Không tải được dữ liệu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).not.toBeInTheDocument();
  });

  it("Admin sửa 1 trường: chỉ PATCH key đó, đúng kiểu số", async () => {
    routeApi({
      "GET /me": adminMe,
      "GET /admin/settings": SETTINGS,
      "PATCH /admin/settings/seat_hold_minutes_web": (init: { json?: { value: number } }) => ({
        ...SETTINGS[0],
        value: init.json?.value,
      }),
    });
    render(<SettingsAdminPage />);
    const input = await screen.findByLabelText(/Thời gian giữ ghế/);
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Đã lưu cấu hình"));
    const writes = mockApiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(writes).toEqual([["/admin/settings/seat_hold_minutes_web", { method: "PATCH", json: { value: 12 } }]]);
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  });

  it("PATCH lỗi: hiện lỗi theo trường, không báo thành công", async () => {
    routeApi({
      "GET /me": adminMe,
      "GET /admin/settings": SETTINGS,
      "PATCH /admin/settings/terms_version": await apiError("VALIDATION_ERROR", "Dữ liệu không hợp lệ từ máy chủ", 400),
    });
    render(<SettingsAdminPage />);
    const input = await screen.findByLabelText(/Phiên bản điều khoản/);
    await userEvent.clear(input);
    await userEvent.type(input, "2.0");
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Dữ liệu không hợp lệ từ máy chủ")).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
  });

  it("giá trị ngoài khoảng: chặn phía client, không gọi PATCH", async () => {
    routeApi({ "GET /me": adminMe, "GET /admin/settings": SETTINGS });
    render(<SettingsAdminPage />);
    const input = await screen.findByLabelText(/Thời gian giữ ghế/);
    await userEvent.clear(input);
    await userEvent.type(input, "500");
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText(/Giá trị không hợp lệ/)).toBeInTheDocument();
    expect(mockApiFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("Manager chỉ xem: ô bị khoá, không có nút lưu", async () => {
    routeApi({ "GET /me": managerMe, "GET /admin/settings": SETTINGS });
    render(<SettingsAdminPage />);
    expect(await screen.findByLabelText(/Thời gian giữ ghế/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).not.toBeInTheDocument();
  });
});

const LOG: AuditLogDto = {
  id: 7,
  occurredAt: "2026-11-10T03:00:00Z",
  actorId: SELF,
  cinemaId: HN01,
  tableName: "showtimes",
  recordId: OTHER,
  action: "UPDATE",
  beforeData: { price: 100000, status: "OPEN", same: 1 },
  afterData: { price: 120000, status: "OPEN", same: 1, note: "x" },
};

describe("AuditLogAdminPage", () => {
  it("diffAuditData: chỉ các trường khác nhau; INSERT/DELETE", () => {
    expect(diffAuditData(LOG.beforeData, LOG.afterData)).toEqual([
      { field: "note", before: "—", after: "x" },
      { field: "price", before: "100000", after: "120000" },
    ]);
    expect(diffAuditData(null, { a: 1 })).toEqual([{ field: "a", before: "—", after: "1" }]);
    expect(diffAuditData({ a: 1 }, null)).toEqual([{ field: "a", before: "1", after: "—" }]);
  });

  it("buildAuditQuery: bỏ trường rỗng, báo lỗi actor sai", () => {
    const base = { cinemaId: "", actorId: "", tableName: "", action: "", from: "", to: "" };
    expect(buildAuditQuery({ ...base, cinemaId: HN01 }, 2)).toEqual({
      ok: true,
      query: `cinemaId=${HN01}&page=2&pageSize=20`,
    });
    expect(buildAuditQuery({ ...base, actorId: "abc" }, 1)).toMatchObject({ ok: false, errors: { actorId: expect.any(String) } });
  });

  it("hiển thị before/after dạng diff khi mở một dòng", async () => {
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/audit-logs?page=1&pageSize=20": page([LOG]),
    });
    render(<AuditLogAdminPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Xem thay đổi bản ghi 7" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("price")).toBeInTheDocument();
    expect(within(sheet).getByText("100000")).toBeInTheDocument();
    expect(within(sheet).getByText("120000")).toBeInTheDocument();
    expect(within(sheet).queryByText("same")).not.toBeInTheDocument();
  });

  it("lọc theo rạp gửi cinemaId; actor sai không gọi API", async () => {
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/audit-logs?page=1&pageSize=20": page([LOG]),
      [`GET /admin/audit-logs?cinemaId=${HN02}&page=1&pageSize=20`]: page([]),
    });
    render(<AuditLogAdminPage />);
    await screen.findByRole("button", { name: "Xem thay đổi bản ghi 7" });
    await userEvent.type(screen.getByLabelText(/Người thực hiện/), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Lọc" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không hợp lệ");
    const callsBefore = mockApiFetch.mock.calls.length;
    await userEvent.clear(screen.getByLabelText(/Người thực hiện/));
    await userEvent.selectOptions(screen.getByLabelText("Rạp"), HN02);
    await userEvent.click(screen.getByRole("button", { name: "Lọc" }));
    expect(await screen.findByText("Chưa có nhật ký")).toBeInTheDocument();
    expect(mockApiFetch.mock.calls.length).toBe(callsBefore + 1);
  });

  it("bấm ID người thực hiện: điền ô lọc và lọc theo actorId", async () => {
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/audit-logs?page=1&pageSize=20": page([LOG]),
      [`GET /admin/audit-logs?actorId=${SELF}&page=1&pageSize=20`]: page([]),
    });
    render(<AuditLogAdminPage />);
    await userEvent.click(await screen.findByRole("button", { name: `Lọc theo người thực hiện ${SELF}` }));
    expect(await screen.findByText("Chưa có nhật ký")).toBeInTheDocument();
    expect(screen.getByLabelText(/Người thực hiện/)).toHaveValue(SELF);
  });

  it("lỗi tải -> ErrorState; Manager không có quyền", async () => {
    routeApi({
      "GET /me": adminMe,
      "GET /admin/cinemas": CINEMAS,
      "GET /admin/audit-logs?page=1&pageSize=20": await apiError("INTERNAL_ERROR", "x", 500),
    });
    render(<AuditLogAdminPage />);
    expect(await screen.findByText("Không tải được dữ liệu")).toBeInTheDocument();
    cleanup();
    routeApi({ "GET /me": managerMe });
    render(<AuditLogAdminPage />);
    expect(await screen.findByText("Không có quyền")).toBeInTheDocument();
  });
});
