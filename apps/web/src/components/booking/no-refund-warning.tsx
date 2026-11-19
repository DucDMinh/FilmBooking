"use client";

import type { BookingSummaryResponse } from "@filmbooking/shared/schemas/booking";
import { TriangleAlert } from "lucide-react";

import { formatShowDate, formatShowTime } from "@/components/booking/order-summary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type Venue = Pick<BookingSummaryResponse, "cinema" | "showtime">;

export interface NoRefundWarningProps extends Venue {
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  /** Có khi phim T13+ mà đơn chưa xác nhận tuổi (R-68). */
  ageCheck?: { checked: boolean; onChange: (checked: boolean) => void };
}

/** Khối cảnh báo inline không huỷ/không hoàn + checkbox gating (R-71, R-133). Không có nút huỷ đơn (R-131). */
export function NoRefundWarning({
  cinema,
  showtime,
  agreed,
  onAgreedChange,
  ageCheck,
}: Readonly<NoRefundWarningProps>) {
  return (
    <section
      aria-label="Cảnh báo không huỷ, không hoàn vé"
      className="space-y-3 border-l-[3px] border-danger bg-danger-soft p-4"
    >
      <p className="flex items-start gap-2 text-body-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger-strong" aria-hidden="true" />
        <span>
          Vé đã mua <strong>không thể huỷ, đổi hoặc hoàn tiền</strong>, trừ trường hợp rạp huỷ suất. Vé chỉ dùng
          tại{" "}
          <strong>
            {cinema.name} - {cinema.address}
          </strong>
          , suất <strong>{formatShowTime(showtime.startsAt)}</strong> ngày{" "}
          <strong>{formatShowDate(showtime.startsAt)}</strong>.
        </span>
      </p>
      <div className="flex items-start gap-3">
        <Checkbox id="consent-no-refund" checked={agreed} onCheckedChange={(v) => onAgreedChange(v === true)} />
        <Label htmlFor="consent-no-refund" className="text-body-sm leading-snug">
          Tôi đã đọc và đồng ý điều kiện vé.
        </Label>
      </div>
      {ageCheck ? (
        <div className="flex items-start gap-3">
          <Checkbox id="confirm-age" checked={ageCheck.checked} onCheckedChange={(v) => ageCheck.onChange(v === true)} />
          <Label htmlFor="confirm-age" className="text-body-sm leading-snug">
            Tôi xác nhận đủ độ tuổi xem phim này.
          </Label>
        </div>
      ) : null}
    </section>
  );
}

export interface PolicyConfirmDialogProps extends Venue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** AlertDialog xác nhận cuối: nhắc lại đúng tên + địa chỉ rạp và suất (D3). */
export function PolicyConfirmDialog({
  cinema,
  showtime,
  open,
  onOpenChange,
  onConfirm,
}: Readonly<PolicyConfirmDialogProps>) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận mua vé</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Bạn sắp mua vé tại <strong>{cinema.name}</strong> - {cinema.address}, suất{" "}
                <strong>{formatShowTime(showtime.startsAt)}</strong> ngày{" "}
                <strong>{formatShowDate(showtime.startsAt)}</strong>.
              </p>
              <p>Vé đã mua không huỷ, không đổi, không hoàn tiền.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Quay lại</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Đồng ý và thanh toán</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
