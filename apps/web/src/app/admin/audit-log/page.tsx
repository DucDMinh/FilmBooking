import type { Metadata } from "next";

import { AuditLogAdminPage } from "@/components/admin/audit-log-view";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AuditLogAdminPage />;
}
