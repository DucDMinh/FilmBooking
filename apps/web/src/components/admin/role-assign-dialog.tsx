"use client";

import { assignStaffSchema, type AdminUserDto, type StaffAssignmentRole } from "@filmbooking/shared/schemas/admin";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api/client";

import { Field, TextField } from "./form-utils";
import type { AdminRole } from "./nav-config";
import type { ScopeCinema } from "./use-admin-scope";

export const ASSIGNMENT_ROLE_LABELS: Record<StaffAssignmentRole, string> = {
  STAFF: "Nhân viên (Staff)",
  MANAGER: "Quản lý rạp (Manager)",
};

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-border-input bg-transparent px-3 text-body-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45";

/** AC-16 / R-105: Manager chỉ gán Staff; Admin gán được Staff hoặc Manager. Chỉ để ẩn UI — API vẫn trả 403. */
export function assignableRoles(viewer: AdminRole): StaffAssignmentRole[] {
  return viewer === "ADMIN" ? ["STAFF", "MANAGER"] : ["STAFF"];
}

export type AssignTarget = Pick<AdminUserDto, "id" | "email" | "assignments">;

/**
 * Gán/đổi vai trò nhân sự tại một rạp. Có `user` (Admin chọn từ danh sách) -> gửi `userId`;
 * không có -> nhập email. Đã có gán ở rạp đó -> PATCH (chỉ Admin), ngược lại POST.
 */
export function RoleAssignDialog({
  open,
  onOpenChange,
  viewerRole,
  cinemas,
  user,
  fixedCinemaId,
  onDone,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerRole: AdminRole;
  cinemas: readonly ScopeCinema[];
  user?: AssignTarget;
  /** Manager: rạp đang xem, không cho đổi. */
  fixedCinemaId?: string;
  onDone: () => void;
}>) {
  const roles = assignableRoles(viewerRole);
  const [email, setEmail] = useState("");
  const [cinemaId, setCinemaId] = useState(fixedCinemaId ?? cinemas[0]?.id ?? "");
  const [role, setRole] = useState<StaffAssignmentRole>("STAFF");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = user?.assignments.find((a) => a.cinemaId === cinemaId);
  const existingRole = existing?.role;

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setCinemaId(fixedCinemaId ?? cinemas[0]?.id ?? "");
    setError(null);
  }, [open, fixedCinemaId, cinemas]);

  // Vai trò chọn sẵn = vai trò hiện có ở rạp đang chọn, để bấm Lưu không vô tình hạ quyền.
  useEffect(() => {
    if (open) setRole(existingRole ?? "STAFF");
  }, [open, cinemaId, existingRole]);

  const unchanged = existingRole !== undefined && role === existingRole;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cinemaId) {
      setError("Vui lòng chọn rạp.");
      return;
    }
    const target = user ? { userId: user.id } : { email };
    const parsed = assignStaffSchema.safeParse({ ...target, role });
    if (!parsed.success) {
      setError(user ? "Dữ liệu không hợp lệ." : "Vui lòng nhập email hợp lệ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (existing && user) {
        await apiFetch(`/admin/cinemas/${cinemaId}/staff/${user.id}`, { method: "PATCH", json: { role } });
        toast.success("Đã đổi vai trò");
      } else {
        await apiFetch(`/admin/cinemas/${cinemaId}/staff`, { method: "POST", json: parsed.data });
        toast.success("Đã gán nhân sự");
      }
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{existing ? "Đổi vai trò" : "Gán vai trò"}</DialogTitle>
            <DialogDescription>
              {user ? (user.email ?? user.id) : "Nhập email của tài khoản đã đăng ký để thêm vào rạp."}
            </DialogDescription>
          </DialogHeader>
          {user ? null : (
            <TextField id="assign-email" label="Email" type="email" value={email} onChange={setEmail} required />
          )}
          <Field id="assign-cinema" label="Rạp" required>
            <select
              id="assign-cinema"
              className={SELECT_CLASS}
              value={cinemaId}
              disabled={fixedCinemaId !== undefined}
              onChange={(e) => setCinemaId(e.target.value)}
            >
              {cinemas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="assign-role" label="Vai trò" required>
            <select
              id="assign-role"
              className={SELECT_CLASS}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffAssignmentRole)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ASSIGNMENT_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={saving || unchanged}>
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
