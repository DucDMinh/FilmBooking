"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/client";
import { ERROR_MESSAGES } from "@/lib/api/error-messages";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { AuthField, FormAlert, PasswordField, PasswordStrength, passwordFieldError } from "./auth-ui";
import { OAuthButtons } from "./oauth-buttons";
import { TurnstileField } from "./turnstile-field";

export interface RegisterResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface RegisterFormProps {
  next?: string | null;
  onRegister?: (data: {
    email: string;
    password: string;
    fullName?: string;
    acceptTerms: boolean;
    captchaToken?: string;
  }) => Promise<RegisterResult>;
  turnstileRef?: React.RefObject<TurnstileInstance | null | undefined>;
}

export function RegisterForm({ next, onRegister, turnstileRef }: Readonly<RegisterFormProps>) {
  const router = useRouter();
  const internalTurnstileRef = useRef<TurnstileInstance | null>(null);
  const activeTurnstileRef = turnstileRef ?? internalTurnstileRef;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    terms?: string;
  }>({});

  const defaultRegister = async (data: {
    email: string;
    password: string;
    fullName?: string;
    acceptTerms: boolean;
    captchaToken?: string;
  }): Promise<RegisterResult> => {
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        json: {
          email: data.email,
          password: data.password,
          fullName: data.fullName || undefined,
          acceptTerms: data.acceptTerms,
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

    const errors: { email?: string; password?: string; terms?: string } = {};
    if (!email.trim()) {
      errors.email = "Vui lòng nhập email";
    }
    const pwdError = passwordFieldError(password);
    if (pwdError) {
      errors.password = pwdError;
    }
    if (!acceptTerms) {
      errors.terms = "Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật để tiếp tục.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const runner = onRegister ?? defaultRegister;
      const res = await runner({
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim() || undefined,
        acceptTerms,
        captchaToken: captchaToken ?? undefined,
      });

      if (res.success) {
        const query = new URLSearchParams({ email: email.trim().toLowerCase() });
        const safeNext = sanitizeNext(next);
        if (safeNext) query.set("next", safeNext);
        router.push(`/xac-nhan-email?${query.toString()}`);
        return;
      }

      // F-05: Reset Turnstile widget và xóa token khi submit lỗi
      activeTurnstileRef.current?.reset();
      setCaptchaToken(null);

      const err = res.error;
      if (err?.code === "DISPOSABLE_EMAIL") {
        setErrorMessage(ERROR_MESSAGES.DISPOSABLE_EMAIL);
      } else if (err?.code === "CONSENT_REQUIRED") {
        setErrorMessage("Bạn phải đồng ý Điều khoản sử dụng và Chính sách bảo mật để tiếp tục.");
      } else if (err?.code === "RATE_LIMITED") {
        setErrorMessage("Bạn đã tạo quá nhiều tài khoản, vui lòng thử lại sau.");
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

  const loginHref = next ? `/dang-nhap?next=${encodeURIComponent(next)}` : "/dang-nhap";

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Tạo tài khoản CINEMO</h1>
        <p className="text-body-sm text-fg-muted">Đăng ký để đặt vé trực tuyến và nhận ưu đãi</p>
      </div>

      {errorMessage ? (
        <FormAlert tone="danger">{errorMessage}</FormAlert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField
          label="Họ và tên"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nguyễn Văn A"
        />

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

        <div className="space-y-2">
          <PasswordField
            label="Mật khẩu"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={fieldErrors.password}
            placeholder="••••••••"
            required
          />
          <PasswordStrength password={password} />
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-start gap-2">
            <Checkbox
              id="acceptTerms"
              checked={acceptTerms}
              onCheckedChange={(checked) => {
                setAcceptTerms(Boolean(checked));
                if (fieldErrors.terms) setFieldErrors((prev) => ({ ...prev, terms: undefined }));
              }}
              className="mt-0.5"
              aria-invalid={fieldErrors.terms ? true : undefined}
            />
            <div className="space-y-1">
              <Label htmlFor="acceptTerms" className="text-body-sm font-normal text-fg leading-snug cursor-pointer select-none">
                Tôi đồng ý với{" "}
                <Link
                  href="/dieu-khoan"
                  target="_blank"
                  className="text-link hover:underline underline-offset-4"
                >
                  Điều khoản sử dụng
                </Link>{" "}
                và{" "}
                <Link
                  href="/chinh-sach-bao-mat"
                  target="_blank"
                  className="text-link hover:underline underline-offset-4"
                >
                  Chính sách bảo mật
                </Link>
                <span className="text-danger-text" aria-hidden="true"> *</span>
              </Label>
              {fieldErrors.terms ? (
                <p role="alert" className="text-small text-danger-text">
                  {fieldErrors.terms}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="marketingOptIn"
              checked={marketingOptIn}
              onCheckedChange={(checked) => setMarketingOptIn(Boolean(checked))}
              className="mt-0.5"
            />
            <Label htmlFor="marketingOptIn" className="text-body-sm font-normal text-fg-muted leading-snug cursor-pointer select-none">
              Tôi muốn nhận email ưu đãi và tin tức từ CINEMO (không bắt buộc)
            </Label>
          </div>
        </div>

        <div className="pt-1">
          <TurnstileField onToken={setCaptchaToken} turnstileRef={activeTurnstileRef} />
        </div>

        <Button
          type="submit"
          variant="gradient"
          className="w-full"
          disabled={!acceptTerms || loading}
          aria-disabled={!acceptTerms || loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang tạo tài khoản…</span>
            </>
          ) : (
            <span>Tạo tài khoản</span>
          )}
        </Button>
      </form>

      <OAuthButtons next={next} />

      <p className="text-center text-body-sm text-fg-muted">
        Đã có tài khoản?{" "}
        <Link href={loginHref} className="text-link font-medium hover:underline underline-offset-4">
          Đăng nhập
        </Link>
      </p>

      <p className="text-center text-small text-fg-muted">
        Email xác nhận có hiệu lực trong 24 giờ.
      </p>
    </div>
  );
}
