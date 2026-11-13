"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export interface ChangePasswordFormProps {
  userEmail: string;
}

/**
 * Form đổi mật khẩu (design-spec §16, R-14).
 * Yêu cầu xác thực mật khẩu hiện tại trước khi cập nhật mật khẩu mới qua Supabase updateUser.
 */
export function ChangePasswordForm({ userEmail }: Readonly<ChangePasswordFormProps>) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!currentPassword) {
      errors.currentPassword = "Vui lòng nhập mật khẩu hiện tại";
    }

    if (!newPassword) {
      errors.newPassword = "Vui lòng nhập mật khẩu mới";
    } else if (newPassword.length < 8) {
      errors.newPassword = "Mật khẩu mới phải có tối thiểu 8 ký tự";
    }

    if (newPassword && currentPassword && newPassword === currentPassword) {
      errors.newPassword = "Mật khẩu mới không được trùng với mật khẩu hiện tại";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Vui lòng xác nhận mật khẩu mới";
    } else if (newPassword && confirmPassword !== newPassword) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validate()) return;
    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabase();

      // 1. Kiểm tra mật khẩu cũ bằng cách thử xác thực
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (signInError || !signInData.session) {
        setFieldErrors((prev) => ({
          ...prev,
          currentPassword: "Mật khẩu hiện tại không chính xác",
        }));
        setErrorMessage("Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.");
        return;
      }

      // 2. Cập nhật mật khẩu mới
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setErrorMessage(updateError.message || "Không thể cập nhật mật khẩu mới.");
        return;
      }

      toast.success("Đổi mật khẩu thành công. Chúng tôi đã gửi email thông báo.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFieldErrors({});
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Đã xảy ra lỗi khi đổi mật khẩu";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border-subtle bg-surface">
      <CardHeader>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <CardDescription>
          Mật khẩu mới phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và chữ số.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage ? (
            <div
              role="alert"
              className="rounded-md border border-danger-line bg-danger-soft p-3 text-body-sm font-medium text-danger"
            >
              {errorMessage}
            </div>
          ) : null}

          {/* Mật khẩu hiện tại */}
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (fieldErrors.currentPassword) {
                    setFieldErrors((prev) => ({ ...prev, currentPassword: "" }));
                  }
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.currentPassword)}
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted hover:text-fg"
                aria-label={showCurrentPassword ? "Ẩn mật khẩu hiện tại" : "Hiện mật khẩu hiện tại"}
              >
                {showCurrentPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.currentPassword ? (
              <p role="alert" className="text-small text-danger">
                {fieldErrors.currentPassword}
              </p>
            ) : null}
          </div>

          {/* Mật khẩu mới */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (fieldErrors.newPassword) {
                    setFieldErrors((prev) => ({ ...prev, newPassword: "" }));
                  }
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted hover:text-fg"
                aria-label={showNewPassword ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
              >
                {showNewPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.newPassword ? (
              <p role="alert" className="text-small text-danger">
                {fieldErrors.newPassword}
              </p>
            ) : null}
          </div>

          {/* Xác nhận mật khẩu mới */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
                }
              }}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword ? (
              <p role="alert" className="text-small text-danger">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Đang cập nhật…</span>
                </>
              ) : (
                "Cập nhật mật khẩu"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
