"use client";

import type { CancelledShowtimeReportItemDto } from "@filmbooking/shared/schemas/report";
import { formatVnd } from "@filmbooking/shared/money";
import { formatVnDateTime } from "@filmbooking/shared/time";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useReport } from "./report-utils";
import type { ReportFilter } from "./revenue-report";

function CancelledRows({ rows }: Readonly<{ rows: readonly CancelledShowtimeReportItemDto[] }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Phim</TableHead>
          <TableHead>Rạp / phòng</TableHead>
          <TableHead>Giờ chiếu</TableHead>
          <TableHead className="text-right">Đơn ảnh hưởng</TableHead>
          <TableHead className="text-right">Đã đổi suất</TableHead>
          <TableHead className="text-right">Hoàn tiền thủ công</TableHead>
          <TableHead className="text-right">Chờ xử lý</TableHead>
          <TableHead className="text-right">Tiền đã hoàn</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.showtimeId}>
            <TableCell>{row.movieTitle}</TableCell>
            <TableCell>
              {row.cinemaName} · {row.roomName}
            </TableCell>
            <TableCell>{formatVnDateTime(new Date(row.startsAt))}</TableCell>
            <TableCell className="text-right">{row.totalAffectedOrders}</TableCell>
            <TableCell className="text-right">{row.exchangedOrders}</TableCell>
            <TableCell className="text-right">{row.refundedManualOrders}</TableCell>
            <TableCell className="text-right">{row.pendingOrders}</TableCell>
            <TableCell className="text-right">{formatVnd(row.totalRefundedAmount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Suất bị huỷ & đơn ảnh hưởng (R-119 lát MVP, AC-25: đơn refunded_manual nằm ở cột "Hoàn tiền thủ công"). */
export function CancelledShowtimesReport({ filter }: Readonly<{ filter: ReportFilter }>) {
  const state = useReport<CancelledShowtimeReportItemDto>(
    "/admin/reports/cancelled-showtimes",
    { cinemaId: filter.cinemaId, fromDate: filter.fromDate, toDate: filter.toDate },
    filter.enabled,
  );
  return (
    <section className="space-y-3" aria-label="Suất bị huỷ">
      <h2 className="text-h3 font-bold">Suất bị huỷ</h2>
      {state.status === "loading" && <LoadingState rows={2} />}
      {state.status === "error" && <ErrorState onRetry={state.retry} />}
      {state.status === "ready" &&
        (state.data.length === 0 ? (
          <EmptyState title="Không có suất bị huỷ" description="Không có suất chiếu nào bị huỷ trong kỳ này." />
        ) : (
          <CancelledRows rows={state.data} />
        ))}
    </section>
  );
}
