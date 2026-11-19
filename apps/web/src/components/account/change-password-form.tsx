"use client";

import { checkPasswordPolicy, PASSWORD_ISSUE_MESSAGES } from "@filmbooking/shared/password-policy";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { changePasswordAction } from "@/app/auth/actions";
import { HUD_LABEL } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ChangePasswordFormProps {
  userEmail?: string;
}

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
}

function PasswordInputField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  disabled,
}: Readonly<PasswordInputProps>) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={HUD_LABEL}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted hover:text-fg"
          aria-label={show ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
        >
          {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Form đổi mật khẩu (design-spec §16, R-02, R-14).
 * Sử dụng Server Action để xác thực mật khẩu cũ qua POST /auth/login (chống bypass lockout/rate-limit)
 * và kiểm tra chính sách mật khẩu checkPasswordPolicy.
 */
export function ChangePasswordForm(props: Readonly<ChangePasswordFormProps>) {
  void props;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = "Vui lòng nhập mật khẩu hiện tại";

    if (!newPassword) {
      errors.newPassword = "Vui lòng nhập mật khẩu mới";
    } else {
      const issues = checkPasswordPolicy(newPassword);
      const firstIssue = issues[0];
      if (firstIssue) {
        errors.newPassword = PASSWORD_ISSUE_MESSAGES[firstIssue];
      } else if (newPassword === currentPassword) {
        errors.newPassword = "Mật khẩu mới không được trùng với mật khẩu hiện tại";
      }
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
      const result = await changePasswordAction(currentPassword, newPassword);
      if (result.error) {
        setErrorMessage(result.error);
        if (result.error.toLowerCase().includes("mật khẩu hiện tại")) {
          setFieldErrors((prev) => ({ ...prev, currentPassword: result.error! }));
        }
        return;
      }

      toast.success("Đổi mật khẩu thành công.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFieldErrors({});
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Đã có lỗi xảy ra khi đổi mật khẩu.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border bg-surface">
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
              className="border border-danger-line bg-danger-soft p-3 text-body-sm font-medium text-danger-text"
            >
              {errorMessage}
            </div>
          ) : null}

          <PasswordInputField
            id="current-password"
            label="Mật khẩu hiện tại"
            value={currentPassword}
            onChange={(val) => {
              setCurrentPassword(val);
              if (fieldErrors.currentPassword) setFieldErrors((prev) => ({ ...prev, currentPassword: "" }));
            }}
            error={fieldErrors.currentPassword}
            autoComplete="current-password"
            disabled={isSubmitting}
          />

          <PasswordInputField
            id="new-password"
            label="Mật khẩu mới"
            value={newPassword}
            onChange={(val) => {
              setNewPassword(val);
              if (fieldErrors.newPassword) setFieldErrors((prev) => ({ ...prev, newPassword: "" }));
            }}
            error={fieldErrors.newPassword}
            autoComplete="new-password"
            disabled={isSubmitting}
          />

          <PasswordInputField
            id="confirm-password"
            label="Xác nhận mật khẩu mới"
            value={confirmPassword}
            onChange={(val) => {
              setConfirmPassword(val);
              if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
            }}
            error={fieldErrors.confirmPassword}
            autoComplete="new-password"
            disabled={isSubmitting}
          />

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
