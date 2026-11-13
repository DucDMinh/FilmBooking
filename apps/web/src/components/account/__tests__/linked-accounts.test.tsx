import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MissingEmailPage from "@/app/(auth)/bo-sung-email/page";
import { AddPasswordForm } from "@/components/account/add-password-form";
import { LinkedAccounts } from "@/components/account/linked-accounts";
import { SessionsCard } from "@/components/account/sessions-card";
import type * as ClientModule from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", async (orig) => ({
  ...(await orig<typeof ClientModule>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

let currentSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToast.success(...args),
    error: (...args: unknown[]) => mockToast.error(...args),
  },
}));

const email = { id: "1", provider: "email", providerId: "a", email: "a@x.vn" };
const google = { id: "2", provider: "google", providerId: "g", email: "a@gmail.com" };
const facebook = { id: "3", provider: "facebook", providerId: "f", email: null };

function mockList(list: unknown) {
  apiFetch.mockImplementation((path: string) =>
    path === "/me/identities" ? Promise.resolve(list) : Promise.resolve(undefined),
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  currentSearchParams = new URLSearchParams();
});
afterEach(cleanup);

describe("LinkedAccounts", () => {
  it("link-intent 204 -> gọi linkIdentity rồi điều hướng", async () => {
    mockList({ identities: [email], hasPassword: true, canUnlink: true });
    const linkIdentity = vi.fn().mockResolvedValue({ url: "https://oauth.example/go" });
    const navigate = vi.fn();
    render(<LinkedAccounts linkIdentity={linkIdentity} navigate={navigate} />);
    await userEvent.click(await screen.findByRole("button", { name: "Liên kết Google" }));
    await waitFor(() => expect(linkIdentity).toHaveBeenCalledWith("google"));
    expect(apiFetch).toHaveBeenCalledWith("/me/identities/link-intent", {
      method: "POST",
      json: { provider: "google" },
    });
    expect(navigate).toHaveBeenCalledWith("https://oauth.example/go");
  });

  it("link-intent 401 REAUTH_REQUIRED -> KHÔNG gọi linkIdentity, yêu cầu đăng nhập lại", async () => {
    apiFetch.mockImplementation((path: string) =>
      path === "/me/identities"
        ? Promise.resolve({ identities: [email], hasPassword: true, canUnlink: true })
        : Promise.reject(new ApiError("REAUTH_REQUIRED", "Vui lòng đăng nhập lại", 401)),
    );
    const linkIdentity = vi.fn();
    render(<LinkedAccounts linkIdentity={linkIdentity} />);
    await userEvent.click(await screen.findByRole("button", { name: "Liên kết Facebook" }));
    expect(await screen.findByRole("link", { name: "Đăng nhập lại" })).toHaveAttribute(
      "href",
      expect.stringContaining("/dang-nhap"),
    );
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("AC-05: chỉ còn một phương thức -> huỷ liên kết mở hướng dẫn, không gọi DELETE", async () => {
    mockList({ identities: [facebook], hasPassword: false, canUnlink: false });
    render(<LinkedAccounts linkIdentity={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Huỷ liên kết Facebook" }));
    expect(await screen.findByText(/phương thức đăng nhập cuối cùng/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/me/identities/facebook", expect.anything());
  });

  it("huỷ liên kết bình thường -> xác nhận rồi DELETE", async () => {
    mockList({ identities: [email, google], hasPassword: true, canUnlink: true });
    render(<LinkedAccounts linkIdentity={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Huỷ liên kết Google" }));
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận huỷ liên kết" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/me/identities/google", { method: "DELETE" }));
  });

  it("tài khoản MXH chưa có mật khẩu -> hiện nút Đặt mật khẩu", async () => {
    mockList({ identities: [google], hasPassword: false, canUnlink: false });
    render(<LinkedAccounts linkIdentity={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /Đặt mật khẩu/ })).toBeInTheDocument();
  });

  it("callback báo lỗi identity_already_exists -> hiện thông báo không lộ tài khoản khác", async () => {
    mockList({ identities: [email], hasPassword: true, canUnlink: true });
    render(<LinkedAccounts linkIdentity={vi.fn()} callbackError="identity_already_exists" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("đã liên kết với một tài khoản CINEMO khác");
  });

  it("AC-04 (UI): callback lỗi khác -> hướng dẫn đăng nhập mật khẩu rồi liên kết", async () => {
    mockList({ identities: [email], hasPassword: true, canUnlink: true });
    render(<LinkedAccounts linkIdentity={vi.fn()} callbackError="OAUTH_COLLISION" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nếu email này đã có tài khoản đăng nhập bằng mật khẩu, hãy đăng nhập bằng mật khẩu rồi liên kết tại đây",
    );
  });

  it("tải danh sách lỗi -> hiện thông báo và nút thử lại", async () => {
    apiFetch.mockRejectedValueOnce(new Error("Network error"));
    render(<LinkedAccounts linkIdentity={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được danh sách phương thức đăng nhập");
    mockList({ identities: [email], hasPassword: true, canUnlink: true });
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Email & mật khẩu")).toBeInTheDocument();
  });
});

describe("AddPasswordForm", () => {
  it("kiểm tra chính sách mật khẩu và mật khẩu không khớp", async () => {
    const onSuccess = vi.fn();
    render(<AddPasswordForm onSuccess={onSuccess} />);

    // Nhập mật khẩu quá ngắn (< 8 ký tự)
    await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "abc");
    await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mật khẩu phải có ít nhất 8 ký tự");

    // Nhập mật khẩu không khớp
    await userEvent.clear(screen.getByLabelText("Mật khẩu mới"));
    await userEvent.clear(screen.getByLabelText("Nhập lại mật khẩu"));
    await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "Password123!");
    await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu"), "Password456!");
    await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mật khẩu nhập lại không khớp");
    expect(apiFetch).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("đặt mật khẩu thành công gọi POST /me/password và onSuccess", async () => {
    const onSuccess = vi.fn();
    apiFetch.mockResolvedValueOnce({ success: true, message: "Mật khẩu đã được thiết lập" });
    render(<AddPasswordForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "ValidPassword123");
    await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu"), "ValidPassword123");
    await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/me/password", {
        method: "POST",
        json: { password: "ValidPassword123" },
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("xử lý lỗi khi API /me/password thất bại", async () => {
    const onSuccess = vi.fn();
    apiFetch.mockRejectedValueOnce(new ApiError("VALIDATION_ERROR", "Mật khẩu không an toàn", 400));
    render(<AddPasswordForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "ValidPassword123");
    await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu"), "ValidPassword123");
    await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Mật khẩu không an toàn");
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("SessionsCard", () => {
  it("xác nhận đăng xuất các thiết bị khác gọi signOutOthers()", async () => {
    const signOutOthers = vi.fn().mockResolvedValue({});
    render(<SessionsCard signOutOthers={signOutOthers} />);

    // Mở hộp thoại xác nhận
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất khỏi các thiết bị khác" }));
    expect(await screen.findByText("Đăng xuất khỏi các thiết bị khác?")).toBeInTheDocument();

    // Bấm nút Đăng xuất trong dialog
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => {
      expect(signOutOthers).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith("Đã đăng xuất khỏi các thiết bị khác.");
    });
  });

  it("thông báo lỗi khi signOutOthers thất bại", async () => {
    const signOutOthers = vi.fn().mockResolvedValue({ error: "Lỗi kết nối máy chủ" });
    render(<SessionsCard signOutOthers={signOutOthers} />);

    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất khỏi các thiết bị khác" }));
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Lỗi kết nối máy chủ");
    });
  });
});

describe("MissingEmailPage (/bo-sung-email)", () => {
  it("AC-04 (UI): khi status=email_exists -> hiện màn hướng dẫn đăng nhập mật khẩu + liên kết", () => {
    currentSearchParams = new URLSearchParams("status=email_exists");
    render(<MissingEmailPage />);

    expect(screen.getByRole("heading", { name: "Email này đã có tài khoản" })).toBeInTheDocument();
    expect(screen.getByText(/Để bảo vệ tài khoản, chúng tôi không tự gộp/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Đăng nhập bằng mật khẩu" });
    expect(link).toHaveAttribute("href", "/dang-nhap?next=%2Ftai-khoan%2Fbao-mat");
  });

  it("bổ sung email hợp lệ -> gọi POST /auth/oauth/missing-email và hiện thông báo trung tính", async () => {
    currentSearchParams = new URLSearchParams("providerAccessToken=token123&oauthStateToken=state456");
    apiFetch.mockResolvedValueOnce({ status: "CHECK_EMAIL", message: "Check email" });
    render(<MissingEmailPage />);

    expect(screen.getByRole("heading", { name: "Bổ sung email" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/auth/oauth/missing-email", {
        method: "POST",
        json: {
          provider: "facebook",
          email: "user@example.com",
          providerAccessToken: "token123",
          oauthStateToken: "state456",
        },
      });
    });

    // Thông báo trung tính không tiết lộ email tồn tại hay chưa
    expect(await screen.findByRole("heading", { name: "Kiểm tra hộp thư" })).toBeInTheDocument();
    expect(
      screen.getByText(/Nếu email hợp lệ, chúng tôi đã gửi hướng dẫn tới hộp thư của bạn/),
    ).toBeInTheDocument();
  });

  it("bổ sung email không hợp lệ -> hiện thông báo lỗi validation", async () => {
    render(<MissingEmailPage />);
    await userEvent.type(screen.getByLabelText("Email"), "invalid-email");
    await userEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Vui lòng nhập email hợp lệ.");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
