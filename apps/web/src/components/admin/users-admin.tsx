"use client";

import type { AdminUserDto, PagedDto } from "@filmbooking/shared/schemas/admin";
import type { AdminCinemaDto } from "@filmbooking/shared/schemas/catalog";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";

import { ConfirmActionDialog, type PendingAction } from "./confirm-action-dialog";
import { PageHeader, useAdminMe } from "./form-utils";
import { ManagerStaffPanel } from "./manager-staff-panel";
import { RoleAssignDialog, type AssignTarget } from "./role-assign-dialog";
import type { ScopeCinema } from "./use-admin-scope";

const PAGE_SIZE = 20;

/** Admin: tìm kiếm, khoá/mở khoá, cấp/gỡ Admin, gán vai trò theo rạp (R-105). */
function AdminUsersPanel({ selfId, cinemas }: Readonly<{ selfId: string; cinemas: readonly ScopeCinema[] }>) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedDto<AdminUserDto> | null>(null);
  const [failed, setFailed] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const cinemaNames = new Map(cinemas.map((c) => [c.id, c.name]));

  const load = useCallback(() => {
    setFailed(false);
    setData(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (applied) params.set("q", applied);
    apiFetch<PagedDto<AdminUserDto>>(`/admin/users?${params.toString()}`, { cache: "no-store" })
      .then(setData)
      .catch(() => setFailed(true));
  }, [applied, page]);

  useEffect(load, [load]);

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setApplied(query.trim());
  }

  async function confirm(action: PendingAction) {
    if (action.kind === "lock") {
      await apiFetch(`/admin/users/${action.user.id}/lock`, { method: "PATCH", json: { locked: !action.user.locked } });
      toast.success(action.user.locked ? "Đã mở khoá tài khoản" : "Đã khoá tài khoản");
    } else if (action.kind === "remove") {
      await apiFetch(`/admin/cinemas/${action.cinemaId}/staff/${action.userId}`, { method: "DELETE" });
      toast.success("Đã gỡ khỏi rạp");
    } else if (action.kind === "admin") {
      await apiFetch(`/admin/users/${action.user.id}/admin-role`, {
        method: "PATCH",
        json: { isAdmin: !action.user.isAdmin },
      });
      toast.success(action.user.isAdmin ? "Đã gỡ quyền Admin" : "Đã cấp quyền Admin");
    }
    load();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap gap-2" role="search">
        <Input
          aria-label="Tìm người dùng"
          placeholder="Email, tên hoặc số điện thoại"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
          className="max-w-sm"
        />
        <Button type="submit">Tìm kiếm</Button>
      </form>
      {failed ? (
        <ErrorState onRetry={load} />
      ) : data === null ? (
        <LoadingState />
      ) : data.items.length === 0 ? (
        <EmptyState title="Không có người dùng" description="Không tìm thấy tài khoản phù hợp." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Rạp được gán</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => {
                  const isSelf = user.id === selfId;
                  const name = user.email ?? user.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-semibold">{user.fullName ?? "-"}</div>
                        <div className="text-small text-fg-muted">{user.email ?? "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.isAdmin ? <Badge tone="brand">Admin</Badge> : null}
                          {user.locked ? <Badge tone="danger">Đã khoá</Badge> : <Badge tone="success">Hoạt động</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.assignments.length === 0 ? "-" : null}
                        <ul className="space-y-1">
                          {user.assignments.map((a) => {
                            const cinemaName = cinemaNames.get(a.cinemaId) ?? a.cinemaId.slice(0, 8);
                            return (
                              <li key={a.cinemaId} className="flex flex-wrap items-center gap-2">
                                <span>
                                  {cinemaName} ({a.role === "MANAGER" ? "Manager" : "Staff"})
                                </span>
                                <Button
                                  variant="ghost" className="shadow-none bg-transparent"
                                  size="sm"
                                  aria-label={`Gỡ ${name} khỏi ${cinemaName}`}
                                  onClick={() =>
                                    setPending({ kind: "remove", cinemaId: a.cinemaId, userId: user.id, who: name, cinemaName })
                                  }
                                >
                                  Gỡ khỏi rạp
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`Gán vai trò cho ${name}`}
                            onClick={() => setAssignTarget(user)}
                          >
                            Gán vai trò
                          </Button>
                          <Button
                            variant="ghost" className="shadow-none bg-transparent"
                            size="sm"
                            disabled={isSelf}
                            title={isSelf ? "Không thể tự khoá tài khoản của mình" : undefined}
                            aria-label={`${user.locked ? "Mở khoá" : "Khoá"} ${name}`}
                            onClick={() => setPending({ kind: "lock", user })}
                          >
                            {user.locked ? "Mở khoá" : "Khoá"}
                          </Button>
                          <Button
                            variant="ghost" className="shadow-none bg-transparent"
                            size="sm"
                            disabled={isSelf}
                            title={isSelf ? "Không thể tự gỡ quyền Admin của mình" : undefined}
                            aria-label={`${user.isAdmin ? "Gỡ quyền Admin" : "Cấp quyền Admin"} ${name}`}
                            onClick={() => setPending({ kind: "admin", user })}
                          >
                            {user.isAdmin ? "Gỡ Admin" : "Cấp Admin"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-small text-fg-muted">
              Trang {data.page}/{totalPages} · {data.total} tài khoản
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
      {assignTarget ? (
        <RoleAssignDialog
          open
          onOpenChange={(open) => !open && setAssignTarget(null)}
          viewerRole="ADMIN"
          cinemas={cinemas}
          user={assignTarget}
          onDone={load}
        />
      ) : null}
      <ConfirmActionDialog action={pending} onClose={() => setPending(null)} onConfirm={confirm} />
    </div>
  );
}

/** Màn 26 — Người dùng & phân quyền. Admin: toàn bộ; Manager: Staff rạp mình; Staff: không có quyền. */
export function UsersAdminPage() {
  const { loading, role, me, failed: meFailed, retry } = useAdminMe();
  const [cinemas, setCinemas] = useState<AdminCinemaDto[] | null>(null);
  const [cinemasFailed, setCinemasFailed] = useState(false);
  const allowed = role === "ADMIN" || role === "MANAGER";

  const loadCinemas = useCallback(() => {
    setCinemasFailed(false);
    apiFetch<AdminCinemaDto[]>("/admin/cinemas", { cache: "no-store" })
      .then(setCinemas)
      .catch(() => setCinemasFailed(true));
  }, []);

  useEffect(() => {
    if (allowed) loadCinemas();
  }, [allowed, loadCinemas]);

  if (loading) return <LoadingState />;
  if (meFailed || !me) return <ErrorState onRetry={retry} />;
  if (!allowed) {
    return <EmptyState title="Không có quyền" description="Chỉ Admin hoặc Quản lý rạp được xem trang này." />;
  }
  if (cinemasFailed) return <ErrorState onRetry={loadCinemas} />;
  if (cinemas === null) return <LoadingState />;

  const isAdmin = role === "ADMIN";
  const managed = new Set(me.cinemas.filter((c) => c.role === "MANAGER").map((c) => c.cinemaId));
  const scoped: ScopeCinema[] = cinemas
    .filter((c) => isAdmin || managed.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description={
          isAdmin
            ? "Tìm tài khoản, khoá/mở khoá, gán vai trò và rạp."
            : "Thêm hoặc gỡ nhân viên (Staff) của rạp bạn quản lý."
        }
      />
      {isAdmin ? <AdminUsersPanel selfId={me.id} cinemas={scoped} /> : <ManagerStaffPanel cinemas={scoped} />}
    </div>
  );
}
