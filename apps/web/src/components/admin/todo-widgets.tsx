"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { DateTime, Money } from "@/components/common/money";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import type { AdminTodoDto, OrderSummaryDto } from "@filmbooking/shared/schemas/orders";

import { useAdminMe } from "./form-utils";
import { mailKindLabel, orderHref } from "./order-utils";
import { useApiResource } from "./use-api-resource";

function TodoCard({
  title,
  count,
  href,
  hrefLabel,
  empty,
  children,
}: Readonly<{ title: string; count: number; href?: string; hrefLabel?: string; empty: string; children: ReactNode }>) {
  return (
    <section className="space-y-3 border border-border-subtle bg-surface p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3 font-bold">
          {title} <Badge tone={count > 0 ? "danger" : "neutral"}>{count}</Badge>
        </h2>
        {href ? (
          <Link href={href} className="inline-flex min-h-11 items-center text-body-sm font-semibold text-brand-hover underline">
            {hrefLabel ?? "Xem tất cả"}
          </Link>
        ) : null}
      </header>
      {count === 0 ? <p className="text-body-sm text-fg-muted">{empty}</p> : <ul className="divide-y divide-border-subtle">{children}</ul>}
    </section>
  );
}

function OrderRow({ order }: Readonly<{ order: OrderSummaryDto }>) {
  return (
    <li>
      <Link href={orderHref(order)} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:bg-surface-elevated">
        <span className="min-w-0">
          <span className="block font-semibold">{order.bookingCode ?? "Chưa có mã"}</span>
          <span className="block text-small text-fg-muted">
            {order.movieTitle} • {order.cinemaName}
          </span>
        </span>
        <Money amount={order.totalAmount} className="text-body-sm" />
      </Link>
    </li>
  );
}

/** Landing nhân sự (D5): việc cần làm theo quyền của người xem. Staff không thấy đơn cần xử lý / email lỗi (API trả rỗng). */
export function TodoDashboard() {
  const { state, reload } = useApiResource<AdminTodoDto>("/admin/todo");
  const { role } = useAdminMe();
  const canManage = role === "ADMIN" || role === "MANAGER";

  if (state.status === "loading") return <LoadingState rows={4} />;
  if (state.status === "error") return <ErrorState description={state.message} onRetry={reload} />;
  const todo = state.data;
  const nothing =
    todo.needsManualReviewCount + todo.affectedCount + todo.failedEmailCount + todo.upcomingShowtimesCount === 0;

  return (
    <div className="space-y-4">
      {nothing ? <EmptyState title="Không có việc cần làm" description="Mọi thứ đang ổn. Quay lại sau nhé." /> : null}
      {canManage ? (
        <TodoCard
          title="Đơn cần xử lý thủ công"
          count={todo.needsManualReviewCount}
          href="/admin/don-can-xu-ly"
          empty="Không có đơn nào cần xử lý."
        >
          {todo.needsManualReviewOrders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </TodoCard>
      ) : null}
      <TodoCard
        title="Đơn bị ảnh hưởng chưa xử lý"
        count={todo.affectedCount}
        href="/admin/don-bi-anh-huong"
        empty="Không có đơn bị ảnh hưởng."
      >
        {todo.affectedOrders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </TodoCard>
      {canManage ? (
        <TodoCard title="Email gửi lỗi" count={todo.failedEmailCount} empty="Không có email lỗi.">
          {todo.failedEmails.map((mail) => (
            <li key={mail.id} className="py-2">
              <span className="block font-semibold">{mail.toEmail}</span>
              <span className="block text-small text-fg-muted">
                {mailKindLabel(mail.kind)} • {mail.attempts} lần thử{mail.lastError ? ` • ${mail.lastError}` : ""}
              </span>
            </li>
          ))}
        </TodoCard>
      ) : null}
      <TodoCard title="Suất sắp bắt đầu (30 phút tới)" count={todo.upcomingShowtimesCount} empty="Không có suất nào sắp bắt đầu.">
        {todo.upcomingShowtimes.map((showtime) => (
          <li key={showtime.id}>
            {canManage ? (
              <Link href={`/admin/lich-chieu/${showtime.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:bg-surface-elevated">
              <span className="min-w-0">
                <span className="block font-semibold">{showtime.movieTitle}</span>
                <span className="block text-small text-fg-muted">
                  {showtime.cinemaName} • {showtime.roomName} • {showtime.format}
                </span>
              </span>
              <DateTime value={showtime.startsAt} className="text-body-sm" />
            </Link>
            ) : (
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block font-semibold">{showtime.movieTitle}</span>
                <span className="block text-small text-fg-muted">
                  {showtime.cinemaName} • {showtime.roomName} • {showtime.format}
                </span>
              </span>
              <DateTime value={showtime.startsAt} className="text-body-sm" />
            </div>
            )}
          </li>
        ))}
      </TodoCard>
    </div>
  );
}
