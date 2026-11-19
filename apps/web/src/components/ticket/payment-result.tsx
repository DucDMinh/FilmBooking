"use client";

import type { PaymentStatusDto } from "@filmbooking/shared/schemas/payment";
import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";

export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 120_000;

type Phase = "waiting" | "failed" | "review" | "timeout" | "error";

function phaseOf(status: PaymentStatusDto["status"]): Phase | "paid" {
  if (status === "PAID") return "paid";
  if (status === "EXPIRED" || status === "CANCELLED") return "failed";
  if (status === "NEEDS_MANUAL_REVIEW") return "review";
  return "waiting";
}

const CONTACT_HINT = "Nếu tiền đã bị trừ nhưng chưa thấy vé, vui lòng liên hệ rạp kèm mã đơn hàng để được hỗ trợ.";
const PERMANENT_ERROR_STATUSES = new Set([400, 403, 404]);

function HomeButton() {
  return (
    <Button asChild variant="secondary">
      <Link href="/">Về trang chủ</Link>
    </Button>
  );
}

function Outcome({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={description}
      action={<div className="flex flex-wrap justify-center gap-2">{children}</div>}
    />
  );
}

/**
 * Màn "Đang xác nhận thanh toán" (R-79). Trạng thái chỉ lấy từ API payment-status,
 * KHÔNG đọc query string PayOS gắn vào returnUrl. Khi PAID → refresh để server render vé;
 * nếu server chưa đọc ra vé thì vẫn tiếp tục poll cho tới hết thời gian chờ.
 */
export function PaymentResult({
  orderId,
  showtimeId,
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS,
}: Readonly<{ orderId: string; showtimeId?: string | null; intervalMs?: number; timeoutMs?: number }>) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("waiting");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      let next: Phase | "paid" = "waiting";
      try {
        const result = await apiFetch<PaymentStatusDto>(`/bookings/${orderId}/payment-status`);
        next = phaseOf(result.status);
      } catch (err) {
        // 400/403/404: đơn không hợp lệ hoặc không phải của bạn — chờ thêm cũng vô ích.
        if (err instanceof ApiError && PERMANENT_ERROR_STATUSES.has(err.status)) next = "error";
        // Lỗi mạng/5xx tạm thời: thử lại cho tới khi hết thời gian chờ.
      }
      if (stopped) return;
      if (next === "paid") router.refresh();
      else if (next !== "waiting") {
        setPhase(next);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        setPhase("timeout");
        return;
      }
      timer = setTimeout(() => void poll(), intervalMs);
    }

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, intervalMs, timeoutMs, router]);

  if (phase === "waiting") {
    return (
      <div
        role="status"
        className="frame"
      >
        <div className="frame-in flex flex-col items-center gap-3 px-4 py-10 text-center">
          <Loader2 className="size-8 animate-spin text-brand motion-reduce:animate-none" aria-hidden="true" />
          <h1 className="text-h2 font-bold uppercase">Đang xác nhận thanh toán</h1>
          <p className="max-w-md text-body-sm text-fg-secondary">
            Vui lòng chờ trong giây lát và không đóng trang này. Vé sẽ hiển thị ngay khi thanh toán được xác nhận.
          </p>
        </div>
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <Outcome
        title="Thanh toán không thành công"
        description="Giao dịch đã bị huỷ hoặc hết hạn, ghế đã được nhả. Bạn có thể chọn ghế lại."
      >
        <Button asChild>
          <Link href={showtimeId ? `/dat-ve/${showtimeId}` : "/lich-chieu"}>
            {showtimeId ? "Chọn lại ghế" : "Chọn suất chiếu"}
          </Link>
        </Button>
        <HomeButton />
      </Outcome>
    );
  }
  if (phase === "error") {
    return (
      <Outcome title="Không xem được đơn hàng này" description="Đơn không tồn tại hoặc không thuộc tài khoản của bạn.">
        <Button asChild>
          <Link href="/ve">Vé của tôi</Link>
        </Button>
        <HomeButton />
      </Outcome>
    );
  }
  if (phase === "review") {
    return (
      <Outcome title="Đơn hàng đang được kiểm tra" description={`Chúng tôi cần kiểm tra thủ công giao dịch của bạn. ${CONTACT_HINT}`}>
        <Button asChild>
          <Link href="/ve">Vé của tôi</Link>
        </Button>
        <HomeButton />
      </Outcome>
    );
  }
  return (
    <Outcome
      title="Chưa nhận được xác nhận thanh toán"
      description={`Hệ thống vẫn chưa ghi nhận thanh toán của bạn. ${CONTACT_HINT}`}
    >
      <Button asChild>
        <Link href="/ve">Vé của tôi</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href={`/dat-ve/don/${orderId}/xac-nhan`}>Quay lại đơn hàng</Link>
      </Button>
      <HomeButton />
    </Outcome>
  );
}
