"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  CINEMA_STATUS_DELAY_DAYS,
  expectedEffectiveDate,
  formatVnDate,
  stopsSellingTickets,
} from "@/lib/cinema-schedule";
import type { SetCinemaStatusResultDto } from "@filmbooking/shared/schemas/cancellation";
import { CINEMA_DB_STATUSES, type CinemaDbStatus, type CinemaDto } from "@filmbooking/shared/schemas/catalog";

export const CINEMA_STATUS_LABELS: Record<CinemaDbStatus, string> = {
  COMING_SOON: "Sắp mở",
  OPEN: "Đang hoạt động",
  TEMP_CLOSED: "Tạm đóng",
  CLOSED: "Ngừng hoạt động",
};

type DialogMode = "none" | "schedule" | "cancel";

/** Chọn trạng thái khác hiện tại = hẹn lịch; giữ nguyên trạng thái hiện tại khi đang có lịch = huỷ lịch. */
function resolveMode(cinema: CinemaDto, selected: CinemaDbStatus): DialogMode {
  if (selected !== cinema.status) return "schedule";
  return cinema.scheduledStatus ? "cancel" : "none";
}

function successMessage(result: SetCinemaStatusResultDto): string {
  const emails = `${result.emailsEnqueuedCount} khách hàng`;
  if (result.scheduleCancelled) return `Đã huỷ lịch đổi trạng thái. Đã gửi email đính chính tới ${emails}.`;
  const date = result.scheduledEffectiveAt ? formatVnDate(new Date(result.scheduledEffectiveAt)) : "";
  return `Đã hẹn đổi trạng thái rạp${date ? ` có hiệu lực ${date}` : ""}. Đã gửi email thông báo tới ${emails}.`;
}

/**
 * Đổi trạng thái rạp (Admin, R-136): mọi thay đổi có hiệu lực sau 7 ngày và email toàn bộ khách ngay bây giờ.
 * Rạp đang có lịch: chọn trạng thái khác = hẹn lại (thay lịch cũ); giữ nguyên trạng thái hiện tại = huỷ lịch.
 */
export function CinemaStatusDialog({
  cinema,
  open,
  onOpenChange,
  onChanged,
}: Readonly<{
  cinema: CinemaDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (result: SetCinemaStatusResultDto) => void;
}>) {
  const [status, setStatus] = useState<CinemaDbStatus>(cinema.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref đồng bộ: chặn gửi lần hai ngay cả khi state `saving` chưa kịp render (thao tác này gửi email hàng loạt).
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setStatus(cinema.status);
      setError(null);
    }
  }, [open, cinema.status]);

  const mode = resolveMode(cinema, status);
  const effectiveDate = formatVnDate(expectedEffectiveDate());
  const pendingDate = cinema.scheduledEffectiveAt ? formatVnDate(new Date(cinema.scheduledEffectiveAt)) : "";

  async function submit() {
    if (!cinema.id || mode === "none" || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<SetCinemaStatusResultDto>(`/admin/cinemas/${cinema.id}/status`, {
        method: "PATCH",
        json: { status },
      });
      toast.success(successMessage(result));
      onChanged(result);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  // Đang gửi thì không cho đóng (Esc, click ra ngoài, nút X): đóng giữa chừng mất trạng thái và cho phép gửi lại.
  function handleOpenChange(next: boolean) {
    if (!next && submittingRef.current) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi trạng thái rạp</DialogTitle>
          <DialogDescription>
            {cinema.name} - hiện đang: {CINEMA_STATUS_LABELS[cinema.status]}
          </DialogDescription>
        </DialogHeader>

        {cinema.scheduledStatus ? (
          <p className="border border-warning-line bg-warning-soft p-3 text-body-sm">
            Đang chờ: {CINEMA_STATUS_LABELS[cinema.scheduledStatus]} từ ngày {pendingDate}. Hẹn lại sẽ
            thay lịch cũ và gửi lại email cho toàn bộ khách hàng.
          </p>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="cinema-status" className="text-body-sm font-semibold">
            Trạng thái mới
          </label>
          <Select value={status} onValueChange={(value) => setStatus(value as CinemaDbStatus)}>
            <SelectTrigger id="cinema-status" aria-label="Trạng thái mới">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CINEMA_DB_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {CINEMA_STATUS_LABELS[value]}
                  {value === cinema.status ? " (hiện tại)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mode === "schedule" ? (
          <div className="space-y-2 border border-border-subtle bg-surface-elevated p-3 text-body-sm">
            <p>
              Thay đổi có hiệu lực vào {effectiveDate} (sau {CINEMA_STATUS_DELAY_DAYS} ngày). Rạp giữ
              nguyên trạng thái hiện tại cho tới lúc đó. Hệ thống gửi email tới toàn bộ khách hàng ngay bây giờ.
            </p>
            {stopsSellingTickets(status) ? (
              <p>
                Đến hạn, các suất chiếu còn lại của rạp sẽ tự huỷ; khách có vé các suất từ ngày hiệu lực trở đi cần đến
                quầy hoàn tiền trước ngày {effectiveDate}, sau hạn sẽ không giải quyết.
              </p>
            ) : (
              <p>Đến hạn, rạp nhận đặt vé trở lại; không có suất chiếu nào bị huỷ.</p>
            )}
          </div>
        ) : null}

        {mode === "cancel" ? (
          <p className="border border-warning-line bg-warning-soft p-3 text-body-sm">
            Huỷ lịch sẽ giữ rạp ở trạng thái {CINEMA_STATUS_LABELS[cinema.status]} và gửi email đính chính cho toàn bộ
            khách hàng.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-small text-danger-text">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={saving}>
            Đóng
          </Button>
          <Button
            onClick={submit}
            disabled={saving || mode === "none"}
            variant={mode === "cancel" ? "destructive" : "default"}
          >
            {saving ? "Đang lưu…" : mode === "cancel" ? "Huỷ lịch & gửi email đính chính" : "Hẹn đổi trạng thái & gửi email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
