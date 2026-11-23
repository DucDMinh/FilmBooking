import {
  CinemaGridSkeleton,
  ChipRowSkeleton,
  HomeHeroSkeleton,
  MovieGridSkeleton,
  PageSkeleton,
  SectionHeadSkeleton,
} from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Trang chủ: hero, thanh khu vực, lưới phim, lưới rạp (cùng bố cục `(public)/page.tsx`). */
export default function HomeLoading() {
  return (
    <PageSkeleton label="Đang tải trang chủ…" className="space-y-10 md:space-y-14">
      <HomeHeroSkeleton />
      <Skeleton className="chamfer-md h-14 w-full" />
      <section className="space-y-6">
        <SectionHeadSkeleton withKicker />
        <ChipRowSkeleton count={2} chipClassName="h-11 w-44" />
        <MovieGridSkeleton count={8} />
      </section>
      <section className="space-y-6">
        <SectionHeadSkeleton withKicker withDescription />
        <CinemaGridSkeleton count={3} />
      </section>
    </PageSkeleton>
  );
}
