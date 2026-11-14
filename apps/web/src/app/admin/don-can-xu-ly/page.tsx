import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/form-utils";
import { ManualReviewQueue } from "@/components/admin/orders-list";

export const metadata: Metadata = { title: "Đơn cần xử lý" };

export default function Page() {
  return (
    <div>
      <PageHeader title="Đơn cần xử lý" description="Đơn thanh toán lệch hoặc cần đối soát thủ công." />
      <ManualReviewQueue />
    </div>
  );
}
