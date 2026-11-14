"use client";

import { useParams } from "next/navigation";

import { AffectedOrderDetail } from "@/components/admin/affected-order-detail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AffectedOrderDetail orderId={id} />;
}
