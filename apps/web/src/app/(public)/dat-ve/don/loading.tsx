import { PageSkeleton, PanelSkeleton } from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Đơn đặt vé (xác nhận / kết quả thanh toán): tiêu đề + cột chi tiết trái, panel tổng thanh toán phải. */
export default function OrderLoading() {
  return (
    <PageSkeleton label="Đang tải đơn hàng…" className="mx-auto w-full max-w-5xl space-y-0 px-4 py-6 sm:py-8">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
        <Skeleton className="h-64 w-full" />
        <PanelSkeleton lines={5} />
      </div>
    </PageSkeleton>
  );
}
