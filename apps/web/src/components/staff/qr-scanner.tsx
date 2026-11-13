"use client";

import { useEffect, useId, useRef, useState } from "react";

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  /** Tạm dừng nhận mã (đang gọi API / đang hiện kết quả). */
  paused?: boolean;
}

/**
 * Camera quét QR. html5-qrcode chạm DOM/camera nên chỉ import động ở client.
 * Không có quyền camera / thiết bị → hiện thông báo, trang vẫn dùng được bằng ô nhập mã.
 */
export function QrScanner({ onScan, paused = false }: Readonly<QrScannerProps>) {
  const elementId = useId().replace(/:/g, "");
  const [status, setStatus] = useState<"starting" | "ready" | "unavailable">("starting");
  const handlers = useRef({ onScan, paused });

  useEffect(() => {
    handlers.current = { onScan, paused };
  });

  useEffect(() => {
    let cancelled = false;
    let stop: (() => Promise<void>) | null = null;

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(elementId);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (!handlers.current.paused) handlers.current.onScan(text);
          },
          () => undefined,
        );
        if (cancelled) {
          await scanner.stop().catch(() => undefined);
          return;
        }
        stop = () => scanner.stop();
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }

    void start();
    return () => {
      cancelled = true;
      void stop?.().catch(() => undefined);
    };
  }, [elementId]);

  return (
    <div className="space-y-2">
      <div
        id={elementId}
        className={`aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface ${status === "unavailable" ? "hidden" : ""}`}
      />
      <p className="text-body-sm text-fg-secondary" role="status">
        {status === "starting" && "Đang bật camera…"}
        {status === "ready" && "CAMERA SẴN SÀNG"}
        {status === "unavailable" &&
          "Không dùng được camera (chưa cấp quyền hoặc không có thiết bị). Hãy nhập mã vé bên dưới."}
      </p>
    </div>
  );
}
