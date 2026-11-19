"use client";

import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import type { MeResponse } from "@filmbooking/shared/schemas/me";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";

import { CancelledShowtimesReport } from "./cancelled-showtimes-report";
import { PayosReconcileTable } from "./payos-reconcile-table";
import { defaultVnRange, defaultVnShowtimeRange } from "./report-utils";
import { RevenueReport, type ReportFilter } from "./revenue-report";
import { ALL_CINEMAS, resolveScope } from "./use-admin-scope";

type ScopeState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "forbidden" }
  | { status: "ready"; cinemaId: string | undefined; label: string };

/**
 * Phạm vi báo cáo: Admin = "Toàn chuỗi" (không gửi cinemaId) hoặc rạp trong `?cinema=`;
 * Manager luôn bị khoá vào một rạp mình làm MANAGER (chỉ STAFF thì không có quyền).
 * Chỉ là lọc hiển thị — API kiểm quyền thật.
 */
function useReportScope(): ScopeState {
  const raw = useSearchParams().get("cinema");
  const [state, setState] = useState<ScopeState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    Promise.all([
      apiFetch<MeResponse>("/me", { signal: controller.signal }),
      apiFetch<CinemaDto[]>("/cinemas", { signal: controller.signal }).catch(() => [] as CinemaDto[]),
    ])
      .then(([me, cinemas]) => {
        if (controller.signal.aborted) return;
        const names = new Map(cinemas.flatMap((c) => (c.id ? [[c.id, c.name] as const] : [])));
        const nameOf = (id: string) => names.get(id) ?? `Rạp ${id.slice(0, 8)}`;
        if (me.isAdmin) {
          const picked = raw && raw !== ALL_CINEMAS ? raw : undefined;
          setState({ status: "ready", cinemaId: picked, label: picked ? nameOf(picked) : "Toàn chuỗi" });
          return;
        }
        const managed = me.cinemas
          .filter((c) => c.role === "MANAGER")
          .map((c) => ({ id: c.cinemaId, name: nameOf(c.cinemaId) }));
        const found = managed.find((c) => c.id === resolveScope(raw, managed, false));
        setState(
          found
            ? { status: "ready", cinemaId: found.id, label: found.name }
            : { status: "forbidden" },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", retry });
      });
    return () => controller.abort();
  }, [raw, attempt, retry]);

  return state;
}

export function isValidRange(from: string, to: string): boolean {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  return isDate(from) && isDate(to) && from <= to;
}

function RangeFields({
  idPrefix,
  legend,
  hint,
  from,
  to,
  onChange,
}: Readonly<{
  idPrefix: string;
  legend: string;
  hint: string;
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}>) {
  return (
    <fieldset className="flex flex-wrap items-end gap-4">
      <legend className="mb-1 text-body-sm font-semibold">{legend}</legend>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-from`}>Từ ngày ({legend})</Label>
        <Input id={`${idPrefix}-from`} type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-to`}>Đến ngày ({legend})</Label>
        <Input id={`${idPrefix}-to`} type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} />
      </div>
      <p className="pb-2 text-body-sm text-fg-secondary">{hint}</p>
    </fieldset>
  );
}

export function ReportDashboard() {
  const scope = useReportScope();
  const [created, setCreated] = useState(() => defaultVnRange());
  const [held, setHeld] = useState(() => defaultVnShowtimeRange());
  const createdOk = isValidRange(created.from, created.to);
  const heldOk = isValidRange(held.from, held.to);

  if (scope.status === "loading") return <LoadingState rows={3} />;
  if (scope.status === "error") return <ErrorState onRetry={scope.retry} />;
  if (scope.status === "forbidden") {
    return <EmptyState title="Không có quyền xem báo cáo" description="Chỉ Quản lý rạp hoặc Admin được xem báo cáo." />;
  }

  const revenueFilter: ReportFilter = { cinemaId: scope.cinemaId, fromDate: created.from, toDate: created.to, enabled: createdOk };
  const showtimeFilter: ReportFilter = { cinemaId: scope.cinemaId, fromDate: held.from, toDate: held.to, enabled: heldOk };
  return (
    <div className="space-y-8">
      <p className="text-body-sm text-fg-secondary">
        Phạm vi: <strong>{scope.label}</strong> · ngày theo giờ Việt Nam
      </p>
      <RangeFields
        idPrefix="report-created"
        legend="Theo ngày tạo đơn"
        hint="Áp dụng cho doanh thu theo ngày."
        {...created}
        onChange={setCreated}
      />
      <RangeFields
        idPrefix="report-held"
        legend="Theo ngày chiếu"
        hint="Áp dụng cho bảng theo phim/suất và suất bị huỷ (mặc định gồm cả suất sắp chiếu)."
        {...held}
        onChange={setHeld}
      />
      {createdOk && heldOk ? (
        <>
          <RevenueReport filter={revenueFilter} showtimeFilter={showtimeFilter} />
          <PayosReconcileTable cinemaId={scope.cinemaId} />
          <CancelledShowtimesReport filter={showtimeFilter} />
        </>
      ) : (
        <p role="alert" className="text-body-sm text-danger-text">
          Khoảng ngày không hợp lệ: ngày bắt đầu phải trước hoặc bằng ngày kết thúc.
        </p>
      )}
    </div>
  );
}
