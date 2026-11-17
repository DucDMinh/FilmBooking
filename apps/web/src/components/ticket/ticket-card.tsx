import { Ticket } from "lucide-react";
import Link from "next/link";

import { DateTime } from "@/components/common/money";
import type { PaidOrderView } from "@/components/ticket/ticket-data";
import { TicketQr } from "@/components/ticket/ticket-qr";
import { cn } from "@/lib/utils";

const STATUS_LABEL = { paid: "Đã thanh toán", checked_in: "Đã check-in", affected: "Bị ảnh hưởng" } as const;

function StatusBadge({ status }: Readonly<{ status: PaidOrderView["status"] }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-caption font-semibold",
        status === "affected" ? "bg-danger-banner text-danger-strong" : "bg-surface-elevated text-fg-secondary",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function AffectedNotice({ hotline }: Readonly<{ hotline: string | null }>) {
  return (
    <p role="alert" className="rounded-md bg-danger-banner px-3 py-2 text-body-sm text-danger-strong">
      Suất đã bị huỷ — vui lòng liên hệ CSKH để được hoàn tiền{hotline ? `: ${hotline}` : ""}.
    </p>
  );
}

function OrderInfo({ order }: Readonly<{ order: PaidOrderView }>) {
  return (
    <div className="min-w-0 space-y-1">
      <StatusBadge status={order.status} />
      <p className="text-caption text-fg-muted">Mã đặt vé</p>
      <p className="tabular text-h3 font-extrabold tracking-wide">{order.bookingCode}</p>
      <p className="text-body font-semibold">{order.movieTitle}</p>
      <p className="text-body-sm text-fg-secondary">
        <DateTime value={order.startsAt} /> · {order.roomName}
      </p>
      <p className="text-body-sm text-fg-secondary">
        {order.cinemaName}
        {order.cinemaAddress ? ` — ${order.cinemaAddress}` : ""}
      </p>
      <p className="text-body-sm text-fg-secondary">
        Ghế: {order.tickets.map((t) => t.seatLabel).join(", ") || "—"} ({order.tickets.length} ghế)
      </p>
    </div>
  );
}

/** Thẻ vé rút gọn trong danh sách "Vé của tôi"; bấm để xem chi tiết. */
export function TicketCard({ order }: Readonly<{ order: PaidOrderView }>) {
  return (
    <div className="space-y-2">
      <Link
        href={`/ve/${encodeURIComponent(order.bookingCode)}`}
        className="flex min-h-11 items-start gap-4 rounded-lg border border-border-subtle bg-surface p-4 hover:bg-surface-elevated"
      >
        <Ticket className="mt-1 size-6 shrink-0 text-brand" aria-hidden="true" />
        <OrderInfo order={order} />
      </Link>
      {order.status === "affected" ? <AffectedNotice hotline={order.cinemaHotline} /> : null}
    </div>
  );
}

/** Chi tiết đơn: MỘT QR cho cả đơn (R-85). Đơn `affected` không hiện QR dùng được. */
export function TicketDetail({ order }: Readonly<{ order: PaidOrderView }>) {
  const affected = order.status === "affected";
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4 sm:p-6">
        <OrderInfo order={order} />
        {order.cinemaHotline ? (
          <p className="text-body-sm text-fg-secondary">Hotline rạp: {order.cinemaHotline}</p>
        ) : null}
        {affected ? (
          <AffectedNotice hotline={order.cinemaHotline} />
        ) : (
          <div className="space-y-1 rounded-md bg-surface-elevated px-3 py-2 text-body-sm text-fg-secondary">
            <p>Vé chỉ có giá trị khi quét tại rạp ghi trên vé. Vui lòng không chia sẻ mã QR cho người khác.</p>
            <p className="font-semibold">Vé không hỗ trợ huỷ / đổi / hoàn tiền.</p>
          </div>
        )}
      </div>
      {affected ? null : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-h3 font-bold">Mã QR đơn hàng</p>
          <TicketQr token={order.qrToken} label="Mã QR đơn hàng" />
          <p className="text-center text-body-sm text-fg-secondary">
            Một mã QR cho cả đơn — đưa cho nhân viên soát vé, không cần mã từng ghế.
          </p>
          {order.status === "checked_in" ? (
            <p className="text-body-sm font-semibold text-fg-muted">Đã soát vé</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
