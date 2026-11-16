"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { signOutAction } from "@/app/auth/actions";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Nút Đăng xuất dùng chung cho khu vực nội bộ (/admin, /staff).
 * Action xoá cookie HttpOnly phía server; sau đó `replace` để Back không quay lại trang đã đăng nhập
 * và `refresh` để bỏ cache RSC của phiên cũ.
 */
export function SignOutButton({
  variant = "ghost",
  size = "default",
  className,
}: Readonly<Pick<ButtonProps, "variant" | "size" | "className">>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    try {
      const result = await signOutAction();
      if (result.error) {
        toast.error(result.error);
        setPending(false);
        return;
      }
      router.replace("/dang-nhap");
      router.refresh();
    } catch {
      toast.error("Đăng xuất thất bại. Vui lòng thử lại.");
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      aria-label={pending ? "Đang đăng xuất" : "Đăng xuất"}
      onClick={() => void handleSignOut()}
    >
      <LogOut aria-hidden="true" />
      <span>{pending ? "Đang đăng xuất…" : "Đăng xuất"}</span>
    </Button>
  );
}
