"use client";

import type { AgeRating } from "@filmbooking/shared";
import type { BookingSummaryResponse } from "@filmbooking/shared/schemas/booking";
import { formatVnd, toVnParts } from "@filmbooking/shared";
import { useEffect, useState } from "react";

import { AgeBadge } from "@/components/common/age-badge";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const SEAT_TYPE_LABELS: Record<string, string> = { standard: "Thường", vip: "VIP", sweetbox: "Sweetbox" };
const pad = (n: number) => String(n).padStart(2, "0");

/** "19:30" theo giờ VN. */
export function formatShowTime(iso: string): string {
  const p = toVnParts(new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "11/11/2026" theo giờ VN. */
export function formatShowDate(iso: string): string {
  const p = toVnParts(new Date(iso));
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

function formatShowWeekday(iso: string): string {
  return WEEKDAYS[toVnParts(new Date(iso)).weekday] ?? "";
}

function formatRemaining(seconds: number): string {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** Đếm ngược giữ ghế (R-61); server là nguồn sự thật, client chỉ hiển thị. */
export function HoldCountdown({
  initialSeconds,
  onExpire,
}: Readonly<{ initialSeconds: number; onExpire: () => void }>) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire();
      return;
    }
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onExpire]);

  return (
    <p
      className={cn(
        "inline-flex rounded-pill px-3 py-1 text-body-sm font-semibold tabular",
        remaining <= 60 ? "bg-danger-banner text-danger-strong" : "bg-surface-elevated text-fg",
      )}
    >
      Còn {formatRemaining(Math.max(remaining, 0))} để giữ ghế
    </p>
  );
}

/** Khối thông tin suất chiếu: rạp nổi bật → phim → suất → ghế (design-spec 08). */
export function ShowtimeInfo({ summary }: Readonly<{ summary: BookingSummaryResponse }>) {
  const { cinema, movie, showtime, seats } = summary;
  return (
    <section
      aria-labelledby="showtime-info-title"
      className="space-y-4 rounded-lg border border-border-subtle bg-surface p-4 sm:p-6"
    >
      <h2 id="showtime-info-title" className="text-h3 font-bold">
        Thông tin suất chiếu
      </h2>
      <div className="rounded-md bg-surface-elevated p-4">
        <p className="text-caption font-semibold tracking-wide text-brand">RẠP ĐÃ CHỌN</p>
        <p className="mt-1 text-h3 font-extrabold uppercase">{cinema.name}</p>
        <p className="mt-1 text-body-sm text-fg-secondary">{cinema.address}</p>
      </div>
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
          {movie.title}
          {movie.ageRating ? <AgeBadge rating={movie.ageRating as AgeRating} tone="semantic" /> : null}
          <span className="text-body-sm font-normal text-fg-secondary">{showtime.format}</span>
        </p>
        <p className="text-body-sm text-fg-secondary">
          {formatShowTime(showtime.startsAt)} • {formatShowWeekday(showtime.startsAt)},{" "}
          {formatShowDate(showtime.startsAt)} • {showtime.roomName}
        </p>
      </div>
      <p className="text-body-sm">
        <span className="text-fg-secondary">Ghế: </span>
        <span className="font-semibold">{seats.map((s) => s.label).join(", ")}</span>
      </p>
    </section>
  );
}

/** Dòng giá: dùng đúng số đã chốt từ server (R-72), không tính lại ở client. */
export function PriceBreakdown({ summary }: Readonly<{ summary: BookingSummaryResponse }>) {
  const { seats, pricing, voucher } = summary;
  return (
    <dl className="space-y-2 text-body-sm">
      {seats.map((seat) => (
        <div key={seat.id} className="flex justify-between gap-2">
          <dt className="text-fg-secondary">
            Ghế {seat.label} ({SEAT_TYPE_LABELS[seat.type] ?? seat.type})
          </dt>
          <dd className="tabular">{formatVnd(seat.price)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t border-border-subtle pt-2">
        <dt className="text-fg-secondary">Tạm tính</dt>
        <dd className="tabular">{formatVnd(pricing.subtotal)}</dd>
      </div>
      {pricing.discount > 0 ? (
        <div className="flex justify-between gap-2 text-success">
          <dt>Giảm giá{voucher ? ` (${voucher.code})` : ""}</dt>
          <dd className="tabular">−{formatVnd(pricing.discount)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-2 border-t border-border-subtle pt-2 text-h3 font-extrabold">
        <dt>Tổng cộng</dt>
        <dd className="tabular" data-testid="order-total">
          {formatVnd(pricing.total)}
        </dd>
      </div>
    </dl>
  );
}
