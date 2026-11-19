"use client";

import type { StaffAssignmentDto } from "@filmbooking/shared/schemas/admin";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";

import { ConfirmActionDialog, type PendingAction } from "./confirm-action-dialog";
import { ASSIGNMENT_ROLE_LABELS, RoleAssignDialog } from "./role-assign-dialog";
import type { ScopeCinema } from "./use-admin-scope";

/** Manager: thêm/bớt Staff của rạp mình (R-105). Dòng Manager không có nút gỡ (API cũng trả 403). */
export function ManagerStaffPanel({ cinemas }: Readonly<{ cinemas: readonly ScopeCinema[] }>) {
  const [cinemaId, setCinemaId] = useState(cinemas[0]?.id ?? "");
  const [staff, setStaff] = useState<StaffAssignmentDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const cinemaName = cinemas.find((c) => c.id === cinemaId)?.name ?? "rạp này";

  const load = useCallback(() => {
    if (!cinemaId) return;
    setFailed(false);
    setStaff(null);
    apiFetch<StaffAssignmentDto[]>(`/admin/cinemas/${cinemaId}/staff`, { cache: "no-store" })
      .then(setStaff)
      .catch(() => setFailed(true));
  }, [cinemaId]);

  useEffect(load, [load]);

  async function confirm(action: PendingAction) {
    if (action.kind !== "remove") return;
    await apiFetch(`/admin/cinemas/${action.cinemaId}/staff/${action.userId}`, { method: "DELETE" });
    toast.success("Đã gỡ nhân sự");
    load();
  }

  if (cinemas.length === 0) {
    return <EmptyState title="Chưa có rạp" description="Bạn chưa quản lý rạp nào." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {cinemas.length > 1 ? (
          <label className="space-y-1.5 text-body-sm font-semibold">
            Rạp
            <select
              className="block h-11 border border-border-input bg-transparent px-3 text-body-sm font-normal"
              value={cinemaId}
              onChange={(e) => setCinemaId(e.target.value)}
            >
              {cinemas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button onClick={() => setAdding(true)}>Thêm nhân viên</Button>
      </div>
      {failed ? (
        <ErrorState onRetry={load} />
      ) : staff === null ? (
        <LoadingState />
      ) : staff.length === 0 ? (
        <EmptyState title="Chưa có nhân sự" description="Thêm nhân viên bằng email tài khoản đã đăng ký." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhân sự</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.userId}>
                  <TableCell>
                    <div className="font-semibold">{s.fullName ?? "-"}</div>
                    <div className="text-small text-fg-muted">{s.email ?? s.userId}</div>
                  </TableCell>
                  <TableCell>{ASSIGNMENT_ROLE_LABELS[s.role]}</TableCell>
                  <TableCell className="text-right">
                    {s.role === "STAFF" ? (
                      <Button
                        variant="ghost" className="shadow-none bg-transparent"
                        size="sm"
                        aria-label={`Gỡ ${s.email ?? s.userId}`}
                        onClick={() =>
                          setPending({ kind: "remove", cinemaId, userId: s.userId, who: s.email ?? s.userId, cinemaName })
                        }
                      >
                        Gỡ
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <RoleAssignDialog
        open={adding}
        onOpenChange={setAdding}
        viewerRole="MANAGER"
        cinemas={cinemas}
        fixedCinemaId={cinemaId}
        onDone={load}
      />
      <ConfirmActionDialog action={pending} onClose={() => setPending(null)} onConfirm={confirm} />
    </div>
  );
}
