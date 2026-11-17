import { useEffect, useRef } from "react";

import { CircleAlert, CircleCheck, CircleX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanResult, ScanTicketResponse } from "@filmbooking/shared/schemas/checkin";

const HEADLINE: Record<ScanResult, string> = {
  OK: "VÉ HỢP LỆ",
  USED: "VÉ ĐÃ SỬ DỤNG",
  WRONG_CINEMA: "SAI RẠP",
  CANCELLED: "VÉ ĐÃ HUỶ",
  EXPIRED: "VÉ HẾT HẠN",
  TOO_EARLY: "CHƯA ĐẾN GIỜ SOÁT VÉ",
  NOT_PAID: "ĐƠN CHƯA THANH TOÁN",
  NOT_FOUND: "KHÔNG TÌM THẤY VÉ",
};

/** Nhãn ngắn cho lịch sử quét. */
export const RESULT_LABEL: Record<ScanResult, string> = {
  OK: "Hợp lệ",
  USED: "Đã sử dụng",
  WRONG_CINEMA: "Sai rạp",
  CANCELLED: "Đã huỷ",
  EXPIRED: "Hết hạn",
  TOO_EARLY: "Chưa đến giờ",
  NOT_PAID: "Chưa thanh toán",
  NOT_FOUND: "Không tìm thấy",
};

const CHECKIN_OPEN_MINUTES_BEFORE = 30;

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="text-h3 font-bold text-fg">{value}</dd>
    </div>
  );
}

function Details({ response }: Readonly<{ response: ScanTicketResponse }>) {
  const { order, used, correctCinema, startsAt } = response;
  if (response.result === "OK" && order) {
    return (
      <div className="space-y-3">
        <p className="text-h3 font-bold text-fg">{`Đã soát ${order.seatCount} ghế của đơn`}</p>
        <dl className="space-y-3">
          <Row label="Phim" value={order.movieTitle} />
          <Row label="Rạp • Phòng" value={`${order.cinemaName} • ${order.roomName}`} />
          <Row label="Suất chiếu" value={formatDateTime(order.startsAt)} />
          <Row label="Mã đặt vé" value={order.bookingCode} />
          <Row label="Ghế" value={order.seats.join(", ")} />
          <Row label="Số ghế" value={`${order.seatCount} ghế`} />
          <Row label="Đã check-in lúc" value={formatDateTime(order.checkedInAt)} />
        </dl>
      </div>
    );
  }
  if (response.result === "USED" && used) {
    return (
      <dl className="space-y-3">
        <Row label="Check-in lần đầu lúc" value={formatDateTime(used.checkedInAt)} />
        <Row label="Người soát" value={used.staffName} />
      </dl>
    );
  }
  // AC-13: chỉ tên + địa chỉ rạp đúng, tuyệt đối không tên khách/ghế.
  if (response.result === "WRONG_CINEMA" && correctCinema) {
    return (
      <dl className="space-y-3">
        <Row label="Vé này dành cho rạp" value={correctCinema.name} />
        {correctCinema.address ? <Row label="Địa chỉ" value={correctCinema.address} /> : null}
      </dl>
    );
  }
  if (response.result === "TOO_EARLY" && startsAt) {
    const opensAt = new Date(new Date(startsAt).getTime() - CHECKIN_OPEN_MINUTES_BEFORE * 60_000).toISOString();
    return (
      <dl className="space-y-3">
        <Row label="Suất chiếu" value={formatDateTime(startsAt)} />
        <Row label="Mở check-in từ" value={formatDateTime(opensAt)} />
      </dl>
    );
  }
  return null;
}

const HINT: Partial<Record<ScanResult, string>> = {
  WRONG_CINEMA: "Vé không bị đánh dấu check-in.",
  CANCELLED: "Vui lòng liên hệ CSKH để được hỗ trợ hoàn tiền.",
};

const RETRY_RESULTS: readonly ScanResult[] = ["NOT_FOUND", "NOT_PAID"];

/** Kết quả soát vé toàn màn hình: màu + icon + chữ (không chỉ dựa vào màu — WCAG). */
export function CheckinResult({
  response,
  onNext,
  scannedCode,
}: Readonly<{ response: ScanTicketResponse; onNext: () => void; scannedCode?: string }>) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus();
  }, []);
  const hint = HINT[response.result];
  const retry = RETRY_RESULTS.includes(response.result);
  const ok = response.result === "OK";
  const Icon = ok ? CircleCheck : response.result === "USED" ? CircleX : CircleAlert;
  return (
    <section
      role="alert"
      data-result={response.result}
      className={cn(
        "fixed inset-0 z-50 flex flex-col gap-6 overflow-y-auto p-6",
        ok ? "bg-success-banner text-success-strong" : "bg-danger-banner text-danger-strong",
      )}
    >
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="size-10 shrink-0" />
        <h2 className="text-h1 font-heavy">{HEADLINE[response.result]}</h2>
      </div>
      {response.message ? <p className="text-body text-fg">{response.message}</p> : null}
      {retry && scannedCode ? <p className="text-body text-fg">Mã: {scannedCode}</p> : null}
      <Details response={response} />
      {hint ? <p className="text-body font-semibold text-fg">{hint}</p> : null}
      <Button
        ref={nextRef}
        type="button"
        size="lg"
        variant="gradient"
        className="mt-auto w-full"
        onClick={onNext}
      >
        {retry ? "Nhập lại mã" : "Quét vé khác"}
      </Button>
    </section>
  );
}
