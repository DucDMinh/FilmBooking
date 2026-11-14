"use client";

import type {
  CancelShowtimesInput,
  CancelShowtimesResultDto,
  PreviewCancelResultDto,
} from "@filmbooking/shared/schemas/cancellation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/client";

/** Đích huỷ: các suất cụ thể hoặc toàn bộ suất tương lai của rạp (R-108). */
export type CancelTarget = { showtimeIds: string[] } | { allFuture: true };

export interface CancelShowtimesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cinemaId: string;
  /** Mã rạp (vd `HN01`): người dùng phải gõ lại để bật nút huỷ. */
  cinemaCode: string;
  target: CancelTarget;
  /** Mô tả phạm vi hiển thị ở bước 1. */
  scopeLabel: string;
  onCancelled: (result: CancelShowtimesResultDto) => void;
}

type Step = "reason" | "preview" | "confirm";

export function previewSummary(p: PreviewCancelResultDto): string {
  return `${p.showtimesCount} suất • ${p.paidOrdersCount} đơn đã thanh toán • ${p.soldSeatsCount} vé • ${p.holdingOrdersCount} đơn đang giữ/chờ thanh toán sẽ bị huỷ`;
}

/** Huỷ suất 3 bước (design-spec B20): lý do → xem trước ảnh hưởng → gõ mã rạp xác nhận. */
export function CancelShowtimesDialog(props: Readonly<CancelShowtimesDialogProps>) {
  const { open, onOpenChange, cinemaId, cinemaCode, target, scopeLabel, onCancelled } = props;
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [preview, setPreview] = useState<PreviewCancelResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/cinemas/${cinemaId}/showtimes/cancel`;
  const reasonOk = reason.trim().length > 0;
  const codeOk = typed.trim().toUpperCase() === cinemaCode.trim().toUpperCase();

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setStep("reason");
      setReason("");
      setTyped("");
      setPreview(null);
      setError(null);
    }
    onOpenChange(next);
  };

  const run = async <T,>(task: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra. Vui lòng thử lại.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async () => {
    const result = await run(() =>
      apiFetch<PreviewCancelResultDto>(`${base}/preview`, { method: "POST", json: target }),
    );
    if (result) {
      setPreview(result);
      setStep("preview");
    }
  };

  const confirm = async () => {
    const body: CancelShowtimesInput = { ...target, reason: reason.trim() };
    const result = await run(() => apiFetch<CancelShowtimesResultDto>(base, { method: "POST", json: body }));
    if (result) {
      onCancelled(result);
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Huỷ suất chiếu</DialogTitle>
          <DialogDescription>
            Bước {step === "reason" ? 1 : step === "preview" ? 2 : 3}/3 • {scopeLabel}
          </DialogDescription>
        </DialogHeader>

        {step === "reason" ? (
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Lý do huỷ *</Label>
            <textarea
              id="cancel-reason"
              value={reason}
              maxLength={500}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-sm border border-input bg-surface-input p-3 text-base outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 md:text-body"
            />
            <p className="text-body-sm text-fg-secondary">Lý do này được gửi trong email thông báo cho khách.</p>
          </div>
        ) : null}

        {step === "preview" && preview ? (
          <div className="space-y-3">
            <p className="rounded-md border border-border bg-surface-elevated p-3 text-body font-semibold" data-testid="cancel-preview">
              {previewSummary(preview)}
            </p>
            <p>
              {preview.paidOrdersCount} đơn đã thanh toán sẽ chuyển sang &quot;Bị ảnh hưởng&quot;,{" "}
              {preview.paidOrdersCount} email sẽ được gửi.
            </p>
            <p className="text-body-sm text-fg-secondary">
              Không đổi suất: khách liên hệ CSKH để được hoàn tiền thủ công. Nhân viên theo dõi tại &quot;Đơn bị ảnh
              hưởng&quot;.
            </p>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-3">
            <div role="alert" className="rounded-md border border-danger-line bg-danger-soft p-3 text-danger">
              Không thể hoàn tác. Suất sẽ ngừng bán trên web; vé không thể check-in.
            </div>
            <Label htmlFor="cancel-code">Gõ mã rạp {cinemaCode} để xác nhận</Label>
            <Input id="cancel-code" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => handleOpenChange(false)}>
            Để sau
          </Button>
          {step === "reason" ? (
            <Button type="button" disabled={!reasonOk || busy} onClick={loadPreview}>
              Xem trước ảnh hưởng
            </Button>
          ) : null}
          {step === "preview" ? (
            <Button type="button" onClick={() => setStep("confirm")}>
              Tiếp tục
            </Button>
          ) : null}
          {step === "confirm" ? (
            <Button type="button" variant="destructive" disabled={!codeOk || busy} onClick={confirm}>
              Huỷ {preview?.showtimesCount ?? ""} suất chiếu
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
