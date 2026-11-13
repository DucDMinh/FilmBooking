"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { GENERIC_ERROR_MESSAGE } from "@/lib/api/error-messages";
import { cn } from "@/lib/utils";
import { checkPasswordPolicy, passwordStrength, type PasswordIssue } from "@filmbooking/shared/password-policy";

/** Thông điệp cho người dùng từ lỗi bất kỳ (ApiError đã map tiếng Việt). */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE;
}

const ALERT_STYLES = {
  danger: "border-danger-line bg-danger-soft",
  info: "border-info-line bg-info-soft",
  success: "border-success-line bg-success-soft",
} as const;

/** Khung thông báo: danger/info dùng role=alert (đọc ngay), success dùng role=status (aria-live polite). */
export function FormAlert({
  tone,
  children,
  className,
}: Readonly<{ tone: keyof typeof ALERT_STYLES; children: ReactNode; className?: string }>) {
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={cn("rounded-md border px-3 py-2.5 text-body-sm text-fg", ALERT_STYLES[tone], className)}
    >
      {children}
    </div>
  );
}

type FieldProps = Omit<ComponentProps<typeof Input>, "id"> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  labelAside?: ReactNode;
};

/** Nhãn hiển thị + input + lỗi liên kết bằng aria-describedby / aria-invalid. */
export function AuthField({ label, error, hint, labelAside, className, ...inputProps }: Readonly<FieldProps>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={className}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-small text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ô mật khẩu có nút hiện/ẩn (aria-label, touch 44px). */
export function PasswordField(props: Readonly<Omit<FieldProps, "type">>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <AuthField {...props} type={visible ? "text" : "password"} className={cn("pr-12", props.className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={visible}
        className="absolute right-0 bottom-0 flex size-11 items-center justify-center rounded-sm text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring md:size-10"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const CHECKLIST: ReadonlyArray<{ label: string; failedBy: PasswordIssue[] }> = [
  { label: "8–72 ký tự", failedBy: ["TOO_SHORT", "TOO_LONG"] },
  { label: "Có chữ hoa", failedBy: ["MISSING_UPPERCASE"] },
  { label: "Có chữ thường", failedBy: ["MISSING_LOWERCASE"] },
  { label: "Có chữ số", failedBy: ["MISSING_DIGIT"] },
];
const SEGMENT_COLORS = ["bg-danger", "bg-warning", "bg-warning", "bg-success"] as const;

/** Thanh độ mạnh 4 đoạn + checklist realtime (R-02). Chỉ là gợi ý UI; server vẫn kiểm bắt buộc. */
export function PasswordStrength({ password }: Readonly<{ password: string }>) {
  const level = passwordStrength(password);
  const issues = checkPasswordPolicy(password);
  return (
    <div className="space-y-2" data-testid="password-strength">
      <div className="flex gap-1" aria-hidden="true">
        {SEGMENT_COLORS.map((color, index) => (
          <span
            key={color + index}
            className={cn("h-1.5 flex-1 rounded-pill", index < level ? color : "bg-surface-control")}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-small">
        {CHECKLIST.map(({ label, failedBy }) => {
          const ok = password.length > 0 && !failedBy.some((issue) => issues.includes(issue));
          return (
            <li key={label} className={ok ? "text-success" : "text-fg-muted"}>
              <span aria-hidden="true">{ok ? "✓" : "○"} </span>
              {label}
              <span className="sr-only">{ok ? " (đạt)" : " (chưa đạt)"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Chuẩn hoá nơi dùng chung: ô trống/độ dài/luật mật khẩu cho form đăng ký & đặt lại. */
export function passwordFieldError(password: string): string | null {
  return checkPasswordPolicy(password).length > 0
    ? "Mật khẩu 8–72 ký tự, gồm chữ hoa, chữ thường và chữ số."
    : null;
}
