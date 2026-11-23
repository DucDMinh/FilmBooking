import { ListRowsSkeleton, PageSkeleton } from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Vùng nội dung tài khoản (layout tài khoản đã có khung và menu): tiêu đề khối + các hàng thông tin/biểu mẫu. */
export default function AccountLoading() {
  return (
    <PageSkeleton label="Đang tải thông tin tài khoản…" className="space-y-4 border border-border bg-surface p-6">
      <Skeleton className="h-6 w-44" />
      <ListRowsSkeleton rows={3} rowClassName="h-10" />
    </PageSkeleton>
  );
}
