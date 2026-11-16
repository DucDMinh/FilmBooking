import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, refresh }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));

const signOutAction = vi.fn();
vi.mock("@/app/auth/actions", () => ({ signOutAction: (...a: unknown[]) => signOutAction(...a) }));

// Không gọi Supabase thật: CinemaSelector chỉ cần danh sách truyền vào.
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabase: () => {
    throw new Error("no supabase in test");
  },
}));

import { AdminShell } from "../admin-shell";
import { SignOutButton } from "@/components/common/sign-out-button";

const cinemas = [{ id: "c1", name: "CINEMO A" }];

beforeEach(() => {
  signOutAction.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminShell – nút Đăng xuất", () => {
  it("topbar có nút Đăng xuất", () => {
    render(
      <AdminShell role="ADMIN" cinemas={cinemas}>
        <p>nội dung</p>
      </AdminShell>,
    );
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  it("menu điều hướng mobile cũng có nút Đăng xuất", async () => {
    const user = userEvent.setup();
    render(
      <AdminShell role="STAFF" cinemas={cinemas}>
        <p>nội dung</p>
      </AdminShell>,
    );
    await user.click(screen.getByRole("button", { name: "Mở menu quản trị" }));
    // Sheet modal ẩn phần còn lại khỏi cây a11y → chỉ thấy nút bên trong menu.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  it("bấm gọi signOutAction rồi replace /dang-nhap + refresh", async () => {
    const user = userEvent.setup();
    render(
      <AdminShell role="ADMIN" cinemas={cinemas}>
        <p>nội dung</p>
      </AdminShell>,
    );
    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dang-nhap"));
    expect(signOutAction).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("SignOutButton", () => {
  it("disable khi đang xử lý, chặn bấm đúp", async () => {
    let finish: (v: { success: boolean }) => void = () => undefined;
    signOutAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
    const busy = await screen.findByRole("button", { name: /Đang đăng xuất/ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(signOutAction).toHaveBeenCalledTimes(1);

    finish({ success: true });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dang-nhap"));
  });

  it("lỗi từ action: toast + không điều hướng + nút dùng lại được", async () => {
    signOutAction.mockResolvedValue({ error: "Đăng xuất thất bại" });
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Đăng xuất thất bại"));
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeEnabled();
  });
});
