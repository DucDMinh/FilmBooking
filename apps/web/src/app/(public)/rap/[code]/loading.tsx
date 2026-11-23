import {
  ChipRowSkeleton,
  ListRowsSkeleton,
  PageSkeleton,
  SectionHeadSkeleton,
} from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Chi tiết rạp: đường dẫn, khung thông tin rạp, bản đồ, dải ngày và các phim đang chiếu. */
export default function CinemaDetailLoading() {
  return (
    <PageSkeleton label="Đang tải thông tin rạp…">
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="frame">
        <div className="frame-in space-y-4 bg-chrome p-6 md:p-8">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <ChipRowSkeleton count={3} chipClassName="h-5 w-36" />
        </div>
      </div>
      <Skeleton className="h-56 w-full" />
      <section className="space-y-6">
        <SectionHeadSkeleton />
        <ChipRowSkeleton count={7} chipClassName="h-14 w-20" />
        <ListRowsSkeleton rows={2} rowClassName="h-40" />
      </section>
    </PageSkeleton>
  );
}
