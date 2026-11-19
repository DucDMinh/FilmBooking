"use client";

import {
  listAuditLogsQuerySchema,
  type AuditLogDto,
  type PagedDto,
} from "@filmbooking/shared/schemas/admin";
import type { AdminCinemaDto } from "@filmbooking/shared/schemas/catalog";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";

import { Field, PageHeader, TextField, useAdminMe } from "./form-utils";

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<AuditLogDto["action"], string> = {
  INSERT: "Thêm",
  UPDATE: "Sửa",
  DELETE: "Xoá",
};
const ACTION_TONE: Record<AuditLogDto["action"], "success" | "info" | "danger"> = {
  INSERT: "success",
  UPDATE: "info",
  DELETE: "danger",
};

const SELECT_CLASS =
  "h-11 w-full border border-border-input bg-transparent px-3 text-body-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

export interface AuditDiffRow {
  field: string;
  before: string;
  after: string;
}

const ABSENT = "-";

function formatValue(value: unknown): string {
  if (value === undefined) return ABSENT;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Diff before/after theo từng trường: chỉ liệt kê trường có khác biệt (INSERT: toàn bộ after; DELETE: toàn bộ before). */
export function diffAuditData(before: unknown, after: unknown): AuditDiffRow[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  return fields
    .filter((field) => JSON.stringify(b[field]) !== JSON.stringify(a[field]))
    .map((field) => ({ field, before: formatValue(b[field]), after: formatValue(a[field]) }));
}

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium" });

function AuditDiffSheet({ log, cinemaName, onClose }: Readonly<{ log: AuditLogDto; cinemaName: string; onClose: () => void }>) {
  const rows = diffAuditData(log.beforeData, log.afterData);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Giá trị trước / sau</SheetTitle>
          <SheetDescription>
            {ACTION_LABELS[log.action]} · {log.tableName} · {formatTime(log.occurredAt)} · {cinemaName}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4">
          {rows.length === 0 ? (
            <p className="text-body-sm text-fg-muted">Không có thay đổi giá trị được ghi nhận.</p>
          ) : (
            <table className="w-full text-small">
              <thead>
                <tr className="text-left text-fg-muted">
                  <th className="py-1 pr-2 font-semibold">Trường</th>
                  <th className="py-1 pr-2 font-semibold">Trước</th>
                  <th className="py-1 font-semibold">Sau</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field} className="border-t border-border-subtle align-top">
                    <td className="py-1.5 pr-2 font-mono">{row.field}</td>
                    <td className="break-all py-1.5 pr-2 font-mono text-danger-text">{row.before}</td>
                    <td className="break-all py-1.5 font-mono text-success">{row.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface Filters {
  cinemaId: string;
  actorId: string;
  tableName: string;
  action: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { cinemaId: "", actorId: "", tableName: "", action: "", from: "", to: "" };

const localToIso = (value: string): string | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
};

/** Filters -> query string hợp lệ theo schema API, hoặc lỗi theo field. Trường rỗng không gửi. */
export function buildAuditQuery(
  filters: Filters,
  page: number,
): { ok: true; query: string } | { ok: false; errors: Record<string, string> } {
  const parsed = listAuditLogsQuerySchema.safeParse({
    cinemaId: filters.cinemaId || undefined,
    actorId: filters.actorId.trim() || undefined,
    tableName: filters.tableName.trim() || undefined,
    action: filters.action || undefined,
    from: localToIso(filters.from),
    to: localToIso(filters.to),
    page,
    pageSize: PAGE_SIZE,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "_form")] ??= "Giá trị không hợp lệ";
    return { ok: false, errors };
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed.data)) if (value !== undefined) params.set(key, String(value));
  return { ok: true, query: params.toString() };
}

function AuditLogList({ cinemas }: Readonly<{ cinemas: readonly AdminCinemaDto[] }>) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedDto<AuditLogDto> | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const cinemaNames = new Map(cinemas.map((c) => [c.id, c.name]));
  const cinemaLabel = (id: string | null) => (id ? (cinemaNames.get(id) ?? id.slice(0, 8)) : "Toàn chuỗi");

  const load = useCallback(() => {
    const built = buildAuditQuery(applied, page);
    if (!built.ok) return;
    setFailed(false);
    setData(null);
    apiFetch<PagedDto<AuditLogDto>>(`/admin/audit-logs?${built.query}`, { cache: "no-store" })
      .then(setData)
      .catch(() => setFailed(true));
  }, [applied, page]);

  useEffect(load, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const built = buildAuditQuery(draft, 1);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    setPage(1);
    setApplied(draft);
  }

  /** Điền ID người thực hiện vào ô lọc và lọc ngay (Admin không có cách khác để lấy UUID). */
  function filterByActor(actorId: string) {
    setErrors({});
    setDraft((prev) => ({ ...prev, actorId }));
    setApplied((prev) => ({ ...prev, actorId }));
    setPage(1);
  }

  const set = (key: keyof Filters) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-3" noValidate>
        <Field id="audit-cinema" label="Rạp">
          <select id="audit-cinema" className={SELECT_CLASS} value={draft.cinemaId} onChange={(e) => set("cinemaId")(e.target.value)}>
            <option value="">Tất cả</option>
            {cinemas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <TextField id="audit-actor" label="Người thực hiện (ID)" value={draft.actorId} onChange={set("actorId")} error={errors.actorId} />
        <TextField id="audit-table" label="Đối tượng (tên bảng)" value={draft.tableName} onChange={set("tableName")} error={errors.tableName} hint="Ví dụ: showtimes" />
        <Field id="audit-action" label="Thao tác">
          <select id="audit-action" className={SELECT_CLASS} value={draft.action} onChange={(e) => set("action")(e.target.value)}>
            <option value="">Tất cả</option>
            {(Object.keys(ACTION_LABELS) as AuditLogDto["action"][]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>
        <TextField id="audit-from" label="Từ ngày" type="datetime-local" value={draft.from} onChange={set("from")} error={errors.from} />
        <TextField id="audit-to" label="Đến ngày" type="datetime-local" value={draft.to} onChange={set("to")} error={errors.to} />
        <div className="md:col-span-3">
          <Button type="submit">Lọc</Button>
        </div>
      </form>
      {failed ? (
        <ErrorState onRetry={load} />
      ) : data === null ? (
        <LoadingState />
      ) : data.items.length === 0 ? (
        <EmptyState title="Chưa có nhật ký" description="Không có bản ghi nào khớp bộ lọc." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Người thực hiện</TableHead>
                  <TableHead>Rạp</TableHead>
                  <TableHead>Thao tác</TableHead>
                  <TableHead>Đối tượng</TableHead>
                  <TableHead className="text-right">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatTime(log.occurredAt)}</TableCell>
                    <TableCell className="font-mono text-small">
                      {log.actorId ? (
                        <button
                          type="button"
                          className="min-h-11 underline decoration-dotted md:min-h-0"
                          title={`${log.actorId} - bấm để lọc theo người này`}
                          aria-label={`Lọc theo người thực hiện ${log.actorId}`}
                          onClick={() => filterByActor(log.actorId as string)}
                        >
                          {log.actorId.slice(0, 8)}
                        </button>
                      ) : (
                        "Hệ thống"
                      )}
                    </TableCell>
                    <TableCell>{cinemaLabel(log.cinemaId)}</TableCell>
                    <TableCell>
                      <Badge tone={ACTION_TONE[log.action]}>{ACTION_LABELS[log.action]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>{log.tableName}</div>
                      <div className="font-mono text-small text-fg-muted">{log.recordId?.slice(0, 8) ?? ABSENT}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Xem thay đổi bản ghi ${log.id}`}
                        onClick={() => setSelected(log)}
                      >
                        Xem
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-small text-fg-muted">
              Trang {data.page}/{totalPages} · {data.total} bản ghi
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Trước
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sau
              </Button>
            </div>
          </div>
        </>
      )}
      {selected ? (
        <AuditDiffSheet log={selected} cinemaName={cinemaLabel(selected.cinemaId)} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

/** Màn 28 (phần audit log) — R-107, chỉ Admin. Danh sách rạp lỗi -> ErrorState (không lọc theo tên sai). */
export function AuditLogAdminPage() {
  const { loading, role, failed: meFailed, retry } = useAdminMe();
  const [cinemas, setCinemas] = useState<AdminCinemaDto[] | null>(null);
  const [cinemasFailed, setCinemasFailed] = useState(false);
  const isAdmin = role === "ADMIN";

  const loadCinemas = useCallback(() => {
    setCinemasFailed(false);
    apiFetch<AdminCinemaDto[]>("/admin/cinemas", { cache: "no-store" })
      .then(setCinemas)
      .catch(() => setCinemasFailed(true));
  }, []);

  useEffect(() => {
    if (isAdmin) loadCinemas();
  }, [isAdmin, loadCinemas]);

  if (loading) return <LoadingState />;
  if (meFailed) return <ErrorState onRetry={retry} />;
  if (!isAdmin) return <EmptyState title="Không có quyền" description="Chỉ Admin được xem audit log." />;

  let body;
  if (cinemasFailed) body = <ErrorState onRetry={loadCinemas} />;
  else if (cinemas === null) body = <LoadingState />;
  else body = <AuditLogList cinemas={cinemas} />;

  return (
    <div>
      <PageHeader title="Audit log" description="Ai đã thay đổi gì, ở rạp nào, khi nào - kèm giá trị trước/sau." />
      {body}
    </div>
  );
}
