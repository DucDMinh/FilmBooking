"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/client";
import { ERROR_MESSAGES } from "@/lib/api/error-messages";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { AuthField, FormAlert, PasswordField } from "./auth-ui";
import { OAuthButtons } from "./oauth-buttons";
import { TurnstileField } from "./turnstile-field";

export interface LoginResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface LoginFormProps {
  next?: string | null;
  initialError?: string | null;
  onLogin?: (data: {
    email: string;
    password: string;
    rememberMe: boolean;
    captchaToken?: string;
  }) => Promise<LoginResult>;
  turnstileRef?: React.RefObject<TurnstileInstance | null | undefined>;
}

export function LoginForm({ next, initialError, onLogin, turnstileRef }: Readonly<LoginFormProps>) {
  const internalTurnstileRef = useRef<TurnstileInstance | null>(null);
  const activeTurnstileRef = turnstileRef ?? internalTurnstileRef;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError === "oauth"
      ? "Đăng nhập với Google/Facebook không thành công. Vui lòng thử lại."
      : initialError === "email_exists"
        ? "Email này đã có tài khoản — hãy đăng nhập bằng phương thức cũ để liên kết."
        : initialError === "identity_taken"
          ? "Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác."
          : null,
  );
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const safeNext = sanitizeNext(next) ?? "/";

  const defaultLogin = async (data: {
    email: string;
    password: string;
    rememberMe: boolean;
    captchaToken?: string;
  }): Promise<LoginResult> => {
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        json: {
          email: data.email,
          password: data.password,
          captchaToken: data.captchaToken,
        },
      });
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        return {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        };
      }
      return {
        success: false,
        error: {
          code: "UNKNOWN",
          message: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
        },
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Vui lòng nhập email";
    if (!password) errors.password = "Vui lòng nhập mật khẩu";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const runner = onLogin ?? defaultLogin;
      const res = await runner({
        email: email.trim().toLowerCase(),
        password,
        rememberMe,
        captchaToken: captchaToken ?? undefined,
      });

      if (res.success) {
        window.location.href = safeNext;
        return;
      }

      // F-05: Reset Turnstile widget và xóa token khi submit lỗi
      activeTurnstileRef.current?.reset();
      setCaptchaToken(null);

      const err = res.error;
      const newFailures = failedAttempts + 1;
      setFailedAttempts(newFailures);

      if (newFailures >= 3 || err?.details?.captchaRequired === true) {
        setShowCaptcha(true);
      }

      if (err?.code === "ACCOUNT_LOCKED") {
        setErrorMessage(
          ERROR_MESSAGES.ACCOUNT_LOCKED ??
            "Đăng nhập bằng mật khẩu tạm khoá 15 phút do nhập sai nhiều lần. Bạn có thể đặt lại mật khẩu hoặc dùng Google/Facebook.",
        );
      } else if (err?.code === "UNAUTHENTICATED") {
        setErrorMessage("Email hoặc mật khẩu không đúng");
      } else {
        setErrorMessage(err?.message ?? "Đã có lỗi xảy ra. Vui lòng thử lại sau.");
      }
    } catch {
      // F-05: Reset Turnstile widget và xóa token khi submit lỗi
      activeTurnstileRef.current?.reset();
      setCaptchaToken(null);
      setErrorMessage("Đã có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  const registerHref = next ? `/dang-ky?next=${encodeURIComponent(next)}` : "/dang-ky";
  const forgotHref = email.trim()
    ? `/quen-mat-khau?email=${encodeURIComponent(email.trim())}`
    : "/quen-mat-khau";

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Chào mừng trở lại</h1>
        <p className="text-body-sm text-fg-muted">Đăng nhập vào tài khoản CINEMO để tiếp tục</p>
      </div>

      {errorMessage ? (
        <FormAlert tone="danger">{errorMessage}</FormAlert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={fieldErrors.email}
          placeholder="example@cinemo.vn"
          required
        />

        <PasswordField
          label="Mật khẩu"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={fieldErrors.password}
          placeholder="••••••••"
          labelAside={
            <Link
              href={forgotHref}
              className="text-small text-link hover:underline underline-offset-4"
            >
              Quên mật khẩu?
            </Link>
          }
          required
        />

        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="rememberMe"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
          />
          <Label htmlFor="rememberMe" className="text-body-sm font-normal text-fg-muted cursor-pointer select-none">
            Ghi nhớ đăng nhập (30 ngày)
          </Label>
        </div>

        {showCaptcha ? (
          <div className="pt-1">
            <TurnstileField onToken={setCaptchaToken} turnstileRef={activeTurnstileRef} />
          </div>
        ) : null}

        <Button
          type="submit"
          variant="gradient"
          className="w-full font-semibold shadow-cta-glow"
          disabled={loading}
          aria-disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang đăng nhập…</span>
            </>
          ) : (
            <span>Đăng nhập</span>
          )}
        </Button>
      </form>

      <OAuthButtons next={next} />

      <p className="text-center text-body-sm text-fg-muted">
        Chưa có tài khoản?{" "}
        <Link href={registerHref} className="text-link font-medium hover:underline underline-offset-4">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
