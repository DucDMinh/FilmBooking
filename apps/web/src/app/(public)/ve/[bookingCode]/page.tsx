import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TicketDetail } from "@/components/ticket/ticket-card";
import { fetchMyOrder, getSessionUser } from "@/components/ticket/ticket-data";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chi tiết vé | CINEMO", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ChiTietVePage({ params }: Readonly<{ params: Promise<{ bookingCode: string }> }>) {
  const { bookingCode } = await params;
  const supabase = await createServerSupabase();
  const user = await getSessionUser(supabase);
  if (!user?.emailConfirmed) notFound();
  // Lọc user_id: đơn của người khác (kể cả khi RLS cho Admin/Staff xem) hoặc không tồn tại đều 404 (AC-17).
  const order = await fetchMyOrder(supabase, user.id, { bookingCode: decodeURIComponent(bookingCode).toUpperCase() });
  if (!order) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/ve" className="inline-flex min-h-11 items-center text-body-sm text-link hover:underline">
        ← Vé của tôi
      </Link>
      <h1 className="mb-4 mt-2 text-h1 font-extrabold">Chi tiết vé</h1>
      <TicketDetail order={order} />
    </main>
  );
}
