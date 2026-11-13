"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "./auth-ui";

interface ResendConfirmButtonProps {
  email: string;
  className?: string;
  onSuccess?: () => void;
}

/**
 * Nút gửi lại email xác nhận (AC-02, R-06):
 * Sau khi bấm thành công -> vô hiệu hoá và đếm ngược 60 giây.
 * Bấm trong lúc đếm tuyệt đối không gọi API.
 */
export function ResendConfirmButton({
  email,
  className,
  onSuccess,
}: Readonly<ResendConfirmButtonProps>) {
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleResend = async () => {
    if (countdown > 0 || loading || !email) return;

    setLoading(true);
    setFeedback(null);
    try {
      await apiFetch<{ status: string }>("/auth/resend-confirmation", {
        method: "POST",
        json: { email: email.trim().toLowerCase() },
      });
      setCountdown(60);
      setFeedback({
        tone: "success",
        text: "Đã gửi lại email xác nhận. Vui lòng kiểm tra hộp thư của bạn.",
      });
      onSuccess?.();
    } catch (err) {
      setFeedback({
        tone: "error",
        text: errorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = countdown > 0 || loading || !email.trim();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleResend}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className={className}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>Đang gửi lại…</span>
          </>
        ) : countdown > 0 ? (
          <span>Có thể gửi lại sau {countdown}s</span>
        ) : (
          <span>Gửi lại email xác nhận</span>
        )}
      </Button>

      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`text-small ${feedback.tone === "error" ? "text-danger" : "text-success"}`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
