"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DateTime, Money } from "@/components/common/money";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  resolveManualReviewSchema,
  type OrderDetailDto,
  type OrderSummaryDto,
} from "@filmbooking/shared/schemas/orders";

import { TextField, useAdminMe } from "./form-utils";
import { OrderTimeline } from "./order-timeline";
import { affectedActionLabel, canResolveOrder, isManualReviewResolved, isUuid, orderStatusView, paymentStatusLabel } from "./order-utils";
import { useApiResource } from "./use-api-resource";

type Resolution = "CONFIRM_SALE" | "REFUND_MANUAL";

const RESOLUTION_LABEL: Record<Resolution, string> = {
  CONFIRM_SALE: "Xác nhận đã bán (giữ vé)",
  REFUND_MANUAL: "Hoàn tiền thủ công",
};

const FIELD_MESSAGE: Record<string, string> = {
  note: "Ghi chú tối đa 1000 ký tự.",
  refundReference: "Nhập mã giao dịch ngân hàng của khoản hoàn.",
  refundedAmount: "Nhập số tiền đã hoàn (số nguyên từ 0).",
};

/** Xác nhận đơn tồn tại theo mã đặt vé (hoặc id) rồi tải chi tiết. */
function useOrderDetail(code: string) {
  const byId = isUuid(code);
  const lookup = useApiResource<{ items: OrderSummaryDto[] }>(
    byId ? null : `/admin/orders?${new URLSearchParams({ bookingCode: code, limit: "5" }).toString()}`,
  );
  const exact =
    lookup.state.status === "ready"
      ? lookup.state.data.items.filter((o) => o.bookingCode?.toLowerCase() === code.toLowerCase())
      : [];
  const orderId = byId ? code : exact.length === 1 ? (exact[0]?.id ?? null) : null;
  const detail = useApiResource<OrderDetailDto>(orderId ? `/admin/orders/${orderId}` : null);
  const notFound = !byId && lookup.state.status === "ready" && exact.length !== 1;
  const lookupFailed = !byId && lookup.state.status === "error";
  const lookupLoading = !byId && lookup.state.status === "loading";
  return { lookup, detail, notFound, lookupFailed, lookupLoading };
}

function ResolveForm({
  order,
  onResolved,
  onConflict,
}: Readonly<{ order: OrderDetailDto; onResolved: () => void; onConflict: (message: string) => void }>) {
  const [action, setAction] = useState<Resolution>("CONFIRM_SALE");
  const [note, setNote] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [refundedAmount, setRefundedAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const refund = action === "REFUND_MANUAL";
    const parsed = resolveManualReviewSchema.safeParse({
      action,
      note: note.trim() === "" ? undefined : note,
      refundReference: refund ? refundReference : undefined,
      refundedAmount: refund && refundedAmount.trim() !== "" ? Number(refundedAmount) : undefined,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        next[field] ??= FIELD_MESSAGE[field] ?? "Dữ liệu chưa hợp lệ.";
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await apiFetch(`/admin/orders/${order.id}/resolve-manual-review`, { method: "POST", json: parsed.data });
      toast.success("Đã ghi xử lý đơn.");
      onResolved();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
      // CONFLICT = đơn vừa được xử lý ở nơi khác. Form sẽ bị unmount khi tải lại → đẩy thông báo lên OrderDetail để còn hiển thị.
      if (error instanceof ApiError && error.code === "CONFLICT") {
        onConflict(message);
      } else {
        setErrors({ form: message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label="Xử lý đơn thủ công"
      className="space-y-4 rounded-lg border border-danger-line bg-surface p-4 md:p-6"
    >
      <h2 className="text-h3 font-bold">Xử lý đơn thủ công</h2>
      <fieldset className="space-y-2">
        <legend className="text-body-sm font-semibold">Hướng xử lý</legend>
        {(Object.keys(RESOLUTION_LABEL) as Resolution[]).map((value) => (
          <label key={value} className="flex min-h-11 items-center gap-2 text-body-sm">
            <input type="radio" name="resolution" value={value} checked={action === value} onChange={() => setAction(value)} />
            {RESOLUTION_LABEL[value]}
          </label>
        ))}
      </fieldset>
      {action === "REFUND_MANUAL" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="resolve-ref"
            label="Mã giao dịch hoàn tiền"
            value={refundReference}
            onChange={setRefundReference}
            error={errors.refundReference}
            required
          />
          <TextField
            id="resolve-amount"
            label="Số tiền đã hoàn (đ)"
            value={refundedAmount}
            onChange={setRefundedAmount}
            error={errors.refundedAmount}
            hint={Number(refundedAmount) > order.totalAmount ? "Số tiền hoàn lớn hơn tổng đơn. Vui lòng kiểm tra lại." : undefined}
            inputMode="numeric"
            required
          />
        </div>
      ) : null}
      <TextField id="resolve-note" label="Ghi chú" value={note} onChange={setNote} error={errors.note} />
      {errors.form ? (
        <p role="alert" className="text-body-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Đang ghi…" : "Ghi xử lý"}
      </Button>
    </form>
  );
}

function Fact({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <dt className="text-small text-fg-muted">{label}</dt>
      <dd className="text-body-sm font-semibold">{children}</dd>
    </div>
  );
}

function OrderBody({
  order,
  canResolve,
  onResolved,
  onConflict,
}: Readonly<{ order: OrderDetailDto; canResolve: boolean; onResolved: () => void; onConflict: (message: string) => void }>) {
  const pendingReview = order.status === "needs_manual_review" && !order.manualReviewResolvedAt;
  const statusView = orderStatusView(order);
  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-lg border border-border-subtle bg-surface p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h3 font-bold">{order.bookingCode ?? "Đơn chưa có mã đặt vé"}</h2>
          <Badge tone={statusView.tone}>{statusView.label}</Badge>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Phim">{order.movieTitle}</Fact>
          <Fact label="Rạp / phòng">
            {order.cinemaName} • {order.roomName}
          </Fact>
          <Fact label="Suất chiếu">
            <DateTime value={order.showtimeStartsAt} />
          </Fact>
          <Fact label="Email">{order.contactEmail ?? "—"}</Fact>
          <Fact label="Số điện thoại">{order.contactPhone ?? "—"}</Fact>
          <Fact label="Tổng tiền">
            <Money amount={order.totalAmount} />
            {order.discountAmount > 0 ? <span className="text-small text-fg-muted"> (giảm {order.discountAmount.toLocaleString("vi-VN")} đ)</span> : null}
          </Fact>
        </dl>
        {isManualReviewResolved(order) && order.manualReviewResolvedAt ? (
          <p className="text-body-sm text-fg-secondary">
            Đã giải quyết thủ công lúc <DateTime value={order.manualReviewResolvedAt} />. Xem ghi chú ở lịch sử trạng thái.
          </p>
        ) : null}
        {order.cancelReason ? <p className="text-body-sm text-fg-secondary">Lý do huỷ: {order.cancelReason}</p> : null}
        {order.affectedAction ? (
          <p className="text-body-sm text-fg-secondary">
            Đã xử lý: {affectedActionLabel(order.affectedAction.action)}
            {order.affectedAction.refundReference ? ` • mã GD ${order.affectedAction.refundReference}` : ""}
            {order.affectedAction.note ? ` • ${order.affectedAction.note}` : ""}
          </p>
        ) : null}
      </section>
      <section className="space-y-2 rounded-lg border border-border-subtle bg-surface p-4 md:p-6">
        <h2 className="text-h3 font-bold">Vé ({order.tickets.length})</h2>
        {order.tickets.length === 0 ? (
          <p className="text-body-sm text-fg-muted">Chưa có vé.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {order.tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm">
                <span className="font-semibold">{ticket.seatLabel}</span>
                <Money amount={ticket.priceAmount} />
                <span className="text-fg-muted">
                  {ticket.checkedInAt ? (
                    <>
                      Đã soát <DateTime value={ticket.checkedInAt} />
                    </>
                  ) : (
                    "Chưa soát"
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2 rounded-lg border border-border-subtle bg-surface p-4 md:p-6">
        <h2 className="text-h3 font-bold">Thanh toán</h2>
        {order.payments.length === 0 ? (
          <p className="text-body-sm text-fg-muted">Chưa có giao dịch.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {order.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm">
                <span>
                  {paymentStatusLabel(payment.status)} • {payment.transactionRef ?? "chưa có mã GD"}
                </span>
                <Money amount={payment.amount} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4 md:p-6">
        <h2 className="text-h3 font-bold">Lịch sử trạng thái</h2>
        <OrderTimeline history={order.statusHistory} />
      </section>
      {pendingReview && canResolve ? <ResolveForm order={order} onResolved={onResolved} onConflict={onConflict} /> : null}
      {pendingReview && !canResolve ? (
        <p role="note" className="rounded-lg border border-border-subtle bg-surface p-4 text-body-sm text-fg-secondary">
          Đơn đang chờ xử lý thủ công. Chỉ Admin hoặc Quản lý rạp này được ghi xử lý.
        </p>
      ) : null}
    </div>
  );
}

/** Chi tiết đơn theo mã đặt vé (hoặc id). Nút xử lý thủ công chỉ hiện với Admin / Manager đúng rạp của đơn. */
export function OrderDetail({ code }: Readonly<{ code: string }>) {
  const { lookup, detail, notFound, lookupFailed, lookupLoading } = useOrderDetail(code);
  const adminMe = useAdminMe();
  // Thông báo xung đột sống ở đây (không bị unmount khi chi tiết tải lại).
  const [conflict, setConflict] = useState<string | null>(null);
  const banner = conflict ? (
    <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-4 text-body-sm text-danger">
      {conflict}
    </p>
  ) : null;

  const content = (() => {
    if (lookupFailed && lookup.state.status === "error") return <ErrorState description={lookup.state.message} onRetry={lookup.reload} />;
    if (notFound) return <EmptyState title="Không tìm thấy đơn" description="Kiểm tra lại mã đặt vé hoặc quyền truy cập rạp." />;
    if (detail.state.status === "error") {
      if (detail.state.httpStatus === 404) return <EmptyState title="Không tìm thấy đơn" description="Đơn không tồn tại." />;
      return <ErrorState description={detail.state.message} onRetry={detail.reload} />;
    }
    if (detail.state.status === "loading" || lookupLoading || adminMe.loading) return <LoadingState rows={4} />;
    if (adminMe.failed) return <ErrorState description="Không xác định được quyền của bạn." onRetry={adminMe.retry} />;
    const order = detail.state.data;
    return (
      <OrderBody
        order={order}
        canResolve={canResolveOrder(adminMe.me, order.cinemaId)}
        onResolved={() => {
          setConflict(null);
          detail.reload();
        }}
        onConflict={(message) => {
          setConflict(message);
          detail.reload();
        }}
      />
    );
  })();

  return (
    <>
      {banner}
      {content}
    </>
  );
}
