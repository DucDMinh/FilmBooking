import type { Metadata } from "next";

import { UsersAdminPage } from "@/components/admin/users-admin";

export const metadata: Metadata = { title: "Người dùng" };

export default function Page() {
  return <UsersAdminPage />;
}
