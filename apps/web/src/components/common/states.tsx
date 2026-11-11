"use client";

import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Trạng thái rỗng (design-spec §6): icon trong vòng tròn, tiêu đề, mô tả, tối đa 1 CTA. */
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
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-pill bg-surface-elevated text-fg-muted">
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <h2 className="text-h3 font-bold">{title}</h2>
      {description ? <p className="max-w-md text-body-sm text-fg-secondary">{description}</p> : null}
      {action}
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
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-danger-line bg-danger-soft px-4 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-8 text-danger" aria-hidden="true" />
      <h2 className="text-h3 font-bold">{title}</h2>
      <p className="max-w-md text-body-sm text-fg-secondary">{description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}

/** Khung chờ cùng hình khối nội dung thật; không spinner toàn trang. */
export function LoadingState({
  rows = 3,
  label = "Đang tải…",
  className,
}: Readonly<{ rows?: number; label?: string; className?: string }>) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}
