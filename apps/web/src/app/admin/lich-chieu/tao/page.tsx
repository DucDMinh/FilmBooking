"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ShowtimeBulkForm } from "@/components/admin/showtime-bulk-form";
import { ShowtimeCinemaGate } from "@/components/admin/showtime-page-gate";

export default function CreateShowtimePage() {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <Link href="/admin/lich-chieu" className="text-body-sm text-link hover:underline">
        ← Lịch chiếu
      </Link>
      <h1 className="text-h2 font-bold">Tạo suất chiếu</h1>
      <ShowtimeCinemaGate>
        {(cinema) => (
          <>
            <p className="text-body-sm text-fg-secondary">Rạp: {cinema.name}</p>
            <ShowtimeBulkForm
              cinemaId={cinema.id}
              onCreated={(count, skipped) => {
                toast.success(
                  skipped > 0
                    ? `Đã tạo ${count} suất chiếu; bỏ qua ${skipped} suất do trùng lịch`
                    : `Đã tạo ${count} suất chiếu`,
                );
                router.push(`/admin/lich-chieu?cinema=${cinema.id}`);
              }}
            />
          </>
        )}
      </ShowtimeCinemaGate>
    </div>
  );
}
