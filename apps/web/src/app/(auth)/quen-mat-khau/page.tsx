"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { AuthField, FormAlert } from "@/components/auth/auth-ui";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setFieldError("Vui lòng nhập email");
      return;
    }
    setFieldError(null);

    setLoading(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        json: {
          email: email.trim().toLowerCase(),
          captchaToken: captchaToken ?? undefined,
        },
      });
      // R-12: Luôn hiển thị thông báo trung tính thành công
      setSubmitted(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "RATE_LIMITED") {
          setErrorMessage("Bạn thử quá nhiều lần, vui lòng đợi một lúc rồi thử lại.");
        } else if (err.code === "CAPTCHA_FAILED") {
          setErrorMessage("Xác minh CAPTCHA không thành công. Vui lòng thử lại.");
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage("Đã có lỗi xảy ra. Vui lòng thử lại sau.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-fg">Đã gửi hướng dẫn</h1>
          <p className="text-body-sm text-fg-muted">
            Nếu email <span className="font-semibold text-fg">{email.trim()}</span> tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu.
          </p>
          <p className="text-small text-fg-muted">
            Liên kết có hiệu lực trong 1 giờ. Vui lòng kiểm tra hộp thư đến và thư mục rác (Spam).
          </p>
        </div>

        <Button asChild variant="gradient" className="w-full font-semibold shadow-cta-glow">
          <Link href="/dang-nhap">Quay lại đăng nhập</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <div className="mx-auto md:mx-0 mb-3 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Mail className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Đặt lại mật khẩu</h1>
        <p className="text-body-sm text-fg-muted">
          Nhập email của bạn, chúng tôi sẽ gửi liên kết đặt lại mật khẩu có hiệu lực trong 1 giờ.
        </p>
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
            if (fieldError) setFieldError(null);
          }}
          error={fieldError}
          placeholder="example@cinemo.vn"
          required
        />

        <div className="pt-1">
          <TurnstileField onToken={setCaptchaToken} />
        </div>

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
              <span>Đang gửi liên kết…</span>
            </>
          ) : (
            <span>Gửi liên kết đặt lại</span>
          )}
        </Button>
      </form>

      <p className="text-center text-body-sm text-fg-muted">
        <Link
          href="/dang-nhap"
          className="inline-flex items-center gap-1.5 text-link font-medium hover:underline underline-offset-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Quay lại đăng nhập</span>
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-fg-muted">Đang tải…</div>}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
