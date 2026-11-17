"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { CheckinResult, formatDateTime, RESULT_LABEL } from "@/components/staff/checkin-result";
import { QrScanner } from "@/components/staff/qr-scanner";
import { loadStaffCinemas, readSelectedCinemaId, type StaffCinema } from "@/components/staff/staff-cinema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { ScanTicketResponse } from "@filmbooking/shared/schemas/checkin";

const HISTORY_SIZE = 5;

interface HistoryEntry {
  at: string;
  code: string;
  result: ScanTicketResponse["result"];
}

/** Lịch sử không bao giờ hiện qr_token (là credential của đơn). */
function displayCode(kind: "token" | "bookingCode", value: string, response: ScanTicketResponse): string {
  if (response.order?.bookingCode) return response.order.bookingCode;
  return kind === "bookingCode" ? value : "Mã QR";
}

/** Màn 17: quét QR / nhập mã, kết quả toàn màn hình, lịch sử 5 lượt gần nhất. */
export default function ScanTicketPage() {
  const router = useRouter();
  const [cinema, setCinema] = useState<StaffCinema | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanTicketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastCode, setLastCode] = useState("");
  // Khoá sau MỖI lần giải mã (kể cả lỗi) tới khi nhân viên bấm tiếp: tránh camera spam API (throttler theo IP).
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStaffCinemas()
      .then((list) => {
        const found = list.find((c) => c.id === readSelectedCinemaId()) ?? (list.length === 1 ? list[0] : null);
        if (found) setCinema(found);
        else router.replace("/staff/chon-rap");
      })
      .catch(() => setError("Không tải được thông tin rạp. Vui lòng tải lại trang."));
  }, [router]);

  const submit = useCallback(
    async (kind: "token" | "bookingCode", value: string) => {
      const trimmed = value.trim();
      if (!cinema || !trimmed || lockedRef.current) return;
      lockedRef.current = true;
      setLocked(true);
      setLastCode(trimmed);
      setError(null);
      try {
        const response = await apiFetch<ScanTicketResponse>("/checkin/scan", {
          method: "POST",
          json: { cinemaId: cinema.id, [kind]: trimmed },
        });
        setResult(response);
        setHistory((prev) =>
          [{ at: new Date().toISOString(), code: displayCode(kind, trimmed, response), result: response.result }, ...prev].slice(0, HISTORY_SIZE),
        );
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Không soát được vé. Vui lòng thử lại.");
      }
    },
    [cinema],
  );

  function unlock() {
    lockedRef.current = false;
    setLocked(false);
  }

  function closeResult() {
    setResult(null);
    setCode("");
    unlock();
    inputRef.current?.focus();
  }

  function retryAfterError() {
    setError(null);
    unlock();
  }

  function onManualSubmit(event: FormEvent) {
    event.preventDefault();
    // Nhập tay là hành động chủ động: được phép thử lại ngay cả khi lần quét trước báo lỗi.
    if (!result) unlock();
    void submit("bookingCode", code);
  }

  if (!cinema) {
    return <p className="p-6 text-body text-fg-secondary">{error ?? "Đang tải…"}</p>;
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 px-4 py-4 md:max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-sm text-fg-secondary">Đang làm việc tại {cinema.name}</p>
        <Link
          href="/staff/chon-rap"
          className="inline-flex min-h-11 items-center rounded-full bg-success-soft px-3 text-body-sm font-semibold text-success"
        >
          {cinema.code} • Đổi rạp
        </Link>
      </div>
      <QrScanner paused={locked} onScan={(text) => void submit("token", text)} />
      <form onSubmit={onManualSubmit} className="flex gap-2">
        <Input
          ref={inputRef}
          aria-label="Nhập mã vé"
          placeholder="HN01-7K3P9Q"
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit">Tra cứu vé</Button>
      </form>
      {error ? (
        <div role="alert" className="flex items-center justify-between gap-2 text-body-sm text-danger">
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={retryAfterError}>
            Thử lại
          </Button>
        </div>
      ) : null}
      <section aria-label="Lịch sử quét gần đây">
        <h2 className="mb-2 text-h3 font-bold">Quét gần đây</h2>
        <ul className="space-y-1 text-body-sm text-fg-secondary">
          {history.length === 0 ? <li>Chưa có lượt quét.</li> : null}
          {history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              {formatDateTime(h.at)} • {h.code} • {RESULT_LABEL[h.result]}
            </li>
          ))}
        </ul>
      </section>
      {result ? <CheckinResult response={result} scannedCode={lastCode} onNext={closeResult} /> : null}
    </main>
  );
}
