// Cố ý KHÔNG có "use client" (giống states.tsx): dùng trực tiếp trong `loading.tsx` của server route.
// Skeleton hiện tức thì khi điều hướng (NFR-20, CR-016): opacity luôn 1, không `Scrub`, không spinner toàn trang.
import type { ReactNode } from "react";

import { MovieGrid } from "@/components/catalog/movie-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Vỏ skeleton của một trang: đúng MỘT vùng `role="status"` mỗi trang (các khối con đều `aria-hidden`),
 * nhãn sr-only để trình đọc màn hình biết trang đang tải. Không chứa chữ/số giả.
 */
export function PageSkeleton({
  label = "Đang tải nội dung…",
  className,
  children,
}: Readonly<{ label?: string; className?: string; children: ReactNode }>) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-8", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Khung tiêu đề section: nhãn hud, tiêu đề, vạch, mô tả tuỳ chọn (cùng nhịp với SectionHeading). */
export function SectionHeadSkeleton({
  withKicker = false,
  withDescription = false,
}: Readonly<{ withKicker?: boolean; withDescription?: boolean }>) {
  return (
    <div className="space-y-3">
      {withKicker ? <Skeleton className="h-3 w-28" /> : null}
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-1 w-24" />
      {withDescription ? <Skeleton className="h-4 w-96 max-w-full" /> : null}
    </div>
  );
}

/** Hàng chip/tab/ô lọc nằm ngang, tự xuống dòng ở màn hẹp. */
export function ChipRowSkeleton({
  count = 3,
  chipClassName = "h-11 w-40",
}: Readonly<{ count?: number; chipClassName?: string }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn("chamfer-md", chipClassName)} />
      ))}
    </div>
  );
}

/** Lưới poster dùng chính `MovieGrid` (4 / 3 / 2 cột) nên số cột khớp lưới thật; thẻ cao như MovieCard (poster 2:3 + chân thẻ). */
export function MovieGridSkeleton({ count = 8 }: Readonly<{ count?: number }>) {
  return (
    <MovieGrid>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="frame">
          <div className="frame-in flex flex-col">
            <Skeleton className="aspect-[2/3] w-full rounded-none" />
            <div className="space-y-2 border-t border-border px-3 py-3 sm:px-4 sm:pb-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="chamfer-sm h-6 w-24" />
            </div>
          </div>
        </div>
      ))}
    </MovieGrid>
  );
}

/** Lưới thẻ rạp 1 / 2 / 3 cột. Mặc định gap như trang chủ; /rap thật dùng gap-6 ở mọi cỡ nên truyền `gapClassName`. */
export function CinemaGridSkeleton({
  count = 3,
  gapClassName = "gap-4 md:gap-6",
}: Readonly<{ count?: number; gapClassName?: string }>) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3", gapClassName)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="frame h-full">
          <div className="frame-in flex h-full flex-col justify-between gap-4 p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="chamfer-sm h-5 w-16" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="flex items-center justify-between border-t border-border-subtle pt-3">
              <Skeleton className="chamfer-md h-9 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Khối hero trang chủ: cao như hero thật để phần dưới không bị đẩy xuống khi dữ liệu về (CLS). */
export function HomeHeroSkeleton() {
  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col justify-end gap-4 border-b border-border bg-linear-to-br from-surface-elevated via-chrome to-bg p-5 md:-mt-8 md:min-h-[calc(100svh-78px)] md:p-6">
      <Skeleton className="h-3 w-28 bg-surface-control" />
      <Skeleton className="h-12 w-3/4 max-w-xl bg-surface-control" />
      <Skeleton className="h-12 w-1/2 max-w-md bg-surface-control" />
      <Skeleton className="chamfer-md mt-4 h-14 w-full max-w-4xl bg-surface-control" />
    </div>
  );
}

/** Chi tiết phim: poster 2:3 bên trái, thông tin bên phải (cùng cột với trang thật). */
export function DetailHeroSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div className="frame">
          <Skeleton className="frame-in aspect-[2/3] w-full rounded-none" />
        </div>
        <Skeleton className="chamfer-md h-11 w-full" />
      </div>
      <div className="space-y-6">
        <ChipRowSkeleton count={3} chipClassName="h-6 w-20" />
        <Skeleton className="h-10 w-4/5" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-5 w-40 max-w-full" />
          <Skeleton className="h-5 w-40 max-w-full" />
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="chamfer-md h-12 w-full sm:w-52" />
      </div>
    </div>
  );
}

/** Danh sách hàng bảng/thẻ cao 56px (design-spec §6 "hàng bảng 56px"); đổi `rowClassName` khi hàng cao hơn. */
export function ListRowsSkeleton({
  rows = 4,
  rowClassName = "h-14",
}: Readonly<{ rows?: number; rowClassName?: string }>) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn("w-full", rowClassName)} />
      ))}
    </div>
  );
}

/** Khung panel có viền (frame) chứa các dòng chữ; dùng cho thẻ tổng kết/thông tin. */
export function PanelSkeleton({ lines = 4, children }: Readonly<{ lines?: number; children?: ReactNode }>) {
  return (
    <div className="frame">
      <div className="frame-in space-y-3 p-4 sm:p-6">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className={cn("h-4", index % 2 === 0 ? "w-full" : "w-3/4")} />
        ))}
        {children}
      </div>
    </div>
  );
}
