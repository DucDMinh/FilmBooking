import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/form-utils";
import { OrderSearch } from "@/components/admin/orders-list";

export const metadata: Metadata = { title: "Đơn hàng" };

export default function Page() {
  return (
    <div>
      <PageHeader title="Đơn hàng" description="Tra cứu theo mã đặt vé, email, số điện thoại hoặc mã giao dịch." />
      <OrderSearch />
    </div>
  );
}
