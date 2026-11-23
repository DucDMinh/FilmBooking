import { BookingStepper } from "@/components/booking/booking-stepper";
import { PageSkeleton, PanelSkeleton } from "@/components/common/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Chọn ghế: thẻ rạp, stepper (bước 2, khung tĩnh), tiêu đề suất, sơ đồ ghế + panel tóm tắt. */
export default function SeatSelectionLoading() {
  return (
    <PageSkeleton label="Đang tải sơ đồ ghế…" className="flex flex-col gap-4 space-y-0">
      <Skeleton className="h-5 w-48" />
      <BookingStepper currentStep={2} />
      <div className="space-y-2">
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,320px)]">
        <Skeleton className="h-80 w-full sm:h-[28rem]" />
        <PanelSkeleton lines={4} />
      </div>
    </PageSkeleton>
  );
}
