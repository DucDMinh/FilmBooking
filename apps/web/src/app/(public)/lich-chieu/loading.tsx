import { BookingStepper } from "@/components/booking/booking-stepper";
import {
  ChipRowSkeleton,
  ListRowsSkeleton,
  PageSkeleton,
  SectionHeadSkeleton,
} from "@/components/common/page-skeleton";

/** Lịch chiếu: tiêu đề, stepper, hàng bộ lọc, dải 7 ngày, các khối phim. Stepper là khung tĩnh nên hiện luôn bản thật. */
export default function ScheduleLoading() {
  return (
    <PageSkeleton label="Đang tải lịch chiếu…" className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <SectionHeadSkeleton withDescription />
      <BookingStepper currentStep={1} />
      <ChipRowSkeleton count={4} chipClassName="h-11 w-full sm:w-48" />
      <ChipRowSkeleton count={7} chipClassName="h-14 w-20" />
      <ListRowsSkeleton rows={3} rowClassName="h-28" />
    </PageSkeleton>
  );
}
