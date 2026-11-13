import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccountProfilePage from "@/app/(public)/tai-khoan/page";
import { changePasswordAction, signOutAction } from "@/app/auth/actions";
import { AvatarUpload } from "@/components/account/avatar-upload";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { UnverifiedEmailBanner } from "@/components/shell/unverified-email-banner";
import { ApiError, apiFetch } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => {
  class MockApiError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
      public details?: Record<string, unknown>,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  return {
    apiFetch: vi.fn(),
    ApiError: MockApiError,
  };
});

vi.mock("@/app/auth/actions", () => ({
  signOutAction: vi.fn().mockResolvedValue({ success: true }),
  changePasswordAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("UnverifiedEmailBanner", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ẩn banner khi emailConfirmed === true hoặc không có email", () => {
    const { container: c1 } = render(
      <UnverifiedEmailBanner email="user@example.com" emailConfirmed={true} />,
    );
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(
      <UnverifiedEmailBanner email={null} emailConfirmed={false} />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it("hiển thị banner nhắc xác nhận khi emailConfirmed === false", () => {
    render(<UnverifiedEmailBanner email="unverified@cinema.vn" emailConfirmed={false} />);

    expect(screen.getByRole("region", { name: "Thông báo xác nhận email" })).toBeInTheDocument();
    expect(screen.getByText("unverified@cinema.vn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi lại email" })).toBeInTheDocument();
  });

  it("bấm Gửi lại email gọi đúng API /auth/resend-confirmation và đếm ngược 60s", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: "ok" });
    const user = userEvent.setup();

    render(<UnverifiedEmailBanner email="unverified@cinema.vn" emailConfirmed={false} />);

    const resendBtn = screen.getByRole("button", { name: "Gửi lại email" });
    await user.click(resendBtn);

    expect(apiFetch).toHaveBeenCalledWith("/auth/resend-confirmation", {
      method: "POST",
      json: { email: "unverified@cinema.vn" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Gửi lại sau \d+s/ })).toBeDisabled();
    });
  });
});

describe("AvatarUpload", () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => "blob:mock-avatar-preview");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("từ chối file sai định dạng (.pdf, .txt) với thông báo lỗi", () => {
    render(<AvatarUpload name="Nguyễn Văn A" />);

    const input = document.querySelector("#avatar-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();

    const invalidFile = new File(["dummy content"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(screen.getByRole("alert")).toHaveTextContent("Ảnh phải là JPG, PNG hoặc WebP, tối đa 2 MB");
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("từ chối file ảnh dung lượng lớn hơn 2MB", () => {
    render(<AvatarUpload name="Nguyễn Văn A" />);

    const input = document.querySelector("#avatar-input") as HTMLInputElement;
    // Tạo file 3MB
    const bigFile = new File([new ArrayBuffer(3 * 1024 * 1024)], "heavy.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(screen.getByRole("alert")).toHaveTextContent("Ảnh phải là JPG, PNG hoặc WebP, tối đa 2 MB");
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("kích hoạt chế độ preview khi chọn ảnh hợp lệ và cho phép huỷ preview", async () => {
    render(<AvatarUpload name="Nguyễn Văn A" />);

    const input = document.querySelector("#avatar-input") as HTMLInputElement;
    const validFile = new File(["fake-image-bytes"], "avatar.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [validFile] } });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(validFile);
    expect(screen.getByText("(Đang xem trước)")).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: "Lưu ảnh" });
    const cancelBtn = screen.getByRole("button", { name: "Huỷ" });
    expect(saveBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    // Bấm Huỷ để thu hồi preview URL
    fireEvent.click(cancelBtn);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-avatar-preview");
    expect(screen.queryByText("(Đang xem trước)")).not.toBeInTheDocument();
  });
});

describe("ChangePasswordForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("báo lỗi khi để trống, mật khẩu mới < 8 ký tự, hoặc mật khẩu xác nhận không khớp", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm userEmail="user@cinema.vn" />);

    const submitBtn = screen.getByRole("button", { name: "Cập nhật mật khẩu" });
    await user.click(submitBtn);

    expect(screen.getByText("Vui lòng nhập mật khẩu hiện tại")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu mới")).toBeInTheDocument();

    const currentPwdInput = screen.getByLabelText("Mật khẩu hiện tại");
    const newPwdInput = screen.getByLabelText("Mật khẩu mới");
    const confirmPwdInput = screen.getByLabelText("Xác nhận mật khẩu mới");

    await user.type(currentPwdInput, "OldPass123");
    await user.type(newPwdInput, "short");
    await user.type(confirmPwdInput, "different");
    await user.click(submitBtn);

    expect(screen.getByText("Mật khẩu phải có ít nhất 8 ký tự")).toBeInTheDocument();
    expect(screen.getByText("Mật khẩu xác nhận không khớp")).toBeInTheDocument();
  });

  it("báo lỗi khi mật khẩu mới vi phạm chính sách mật khẩu (thiếu chữ hoa, trùng mật khẩu cũ)", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm userEmail="user@cinema.vn" />);

    const submitBtn = screen.getByRole("button", { name: "Cập nhật mật khẩu" });
    const currentPwdInput = screen.getByLabelText("Mật khẩu hiện tại");
    const newPwdInput = screen.getByLabelText("Mật khẩu mới");
    const confirmPwdInput = screen.getByLabelText("Xác nhận mật khẩu mới");

    // Thiếu chữ hoa
    await user.type(currentPwdInput, "OldPassword123");
    await user.type(newPwdInput, "lowercase123");
    await user.type(confirmPwdInput, "lowercase123");
    await user.click(submitBtn);

    expect(screen.getByText("Mật khẩu phải có chữ hoa")).toBeInTheDocument();

    // Trùng mật khẩu cũ
    await user.clear(newPwdInput);
    await user.clear(confirmPwdInput);
    await user.type(newPwdInput, "OldPassword123");
    await user.type(confirmPwdInput, "OldPassword123");
    await user.click(submitBtn);

    expect(screen.getByText("Mật khẩu mới không được trùng với mật khẩu hiện tại")).toBeInTheDocument();
  });

  it("báo lỗi khi mật khẩu cũ không chính xác từ changePasswordAction", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockResolvedValueOnce({
      error: "Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.",
    });

    render(<ChangePasswordForm userEmail="user@cinema.vn" />);

    await user.type(screen.getByLabelText("Mật khẩu hiện tại"), "WrongOld123");
    await user.type(screen.getByLabelText("Mật khẩu mới"), "NewPassword456");
    await user.type(screen.getByLabelText("Xác nhận mật khẩu mới"), "NewPassword456");
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    await waitFor(() => {
      expect(
        screen.getAllByText("Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.").length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(changePasswordAction).toHaveBeenCalledWith("WrongOld123", "NewPassword456");
  });

  it("báo lỗi khi tài khoản bị tạm khóa 15 phút do nhập sai nhiều lần", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockResolvedValueOnce({
      error: "Đăng nhập bằng mật khẩu tạm khoá 15 phút do nhập sai nhiều lần. Vui lòng thử lại sau.",
    });

    render(<ChangePasswordForm userEmail="user@cinema.vn" />);

    await user.type(screen.getByLabelText("Mật khẩu hiện tại"), "WrongOld123");
    await user.type(screen.getByLabelText("Mật khẩu mới"), "NewPassword456");
    await user.type(screen.getByLabelText("Xác nhận mật khẩu mới"), "NewPassword456");
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    await waitFor(() => {
      expect(
        screen.getByText("Đăng nhập bằng mật khẩu tạm khoá 15 phút do nhập sai nhiều lần. Vui lòng thử lại sau."),
      ).toBeInTheDocument();
    });
  });

  it("đổi mật khẩu thành công và xoá trống các trường nhập", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockResolvedValueOnce({ success: true });

    render(<ChangePasswordForm userEmail="user@cinema.vn" />);

    const currentPwdInput = screen.getByLabelText("Mật khẩu hiện tại");
    const newPwdInput = screen.getByLabelText("Mật khẩu mới");
    const confirmPwdInput = screen.getByLabelText("Xác nhận mật khẩu mới");

    await user.type(currentPwdInput, "OldPassword123");
    await user.type(newPwdInput, "NewPassword456");
    await user.type(confirmPwdInput, "NewPassword456");
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    await waitFor(() => {
      expect(changePasswordAction).toHaveBeenCalledWith("OldPassword123", "NewPassword456");
      expect(currentPwdInput).toHaveValue("");
      expect(newPwdInput).toHaveValue("");
      expect(confirmPwdInput).toHaveValue("");
    });
  });
});

describe("DeleteAccountDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Bước 1: nút Tiếp tục bị vô hiệu hoá khi chưa tích checkbox cam kết mất vé", () => {
    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={true} />);

    expect(screen.getByText("Xoá tài khoản CINEMO?")).toBeInTheDocument();
    const continueBtn = screen.getByRole("button", { name: "Tiếp tục" });
    expect(continueBtn).toBeDisabled();
  });

  it("Bước 1: tích checkbox mở khoá nút Tiếp tục chuyển sang Bước 2", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={true} />);

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    const continueBtn = screen.getByRole("button", { name: "Tiếp tục" });
    expect(continueBtn).not.toBeDisabled();

    await user.click(continueBtn);

    // Sang Bước 2: Hiển thị hướng dẫn nhập cụm từ xác nhận
    expect(screen.getByLabelText("Cụm từ xác nhận")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu của bạn")).toBeInTheDocument();
  });

  it("Bước 2 (hasPassword = true): nút Xoá bị vô hiệu hoá nếu chưa nhập đúng XOÁ TÀI KHOẢN hoặc thiếu mật khẩu", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={true} />);

    // Qua bước 1
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));

    const deleteBtn = screen.getByRole("button", { name: "Xoá vĩnh viễn tài khoản" });
    const phraseInput = screen.getByLabelText("Cụm từ xác nhận");
    const pwdInput = screen.getByLabelText("Mật khẩu của bạn");

    // Chưa nhập gì -> disabled
    expect(deleteBtn).toBeDisabled();

    // Nhập sai cụm từ -> disabled
    await user.type(phraseInput, "XOA TAI KHOAN");
    expect(deleteBtn).toBeDisabled();

    // Sửa đúng cụm từ nhưng chưa nhập mật khẩu -> vẫn disabled
    await user.clear(phraseInput);
    await user.type(phraseInput, "XOÁ TÀI KHOẢN");
    expect(deleteBtn).toBeDisabled();

    // Nhập mật khẩu -> mở khoá nút Xoá
    await user.type(pwdInput, "MySecretPass123");
    expect(deleteBtn).not.toBeDisabled();
  });

  it("Bước 2 (hasPassword = true): xoá thành công gọi API DELETE, signOutAction dọn cookie HttpOnly", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({ deleted: true });
    vi.mocked(signOutAction).mockResolvedValueOnce({ success: true });

    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={true} />);

    // Bước 1
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));

    // Bước 2
    await user.type(screen.getByLabelText("Cụm từ xác nhận"), "XOÁ TÀI KHOẢN");
    await user.type(screen.getByLabelText("Mật khẩu của bạn"), "MySecretPass123");
    await user.click(screen.getByRole("button", { name: "Xoá vĩnh viễn tài khoản" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/me", {
        method: "DELETE",
        json: {
          acknowledgeTicketLoss: true,
          password: "MySecretPass123",
        },
      });
      expect(signOutAction).toHaveBeenCalled();
    });
  });

  it("Bước 2 (hasPassword = true): lỗi 403 hiển thị 'Mật khẩu hiện tại không đúng'", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new ApiError("FORBIDDEN", "Forbidden", 403),
    );

    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={true} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));

    await user.type(screen.getByLabelText("Cụm từ xác nhận"), "XOÁ TÀI KHOẢN");
    await user.type(screen.getByLabelText("Mật khẩu của bạn"), "WrongPassword123");
    await user.click(screen.getByRole("button", { name: "Xoá vĩnh viễn tài khoản" }));

    await waitFor(() => {
      expect(
        screen.getByText("Mật khẩu hiện tại không đúng, vui lòng kiểm tra lại."),
      ).toBeInTheDocument();
    });
  });

  it("Bước 2 (hasPassword = false, OAuth-only): không yêu cầu mật khẩu và mở khoá nút Xoá ngay khi gõ đúng cụm từ", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={false} />);

    // Bước 1
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));

    // Bước 2: Không có trường nhập mật khẩu
    expect(screen.queryByLabelText("Mật khẩu của bạn")).not.toBeInTheDocument();
    const deleteBtn = screen.getByRole("button", { name: "Xoá vĩnh viễn tài khoản" });
    expect(deleteBtn).toBeDisabled();

    // Nhập cụm từ xác nhận
    await user.type(screen.getByLabelText("Cụm từ xác nhận"), "XOÁ TÀI KHOẢN");
    expect(deleteBtn).not.toBeDisabled();
  });

  it("Bước 2 (hasPassword = false, OAuth-only): xoá thành công gửi password: undefined và gọi signOutAction", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({ deleted: true });
    vi.mocked(signOutAction).mockResolvedValueOnce({ success: true });

    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={false} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));

    await user.type(screen.getByLabelText("Cụm từ xác nhận"), "XOÁ TÀI KHOẢN");
    await user.click(screen.getByRole("button", { name: "Xoá vĩnh viễn tài khoản" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/me", {
        method: "DELETE",
        json: {
          acknowledgeTicketLoss: true,
          password: undefined,
        },
      });
      expect(signOutAction).toHaveBeenCalled();
    });
  });

  it("Bước 2 (hasPassword = false, OAuth-only): lỗi 403 báo phiên quá 5 phút và hiện nút Đăng nhập lại", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new ApiError("FORBIDDEN", "Forbidden", 403),
    );

    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} hasPassword={false} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));

    await user.type(screen.getByLabelText("Cụm từ xác nhận"), "XOÁ TÀI KHOẢN");
    await user.click(screen.getByRole("button", { name: "Xoá vĩnh viễn tài khoản" }));

    await waitFor(() => {
      expect(
        screen.getByText("Phiên đăng nhập đã quá 5 phút. Vui lòng đăng nhập lại để xác thực xoá tài khoản"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Đăng nhập lại" })).toBeInTheDocument();
    });
  });
});

describe("AccountProfilePage (/tai-khoan)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ẩn form Đổi mật khẩu khi tài khoản là OAuth-only (hasPassword = false)", async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === "/me/profile") {
        return Promise.resolve({
          id: "usr-oauth-1",
          email: "google.user@example.com",
          full_name: "Google User",
          phone: "0912345678",
          date_of_birth: "1995-01-01",
          gender: "MALE",
          avatar_url: null,
        });
      }
      if (path === "/me/identities") {
        return Promise.resolve({
          identities: [
            {
              id: "id-1",
              provider: "google",
              providerId: "goog-123",
              email: "google.user@example.com",
            },
          ],
          hasPassword: false,
          canUnlink: false,
        });
      }
      return Promise.reject(new Error(`Unhandled path: ${path}`));
    });

    render(<AccountProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Google User")).toBeInTheDocument();
    });

    // Form Đổi mật khẩu không được render
    expect(screen.queryByText("Đổi mật khẩu")).not.toBeInTheDocument();
  });

  it("hiển thị form Đổi mật khẩu khi tài khoản có mật khẩu (hasPassword = true)", async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === "/me/profile") {
        return Promise.resolve({
          id: "usr-pwd-1",
          email: "password.user@example.com",
          full_name: "Password User",
          phone: "0912345678",
          date_of_birth: "1995-01-01",
          gender: "MALE",
          avatar_url: null,
        });
      }
      if (path === "/me/identities") {
        return Promise.resolve({
          identities: [
            {
              id: "id-2",
              provider: "email",
              providerId: "password.user@example.com",
              email: "password.user@example.com",
            },
          ],
          hasPassword: true,
          canUnlink: false,
        });
      }
      return Promise.reject(new Error(`Unhandled path: ${path}`));
    });

    render(<AccountProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Password User")).toBeInTheDocument();
    });

    // Form Đổi mật khẩu xuất hiện
    expect(screen.getByText("Đổi mật khẩu")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu hiện tại")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu mới")).toBeInTheDocument();
  });
});
