"use client";

import type { SeatMapItem, SeatMapState } from "@filmbooking/shared/schemas/booking";
import { useEffect, useMemo, useRef, useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase/browser";

/** Payload tối thiểu của postgres_changes trên `seat_status_public` (không có user_id/order_id). */
interface SeatStatusRow {
  showtime_id?: string;
  seat_id?: string;
  state?: "HELD" | "SOLD";
  expires_at?: string | null;
}

interface RealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: SeatStatusRow;
  old: SeatStatusRow;
}

/** Phần Supabase client mà hook cần — tách ra để test bằng mock channel. */
export interface SeatChannelClient {
  channel(name: string): {
    on(type: "postgres_changes", filter: Record<string, string>, cb: (payload: RealtimePayload) => void): {
      subscribe(cb?: (status: string) => void): unknown;
    };
  };
  removeChannel(channel: unknown): unknown;
}

interface SeatOverride {
  state: SeatMapState;
  expiresAt: string | null;
}

export interface UseShowtimeSeatsOptions {
  showtimeId: string;
  initialSeats: SeatMapItem[];
  /** Tick để tự tính "trống" khi expires_at < now (R-60/AC-07: ≤ 2s, không cần cron). */
  tickMs?: number;
  /** Cho test; mặc định client Supabase trình duyệt. */
  createClient?: () => SeatChannelClient;
  /** Gọi khi kênh kết nối lại để nạp lại sơ đồ (tránh lỡ sự kiện lúc mất mạng). */
  onResync?: () => void;
}

/**
 * Trạng thái ghế theo suất: sơ đồ ban đầu + sự kiện Realtime kênh `seats:<showtimeId>`;
 * ghế HELD có expires_at đã qua được client coi là FREE ngay ở tick kế tiếp.
 */
export function useShowtimeSeats({
  showtimeId,
  initialSeats,
  tickMs = 1000,
  createClient = createBrowserSupabase as unknown as () => SeatChannelClient,
  onResync,
}: UseShowtimeSeatsOptions) {
  const [overrides, setOverrides] = useState<Map<string, SeatOverride>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(true);
  // Giữ callback mới nhất trong ref: caller truyền lambda inline cũng không làm kênh subscribe lại.
  const createClientRef = useRef(createClient);
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    createClientRef.current = createClient;
    onResyncRef.current = onResync;
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);

  useEffect(() => {
    let client: SeatChannelClient;
    try {
      client = createClientRef.current();
    } catch {
      setConnected(false);
      return;
    }
    let subscribedBefore = false;
    const channel = client
      .channel(`seats:${showtimeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seat_status_public", filter: `showtime_id=eq.${showtimeId}` },
        (payload) => {
          const row = payload.eventType === "DELETE" ? payload.old : payload.new;
          // Filter phía server có thể không áp cho DELETE: tự lọc để suất khác không đè trạng thái.
          if (!row.seat_id || row.showtime_id !== showtimeId) return;
          const seatId = row.seat_id;
          const next: SeatOverride =
            payload.eventType === "DELETE" || !row.state
              ? { state: "FREE", expiresAt: null }
              : { state: row.state, expiresAt: row.expires_at ?? null };
          setOverrides((prev) => new Map(prev).set(seatId, next));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          if (subscribedBefore) onResyncRef.current?.();
          subscribedBefore = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
        }
      });
    return () => {
      client.removeChannel(channel);
    };
  }, [showtimeId]);

  // Sơ đồ mới nạp lại từ server thay thế mọi override cũ.
  useEffect(() => setOverrides(new Map()), [initialSeats]);

  const seats = useMemo(
    () =>
      initialSeats.map((seat) => {
        const override = overrides.get(seat.id);
        if (seat.state === "LOCKED" || (!override && seat.state === "SOLD")) return seat;
        const state = override?.state ?? seat.state;
        const expiresAt = override ? override.expiresAt : seat.expiresAt;
        if (state === "HELD" && expiresAt && new Date(expiresAt).getTime() <= now) {
          return { ...seat, state: "FREE" as const, expiresAt: null };
        }
        return { ...seat, state, expiresAt };
      }),
    [initialSeats, overrides, now],
  );

  return { seats, connected };
}
