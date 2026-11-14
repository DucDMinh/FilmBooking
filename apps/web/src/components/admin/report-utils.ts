"use client";

import { toVnParts } from "@filmbooking/shared/time";
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

export type ReportState<T> =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; data: T[] };

export type ReportParams = Readonly<Record<string, string | undefined>>;

function toQuery(params: ReportParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/**
 * Tải một báo cáo. Đổi bộ lọc → về "loading" (xoá dữ liệu cũ); request cũ về muộn bị huỷ nên
 * không ghi đè bộ lọc mới. Lỗi → "error", không giữ dữ liệu cũ.
 */
export function useReport<T>(path: string, params: ReportParams, enabled = true): ReportState<T> {
  const [state, setState] = useState<ReportState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const query = toQuery(params);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    apiFetch<T[]>(`${path}${query}`, { signal: controller.signal, cache: "no-store" })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data: data ?? [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", retry });
      });
    return () => controller.abort();
  }, [path, query, enabled, attempt, retry]);

  return state;
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam (không theo múi giờ trình duyệt). */
export function vnDateString(instant: Date): string {
  const p = toVnParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Khoảng mặc định: 30 ngày gần nhất tính cả hôm nay (theo giờ VN). */
export function defaultVnRange(now: Date = new Date()): { from: string; to: string } {
  return { from: vnDateString(new Date(now.getTime() - 29 * 86_400_000)), to: vnDateString(now) };
}

/**
 * Khoảng mặc định theo NGÀY CHIẾU: 30 ngày trước đến 30 ngày sau hôm nay (giờ VN), vì suất bị huỷ
 * thường là suất sắp chiếu.
 */
export function defaultVnShowtimeRange(now: Date = new Date()): { from: string; to: string } {
  return { from: vnDateString(new Date(now.getTime() - 30 * 86_400_000)), to: vnDateString(new Date(now.getTime() + 30 * 86_400_000)) };
}

/** "2026-11-14" thành "14/11/2026" (chuỗi ngày thuần, không qua Date để tránh lệch múi giờ). */
export function formatReportDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}
