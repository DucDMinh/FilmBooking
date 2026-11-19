"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { FormAlert, PasswordField, PasswordStrength, passwordFieldError } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token") || searchParams.get("access_token") || "";

  const [accessToken, setAccessToken] = useState<string>(tokenFromQuery);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    if (accessToken) return;
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = hashParams.get("access_token");
      if (token) {
        setAccessToken(token);
      }
    }
  }, [accessToken]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const errors: { newPassword?: string; confirmPassword?: string } = {};
    const pwdErr = passwordFieldError(newPassword);
    if (pwdErr) {
      errors.newPassword = pwdErr;
    }
    if (confirmPassword !== newPassword) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    if (!accessToken) {
      setErrorMessage("Liên kết không hợp lệ hoặc thiếu mã xác thực. Vui lòng yêu cầu gửi lại.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        json: {
          accessToken,
          newPassword,
        },
      });
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "UNAUTHENTICATED") {
          setErrorMessage(
            "Liên kết đặt lại mật khẩu đã hết hạn (quá 1 giờ) hoặc đã được sử dụng. Vui lòng yêu cầu gửi lại.",
          );
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

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center chamfer-md bg-success-soft text-success">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-fg">Đặt lại mật khẩu thành công</h1>
          <p className="text-body-sm text-fg-muted">
            Mật khẩu mới đã được cập nhật. Tất cả các phiên đăng nhập khác của bạn đã được đăng xuất an toàn.
          </p>
        </div>

        <Button asChild variant="gradient" className="w-full">
          <Link href="/dang-nhap">Đăng nhập ngay</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <div className="mx-auto md:mx-0 mb-3 flex size-12 items-center justify-center chamfer-md bg-brand-soft text-brand">
          <KeyRound className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Đặt mật khẩu mới</h1>
        <p className="text-body-sm text-fg-muted">
          Nhập mật khẩu mới an toàn cho tài khoản CINEMO của bạn.
        </p>
      </div>

      {!accessToken && (
        <div className="border border-warning-line bg-warning-soft p-3 text-body-sm text-fg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Không tìm thấy mã xác thực</p>
              <p className="text-small text-fg-muted">
                Liên kết có thể bị thiếu mã hoặc không hợp lệ.{" "}
                <Link href="/quen-mat-khau" className="text-link underline">
                  Yêu cầu liên kết mới
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {errorMessage ? (
        <FormAlert tone="danger">{errorMessage}</FormAlert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <PasswordField
            label="Mật khẩu mới"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (fieldErrors.newPassword) setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
            }}
            error={fieldErrors.newPassword}
            placeholder="••••••••"
            required
          />
          <PasswordStrength password={newPassword} />
        </div>

        <PasswordField
          label="Xác nhận mật khẩu mới"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
          }}
          error={fieldErrors.confirmPassword}
          placeholder="••••••••"
          required
        />

        <Button
          type="submit"
          variant="gradient"
          className="w-full"
          disabled={loading || !accessToken}
          aria-disabled={loading || !accessToken}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Đang lưu mật khẩu…</span>
            </>
          ) : (
            <span>Đặt mật khẩu mới</span>
          )}
        </Button>
      </form>

      <p className="text-center text-body-sm text-fg-muted">
        <Link href="/dang-nhap" className="text-link font-medium hover:underline underline-offset-4">
          Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-fg-muted">Đang tải…</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
