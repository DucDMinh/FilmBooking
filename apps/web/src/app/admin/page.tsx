import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/form-utils";
import { TodoDashboard } from "@/components/admin/todo-widgets";

export const metadata: Metadata = { title: "Việc cần làm" };

export default function Page() {
  return (
    <div>
      <PageHeader title="Việc cần làm" description="Đơn, email và suất chiếu cần bạn chú ý." />
      <TodoDashboard />
    </div>
  );
}
