import { CalendarClock, DoorClosed, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatVnDate, refundNoticeText, stopsSellingTickets } from "@/lib/cinema-schedule";
import type { CinemaDbStatus, CinemaDto } from "@filmbooking/shared/schemas/catalog";

type InactiveStatus = Exclude<CinemaDbStatus, "OPEN">;

const CLOSED_COPY: Record<
  InactiveStatus,
  { title: (name: string) => string; badge: string; tone: "danger" | "warning" | "neutral"; description: string }
> = {
  CLOSED: {
    title: (name) => `Rạp ${name} đã đóng cửa`,
    badge: "Đã đóng cửa",
    tone: "danger",
    description:
      "Rạp này đã ngừng hoạt động và không còn nhận đặt vé. Quý khách vui lòng chọn một rạp khác trong hệ thống CINEMO để xem lịch chiếu và đặt vé.",
  },
  TEMP_CLOSED: {
    title: (name) => `Rạp ${name} đang tạm đóng cửa`,
    badge: "Tạm đóng cửa",
    tone: "warning",
    description:
      "Rạp tạm ngừng hoạt động và chưa nhận đặt vé. Thời gian mở lại sẽ được CINEMO thông báo. Trong thời gian này, quý khách có thể chọn rạp khác để đặt vé.",
  },
  COMING_SOON: {
    title: (name) => `Rạp ${name} sắp khai trương`,
    badge: "Sắp khai trương",
    tone: "neutral",
    description:
      "Rạp chưa mở cửa nên chưa có lịch chiếu và chưa nhận đặt vé. Quý khách vui lòng quay lại sau hoặc chọn rạp khác trong hệ thống CINEMO.",
  },
};

/** Tiêu đề trang cho rạp không hoạt động (dùng chung với metadata). */
export function closedCinemaTitle(cinema: Pick<CinemaDto, "name" | "status">): string {
  if (cinema.status === "OPEN") return cinema.name;
  return CLOSED_COPY[cinema.status].title(cinema.name);
}

/**
 * Trang `/rap/[code]` cho rạp CLOSED / TEMP_CLOSED / COMING_SOON (R-137): thay cho 404, không có
 * lịch chiếu, bản đồ hay yêu thích vì rạp không bán vé.
 */
export function CinemaClosedNotice({ cinema }: Readonly<{ cinema: CinemaDto }>) {
  const status: InactiveStatus = cinema.status === "OPEN" ? "CLOSED" : cinema.status;
  const copy = CLOSED_COPY[status];
  const reopenDate =
    cinema.scheduledStatus === "OPEN" && cinema.scheduledEffectiveAt
      ? formatVnDate(new Date(cinema.scheduledEffectiveAt))
      : null;

  return (
    <div className="space-y-8">
      <nav aria-label="Đường dẫn phân cấp" className="flex flex-wrap items-center gap-2 text-body-sm text-fg-secondary">
        <Link href="/" className="hover:text-fg">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <Link href="/rap" className="hover:text-fg">Hệ thống rạp</Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-fg" aria-current="page">{cinema.name}</span>
      </nav>

      <section className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-2xl border border-border bg-chrome p-6 text-center md:p-10">
        <span className="flex size-16 items-center justify-center rounded-pill bg-surface-elevated text-fg-muted">
          <DoorClosed className="size-8" aria-hidden="true" />
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-overline uppercase tracking-wider text-brand">CINEMO {cinema.code}</span>
          <Badge tone={copy.tone}>{copy.badge}</Badge>
        </div>
        <h1 className="text-h1 font-heavy tracking-tight text-fg">{copy.title(cinema.name)}</h1>
        <p className="max-w-prose text-body text-fg-secondary">{copy.description}</p>

        {reopenDate ? (
          <p className="flex items-start gap-2 rounded-md border border-info-line bg-info-soft p-3 text-left text-body-sm text-info">
            <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {status === "COMING_SOON" ? "Rạp dự kiến khai trương và mở cửa từ ngày" : "Rạp dự kiến mở cửa trở lại từ ngày"}{" "}
              <strong>{reopenDate}</strong>.
            </span>
          </p>
        ) : null}

        <div className="w-full space-y-2 text-left text-body-sm text-fg-secondary">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>{cinema.address}</span>
          </div>
          {cinema.hotline ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <Phone className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <span>Hotline hỗ trợ:</span>
              <a href={`tel:${cinema.hotline}`} className="font-semibold text-fg hover:text-brand">
                {cinema.hotline}
              </a>
            </div>
          ) : null}
        </div>

        <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
          <Link href="/rap">Xem các rạp khác</Link>
        </Button>
      </section>
    </div>
  );
}

const BANNER_TITLES: Record<CinemaDbStatus, (date: string) => string> = {
  CLOSED: (date) => `Rạp sẽ đóng cửa từ ngày ${date}`,
  TEMP_CLOSED: (date) => `Rạp sẽ tạm đóng cửa từ ngày ${date}`,
  COMING_SOON: (date) => `Rạp sẽ chuyển sang sắp khai trương từ ngày ${date}`,
  OPEN: (date) => `Rạp sẽ mở cửa từ ngày ${date}`,
};

/**
 * Banner đầu trang rạp đang OPEN có lịch đổi trạng thái (R-136): nêu ngày hiệu lực (giờ VN) và,
 * khi rạp sắp ngừng bán vé, hướng dẫn hoàn tiền tại quầy trước ngày đó (khớp email CINEMA_STATUS_NOTICE).
 */
export function CinemaScheduleBanner({ cinema }: Readonly<{ cinema: CinemaDto }>) {
  const target = cinema.scheduledStatus;
  if (!target || !cinema.scheduledEffectiveAt || target === cinema.status) return null;
  const date = formatVnDate(new Date(cinema.scheduledEffectiveAt));

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-warning-line bg-warning-soft p-4 text-body-sm text-fg"
    >
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold text-warning">{BANNER_TITLES[target](date)}</p>
        {stopsSellingTickets(target) ? (
          <p>{refundNoticeText(date)}</p>
        ) : (
          <p>Rạp sẽ đón khách và nhận đặt vé từ ngày này.</p>
        )}
      </div>
    </div>
  );
}
