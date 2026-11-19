"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { DateTime, Money } from "@/components/common/money";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api/client";
import { ORDER_STATUSES } from "@filmbooking/shared/enums";
import type { OrderSummaryDto } from "@filmbooking/shared/schemas/orders";

import { TextField } from "./form-utils";
import { ORDER_STATUS_LABEL, canResolveOrder, isManualReviewResolved, orderHref, orderStatusView, useOrdersScope } from "./order-utils";
import { useApiResource } from "./use-api-resource";

const PAGE_SIZE = 20;

interface OrdersPage {
  items: OrderSummaryDto[];
  total: number;
  page: number;
  limit: number;
}

interface Filters {
  bookingCode: string;
  email: string;
  phone: string;
  transactionRef: string;
  status: string;
}

const EMPTY_FILTERS: Filters = { bookingCode: "", email: "", phone: "", transactionRef: "", status: "" };

function buildQuery(filters: Filters, cinemaId: string | undefined, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim() !== "") params.set(key, value.trim());
  }
  if (cinemaId) params.set("cinemaId", cinemaId);
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  return params.toString();
}

function StatusBadge({ order }: Readonly<{ order: OrderSummaryDto }>) {
  const view = orderStatusView(order);
  return <Badge tone={view.tone}>{view.label}</Badge>;
}

function OrdersTable({ items }: Readonly<{ items: readonly OrderSummaryDto[] }>) {
  return (
    <div className="overflow-x-auto border border-border-subtle">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã đặt vé</TableHead>
            <TableHead>Phim / suất</TableHead>
            <TableHead>Rạp</TableHead>
            <TableHead>Khách</TableHead>
            <TableHead>Tổng tiền</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Tạo lúc</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((order) => (
            <TableRow key={order.id}>
              <TableCell>
                <Link href={orderHref(order)} className="inline-flex min-h-11 items-center font-semibold text-brand-hover underline">
                  {order.bookingCode ?? "Chưa có mã"}
                </Link>
              </TableCell>
              <TableCell>
                <span className="block">{order.movieTitle}</span>
                <DateTime value={order.showtimeStartsAt} className="text-small text-fg-muted" />
              </TableCell>
              <TableCell>{order.cinemaName}</TableCell>
              <TableCell>
                <span className="block">{order.contactEmail ?? "-"}</span>
                <span className="block text-small text-fg-muted">{order.contactPhone ?? ""}</span>
              </TableCell>
              <TableCell>
                <Money amount={order.totalAmount} />
              </TableCell>
              <TableCell>
                <StatusBadge order={order} />
              </TableCell>
              <TableCell>
                <DateTime value={order.createdAt} className="text-small" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Pager({ page, total, onPage }: Readonly<{ page: number; total: number; onPage: (next: number) => void }>) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <nav aria-label="Phân trang" className="flex items-center justify-between gap-3">
      <span className="text-body-sm text-fg-muted">
        Trang {page}/{pages} • {total} đơn
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Trước
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Sau
        </Button>
      </div>
    </nav>
  );
}

/** Danh sách đơn theo trang + trạng thái tải/lỗi; dùng chung cho tra cứu và hàng đợi xử lý thủ công. */
function PagedOrders({
  path,
  page,
  onPage,
  emptyTitle,
  emptyDescription,
  hideResolved = false,
}: Readonly<{
  path: string;
  page: number;
  onPage: (next: number) => void;
  emptyTitle: string;
  emptyDescription: string;
  hideResolved?: boolean;
}>) {
  const { state, reload } = useApiResource<OrdersPage>(path);
  if (state.status === "loading") return <LoadingState rows={5} />;
  if (state.status === "error") return <ErrorState description={state.message} onRetry={reload} />;
  // API list chưa lọc đơn đã giải quyết → lọc ở client theo từng trang (xem gap trong report).
  const items = hideResolved ? state.data.items.filter((o) => !isManualReviewResolved(o)) : state.data.items;
  const hasMorePages = page * PAGE_SIZE < state.data.total;
  if (items.length === 0 && !hasMorePages && page <= 1) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <OrdersTable items={items} />
      ) : (
        <p className="text-body-sm text-fg-muted">Trang này không còn đơn chưa giải quyết.</p>
      )}
      <Pager page={page} total={state.data.total} onPage={onPage} />
    </div>
  );
}

/**
 * Tra cứu đơn (R-103). Tìm chỉ theo mã đặt vé: nếu có đúng một đơn trùng mã (không phân biệt hoa/thường)
 * thì mở thẳng chi tiết; ngược lại hiển thị danh sách kết quả.
 */
export function OrderSearch() {
  const router = useRouter();
  const { me, cinemaId } = useOrdersScope();
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Filters) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  const findExactBookingCode = async (code: string): Promise<OrderSummaryDto | null> => {
    const result = await apiFetch<OrdersPage>(`/admin/orders?${buildQuery({ ...EMPTY_FILTERS, bookingCode: code }, cinemaId, 1)}`, {
      cache: "no-store",
    });
    const exact = result.items.filter((o) => o.bookingCode?.toLowerCase() === code.toLowerCase());
    return exact.length === 1 ? (exact[0] ?? null) : null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLookupError(null);
    const code = draft.bookingCode.trim();
    const onlyCode = code !== "" && !draft.email.trim() && !draft.phone.trim() && !draft.transactionRef.trim() && !draft.status;
    if (onlyCode) {
      setBusy(true);
      try {
        const exact = await findExactBookingCode(code);
        if (exact) {
          router.push(orderHref(exact));
          return;
        }
      } catch (error) {
        setLookupError(error instanceof ApiError ? error.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.");
        return;
      } finally {
        setBusy(false);
      }
    }
    setPage(1);
    setApplied(draft);
  };

  if (me.loading) return <LoadingState rows={2} />;
  if (me.failed || !me.role) return <ErrorState description="Không xác định được quyền của bạn." onRetry={me.retry} />;

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 border border-border-subtle bg-surface p-4 md:grid-cols-3 md:p-6">
        <TextField id="order-code" label="Mã đặt vé" value={draft.bookingCode} onChange={set("bookingCode")} />
        <TextField id="order-email" label="Email" value={draft.email} onChange={set("email")} />
        <TextField id="order-phone" label="Số điện thoại" value={draft.phone} onChange={set("phone")} inputMode="numeric" />
        <TextField id="order-tx" label="Mã giao dịch" value={draft.transactionRef} onChange={set("transactionRef")} />
        <div className="space-y-1.5">
          <label htmlFor="order-status" className="text-body-sm font-semibold">
            Trạng thái
          </label>
          <select
            id="order-status"
            value={draft.status}
            onChange={(e) => set("status")(e.target.value)}
            className="h-11 w-full border border-border-input bg-transparent px-3 text-body-sm"
          >
            <option value="">Tất cả</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Đang tìm…" : "Tìm đơn"}
          </Button>
        </div>
        {lookupError ? (
          <p role="alert" className="text-body-sm text-danger-text md:col-span-3">
            {lookupError}
          </p>
        ) : null}
      </form>
      <PagedOrders
        path={`/admin/orders?${buildQuery(applied, cinemaId, page)}`}
        page={page}
        onPage={setPage}
        emptyTitle="Không tìm thấy đơn"
        emptyDescription="Thử đổi điều kiện tìm kiếm."
      />
    </div>
  );
}

/** Hàng đợi đơn needs_manual_review (AC-11). Chỉ Admin/Manager; Staff bị chặn ở API nên hiện thông báo quyền thay vì danh sách. */
export function ManualReviewQueue() {
  const { me, cinemaId } = useOrdersScope();
  const [page, setPage] = useState(1);
  const [showResolved, setShowResolved] = useState(false);

  if (me.loading) return <LoadingState rows={3} />;
  if (me.failed) return <ErrorState onRetry={me.retry} />;
  if (me.role !== "ADMIN" && me.role !== "MANAGER") {
    return <ErrorState title="Không có quyền" description="Chỉ Admin và Quản lý rạp xử lý đơn thủ công." />;
  }
  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  // Scope mặc định có thể là rạp chỉ làm Staff (API sẽ 403) → chỉ lọc theo rạp khi người xem là Admin hoặc Manager rạp đó.
  if (cinemaId && canResolveOrder(me.me, cinemaId)) query.set("cinemaId", cinemaId);
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-center gap-2 text-body-sm">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Hiện cả đơn đã giải quyết
      </label>
      <PagedOrders
        path={`/admin/orders/needs-manual-review?${query.toString()}`}
        page={page}
        onPage={setPage}
        hideResolved={!showResolved}
        emptyTitle="Không có đơn cần xử lý"
        emptyDescription="Mọi đơn đã được xử lý."
      />
    </div>
  );
}
