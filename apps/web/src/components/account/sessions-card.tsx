"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Phiên đăng nhập (R-15). `signOutOthers` chạy phía server (phiên nằm trong cookie HttpOnly)
 * và gọi `supabase.auth.signOut({ scope: "others" })`.
 */
export function SessionsCard({
  signOutOthers,
}: Readonly<{ signOutOthers: () => Promise<{ error?: string }> }>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      const result = await signOutOthers();
      if (result.error) toast.error(result.error);
      else toast.success("Đã đăng xuất khỏi các thiết bị khác.");
    } catch {
      toast.error("Đã có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <section aria-labelledby="sessions-title" className="rounded-lg border border-border-subtle bg-surface p-4 md:p-6">
      <h2 id="sessions-title" className="text-h3 font-bold">
        Phiên đăng nhập
      </h2>
      <p className="mt-1 text-body-sm text-fg-secondary">
        Thiết bị hiện tại luôn được giữ đăng nhập. Bạn có thể đăng xuất mọi thiết bị khác nếu nghi ngờ bị lộ tài khoản.
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="mt-4 border-danger-line text-danger">
            Đăng xuất khỏi các thiết bị khác
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đăng xuất khỏi các thiết bị khác?</AlertDialogTitle>
            <AlertDialogDescription>
              Mọi phiên đăng nhập khác của bạn sẽ bị kết thúc. Thiết bị này vẫn giữ đăng nhập.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              Đăng xuất
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
