import {
  ChipRowSkeleton,
  MovieGridSkeleton,
  PageSkeleton,
  SectionHeadSkeleton,
} from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Danh sách phim: tiêu đề trang, hàng bộ lọc, dòng đếm kết quả, lưới poster. */
export default function MoviesLoading() {
  return (
    <PageSkeleton label="Đang tải danh sách phim…">
      <div className="border-b border-border pb-6">
        <SectionHeadSkeleton withDescription />
      </div>
      <ChipRowSkeleton count={4} chipClassName="h-11 w-full sm:w-44" />
      <section className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <MovieGridSkeleton count={8} />
      </section>
    </PageSkeleton>
  );
}
