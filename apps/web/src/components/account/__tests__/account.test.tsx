import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarUpload } from "@/components/account/avatar-upload";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { UnverifiedEmailBanner } from "@/components/shell/unverified-email-banner";
import { apiFetch } from "@/lib/api/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabase: vi.fn(),
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

    expect(screen.getByText("Mật khẩu mới phải có tối thiểu 8 ký tự")).toBeInTheDocument();
    expect(screen.getByText("Mật khẩu xác nhận không khớp")).toBeInTheDocument();
  });

  it("báo lỗi khi mật khẩu cũ không chính xác từ Supabase", async () => {
    const user = userEvent.setup();
    const mockSignInWithPassword = vi.fn().mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    vi.mocked(createBrowserSupabase).mockReturnValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
      },
    } as unknown as ReturnType<typeof createBrowserSupabase>);

    render(<ChangePasswordForm userEmail="user@cinema.vn" />);

    await user.type(screen.getByLabelText("Mật khẩu hiện tại"), "WrongOld123");
    await user.type(screen.getByLabelText("Mật khẩu mới"), "NewPassword456");
    await user.type(screen.getByLabelText("Xác nhận mật khẩu mới"), "NewPassword456");
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    await waitFor(() => {
      expect(
        screen.getByText("Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại."),
      ).toBeInTheDocument();
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

  it("Bước 2: nút Xoá bị vô hiệu hoá nếu chưa nhập đúng XOÁ TÀI KHOẢN hoặc thiếu mật khẩu", async () => {
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
});
