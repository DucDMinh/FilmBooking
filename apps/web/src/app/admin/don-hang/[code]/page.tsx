import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/form-utils";
import { OrderDetail } from "@/components/admin/order-detail";

export const metadata: Metadata = { title: "Chi tiết đơn" };

export default async function Page({ params }: Readonly<{ params: Promise<{ code: string }> }>) {
  const { code: rawCode } = await params;
  let code: string;
  try {
    code = decodeURIComponent(rawCode);
  } catch {
    notFound();
  }
  return (
    <div>
      <PageHeader title="Chi tiết đơn" />
      <OrderDetail code={code} />
    </div>
  );
}
