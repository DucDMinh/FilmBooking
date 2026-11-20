"use client";

import { formatVnd } from "@filmbooking/shared";
import type { AffectedOrderDetailDto } from "@filmbooking/shared/schemas/cancellation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

import {
  canResendEmail,
  EMAIL_STATUS_LABEL,
  formatRefundDate,
  ORDER_STATUS_LABEL,
  refundMethodText,
  resendErrorMessage,
} from "./affected-orders-api";
import { EmailBadge } from "./affected-orders-list";
import { AffectedResolutionForm } from "./affected-resolution-form";
import { PageHeader } from "./form-utils";
import { formatVnDate, formatVnTime } from "./showtime-utils";

function Row({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-body-sm text-fg-muted">{label}</dt>
      <dd className="text-body-sm">{children}</dd>
    </div>
  );
}

export function AffectedOrderDetail({ orderId }: Readonly<{ orderId: string }>) {
  const [order, setOrder] = useState<AffectedOrderDetailDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resending, setResending] = useState(false);
  const resendInFlight = useRef(false);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setOrder(null);
    setFailed(false);
    apiFetch<AffectedOrderDetailDto>(`/admin/affected-orders/${orderId}`, { cache: "no-store" })
      .then((res) => active && setOrder(res))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [orderId, attempt]);

  async function resend() {
    if (resendInFlight.current) return;
    resendInFlight.current = true;
    setResending(true);
    try {
      await apiFetch(`/admin/affected-orders/${orderId}/resend-email`, { method: "POST" });
      toast.success("Đã đưa email vào hàng gửi lại");
      reload();
    } catch (error) {
      toast.error(resendErrorMessage(error));
    } finally {
      resendInFlight.current = false;
      setResending(false);
    }
  }

  if (failed) return <ErrorState onRetry={reload} />;
  if (!order) return <LoadingState />;

  const outbox = order.emailOutbox;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Đơn ${order.bookingCode}`}
        action={
          <Link href="/admin/don-bi-anh-huong" className="text-body-sm underline">
            ← Danh sách đơn bị ảnh hưởng
          </Link>
        }
      />
      <dl className="space-y-2 border border-border-subtle bg-surface p-4 md:p-6">
        <Row label="Trạng thái xử lý">
          <Badge tone={order.status === "affected" ? "danger" : "success"}>{ORDER_STATUS_LABEL[order.status]}</Badge>
        </Row>
        <Row label="Khách">
          {order.contactName ?? "-"} • {order.contactEmail ?? "-"} • {order.contactPhone ?? "-"}
        </Row>
        <Row label="Suất chiếu">
          {order.movieTitle} • {order.cinemaName} • {order.roomName} • {formatVnDate(order.showtimeStartsAt)}{" "}
          {formatVnTime(order.showtimeStartsAt)}
        </Row>
        <Row label="Ghế">{order.seatLabels.join(", ") || "-"}</Row>
        <Row label="Giá trị đơn">{formatVnd(order.totalAmount)}</Row>
        <Row label="Lý do huỷ">{order.cancelReason ?? "-"}</Row>
        {order.status === "refunded_manual" ? (
          <>
            <Row label="Số tiền đã hoàn">{order.refundedAmount === null ? "-" : formatVnd(order.refundedAmount)}</Row>
            <Row label="Phương thức hoàn">{refundMethodText(order.refundMethod)}</Row>
            <Row label="Ngày hoàn">{formatRefundDate(order.refundedAt)}</Row>
            <Row label="Mã giao dịch">{order.refundReference ?? "-"}</Row>
            <Row label="Ghi chú">{order.note ?? "-"}</Row>
          </>
        ) : null}
      </dl>

      <section className="space-y-3 border border-border-subtle bg-surface p-4 md:p-6">
        <h2 className="text-h3 font-bold">Email thông báo</h2>
        <div className="flex flex-wrap items-center gap-3">
          <EmailBadge status={order.emailStatus} />
          {outbox ? (
            <span className="text-body-sm text-fg-muted">
              {EMAIL_STATUS_LABEL[outbox.status]} • {outbox.attempts} lần thử
              {outbox.lastError ? ` • Lỗi: ${outbox.lastError}` : ""}
            </span>
          ) : null}
          {canResendEmail(order) ? (
            <Button variant="secondary" className="min-h-11" disabled={resending} onClick={resend}>
              {resending ? "Đang gửi…" : "Gửi lại email"}
            </Button>
          ) : null}
        </div>
      </section>

      {order.status === "affected" ? (
        <AffectedResolutionForm orderId={order.id} totalAmount={order.totalAmount} onResolved={reload} />
      ) : null}
    </div>
  );
}
