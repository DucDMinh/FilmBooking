"use client";

import { Loader2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HUD_LABEL } from "@/components/auth/auth-ui";
import { ApiError, apiFetch } from "@/lib/api/client";

export interface VoucherInputProps {
  orderId: string;
  /** Mã đang áp dụng (nếu có). */
  appliedCode: string | null;
  /** Gọi sau khi áp/gỡ thành công để trang tải lại tóm tắt (giá do server chốt). */
  onChanged: () => void;
}

/** Ô nhập voucher (R-90, R-92, R-94); lỗi hiển thị thông điệp tiếng Việt theo mã lỗi API. */
export function VoucherInput({ orderId, appliedCode, onChanged }: Readonly<VoucherInputProps>) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(request: () => Promise<unknown>, clear: boolean) {
    setBusy(true);
    setError(null);
    try {
      await request();
      if (clear) setCode("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  const apply = () =>
    run(() => apiFetch(`/bookings/${orderId}/voucher`, { method: "POST", json: { code: code.trim() } }), true);
  const remove = () => run(() => apiFetch(`/bookings/${orderId}/voucher`, { method: "DELETE" }), false);

  if (appliedCode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 border-l-[3px] border-success bg-success-soft px-3 py-2 text-body-sm text-success">
          <span>
            Đã áp dụng mã <strong>{appliedCode}</strong>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy} aria-label="Gỡ mã giảm giá">
            <X aria-hidden="true" />
            Gỡ
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) void apply();
      }}
    >
      <Label htmlFor="voucher-code" className={HUD_LABEL}>Mã giảm giá</Label>
      <div className="flex gap-2">
        <Input
          id="voucher-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Nhập mã giảm giá"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "voucher-error" : undefined}
        />
        <Button type="submit" variant="secondary" disabled={busy || !code.trim()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Áp dụng
        </Button>
      </div>
      {error ? (
        <p id="voucher-error" role="alert" className="text-body-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </form>
  );
}
