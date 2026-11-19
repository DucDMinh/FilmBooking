"use client";

import { Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function remainingSeconds(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Đồng hồ đếm ngược giữ ghế (R-61): tính theo expires_at của server, đồng bộ lại khi tab hiện lại.
 * Màu: >2' mint, ≤2' warning, ≤30s danger. Hết giờ gọi onExpire đúng 1 lần.
 */
export function HoldCountdown({
  expiresAt,
  onExpire,
  className,
}: Readonly<{ expiresAt: string; onExpire?: () => void; className?: string }>) {
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const remaining = remainingSeconds(expiresAt, now);

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [expiresAt]);

  useEffect(() => {
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  const tone =
    remaining <= 30
      ? "bg-danger-soft text-danger-text"
      : remaining <= 120
        ? "bg-warning-soft text-warning"
        : "bg-success-soft text-success";

  return (
    <div
      role="timer"
      aria-live={remaining === 60 ? "assertive" : "off"}
      className={cn("chamfer-sm inline-flex items-center gap-2 px-3.5 py-1.5 text-body-sm font-semibold", tone, className)}
    >
      <Timer className="size-4" aria-hidden="true" />
      <span>
        Giữ ghế trong <span className="font-mono font-bold tabular">{formatCountdown(remaining)}</span>
      </span>
    </div>
  );
}
