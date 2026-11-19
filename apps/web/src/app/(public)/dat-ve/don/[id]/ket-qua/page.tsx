import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PaymentResult } from "@/components/ticket/payment-result";
import { TicketDetail } from "@/components/ticket/ticket-card";
import { fetchMyOrder, fetchMyOrderShowtimeId, getSessionUser } from "@/components/ticket/ticket-data";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kết quả thanh toán | CINEMO", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * returnUrl của PayOS và đích của đơn 0đ. Server đọc đơn bằng phiên khách, lọc theo user_id (AC-17):
 * đơn của người khác hoặc không tồn tại → 404; đã PAID → hiện vé ngay; chưa → PaymentResult polling
 * payment-status. Query string của PayOS bị bỏ qua hoàn toàn (R-79).
 */
export default async function KetQuaPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const user = await getSessionUser(supabase);
  if (!user) notFound();
  const showtimeId = await fetchMyOrderShowtimeId(supabase, user.id, id);
  if (!showtimeId) notFound();
  const order = await fetchMyOrder(supabase, user.id, { id });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {order ? (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-heading text-h1 font-bold">Đặt vé thành công</h1>
            <p className="mt-1 text-body-sm text-fg-secondary">
              Mã đặt vé của bạn là <strong className="tabular">{order.bookingCode}</strong>. Đưa mã QR bên dưới cho
              nhân viên tại rạp.
            </p>
          </div>
          <TicketDetail order={order} />
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/ve" className={buttonVariants({ variant: "gradient" })}>
              Xem Vé của tôi
            </Link>
            <Link href="/" className={buttonVariants({ variant: "secondary" })}>
              Về trang chủ
            </Link>
          </div>
        </div>
      ) : (
        <PaymentResult orderId={id} showtimeId={showtimeId} />
      )}
    </main>
  );
}
