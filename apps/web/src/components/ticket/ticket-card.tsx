import { Ticket } from "lucide-react";
import Link from "next/link";

import { DateTime } from "@/components/common/money";
import { Badge } from "@/components/ui/badge";
import type { PaidOrderView } from "@/components/ticket/ticket-data";
import { TicketQr } from "@/components/ticket/ticket-qr";

const STATUS_LABEL = { paid: "Đã thanh toán", checked_in: "Đã check-in", affected: "Bị ảnh hưởng" } as const;

function StatusBadge({ status }: Readonly<{ status: PaidOrderView["status"] }>) {
  return (
    <Badge tone={status === "affected" ? "danger" : "neutral"}>{STATUS_LABEL[status]}</Badge>
  );
}

function AffectedNotice({ hotline }: Readonly<{ hotline: string | null }>) {
  return (
    <p role="alert" className="border-l-[3px] border-danger bg-danger-banner px-3 py-2 text-body-sm text-danger-strong">
      Suất đã bị huỷ - vui lòng liên hệ CSKH để được hoàn tiền{hotline ? `: ${hotline}` : ""}.
    </p>
  );
}

function OrderInfo({ order }: Readonly<{ order: PaidOrderView }>) {
  return (
    <div className="min-w-0 space-y-1">
      <StatusBadge status={order.status} />
      <p className="text-caption text-fg-muted">Mã đặt vé</p>
      <p className="w-fit border border-dashed border-brand-line px-2 py-0.5 font-mono text-h3 font-bold tracking-wide text-brand tabular">
        {order.bookingCode}
      </p>
      <p className="font-heading text-body font-bold">{order.movieTitle}</p>
      <p className="text-body-sm text-fg-secondary">
        <DateTime value={order.startsAt} /> · {order.roomName}
      </p>
      <p className="text-body-sm text-fg-secondary">
        {order.cinemaName}
        {order.cinemaAddress ? ` - ${order.cinemaAddress}` : ""}
      </p>
      <p className="text-body-sm text-fg-secondary">
        Ghế: {order.tickets.map((t) => t.seatLabel).join(", ") || "-"} ({order.tickets.length} ghế)
      </p>
    </div>
  );
}

function ComboList({
  combos,
  showPickupNote,
}: Readonly<{ combos: PaidOrderView["combos"]; showPickupNote: boolean }>) {
  return (
    <div className="space-y-1 border-t border-border pt-3">
      <p className="text-caption text-fg-muted">Bắp nước & Combo</p>
      <ul className="text-body-sm font-semibold">
        {combos.map((combo, index) => (
          <li key={`${combo.name}-${index}`}>
            {combo.name} × {combo.quantity}
          </li>
        ))}
      </ul>
      {showPickupNote ? (
        <p className="text-body-sm text-fg-secondary">
          Nhận bắp nước tại quầy bắp nước của rạp bằng mã QR hoặc mã vé này.
        </p>
      ) : null}
    </div>
  );
}

/** Thẻ vé rút gọn trong danh sách "Vé của tôi"; bấm để xem chi tiết. */
export function TicketCard({ order }: Readonly<{ order: PaidOrderView }>) {
  return (
    <div className="space-y-2">
      <Link
        href={`/ve/${encodeURIComponent(order.bookingCode)}`}
        className="group frame block min-h-11 hover:[--frame-color:var(--color-brand)]"
      >
        <div className="frame-in flex items-start gap-4 p-4 transition-colors group-hover:bg-surface-elevated group-focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)]">
          <Ticket className="mt-1 size-6 shrink-0 text-brand" aria-hidden="true" />
          <OrderInfo order={order} />
        </div>
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
      <div className="frame">
        <div className="frame-in space-y-3 p-4 sm:p-6">
          <OrderInfo order={order} />
          {order.cinemaHotline ? (
            <p className="text-body-sm text-fg-secondary">Hotline rạp: {order.cinemaHotline}</p>
          ) : null}
          {order.combos.length > 0 ? <ComboList combos={order.combos} showPickupNote={!affected} /> : null}
          {affected ? (
            <AffectedNotice hotline={order.cinemaHotline} />
          ) : (
            <div className="space-y-1 bg-surface-elevated px-3 py-2 text-body-sm text-fg-secondary">
              <p>Vé chỉ có giá trị khi quét tại rạp ghi trên vé. Vui lòng không chia sẻ mã QR cho người khác.</p>
              <p className="font-semibold">Vé không hỗ trợ huỷ / đổi / hoàn tiền.</p>
            </div>
          )}
        </div>
      </div>
      {affected ? null : (
        // Vé điện tử: chamfer-lg ngoài (p-5 > cut 24px nên viền đứt không chạm đường cắt), viền nét đứt bên trong.
        // Overlay toàn màn hình của TicketQr được portal ra <body>, không bị clip-path này cắt.
        <div className="chamfer-lg bg-surface p-5">
          <div className="flex flex-col items-center gap-2 border border-dashed border-input p-4">
            <p className="font-heading text-h3 font-bold">Mã QR đơn hàng</p>
            <TicketQr token={order.qrToken} label="Mã QR đơn hàng" />
            <p className="text-center text-body-sm text-fg-secondary">
              Một mã QR cho cả đơn - đưa cho nhân viên soát vé, không cần mã từng ghế.
            </p>
            {order.status === "checked_in" ? (
              <p className="text-body-sm font-semibold text-fg-muted">Đã soát vé</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
