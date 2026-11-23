import { PageSkeleton, PanelSkeleton } from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Chi tiết vé: liên kết quay lại, tiêu đề, khung vé (mã QR + thông tin suất). */
export default function TicketDetailLoading() {
  return (
    <PageSkeleton label="Đang tải chi tiết vé…" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-9 w-48" />
      <PanelSkeleton lines={5}>
        <Skeleton className="mx-auto size-44" />
      </PanelSkeleton>
    </PageSkeleton>
  );
}
