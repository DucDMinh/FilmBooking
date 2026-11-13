"use client";

import Link from "next/link";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { cn } from "@/lib/utils";

/** Khách chưa đăng nhập bấm ghế (R-16, B13): dẫn tới đăng nhập, quay lại đúng suất qua `next`. */
export function LoginRequiredDialog({
  open,
  onOpenChange,
  next,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; next: string }>) {
  const query = `?next=${encodeURIComponent(sanitizeNext(next) ?? "/")}`;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Đăng nhập để chọn ghế</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn cần đăng nhập để giữ ghế và đặt vé. Sau khi đăng nhập, bạn sẽ quay lại đúng suất chiếu này.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Để sau</AlertDialogCancel>
          <Link href={`/dang-ky${query}`} className={cn(buttonVariants({ variant: "secondary" }))}>
            Tạo tài khoản
          </Link>
          <Link href={`/dang-nhap${query}`} className={cn(buttonVariants({ variant: "gradient" }))}>
            Đăng nhập
          </Link>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
