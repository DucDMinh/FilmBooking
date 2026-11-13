import { Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/states";
import { TicketCard } from "@/components/ticket/ticket-card";
import { fetchMyOrders, getSessionUser, splitUpcomingAndPast, type PaidOrderView } from "@/components/ticket/ticket-data";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Vé của tôi | CINEMO", robots: { index: false } };
export const dynamic = "force-dynamic";

function TicketSection({ title, orders }: Readonly<{ title: string; orders: PaidOrderView[] }>) {
  if (orders.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-h3 font-bold">{title}</h2>
      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <TicketCard order={order} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function VeCuaToiPage() {
  const supabase = await createServerSupabase();
  const user = await getSessionUser(supabase);
  // Khách chưa xác nhận email không được xem vé: danh sách rỗng (ma trận quyền).
  const confirmed = Boolean(user?.emailConfirmed);
  const orders = user && confirmed ? await fetchMyOrders(supabase, user.id) : [];
  const { upcoming, past } = splitUpcomingAndPast(orders, new Date());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-h1 font-extrabold">Vé của tôi</h1>
      {orders.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={Ticket}
          title="Bạn chưa có vé nào"
          description={
            confirmed
              ? "Vé sẽ xuất hiện ở đây sau khi bạn đặt và thanh toán thành công."
              : "Hãy xác nhận email của bạn để xem vé đã đặt."
          }
          action={
            <Link href="/lich-chieu" className={buttonVariants({ variant: "gradient" })}>
              Xem lịch chiếu
            </Link>
          }
        />
      ) : (
        <div className="mt-6 space-y-8">
          <TicketSection title="Sắp tới" orders={upcoming} />
          <TicketSection title="Đã qua" orders={past} />
        </div>
      )}
    </main>
  );
}
