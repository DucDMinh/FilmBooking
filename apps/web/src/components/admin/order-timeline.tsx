import type { OrderStatusHistoryItemDto } from "@filmbooking/shared/schemas/orders";

import { DateTime } from "@/components/common/money";
import { Badge } from "@/components/ui/badge";

import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "./order-utils";

/** Timeline trạng thái đơn (R-103): cũ → mới, mỗi mốc có nhãn trạng thái, thời điểm và ghi chú (nếu có). */
export function OrderTimeline({ history }: Readonly<{ history: readonly OrderStatusHistoryItemDto[] }>) {
  if (history.length === 0) return <p className="text-body-sm text-fg-muted">Chưa có lịch sử trạng thái.</p>;
  return (
    <ol aria-label="Lịch sử trạng thái" className="space-y-4 border-l border-border-subtle pl-4">
      {history.map((item, index) => (
        <li key={`${item.timestamp}-${index}`} className="relative space-y-1">
          <span aria-hidden="true" className="absolute top-1.5 -left-[21px] size-2.5 bg-brand" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[item.status] ?? "neutral"}>{ORDER_STATUS_LABEL[item.status] ?? item.status}</Badge>
            <DateTime value={item.timestamp} className="text-small text-fg-muted" />
          </div>
          {item.note ? <p className="text-body-sm text-fg-secondary">{item.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
