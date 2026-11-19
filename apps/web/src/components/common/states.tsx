// Cố ý KHÔNG có "use client": module không dùng hook/handler riêng, nên dùng được cả từ server page
// lẫn client component. Thêm "use client" sẽ khiến server page truyền `icon={Film}` (function) → lỗi
// "Functions cannot be passed directly to Client Components" (500 khi danh sách rỗng).
import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Trạng thái rỗng (design-spec §6, §16.3): icon 32px trong ô chamfer, tiêu đề, mô tả, tối đa 1 CTA. Khung chamfer 2 lớp. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: Readonly<{
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn("frame", className)}>
      <div className="frame-in flex flex-col items-center gap-3 px-4 py-10 text-center">
        <span className="chamfer-md flex size-14 items-center justify-center bg-surface-elevated text-fg-muted">
          <Icon className="size-8" aria-hidden="true" />
        </span>
        <h2 className="text-h3 font-bold">{title}</h2>
        {description ? <p className="max-w-md text-body-sm text-fg-secondary">{description}</p> : null}
        {action}
      </div>
    </div>
  );
}

/** Lỗi tải dữ liệu: role=alert để trình đọc màn hình đọc ngay; nút "Thử lại" khi có onRetry. */
export function ErrorState({
  title = "Không tải được dữ liệu",
  description = "Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.",
  onRetry,
  className,
}: Readonly<{ title?: string; description?: string; onRetry?: () => void; className?: string }>) {
  return (
    <div role="alert" className={cn("frame [--frame-color:var(--color-danger-line)]", className)}>
      <div className="frame-in flex flex-col items-center gap-3 bg-danger-soft! px-4 py-10 text-center">
        <span className="chamfer-md flex size-14 items-center justify-center bg-danger-banner text-danger-text">
          <AlertTriangle className="size-8" aria-hidden="true" />
        </span>
        <h2 className="text-h3 font-bold">{title}</h2>
        <p className="max-w-md text-body-sm text-fg-secondary">{description}</p>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Khung chờ cùng hình khối nội dung thật; không spinner toàn trang. Shimmer opacity do Skeleton lo (tắt khi reduced-motion). */
export function LoadingState({
  rows = 3,
  label = "Đang tải…",
  className,
}: Readonly<{ rows?: number; label?: string; className?: string }>) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
