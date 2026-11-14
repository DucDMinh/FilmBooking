"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { z } from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { MeResponse } from "@filmbooking/shared/schemas/me";

import { resolveAdminRole, type AdminRole } from "./nav-config";

export type FieldErrors = Record<string, string>;

/** Thông điệp tiếng Việt theo loại lỗi zod (message gốc của zod/API là tiếng Anh). */
function issueMessage(code: string | undefined): string {
  if (code === "invalid_type") return "Vui lòng nhập giá trị hợp lệ";
  if (code === "too_small") return "Giá trị quá nhỏ hoặc để trống";
  if (code === "too_big") return "Giá trị quá lớn";
  return "Giá trị không hợp lệ";
}

/** Lỗi zod phía client -> lỗi theo field (path đầu tiên, ví dụ `genres.0` -> `genres`). */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    errors[key] ??= issueMessage(issue.code);
  }
  return errors;
}

/** Lỗi 400 VALIDATION_ERROR của API (`details.issues[{path}]`) -> lỗi theo field. */
export function serverFieldErrors(error: ApiError): FieldErrors {
  const issues = error.details?.issues;
  if (!Array.isArray(issues)) return {};
  const errors: FieldErrors = {};
  for (const issue of issues as Array<{ path?: unknown }>) {
    const key = typeof issue.path === "string" && issue.path ? (issue.path.split(".")[0] ?? "_form") : "_form";
    errors[key] ??= "Giá trị không hợp lệ";
  }
  return errors;
}

/**
 * Lỗi ghi (POST/PATCH) -> lỗi theo field theo contract thật của API:
 * 400 `details.issues[].path`; 400 `details.provinceCode` (tỉnh/thành không tồn tại);
 * 409 CONFLICT (unique slug/code) -> `conflictField`.
 */
export function writeErrorToFields(error: unknown, conflictField: { field: string; message: string }): FieldErrors {
  if (!(error instanceof ApiError)) return { _form: "Đã có lỗi xảy ra. Vui lòng thử lại sau." };
  if (error.code === "CONFLICT") return { [conflictField.field]: conflictField.message };
  if (error.details && typeof error.details.provinceCode === "string") {
    return { provinceCode: "Tỉnh/thành không tồn tại" };
  }
  const fields = serverFieldErrors(error);
  return Object.keys(fields).length > 0 ? fields : { _form: error.message };
}

export const emptyToNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

export const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

/** Ô số: rỗng -> undefined (zod báo thiếu / để API dùng mặc định). */
export const parseNumber = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

export function Field({
  id,
  label,
  error,
  hint,
  required,
  className,
  children,
}: Readonly<{
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-small text-fg-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  type = "text",
  className,
  inputMode,
  disabled,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  type?: string;
  className?: string;
  inputMode?: "numeric" | "decimal" | "text";
  disabled?: boolean;
}>) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <Input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </Field>
  );
}

export function FormSection({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="space-y-4 rounded-lg border border-border-subtle bg-surface p-4 md:p-6">
      <h2 className="text-h3 font-bold">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: Readonly<{ title: string; description?: string; action?: ReactNode }>) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-h1 font-heavy">{title}</h1>
        {description ? <p className="mt-1 text-body-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export interface AdminMeState {
  loading: boolean;
  role: AdminRole | null;
  me: MeResponse | null;
  failed: boolean;
  /** Tải lại /me sau lỗi tạm thời. */
  retry: () => void;
}

/** Vai trò hiệu lực của người xem (chỉ để ẩn/hiện UI; API vẫn là lớp quyền thật). */
export function useAdminMe(): AdminMeState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<AdminMeState, "retry">>({ loading: true, role: null, me: null, failed: false });
  const retry = useCallback(() => {
    setState({ loading: true, role: null, me: null, failed: false });
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    let active = true;
    apiFetch<MeResponse>("/me", { cache: "no-store" })
      .then((me) => active && setState({ loading: false, role: resolveAdminRole(me), me, failed: false }))
      .catch(() => active && setState({ loading: false, role: null, me: null, failed: true }));
    return () => {
      active = false;
    };
  }, [attempt]);
  return { ...state, retry };
}
