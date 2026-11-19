"use client";

import type { MovieShowtimeReportItemDto, RevenueReportItemDto } from "@filmbooking/shared/schemas/report";
import { formatVnd } from "@filmbooking/shared/money";
import { formatVnDateTime } from "@filmbooking/shared/time";
import { useMemo, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { formatReportDate, useReport, type ReportState } from "./report-utils";

export interface ReportFilter {
  cinemaId?: string;
  fromDate: string;
  toDate: string;
  enabled: boolean;
}

interface DayTotal {
  date: string;
  netRevenue: number;
  orders: number;
  tickets: number;
}

/** Gộp các dòng (ngày x rạp x kênh) thành tổng theo ngày, tăng dần theo ngày. */
export function aggregateByDay(rows: readonly RevenueReportItemDto[]): DayTotal[] {
  const byDate = new Map<string, DayTotal>();
  for (const row of rows) {
    const day = byDate.get(row.reportDate) ?? { date: row.reportDate, netRevenue: 0, orders: 0, tickets: 0 };
    day.netRevenue += row.netRevenue;
    day.orders += row.totalOrders;
    day.tickets += row.totalTickets;
    byDate.set(row.reportDate, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function RevenueBarChart({ days }: Readonly<{ days: readonly DayTotal[] }>) {
  const max = Math.max(...days.map((d) => d.netRevenue), 1);
  return (
    <div className="overflow-x-auto border border-border-subtle bg-surface p-3">
      <div
        role="img"
        aria-label={`Biểu đồ doanh thu thuần theo ngày, ${days.length} ngày, cao nhất ${formatVnd(max)}`}
        className="flex h-40 items-end gap-1"
        style={{ minWidth: `${days.length * 14}px` }}
      >
        {days.map((day) => (
          <div
            key={day.date}
            title={`${formatReportDate(day.date)}: ${formatVnd(day.netRevenue)}`}
            className="min-w-2.5 flex-1 bg-chart-1"
            style={{ height: `${Math.max((day.netRevenue / max) * 100, day.netRevenue > 0 ? 2 : 0)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function RevenueByDay({ rows }: Readonly<{ rows: readonly RevenueReportItemDto[] }>) {
  const days = useMemo(() => aggregateByDay(rows), [rows]);
  if (days.length === 0) {
    return <EmptyState title="Chưa có doanh thu" description="Không có đơn đã thanh toán trong kỳ này." />;
  }
  const total = days.reduce((sum, d) => sum + d.netRevenue, 0);
  return (
    <div className="space-y-3">
      <p className="text-body">
        Tổng doanh thu thuần: <strong data-testid="revenue-total">{formatVnd(total)}</strong>
      </p>
      <RevenueBarChart days={days} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ngày</TableHead>
            <TableHead className="text-right">Đơn</TableHead>
            <TableHead className="text-right">Vé</TableHead>
            <TableHead className="text-right">Doanh thu thuần</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...days].reverse().map((day) => (
            <TableRow key={day.date}>
              <TableCell>{formatReportDate(day.date)}</TableCell>
              <TableCell className="text-right">{day.orders}</TableCell>
              <TableCell className="text-right">{day.tickets}</TableCell>
              <TableCell className="text-right">{formatVnd(day.netRevenue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ShowtimeTable({ rows }: Readonly<{ rows: readonly MovieShowtimeReportItemDto[] }>) {
  if (rows.length === 0) {
    return <EmptyState title="Chưa có suất chiếu" description="Không có suất chiếu trong kỳ này." />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Phim</TableHead>
          <TableHead>Rạp / phòng</TableHead>
          <TableHead>Giờ chiếu</TableHead>
          <TableHead className="text-right">Ghế bán</TableHead>
          <TableHead className="text-right">Lấp đầy</TableHead>
          <TableHead className="text-right">Doanh thu thuần</TableHead>
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
            <TableCell className="text-right">
              {row.soldSeats}/{row.roomCapacity}
            </TableCell>
            <TableCell className="text-right">{Math.round(row.occupancyRate)}%</TableCell>
            <TableCell className="text-right">{formatVnd(row.netRevenue)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Section<T>({
  title,
  state,
  children,
}: Readonly<{ title: string; state: ReportState<T>; children: (rows: readonly T[]) => ReactNode }>) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-h3 font-bold">{title}</h2>
      {state.status === "loading" && <LoadingState rows={2} />}
      {state.status === "error" && <ErrorState onRetry={state.retry} />}
      {state.status === "ready" && children(state.data)}
    </section>
  );
}

/** Doanh thu theo kỳ (R-112) + bảng theo phim/suất/rạp (R-113). */
export function RevenueReport({
  filter,
  showtimeFilter,
}: Readonly<{ filter: ReportFilter; showtimeFilter: ReportFilter }>) {
  const revenue = useReport<RevenueReportItemDto>(
    "/admin/reports/revenue",
    { cinemaId: filter.cinemaId, fromDate: filter.fromDate, toDate: filter.toDate },
    filter.enabled,
  );
  const showtimes = useReport<MovieShowtimeReportItemDto>(
    "/admin/reports/showtimes",
    { cinemaId: showtimeFilter.cinemaId, fromDate: showtimeFilter.fromDate, toDate: showtimeFilter.toDate },
    showtimeFilter.enabled,
  );
  return (
    <div className="space-y-8">
      <Section title="Doanh thu theo ngày" state={revenue}>
        {(rows) => <RevenueByDay rows={rows} />}
      </Section>
      <Section title="Theo phim, suất, rạp" state={showtimes}>
        {(rows) => <ShowtimeTable rows={rows} />}
      </Section>
    </div>
  );
}
