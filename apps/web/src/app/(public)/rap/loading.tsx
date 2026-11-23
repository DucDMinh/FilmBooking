import {
  CinemaGridSkeleton,
  ChipRowSkeleton,
  PageSkeleton,
  SectionHeadSkeleton,
} from "@/components/common/page-skeleton";

/** Hệ thống rạp: tiêu đề, hàng tab tỉnh/thành, tiêu đề danh sách, lưới thẻ rạp. */
export default function CinemasLoading() {
  return (
    <PageSkeleton label="Đang tải danh sách rạp…">
      <SectionHeadSkeleton withKicker withDescription />
      <ChipRowSkeleton count={5} chipClassName="h-11 w-32" />
      <section className="space-y-6">
        <SectionHeadSkeleton />
        <CinemaGridSkeleton count={6} gapClassName="gap-6" />
      </section>
    </PageSkeleton>
  );
}
