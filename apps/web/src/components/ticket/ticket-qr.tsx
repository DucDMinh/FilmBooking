"use client";

import { Maximize2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

/** Giữ màn hình sáng khi mở QR toàn màn hình (R-87); trình duyệt không hỗ trợ thì bỏ qua. */
function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } })
      .wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    wakeLock
      .request("screen")
      .then((s) => {
        if (cancelled) void s.release().catch(() => undefined);
        else sentinel = s;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

function FullscreenTicket({
  token,
  label,
  onClose,
}: Readonly<{ token: string; label: string; onClose: () => void }>) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useScreenWakeLock(true);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vé toàn màn hình ${label}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-4 text-neutral-900"
    >
      <p className="text-h3 font-bold">{label}</p>
      <QRCodeSVG value={token} size={304} level="M" role="img" aria-label="Mã QR vé" style={{ maxWidth: "100%" }} />
      <Button ref={closeRef} variant="secondary" onClick={onClose}>
        <X aria-hidden="true" /> Đóng
      </Button>
    </div>
  );
}

/**
 * QR chỉ mã hoá qr_token (không PII — R-85). Nền trắng để máy quét đọc được cả ở dark mode.
 * Nút "Mở vé toàn màn hình" bật overlay nền trắng, QR lớn, giữ màn hình sáng.
 */
export function TicketQr({ token, label }: Readonly<{ token: string; label: string }>) {
  const [fullscreen, setFullscreen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setFullscreen(false);
    openerRef.current?.focus();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="inline-block rounded-md bg-white p-3" data-testid="ticket-qr" data-qr-value={token}>
        <QRCodeSVG value={token} size={240} level="M" role="img" aria-label="Mã QR vé" style={{ maxWidth: "100%" }} />
      </div>
      <Button ref={openerRef} variant="secondary" onClick={() => setFullscreen(true)}>
        <Maximize2 aria-hidden="true" /> Mở vé toàn màn hình
      </Button>
      {fullscreen ? <FullscreenTicket token={token} label={label} onClose={close} /> : null}
    </div>
  );
}
