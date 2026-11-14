import type { Metadata } from "next";

import { SettingsAdminPage } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Cấu hình" };

export default function Page() {
  return <SettingsAdminPage />;
}
