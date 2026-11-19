import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TurnstileInstance } from "@marsidev/react-turnstile";

import { LoginForm } from "../login-form";
import { RegisterForm } from "../register-form";
import { ResendConfirmButton } from "../resend-confirm-button";
import { OAuthButtons } from "../oauth-buttons";
import { apiFetch } from "@/lib/api/client";
import { sanitizeNext } from "@/lib/auth/safe-next";
import {
  sessionCookieOptions,
  REMEMBER_COOKIE_NAME,
  REMEMBER_MAX_AGE,
  DEFAULT_SUPABASE_MAX_AGE,
} from "@/lib/supabase/cookie-options";
import {
  classifyOAuthError,
  buildRedirectForError,
} from "@/app/auth/callback/route";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
      readonly details?: Record<string, unknown>,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("sanitizeNext", () => {
  it("chấp nhận đường dẫn nội bộ hợp lệ", () => {
    expect(sanitizeNext("/dat-ve/showtime-1")).toBe("/dat-ve/showtime-1");
    expect(sanitizeNext("/ve")).toBe("/ve");
    expect(sanitizeNext("/")).toBe("/");
  });

  it("từ chối đường dẫn nguy hiểm, scheme khác và open redirect", () => {
    expect(sanitizeNext("//evil.com")).toBeNull();
    expect(sanitizeNext("https://evil.com")).toBeNull();
    expect(sanitizeNext("/\\evil.com")).toBeNull();
    expect(sanitizeNext("javascript:alert(1)")).toBeNull();
    expect(sanitizeNext(null)).toBeNull();
    expect(sanitizeNext("")).toBeNull();
    expect(sanitizeNext("/\n/evil.com")).toBeNull();
  });

  it("M-03: xử lý mảng tham số query (?next=a&next=b) bằng cách lấy phần tử đầu tiên", () => {
    expect(sanitizeNext(["/ve", "/dat-ve"])).toBe("/ve");
    expect(sanitizeNext(["//evil.com", "/ve"])).toBeNull();
  });
});

describe("LoginForm", () => {
  it("hiển thị đầy đủ nhãn, input, checkbox ghi nhớ và nút đăng nhập", () => {
    render(<LoginForm next="/dat-ve/123" />);

    expect(screen.getByRole("heading", { level: 1, name: "Chào mừng trở lại" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Ghi nhớ đăng nhập/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quên mật khẩu?" })).toHaveAttribute(
      "href",
      "/quen-mat-khau",
    );
    expect(screen.getByRole("link", { name: "Đăng ký ngay" })).toHaveAttribute(
      "href",
      "/dang-ky?next=%2Fdat-ve%2F123",
    );
  });

  it("hiển thị lỗi validation khi submit form trống", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByText("Vui lòng nhập email")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("AC-03: API trả ACCOUNT_LOCKED -> hiển thị thông báo khoá 15 phút, không lộ thêm thông tin", async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue({
      success: false,
      error: {
        code: "ACCOUNT_LOCKED",
        message: "Đăng nhập bị khoá 15 phút do nhập sai mật khẩu nhiều lần",
        details: { lockMinutes: 15 },
      },
    });

    render(<LoginForm onLogin={mockLogin} />);

    await user.type(screen.getByLabelText("Email"), "user@test.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "Password123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("khoá 15 phút");
      expect(alert).toHaveTextContent("nhập sai nhiều lần");
      expect(alert).not.toHaveTextContent("user@test.vn");
    });
  });

  it("API trả UNAUTHENTICATED -> hiển thị thông báo lỗi chung chung (R-12)", async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Email hoặc mật khẩu không đúng",
      },
    });

    render(<LoginForm onLogin={mockLogin} />);

    await user.type(screen.getByLabelText("Email"), "user@test.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "WrongPassword123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng");
    });
  });

  it("hiển thị Turnstile CAPTCHA khi API yêu cầu captchaRequired hoặc sau 3 lần sai", async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Email hoặc mật khẩu không đúng",
        details: { captchaRequired: true },
      },
    });

    render(<LoginForm onLogin={mockLogin} />);

    await user.type(screen.getByLabelText("Email"), "user@test.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "WrongPassword123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });
  });

  it("ưu tiên redirectTo do server tính theo vai trò, vẫn lọc open-redirect", async () => {
    const user = userEvent.setup();
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: "" };
    Object.defineProperty(window, "location", { writable: true, value: mockLocation });

    const mockLogin = vi.fn().mockResolvedValue({ success: true, redirectTo: "/admin" });
    render(<LoginForm next="/ve" onLogin={mockLogin} />);
    await user.type(screen.getByLabelText("Email"), "admin@test.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "ValidPassword123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(mockLocation.href).toBe("/admin"));

    cleanup();
    mockLocation.href = "";
    mockLogin.mockResolvedValue({ success: true, redirectTo: "//evil.com" });
    render(<LoginForm next="/ve" onLogin={mockLogin} />);
    await user.type(screen.getByLabelText("Email"), "admin@test.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "ValidPassword123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(mockLocation.href).toBe("/ve"));

    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("đăng nhập thành công gọi onLogin và điều hướng an toàn", async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue({ success: true });

    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: "" };
    Object.defineProperty(window, "location", {
      writable: true,
      value: mockLocation,
    });

    render(<LoginForm next="/ve" onLogin={mockLogin} />);

    await user.type(screen.getByLabelText("Email"), "user@test.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "ValidPassword123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: "user@test.vn",
        password: "ValidPassword123",
        rememberMe: true,
        captchaToken: undefined,
      });
      expect(mockLocation.href).toBe("/ve");
    });

    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  it("R-20: initialError='email_exists' hiển thị thông báo hướng dẫn đăng nhập bằng phương thức cũ", () => {
    render(<LoginForm initialError="email_exists" />);
    expect(
      screen.getByText("Email này đã có tài khoản - hãy đăng nhập bằng phương thức cũ để liên kết."),
    ).toBeInTheDocument();
  });

  it("F-01: initialError='identity_taken' hiển thị thông báo tài khoản MXH đã liên kết với tài khoản khác", () => {
    render(<LoginForm initialError="identity_taken" />);
    expect(
      screen.getByText("Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác."),
    ).toBeInTheDocument();
  });

  it("F-05: reset Turnstile widget sau khi submit đăng nhập thất bại", async () => {
    const user = userEvent.setup();
    const mockReset = vi.fn();
    const mockRef = { current: { reset: mockReset } } as unknown as React.RefObject<TurnstileInstance>;
    const mockLogin = vi.fn().mockResolvedValue({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Sai mật khẩu" },
    });

    render(<LoginForm onLogin={mockLogin} turnstileRef={mockRef} />);

    await user.type(screen.getByLabelText("Email"), "user@test.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "WrongPass123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledTimes(1);
    });
  });
});

describe("RegisterForm", () => {
  it("nút submit bị vô hiệu khi chưa tick đồng ý điều khoản (R-03)", async () => {
    render(<RegisterForm />);

    const submitBtn = screen.getByRole("button", { name: "Tạo tài khoản" });
    expect(submitBtn).toBeDisabled();

    const termsCheckbox = screen.getByRole("checkbox", {
      name: /Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật/i,
    });
    expect(termsCheckbox).not.toBeChecked();

    const user = userEvent.setup();
    await user.click(termsCheckbox);

    expect(termsCheckbox).toBeChecked();
    expect(submitBtn).toBeEnabled();
  });

  it("checkbox email ưu đãi mặc định bỏ tick (R-30)", () => {
    render(<RegisterForm />);
    const marketingCheckbox = screen.getByRole("checkbox", {
      name: /Tôi muốn nhận email ưu đãi/i,
    });
    expect(marketingCheckbox).not.toBeChecked();
  });

  it("thanh độ mạnh mật khẩu cập nhật điều kiện khi nhập mật khẩu (R-02)", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const pwdInput = screen.getByLabelText("Mật khẩu");
    await user.type(pwdInput, "abc");

    expect(screen.getByTestId("password-strength")).toBeInTheDocument();
    expect(screen.getByText(/8–72 ký tự/)).toBeInTheDocument();

    await user.clear(pwdInput);
    await user.type(pwdInput, "Password123");

    expect(screen.getByText("8–72 ký tự")).toHaveClass("text-success");
    expect(screen.getByText("Có chữ hoa")).toHaveClass("text-success");
    expect(screen.getByText("Có chữ thường")).toHaveClass("text-success");
    expect(screen.getByText("Có chữ số")).toHaveClass("text-success");
  });

  it("đăng ký thành công điều hướng sang /xac-nhan-email", async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockResolvedValue({ success: true });

    render(<RegisterForm onRegister={mockRegister} next="/dat-ve/1" />);

    await user.type(screen.getByLabelText("Họ và tên"), "Nguyen Van A");
    await user.type(screen.getByLabelText("Email"), "a@cinemo.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "StrongPass123");
    await user.click(
      screen.getByRole("checkbox", {
        name: /Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        email: "a@cinemo.vn",
        password: "StrongPass123",
        fullName: "Nguyen Van A",
        acceptTerms: true,
        captchaToken: undefined,
      });
      expect(mockPush).toHaveBeenCalledWith("/xac-nhan-email?email=a%40cinemo.vn&next=%2Fdat-ve%2F1");
    });
  });

  it("hiển thị lỗi khi dùng email dùng một lần (R-09)", async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockResolvedValue({
      success: false,
      error: {
        code: "DISPOSABLE_EMAIL",
        message: "Email dùng một lần không được chấp nhận",
      },
    });

    render(<RegisterForm onRegister={mockRegister} />);

    await user.type(screen.getByLabelText("Email"), "disposable@tempmail.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "StrongPass123");
    await user.click(
      screen.getByRole("checkbox", {
        name: /Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("email tạm thời");
    });
  });

  it("F-05: reset Turnstile widget sau khi submit đăng ký thất bại", async () => {
    const user = userEvent.setup();
    const mockReset = vi.fn();
    const mockRef = { current: { reset: mockReset } } as unknown as React.RefObject<TurnstileInstance>;
    const mockRegister = vi.fn().mockResolvedValue({
      success: false,
      error: { code: "RATE_LIMITED", message: "Quá số lần đăng ký" },
    });

    render(<RegisterForm onRegister={mockRegister} turnstileRef={mockRef} />);

    await user.type(screen.getByLabelText("Họ và tên"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "StrongPass123");
    await user.click(
      screen.getByRole("checkbox", {
        name: /Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledTimes(1);
    });
  });
});

describe("ResendConfirmButton", () => {
  it("AC-02: Sau khi bấm gửi lại, nút disabled + đếm ngược 60s; bấm trong lúc đếm không gọi API", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiFetch).mockResolvedValue({ status: "CHECK_EMAIL" });

    render(<ResendConfirmButton email="test@cinemo.vn" />);

    const button = screen.getByRole("button", { name: "Gửi lại email xác nhận" });
    expect(button).toBeEnabled();

    // Bấm gửi lần 1
    fireEvent.click(button);

    // Chờ API hoàn tất và countdown bật
    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(button).toBeDisabled();
      expect(screen.getByText(/Có thể gửi lại sau 60s/)).toBeInTheDocument();
    });

    expect(apiFetch).toHaveBeenCalledWith("/auth/resend-confirmation", {
      method: "POST",
      json: { email: "test@cinemo.vn" },
    });

    // Thử bấm lại trong lúc đếm -> không được gọi thêm
    fireEvent.click(button);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // Tiến tới 30 giây
    vi.advanceTimersByTime(30000);
    await vi.waitFor(() => {
      expect(screen.getByText(/Có thể gửi lại sau 30s/)).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    // Thử bấm tiếp
    fireEvent.click(button);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // Tiến thêm 30 giây (hết 60s)
    vi.advanceTimersByTime(30000);
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Gửi lại email xác nhận" })).toBeEnabled();
    });
  });

  it("email rỗng thì nút bị disabled", () => {
    render(<ResendConfirmButton email="" />);
    expect(screen.getByRole("button", { name: "Gửi lại email xác nhận" })).toBeDisabled();
  });
});

describe("OAuthButtons", () => {
  it("hiển thị các nút đăng nhập Google và Facebook", () => {
    render(<OAuthButtons next="/dat-ve/2" />);

    expect(screen.getByRole("button", { name: /Tiếp tục với Google/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tiếp tục với Facebook/ })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "hoặc" })).toBeInTheDocument();
  });
});

describe("sessionCookieOptions (F-04)", () => {
  it("không ghi nhớ (remember=false|'0') -> không đặt maxAge (phiên trình duyệt)", () => {
    const opts1 = sessionCookieOptions({ maxAge: 1000 }, false);
    expect(opts1.maxAge).toBeUndefined();
    expect(opts1.httpOnly).toBe(true);

    const opts2 = sessionCookieOptions({ maxAge: 1000 }, "0");
    expect(opts2.maxAge).toBeUndefined();
  });

  it("ghi nhớ đăng nhập (remember=true|'1') -> đặt maxAge tối đa 30 ngày (REMEMBER_MAX_AGE)", () => {
    const opts1 = sessionCookieOptions({}, true);
    expect(opts1.maxAge).toBe(REMEMBER_MAX_AGE);

    const opts2 = sessionCookieOptions({}, "1");
    expect(opts2.maxAge).toBe(REMEMBER_MAX_AGE);
  });

  it("refresh token với maxAge 400 ngày mặc định của @supabase/ssr -> xóa maxAge để không biến session cookie thành bền", () => {
    const opts = sessionCookieOptions({ maxAge: DEFAULT_SUPABASE_MAX_AGE });
    expect(opts.maxAge).toBeUndefined();
  });

  it("hằng số REMEMBER_COOKIE_NAME là 'fb-remember'", () => {
    expect(REMEMBER_COOKIE_NAME).toBe("fb-remember");
  });
});

describe("OAuth Callback Error Mapping (F-01)", () => {
  const reqUrl = "http://localhost:3000/auth/callback";

  it("phân loại đúng mã lỗi đã liên kết (R-23, 23505) -> identity_taken", () => {
    expect(
      classifyOAuthError(null, "identity_already_exists", null),
    ).toBe("identity_taken");
    expect(
      classifyOAuthError(null, null, "OAUTH_IDENTITY_ALREADY_LINKED: Tai khoan mang xa hoi da duoc lien ket"),
    ).toBe("identity_taken");
  });

  it("phân loại đúng mã lỗi trùng email / auto-merge (AC-04 / R-20, 23514) -> email_exists", () => {
    expect(
      classifyOAuthError(null, null, "OAUTH_AUTO_MERGE_BLOCKED: Khong the tu dong gop"),
    ).toBe("email_exists");
    expect(
      classifyOAuthError(null, null, "OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED: Email nay da co tai khoan"),
    ).toBe("email_exists");
  });

  it("phân loại lỗi Facebook thiếu email (R-19) -> missing_email", () => {
    expect(
      classifyOAuthError(null, null, "missing_email from provider"),
    ).toBe("missing_email");
  });

  it("buildRedirectForError: identity_taken khi đang ở luồng liên kết (/tai-khoan) -> điều hướng về next?error=identity_taken", () => {
    const res = buildRedirectForError("identity_taken", "/tai-khoan/bao-mat", reqUrl);
    expect(res.headers.get("location")).toBe("http://localhost:3000/tai-khoan/bao-mat?error=identity_taken");
  });

  it("buildRedirectForError: identity_taken khi bấm từ bên ngoài -> điều hướng về /dang-nhap?error=identity_taken và giữ next", () => {
    const res = buildRedirectForError("identity_taken", "/dat-ve/123", reqUrl);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/dang-nhap?error=identity_taken&next=%2Fdat-ve%2F123",
    );
  });

  it("buildRedirectForError: email_exists khi đang ở luồng liên kết -> quay về next?error=email_exists", () => {
    const res = buildRedirectForError("email_exists", "/tai-khoan/bao-mat", reqUrl);
    expect(res.headers.get("location")).toBe("http://localhost:3000/tai-khoan/bao-mat?error=email_exists");
  });

  it("buildRedirectForError: email_exists khi đăng nhập bên ngoài -> dẫn về /dang-nhap?error=email_exists và giữ next", () => {
    const res = buildRedirectForError("email_exists", "/dat-ve/showtime-1", reqUrl);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/dang-nhap?error=email_exists&next=%2Fdat-ve%2Fshowtime-1",
    );
  });

  it("buildRedirectForError: missing_email -> dẫn về /bo-sung-email và giữ next", () => {
    const res = buildRedirectForError("missing_email", "/dat-ve/2", reqUrl);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/bo-sung-email?next=%2Fdat-ve%2F2",
    );
  });

  it("buildRedirectForError: lỗi oauth không thuộc allowlist -> fallback /dang-nhap?error=oauth", () => {
    const res = buildRedirectForError("oauth", "/ve", reqUrl);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/dang-nhap?error=oauth&next=%2Fve",
    );
  });
});
