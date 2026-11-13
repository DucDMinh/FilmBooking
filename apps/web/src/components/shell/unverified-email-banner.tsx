"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

export interface UnverifiedEmailBannerProps {
  email?: string | null;
  emailConfirmed?: boolean;
}

const COUNTDOWN_SECONDS = 60;

/**
 * Banner nhắc xác nhận email dưới header (design-spec §5.1, B11; R-05, R-06, AC-01, AC-02).
 * Chỉ hiển thị khi người dùng đã đăng nhập nhưng emailConfirmed === false.
 */
export function UnverifiedEmailBanner({
  email,
  emailConfirmed,
}: Readonly<UnverifiedEmailBannerProps>) {
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  if (!email || emailConfirmed !== false) {
    return null;
  }

  const handleResend = async () => {
    if (countdown > 0 || isSending) return;
    setIsSending(true);
    try {
      await apiFetch<{ status: string }>("/auth/resend-confirmation", {
        method: "POST",
        json: { email },
      });
      setCountdown(COUNTDOWN_SECONDS);
      toast.success("Đã gửi lại email xác nhận. Vui lòng kiểm tra hộp thư của bạn.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể gửi lại email xác nhận";
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Thông báo xác nhận email"
      className="border-b border-warning-line bg-warning-soft px-4 py-2.5 text-warning"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4 md:px-2">
        <div className="flex items-center gap-2 text-body-sm leading-normal">
          <AlertCircle className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Xác nhận email để đặt vé. Đã gửi liên kết tới{" "}
            <strong className="font-semibold text-fg">{email}</strong>.
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={countdown > 0 || isSending}
          onClick={handleResend}
          className="min-h-11 border-warning-line bg-surface/60 text-warning hover:bg-surface hover:text-fg sm:min-h-9"
        >
          {isSending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              <span>Đang gửi…</span>
            </>
          ) : countdown > 0 ? (
            `Gửi lại sau ${countdown}s`
          ) : (
            "Gửi lại email"
          )}
        </Button>
      </div>
    </div>
  );
}
