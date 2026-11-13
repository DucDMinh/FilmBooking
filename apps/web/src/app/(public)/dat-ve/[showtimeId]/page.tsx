import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AgeRating } from "@filmbooking/shared";
import type { SeatMapResponse } from "@filmbooking/shared/schemas/booking";
import type { MovieDto } from "@filmbooking/shared/schemas/catalog";

import { BookingStepper } from "@/components/booking/booking-stepper";
import { SeatPicker, type SeatPickerAuth } from "@/components/booking/seat-picker";
import { AgeBadge } from "@/components/common/age-badge";
import { DateTime } from "@/components/common/money";
import { EmptyState, ErrorState } from "@/components/common/states";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Chọn ghế | CINEMO",
  robots: { index: false },
};

async function resolveAuth(): Promise<SeatPickerAuth> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return "guest";
    return data.user.email_confirmed_at ? "ready" : "unconfirmed";
  } catch {
    return "guest";
  }
}

/** Thông tin phim (tên, nhãn tuổi) cho showtime; lỗi tải thì bỏ qua — server vẫn kiểm tra khi giữ ghế. */
async function loadMovie(movieId: string): Promise<MovieDto | null> {
  try {
    const movies = await apiFetch<MovieDto[]>("/movies?status=now_showing");
    return movies.find((m) => m.id === movieId) ?? null;
  } catch {
    return null;
  }
}

export default async function DatVePage({ params }: Readonly<{ params: Promise<{ showtimeId: string }> }>) {
  const { showtimeId } = await params;

  let seatMap: SeatMapResponse;
  try {
    seatMap = await apiFetch<SeatMapResponse>(`/showtimes/${encodeURIComponent(showtimeId)}/seatmap`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    if (error instanceof ApiError && error.code === "SHOWTIME_CANCELLED") {
      return (
        <EmptyState
          title="Suất chiếu không còn mở bán"
          description="Suất chiếu này đã bị huỷ. Vui lòng chọn suất khác."
          action={
            <Link href="/lich-chieu" className={buttonVariants({ variant: "gradient" })}>
              Chọn suất khác
            </Link>
          }
        />
      );
    }
    return <ErrorState title="Không tải được sơ đồ ghế" description="Vui lòng tải lại trang sau ít phút." />;
  }

  const [movie, auth] = await Promise.all([loadMovie(seatMap.showtime.movieId), resolveAuth()]);
  const ageRating: AgeRating | null = movie?.ageRating ?? null;

  return (
    <div className="flex flex-col gap-4">
      <BookingStepper currentStep={2} />
      <header className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-2 text-h2 font-bold">
          {movie?.titleVi ?? "Chọn ghế"}
          {ageRating ? <AgeBadge rating={ageRating} tone="semantic" /> : null}
        </h1>
        <p className="text-body-sm text-fg-secondary">
          {seatMap.room.name} • {seatMap.showtime.format} • <DateTime value={seatMap.showtime.startsAt} />
        </p>
      </header>
      <SeatPicker showtimeId={showtimeId} initialSeatMap={seatMap} ageRating={ageRating} ageUnknown={movie === null} auth={auth} />
    </div>
  );
}
