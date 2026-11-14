import type { Metadata } from "next";

import { ReportDashboard } from "@/components/admin/report-dashboard";

export const metadata: Metadata = { title: "Báo cáo" };

// Layout /admin đã chặn người không có vai trò; menu "Báo cáo" chỉ hiện cho Admin/Manager, API từ chối Staff (403).
export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-h2 font-bold">Báo cáo</h1>
      <ReportDashboard />
    </div>
  );
}
