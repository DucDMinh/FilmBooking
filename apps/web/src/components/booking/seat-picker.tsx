"use client";

import { formatVnd } from "@filmbooking/shared";
import type { AgeRating } from "@filmbooking/shared";
import type { HoldSeatsResponse, SeatMapItem, SeatMapResponse } from "@filmbooking/shared/schemas/booking";
import { AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useShowtimeSeats, type SeatChannelClient } from "@/lib/realtime/use-showtime-seats";
import { HoldCountdown } from "./hold-countdown";
import { HoldExpiredDialog } from "./hold-expired-dialog";
import { LoginRequiredDialog } from "./login-required-dialog";
import { SeatLegend } from "./seat-legend";
import { SeatMap } from "./seat-map";
import {
  findOrphanSeatIds,
  isBookableType,
  MAX_SEATS_PER_ORDER,
  seatPositionLabel,
  SEAT_STATE_LABEL,
  seatWeight,
  totalWeight,
  visualState,
} from "./seat-rules";

export type SeatPickerAuth = "guest" | "unconfirmed" | "ready";

export interface SeatPickerProps {
  showtimeId: string;
  initialSeatMap: SeatMapResponse;
  ageRating: AgeRating | null;
  /** Không tải được phân loại tuổi: chặn Tiếp tục thay vì lặng lẽ bỏ bước xác nhận tuổi (R-68). */
  ageUnknown?: boolean;
  auth: SeatPickerAuth;
  /** Cho test: thay client Realtime. */
  createRealtimeClient?: () => SeatChannelClient;
}

const ONLINE_CLOSE_MINUTES = 15;
const AGE_RESTRICTED: readonly AgeRating[] = ["T13", "T16", "T18"];
const AGE_MIN: Record<string, number> = { T13: 13, T16: 16, T18: 18 };

function isSalesClosed(startsAt: string): boolean {
  return new Date(startsAt).getTime() - Date.now() <= ONLINE_CLOSE_MINUTES * 60_000;
}

/** Màn chọn ghế (06/31): chọn ghế, kiểm tra ràng buộc phía client, giữ ghế rồi sang bước xác nhận. */
export function SeatPicker({ showtimeId, initialSeatMap, ageRating, ageUnknown = false, auth, createRealtimeClient }: Readonly<SeatPickerProps>) {
  const router = useRouter();
  const [seatMap, setSeatMap] = useState(initialSeatMap);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [hold, setHold] = useState<{ orderId: string; expiresAt: string } | null>(null);
  const [expired, setExpired] = useState(false);

  const refetchSeatMap = useCallback(async (): Promise<SeatMapResponse | null> => {
    try {
      const fresh = await apiFetch<SeatMapResponse>(`/showtimes/${showtimeId}/seatmap`);
      setSeatMap(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [showtimeId]);

  const { seats, connected } = useShowtimeSeats({
    showtimeId,
    initialSeats: seatMap.seats,
    createClient: createRealtimeClient,
    onResync: refetchSeatMap,
  });

  const needsAgeConfirm = ageRating !== null && AGE_RESTRICTED.includes(ageRating);
  const salesClosed = isSalesClosed(seatMap.showtime.startsAt);
  const selectedSeats = useMemo(() => seats.filter((s) => selectedIds.has(s.id)), [seats, selectedIds]);
  const orphanIds = useMemo(() => new Set(findOrphanSeatIds(seats, selectedIds)), [seats, selectedIds]);
  const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  // Ghế đang chọn của tôi bị người khác giữ/mua (realtime hoặc hết hạn) -> bỏ chọn + báo (AC-06).
  useEffect(() => {
    // Ghế chuyển HELD do chính hold của mình: giữ nguyên lựa chọn, không toast.
    if (holding || hold) return;
    const lost = selectedSeats.filter((s) => s.state !== "FREE");
    if (lost.length === 0) return;
    const labels = lost.map((s) => s.label).join(", ");
    setSelectedIds((prev) => new Set([...prev].filter((id) => !lost.some((s) => s.id === id))));
    toast.warning(`${labels} vừa có người chọn`);
    setAnnouncement(`Ghế ${labels} vừa được người khác giữ`);
  }, [selectedSeats, holding, hold]);

  const announceSelection = (next: SeatMapItem[]) => {
    const sum = next.reduce((acc, s) => acc + s.price, 0);
    setAnnouncement(`Đã chọn ${next.length} ghế, tổng ${formatVnd(sum)}`);
  };

  const handleActivate = (seat: SeatMapItem) => {
    if (auth === "guest") return setLoginOpen(true);
    if (auth === "unconfirmed") return void toast.info("Vui lòng xác nhận email trước khi chọn ghế.");
    if (salesClosed || hold) return;
    const state = visualState(seat, selectedIds.has(seat.id));
    if (state === "selected") {
      const next = selectedSeats.filter((s) => s.id !== seat.id);
      setSelectedIds(new Set(next.map((s) => s.id)));
      return announceSelection(next);
    }
    if (state !== "free" || !isBookableType(seat)) {
      return setAnnouncement(`${seatPositionLabel(seat)} ${SEAT_STATE_LABEL[state]}`);
    }
    if (totalWeight(selectedSeats) + seatWeight(seat) > MAX_SEATS_PER_ORDER) {
      toast.error(`Tối đa ${MAX_SEATS_PER_ORDER} ghế mỗi đơn`);
      return setAnnouncement(`Tối đa ${MAX_SEATS_PER_ORDER} ghế mỗi đơn`);
    }
    const next = [...selectedSeats, seat];
    setSelectedIds(new Set(next.map((s) => s.id)));
    announceSelection(next);
  };

  const handleHoldError = async (error: unknown) => {
    if (error instanceof ApiError && error.code === "SEAT_TAKEN") {
      const fresh = await refetchSeatMap();
      const takenNow = fresh?.seats.filter((s) => selectedIds.has(s.id) && s.state !== "FREE") ?? [];
      // Có dữ liệu mới: effect bỏ chọn + toast từng ghế; không thì báo thông điệp chung.
      if (takenNow.length === 0) toast.error(error.message);
      return;
    }
    toast.error(error instanceof Error ? error.message : "Không giữ được ghế. Vui lòng thử lại.");
  };

  const handleContinue = async () => {
    if (selectedSeats.length === 0 || orphanIds.size > 0 || holding) return;
    setHolding(true);
    let orderId: string | null = null;
    try {
      const res = await apiFetch<HoldSeatsResponse>("/bookings/holds", {
        method: "POST",
        json: { showtimeId, seatIds: selectedSeats.map((s) => s.id) },
      });
      orderId = res.orderId;
      if (needsAgeConfirm) await apiFetch(`/bookings/${res.orderId}/age-confirm`, { method: "POST", json: {} });
      setHold({ orderId: res.orderId, expiresAt: res.holdExpiresAt });
      router.push(`/dat-ve/don/${res.orderId}/xac-nhan`);
    } catch (error) {
      if (orderId) await apiFetch(`/bookings/${orderId}/hold`, { method: "DELETE" }).catch(() => undefined);
      await handleHoldError(error);
      setHolding(false);
    }
  };

  const backToSeatMap = () => {
    setHold(null);
    setExpired(false);
    setHolding(false);
    setSelectedIds(new Set());
    void refetchSeatMap();
  };

  const orphanBlocked = orphanIds.size > 0;
  const canContinue =
    selectedSeats.length > 0 && !orphanBlocked && (!needsAgeConfirm || ageConfirmed) && !ageUnknown && !salesClosed && !holding;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-label="Chọn ghế" className="flex min-w-0 flex-col gap-4">
        {!connected && (
          <p role="status" className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            <WifiOff className="size-4" aria-hidden="true" />
            Mất kết nối. Trạng thái ghế có thể chưa cập nhật.
          </p>
        )}
        {salesClosed && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            Ngừng bán online — vui lòng mua tại quầy.
          </p>
        )}
        {auth === "unconfirmed" && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            Bạn cần xác nhận email trước khi chọn ghế. Hãy kiểm tra hộp thư của bạn.
          </p>
        )}
        <SeatMap seats={seats} selectedIds={selectedIds} orphanIds={orphanIds} onSeatActivate={handleActivate} />
        <SeatLegend pricing={seatMap.pricing} seats={seats} />
        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>
      </section>

      <aside aria-label="Tóm tắt lựa chọn" className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4 lg:sticky lg:top-4 lg:self-start">
        <h2 className="text-h3 font-bold">Ghế đã chọn</h2>
        {hold ? <HoldCountdown expiresAt={hold.expiresAt} onExpire={() => setExpired(true)} /> : null}
        {selectedSeats.length === 0 ? (
          <p className="text-body-sm text-fg-secondary">Chọn ít nhất 1 ghế (tối đa {MAX_SEATS_PER_ORDER}).</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Danh sách ghế đã chọn">
            {selectedSeats.map((s) => (
              <li key={s.id} className="rounded-pill bg-surface-control px-3 py-1 text-body-sm font-semibold">
                {s.label}
              </li>
            ))}
          </ul>
        )}
        {orphanBlocked && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-body-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Không để trống 1 ghế lẻ giữa các ghế. Vui lòng chọn lại.
          </p>
        )}
        {ageUnknown && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            Không xác định được phân loại độ tuổi của phim. Vui lòng tải lại trang để tiếp tục.
          </p>
        )}
        {needsAgeConfirm && ageRating && (
          <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3 text-body-sm">
            <p>
              Phim {ageRating}: chỉ dành cho khán giả từ {AGE_MIN[ageRating]} tuổi. Nhân viên có quyền yêu cầu giấy tờ và
              từ chối vào phòng — vé không được hoàn.
            </p>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={ageConfirmed}
                onCheckedChange={(v) => setAgeConfirmed(v === true)}
                aria-label="Tất cả người xem đủ tuổi theo quy định"
              />
              Tất cả người xem đủ tuổi theo quy định
            </label>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border-subtle pt-3">
          <span className="text-body-sm text-fg-secondary">Tạm tính</span>
          <span className="tabular text-h3 font-bold">{formatVnd(total)}</span>
        </div>
        <Button variant="gradient" size="lg" disabled={!canContinue} aria-busy={holding} onClick={() => void handleContinue()}>
          {holding ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Đang giữ ghế…
            </>
          ) : (
            "Tiếp tục"
          )}
        </Button>
        <p className="text-center text-caption text-danger">Không hỗ trợ huỷ / hoàn vé</p>
      </aside>

      <LoginRequiredDialog open={loginOpen} onOpenChange={setLoginOpen} next={`/dat-ve/${showtimeId}`} />
      <HoldExpiredDialog open={expired} onBackToSeatMap={backToSeatMap} />
    </div>
  );
}
