"use client";

import { Heart, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface FavoriteButtonProps {
  /** UUID của rạp trong hệ thống (dùng cho API PUT/DELETE /me/favorites/:cinemaId). */
  cinemaId?: string;
  /** Mã rạp viết hoa (ví dụ CG, LB). */
  cinemaCode?: string;
  /** Tên rạp (dùng cho aria-label và thông báo). */
  cinemaName?: string;
  /** Trạng thái yêu thích ban đầu (từ server profile). */
  initialFavorite?: boolean;
  /** Đã đăng nhập chưa (được truyền từ Server Component hoặc session). */
  isAuthenticated?: boolean;
  /** Hiển thị nhãn chữ bên cạnh icon. */
  showLabel?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

/**
 * Nút đánh dấu rạp yêu thích (R-16, R-31).
 * - Nếu chưa đăng nhập: bấm nút chuyển hướng sang /dang-nhap?next=... (R-16).
 * - Nếu đã đăng nhập: gọi API PUT /me/favorites/:cinemaId hoặc DELETE /me/favorites/:cinemaId.
 */
export function FavoriteButton({
  cinemaId,
  cinemaName = "rạp",
  initialFavorite = false,
  isAuthenticated = false,
  showLabel = false,
  variant = "secondary",
  size = "icon",
  className,
}: Readonly<FavoriteButtonProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isPending, startTransition] = useTransition();

  const label = isFavorite ? `Bỏ yêu thích ${cinemaName}` : `Yêu thích ${cinemaName}`;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // R-16: Chưa đăng nhập bấm nút yêu thích -> chuyển hướng đăng nhập kèm next param
    if (!isAuthenticated) {
      const nextUrl = pathname ? `/dang-nhap?next=${encodeURIComponent(pathname)}` : "/dang-nhap";
      router.push(nextUrl);
      return;
    }

    if (!cinemaId) {
      toast.info("Không có mã định danh rạp để lưu yêu thích.");
      return;
    }

    startTransition(async () => {
      const targetState = !isFavorite;
      const method = targetState ? "PUT" : "DELETE";

      try {
        await apiFetch(`/me/favorites/${cinemaId}`, { method });
        setIsFavorite(targetState);
        toast.success(
          targetState
            ? `Đã thêm ${cinemaName} vào rạp yêu thích`
            : `Đã xoá ${cinemaName} khỏi rạp yêu thích`,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          const nextUrl = pathname ? `/dang-nhap?next=${encodeURIComponent(pathname)}` : "/dang-nhap";
          router.push(nextUrl);
          return;
        }
        const msg = error instanceof Error ? error.message : "Không thể cập nhật rạp yêu thích";
        toast.error(msg);
      }
    });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={label}
      aria-pressed={isFavorite}
      disabled={isPending}
      onClick={handleClick}
      className={cn("group min-h-11 min-w-11 transition-all", className)}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
      ) : (
        <Heart
          className={cn(
            "size-4 transition-colors",
            isFavorite
              ? "fill-brand text-brand"
              : "text-fg-secondary group-hover:text-brand",
          )}
          aria-hidden="true"
        />
      )}
      {showLabel ? (
        <span className="text-body-sm font-semibold">
          {isFavorite ? "Đã yêu thích" : "Yêu thích"}
        </span>
      ) : null}
    </Button>
  );
}
