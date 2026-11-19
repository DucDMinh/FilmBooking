"use client";

import { formatVnd } from "@filmbooking/shared";
import {
  AFFECTED_ORDER_STATUSES,
  EMAIL_DELIVERY_STATUSES,
  type AffectedOrderDto,
  type AffectedOrderStatus,
  type EmailDeliveryStatus,
} from "@filmbooking/shared/schemas/cancellation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api/client";

import {
  canResendEmail,
  downloadAffectedCsv,
  EMAIL_STATUS_LABEL,
  filtersToQuery,
  ORDER_STATUS_LABEL,
  resendErrorMessage,
  type AffectedFilters,
} from "./affected-orders-api";
import { PageHeader, useAdminMe } from "./form-utils";
import { formatVnDate, formatVnTime } from "./showtime-utils";

const SELECT_CLASS =
  "h-11 w-full border border-border-input bg-transparent px-3 text-body-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring";
const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function EmailBadge({ status }: Readonly<{ status: EmailDeliveryStatus | null }>) {
  if (!status) return <span className="text-fg-muted">-</span>;
  const variant = status === "SENT" ? "success" : status === "FAILED" ? "danger" : "neutral";
  return <Badge tone={variant}>{EMAIL_STATUS_LABEL[status]}</Badge>;
}

/**
 * Rạp lọc từ `?cinema=` của topbar: "all"/thiếu -> undefined (server tự giới hạn theo rạp được gán);
 * rạp ngoài danh sách được gán của Staff/Manager bị bỏ. Chỉ là lọc hiển thị — API vẫn kiểm quyền thật.
 */
function resolveCinemaFilter(raw: string | null, me: ReturnType<typeof useAdminMe>["me"]): string | undefined {
  if (!raw || raw === "all" || !me) return undefined;
  if (me.isAdmin) return UUID.test(raw) ? raw : undefined;
  return me.cinemas.some((c) => c.cinemaId === raw) ? raw : undefined;
}

export function AffectedOrdersList({ initialShowtimeId = "" }: Readonly<{ initialShowtimeId?: string }>) {
  const adminMe = useAdminMe();
  const cinemaId = resolveCinemaFilter(useSearchParams().get("cinema"), adminMe.me);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<AffectedOrderStatus | "">("");
  const [emailStatus, setEmailStatus] = useState<EmailDeliveryStatus | "">("");
  const [showtimeInput, setShowtimeInput] = useState(initialShowtimeId);
  const [items, setItems] = useState<AffectedOrderDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resending, setResending] = useState<ReadonlySet<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const resendInFlight = useRef(new Set<string>());

  const showtimeValid = showtimeInput.trim() === "" || UUID.test(showtimeInput.trim());
  const filters: AffectedFilters = {
    status: status || undefined,
    showtimeId: showtimeInput.trim() && showtimeValid ? showtimeInput.trim() : undefined,
    cinemaId,
  };
  const query = filtersToQuery(filters, { limit: PAGE_SIZE, offset });
  const filterKey = filtersToQuery(filters);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Đổi bộ lọc -> về trang đầu.
  useEffect(() => setOffset(0), [filterKey]);

  useEffect(() => {
    if (!showtimeValid || adminMe.loading || adminMe.failed) return;
    let active = true;
    setItems(null);
    setFailed(false);
    apiFetch<{ items: AffectedOrderDto[]; total: number }>(`/admin/affected-orders${query}`, { cache: "no-store" })
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [query, attempt, showtimeValid, adminMe.loading, adminMe.failed]);

  async function resend(order: AffectedOrderDto) {
    if (resendInFlight.current.has(order.id)) return;
    resendInFlight.current.add(order.id);
    setResending(new Set(resendInFlight.current));
    try {
      await apiFetch(`/admin/affected-orders/${order.id}/resend-email`, { method: "POST" });
      toast.success(`Đã đưa email của ${order.bookingCode} vào hàng gửi lại`);
      reload();
    } catch (error) {
      toast.error(resendErrorMessage(error));
    } finally {
      resendInFlight.current.delete(order.id);
      setResending(new Set(resendInFlight.current));
    }
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadAffectedCsv(filters);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không xuất được file CSV. Vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  }

  // API chưa có filter trạng thái email: chỉ lọc được trong trang đang tải (xem ghi chú dưới bộ lọc).
  const visible = items?.filter((o) => !emailStatus || o.emailStatus === emailStatus) ?? null;
  const pageEnd = offset + (items?.length ?? 0);

  return (
    <div>
      <PageHeader
        title="Đơn bị ảnh hưởng"
        description="Đơn của suất chiếu bị huỷ cần hoàn tiền thủ công."
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={exporting} className="min-h-11">
            {exporting ? "Đang xuất…" : "Tải CSV"}
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5 text-body-sm">
          <span>Trạng thái xử lý</span>
          <select
            className={SELECT_CLASS}
            value={status}
            onChange={(e) => setStatus(e.target.value as AffectedOrderStatus | "")}
          >
            <option value="">Tất cả</option>
            {AFFECTED_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-body-sm">
          <span>Trạng thái email</span>
          <select
            className={SELECT_CLASS}
            value={emailStatus}
            onChange={(e) => setEmailStatus(e.target.value as EmailDeliveryStatus | "")}
          >
            <option value="">Tất cả</option>
            {EMAIL_DELIVERY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EMAIL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-body-sm">
          <span>Mã suất chiếu</span>
          <input
            className={SELECT_CLASS}
            value={showtimeInput}
            onChange={(e) => setShowtimeInput(e.target.value)}
            placeholder="Để trống = mọi suất"
            aria-invalid={showtimeValid ? undefined : true}
          />
          {showtimeValid ? null : (
            <span role="alert" className="text-small text-danger-text">
              Mã suất chiếu không hợp lệ
            </span>
          )}
        </label>
      </div>

      <p className="mb-4 text-small text-fg-muted">
        Bộ lọc trạng thái email chỉ áp dụng cho các đơn trong trang đang xem; file CSV áp dụng bộ lọc rạp, suất và
        trạng thái xử lý, không áp dụng bộ lọc email.
      </p>

      {!showtimeValid ? null : adminMe.failed ? (
        <ErrorState onRetry={adminMe.retry} />
      ) : failed ? (
        <ErrorState onRetry={reload} />
      ) : visible === null ? (
        <LoadingState />
      ) : items !== null && items.length === 0 ? (
        <EmptyState title="Không có đơn bị ảnh hưởng" description="Chưa có đơn nào khớp bộ lọc hiện tại." />
      ) : (
        <>
          <p className="mb-2 text-body-sm text-fg-muted">
            Đơn {offset + 1}-{pageEnd} / {total}
            {visible.length < (items?.length ?? 0) ? ` • ${visible.length} đơn khớp bộ lọc email trong trang này` : ""}
          </p>
          {visible.length === 0 ? (
            <p role="status" className="mb-2 text-body-sm">
              Không có đơn nào trong trang này khớp trạng thái email đã chọn. Đơn ở các trang khác có thể vẫn khớp.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Khách</TableHead>
                  <TableHead>Suất chiếu</TableHead>
                  <TableHead>Giá trị</TableHead>
                  <TableHead>Xử lý</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>
                    <span className="sr-only">Thao tác</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/admin/don-bi-anh-huong/${order.id}`} className="font-bold underline">
                        {order.bookingCode}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{order.contactName ?? "-"}</div>
                      <div className="text-small text-fg-muted">{order.contactEmail ?? order.contactPhone ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <div>{order.movieTitle}</div>
                      <div className="text-small text-fg-muted">
                        {order.cinemaName} • {order.roomName} • {formatVnDate(order.showtimeStartsAt)}{" "}
                        {formatVnTime(order.showtimeStartsAt)}
                      </div>
                    </TableCell>
                    <TableCell>{formatVnd(order.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge tone={order.status === "affected" ? "danger" : "success"}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <EmailBadge status={order.emailStatus} />
                    </TableCell>
                    <TableCell>
                      {canResendEmail(order) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-h-11"
                          disabled={resending.has(order.id)}
                          onClick={() => resend(order)}
                          aria-label={`Gửi lại email đơn ${order.bookingCode}`}
                        >
                          {resending.has(order.id) ? "Đang gửi…" : "Gửi lại email"}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Trang trước
            </Button>
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={pageEnd >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Trang sau
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
