"use client";

import type { CreatePaymentResultDto } from "@filmbooking/shared/schemas/payment";
import type { BookingSummaryResponse } from "@filmbooking/shared/schemas/booking";
import { formatVnd } from "@filmbooking/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BookingStepper } from "@/components/booking/booking-stepper";
import { NoRefundWarning, PolicyConfirmDialog } from "@/components/booking/no-refund-warning";
import { HoldCountdown, PriceBreakdown, ShowtimeInfo } from "@/components/booking/order-summary";
import { VoucherInput } from "@/components/booking/voucher-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";

const AGE_GATED = new Set(["T13", "T16", "T18"]);
const PAYABLE_STATUSES = new Set(["holding", "pending_payment"]);

function needsAgeConfirm(summary: BookingSummaryResponse): boolean {
  return !summary.ageConfirmed && AGE_GATED.has(summary.movie.ageRating ?? "");
}

export default function OrderConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<BookingSummaryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSummary(await apiFetch<BookingSummaryResponse>(`/bookings/${id}`));
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHENTICATED") {
        router.replace(`/dang-nhap?next=${encodeURIComponent(`/dat-ve/don/${id}/xac-nhan`)}`);
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : "Không tải được đơn hàng. Vui lòng thử lại.");
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const markExpired = useCallback(() => setExpired(true), []);

  async function pay() {
    if (!summary) return;
    setDialogOpen(false);
    setPaying(true);
    setPayError(null);
    try {
      if (needsAgeConfirm(summary)) await apiFetch(`/bookings/${id}/age-confirm`, { method: "POST", json: {} });
      // Phiên bản điều khoản do server quyết, client không gửi (R-71, R-133).
      await apiFetch(`/bookings/${id}/consent`, { method: "POST", json: {} });
      const origin = window.location.origin;
      const result = await apiFetch<CreatePaymentResultDto>(`/bookings/${id}/payment`, {
        method: "POST",
        json: { returnUrl: `${origin}/dat-ve/don/${id}/ket-qua`, cancelUrl: `${origin}/dat-ve/don/${id}/xac-nhan` },
      });
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else router.push(`/dat-ve/don/${id}/ket-qua`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "HOLD_EXPIRED") setExpired(true);
      setPayError(
        err instanceof ApiError && err.code !== "UNKNOWN" ? err.message : "Không tạo được thanh toán. Thử lại.",
      );
      setPaying(false);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <ErrorState title="Không tải được đơn hàng" description={loadError} onRetry={() => void load()} />
      </main>
    );
  }
  if (!summary) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <LoadingState />
      </main>
    );
  }
  if (expired || !PAYABLE_STATUSES.has(summary.status)) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <EmptyState
          title="Đơn hàng không còn hiệu lực"
          description="Thời gian giữ ghế đã hết hoặc đơn đã được xử lý. Vui lòng chọn suất và ghế lại."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href={`/dat-ve/${summary.showtime.id}`}>Chọn lại ghế</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/lich-chieu">Chọn suất khác</Link>
              </Button>
            </div>
          }
        />
      </main>
    );
  }

  const needsAge = needsAgeConfirm(summary);
  const canPay = agreed && (!needsAge || ageChecked) && !paying;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 sm:py-8 lg:pb-8">
      <BookingStepper currentStep={3} />
      <Link href={`/dat-ve/${summary.showtime.id}`} className="mt-1 inline-flex min-h-11 items-center text-body-sm text-link hover:underline">
        ← Đổi ghế
      </Link>
      <h1 className="mt-2 font-heading text-h1 font-bold">Xác nhận đơn hàng</h1>
      <p className="mt-1 text-body-sm text-fg-secondary">Kiểm tra kỹ rạp, suất chiếu và ghế trước khi thanh toán.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
        <ShowtimeInfo summary={summary} />
        <aside className="frame">
         <div className="frame-in space-y-4 p-4 sm:p-6">
          <h2 className="font-heading text-h3 font-bold">Tổng thanh toán</h2>
          <HoldCountdown initialSeconds={summary.expiresInSeconds} onExpire={markExpired} />
          <VoucherInput orderId={id} appliedCode={summary.voucher?.code ?? null} onChanged={load} />
          <PriceBreakdown summary={summary} />
          <NoRefundWarning
            cinema={summary.cinema}
            showtime={summary.showtime}
            agreed={agreed}
            onAgreedChange={setAgreed}
            ageCheck={needsAge ? { checked: ageChecked, onChange: setAgeChecked } : undefined}
          />
          {payError ? (
            <p role="alert" className="border-l-[3px] border-danger bg-danger-banner px-3 py-2 text-body-sm text-danger-strong">
              {payError}
            </p>
          ) : null}
          <div className="max-lg:sticky max-lg:bottom-0 max-lg:-mx-4 max-lg:border-t max-lg:border-border max-lg:bg-surface max-lg:p-4 space-y-2">
            <Button
              variant="gradient"
              size="lg"
              className="w-full"
              disabled={!canPay}
              aria-describedby={agreed ? undefined : "pay-hint"}
              onClick={() => setDialogOpen(true)}
            >
              {paying ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Thanh toán {formatVnd(summary.pricing.total)}
            </Button>
            {!agreed ? (
              <p id="pay-hint" className="text-center text-caption text-fg-muted">
                Nút chỉ khả dụng sau khi xác nhận điều khoản
              </p>
            ) : null}
          </div>
         </div>
        </aside>
      </div>
      <PolicyConfirmDialog
        cinema={summary.cinema}
        showtime={summary.showtime}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={() => void pay()}
      />
    </main>
  );
}
