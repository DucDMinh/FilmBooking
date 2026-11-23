import { ListRowsSkeleton, PageSkeleton } from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Vé của tôi: tiêu đề + danh sách vé (thẻ cao). Dùng div thay main vì layout đã có main. */
export default function MyTicketsLoading() {
  return (
    <PageSkeleton label="Đang tải danh sách vé…" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <Skeleton className="h-9 w-44" />
      <ListRowsSkeleton rows={3} rowClassName="h-28" />
    </PageSkeleton>
  );
}
