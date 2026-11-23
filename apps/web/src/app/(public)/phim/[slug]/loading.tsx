import {
  ChipRowSkeleton,
  DetailHeroSkeleton,
  ListRowsSkeleton,
  PageSkeleton,
  SectionHeadSkeleton,
} from "@/components/common/page-skeleton";

/** Chi tiết phim: hero poster + thông tin, rồi khối lịch chiếu (dải ngày + hàng suất). */
export default function MovieDetailLoading() {
  return (
    <PageSkeleton label="Đang tải thông tin phim…" className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      <DetailHeroSkeleton />
      <section className="space-y-6 border-t border-border pt-8">
        <SectionHeadSkeleton withDescription />
        <ChipRowSkeleton count={7} chipClassName="h-14 w-20" />
        <ListRowsSkeleton rows={3} rowClassName="h-24" />
      </section>
    </PageSkeleton>
  );
}
