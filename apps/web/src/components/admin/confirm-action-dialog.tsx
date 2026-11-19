"use client";

import type { AdminUserDto } from "@filmbooking/shared/schemas/admin";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";

export const errorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.";

export type PendingAction =
  | { kind: "lock"; user: AdminUserDto }
  | { kind: "admin"; user: AdminUserDto }
  | { kind: "remove"; cinemaId: string; userId: string; who: string; cinemaName: string };

function describeAction(action: PendingAction): { title: string; body: string; confirm: string } {
  if (action.kind === "remove") {
    return {
      title: "Gỡ khỏi rạp",
      body: `Gỡ ${action.who} khỏi ${action.cinemaName}? Người này sẽ mất quyền truy cập rạp.`,
      confirm: "Gỡ",
    };
  }
  const who = action.user.email ?? action.user.id;
  if (action.kind === "lock") {
    return action.user.locked
      ? { title: "Mở khoá tài khoản", body: `Mở khoá ${who}?`, confirm: "Mở khoá" }
      : { title: "Khoá tài khoản", body: `Khoá ${who}? Người này sẽ không đăng nhập được.`, confirm: "Khoá" };
  }
  return action.user.isAdmin
    ? { title: "Gỡ quyền Admin", body: `Gỡ quyền Admin của ${who}?`, confirm: "Gỡ quyền" }
    : { title: "Cấp quyền Admin", body: `Cấp quyền Admin toàn chuỗi cho ${who}?`, confirm: "Cấp quyền" };
}

/** Hộp xác nhận cho thao tác nhạy cảm. Chỉ đóng khi API thành công; lỗi hiện trong hộp. */
export function ConfirmActionDialog({
  action,
  onClose,
  onConfirm,
}: Readonly<{
  action: PendingAction | null;
  onClose: () => void;
  onConfirm: (action: PendingAction) => Promise<void>;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [action]);
  if (!action) return null;
  const text = describeAction(action);
  async function run(current: PendingAction) {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(current);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.body}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-small text-danger-text">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={() => run(action)} disabled={busy}>
            {busy ? "Đang xử lý..." : text.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
