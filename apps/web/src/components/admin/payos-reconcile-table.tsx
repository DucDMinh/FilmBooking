"use client";

import type { PayosReconciliationItemDto } from "@filmbooking/shared/schemas/report";
import { formatVnd } from "@filmbooking/shared/money";
import { formatVnDateTime } from "@filmbooking/shared/time";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useReport } from "./report-utils";

const DISCREPANCY: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
  AMOUNT_MISMATCH: { label: "Lệch tiền", tone: "danger" },
  NEEDS_MANUAL_REVIEW: { label: "Cần xử lý tay", tone: "warning" },
  STATUS_MISMATCH: { label: "Lệch trạng thái", tone: "danger" },
  PENDING_EXPIRED: { label: "Chờ quá hạn", tone: "warning" },
  OTHER_DISCREPANCY: { label: "Khác", tone: "neutral" },
};

function ReconcileRows({ rows }: Readonly<{ rows: readonly PayosReconciliationItemDto[] }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã PayOS</TableHead>
          <TableHead>Rạp</TableHead>
          <TableHead className="text-right">Đã thanh toán</TableHead>
          <TableHead className="text-right">Giá trị đơn</TableHead>
          <TableHead className="text-right">Chênh lệch</TableHead>
          <TableHead>Thanh toán / đơn</TableHead>
          <TableHead>Loại</TableHead>
          <TableHead>Tạo lúc</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const kind = DISCREPANCY[row.discrepancyType] ?? { label: row.discrepancyType, tone: "neutral" as const };
          return (
            <TableRow key={row.paymentId}>
              <TableCell>{row.orderCode}</TableCell>
              <TableCell>{row.cinemaName}</TableCell>
              <TableCell className="text-right">{formatVnd(row.paymentAmount)}</TableCell>
              <TableCell className="text-right">{formatVnd(row.orderTotalAmount)}</TableCell>
              <TableCell className="text-right">{formatVnd(row.paymentAmount - row.orderTotalAmount)}</TableCell>
              <TableCell>
                {row.paymentStatus} / {row.orderStatus}
              </TableCell>
              <TableCell>
                <Badge tone={kind.tone}>{kind.label}</Badge>
              </TableCell>
              <TableCell>{formatVnDateTime(new Date(row.paymentCreatedAt))}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Đối soát PayOS (R-116): chỉ các giao dịch lệch/chờ quá hạn; không lọc theo ngày (API không hỗ trợ). */
export function PayosReconcileTable({ cinemaId }: Readonly<{ cinemaId?: string }>) {
  const state = useReport<PayosReconciliationItemDto>("/admin/reports/payos-reconciliation", { cinemaId });
  return (
    <section className="space-y-3" aria-label="Đối soát PayOS">
      <h2 className="text-h3 font-bold">Đối soát PayOS</h2>
      {state.status === "loading" && <LoadingState rows={2} />}
      {state.status === "error" && <ErrorState onRetry={state.retry} />}
      {state.status === "ready" &&
        (state.data.length === 0 ? (
          <EmptyState title="Không có giao dịch lệch" description="Mọi thanh toán đều khớp với đơn hàng." />
        ) : (
          <ReconcileRows rows={state.data} />
        ))}
    </section>
  );
}
