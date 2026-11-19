"use client";

import type { SeatMapItem } from "@filmbooking/shared/schemas/booking";
import { useMemo, useState } from "react";

import { SeatMap } from "@/components/booking/seat-map";
import { isBookableType } from "@/components/booking/seat-rules";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";

export interface SeatLockPanelProps {
  cinemaId: string;
  showtimeId: string;
  seats: readonly SeatMapItem[];
  /** Suất đã huỷ: không cho khoá/mở khoá. */
  disabled?: boolean;
  onChanged: () => void;
}

const REASONS = [
  { value: "GUEST", label: "Khách mời" },
  { value: "BROKEN_EQUIPMENT", label: "Ghế hỏng" },
  { value: "OTHER", label: "Khác" },
] as const;

/** Chia ghế đã chọn thành nhóm khoá được (FREE) và nhóm mở khoá được (LOCKED). Ghế đã bán/đang giữ bị loại (R-55). */
export function splitSelection(seats: readonly SeatMapItem[], selectedIds: ReadonlySet<string>) {
  const chosen = seats.filter((s) => selectedIds.has(s.id));
  return {
    toLock: chosen.filter((s) => s.state === "FREE" && isBookableType(s)),
    toUnlock: chosen.filter((s) => s.state === "LOCKED"),
  };
}

/** Khoá/mở khoá ghế theo suất (R-55) trên sơ đồ chỉ-quản-trị: bấm ghế trống hoặc ghế đã khoá để chọn. */
export function SeatLockPanel({ cinemaId, showtimeId, seats, disabled, onChanged }: Readonly<SeatLockPanelProps>) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("GUEST");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toLock, toUnlock } = useMemo(() => splitSelection(seats, selected), [seats, selected]);
  const base = `/cinemas/${cinemaId}/showtimes/${showtimeId}/locks`;

  const toggle = (seat: SeatMapItem) => {
    if (disabled || (seat.state !== "FREE" && seat.state !== "LOCKED") || !isBookableType(seat)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(seat.id)) next.add(seat.id);
      return next;
    });
  };

  const apply = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      setSelected(new Set());
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra. Vui lòng thử lại.");
      // Mở khoá tuần tự có thể đã thành công một phần: tải lại để sơ đồ phản ánh đúng.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const lock = () =>
    apply(() => apiFetch(base, { method: "POST", json: { seatIds: toLock.map((s) => s.id), reason } }));
  const unlock = () =>
    apply(async () => {
      for (const seat of toUnlock) await apiFetch(`${base}/${seat.id}`, { method: "DELETE" });
    });

  // Ghế được chọn nhưng đang LOCKED không đổi màu trên SeatMap -> liệt kê nhãn để người dùng thấy lựa chọn.
  const chosenLabels = [...toLock, ...toUnlock].map((s) => s.label).join(", ");

  return (
    <section aria-label="Khoá ghế" className="space-y-3">
      <SeatMap seats={seats} selectedIds={selected} onSeatActivate={toggle} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-body-sm">
          Lý do khoá
          <select
            value={reason}
            disabled={disabled || busy}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="h-11 border border-input bg-surface-input px-2 text-base md:h-10 md:text-body"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" disabled={disabled || busy || toLock.length === 0} onClick={lock}>
          Khoá {toLock.length} ghế
        </Button>
        <Button type="button" variant="secondary" disabled={disabled || busy || toUnlock.length === 0} onClick={unlock}>
          Mở khoá {toUnlock.length} ghế
        </Button>
      </div>
      {chosenLabels ? <p className="text-body-sm text-fg-secondary">Đã chọn: {chosenLabels}</p> : null}
      {error ? (
        <p role="alert" className="text-body-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
