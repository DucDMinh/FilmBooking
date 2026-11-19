"use client";

import { addPasswordInputSchema } from "@filmbooking/shared/schemas/identity";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { HUD_LABEL } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/client";

/** Đặt mật khẩu lần đầu cho tài khoản đăng nhập bằng MXH (R-22) — POST /me/password. */
export function AddPasswordForm({ onSuccess }: Readonly<{ onSuccess: () => void }>) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = addPasswordInputSchema.safeParse({ password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Mật khẩu chưa hợp lệ.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setPending(true);
    try {
      await apiFetch("/me/password", { method: "POST", json: parsed.data });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-password" className={HUD_LABEL}>Mật khẩu mới</Label>
        <Input
          id="add-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          required
        />
        <p className="text-small text-fg-muted">Ít nhất 8 ký tự, gồm chữ hoa, chữ thường và chữ số.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-password-confirm" className={HUD_LABEL}>Nhập lại mật khẩu</Label>
        <Input
          id="add-password-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Đặt mật khẩu
      </Button>
    </form>
  );
}
