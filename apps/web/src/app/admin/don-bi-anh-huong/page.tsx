"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AffectedOrdersList } from "@/components/admin/affected-orders-list";

function Content() {
  // Liên kết từ màn suất chiếu: ?showtime=<id> lọc sẵn theo suất.
  const showtime = useSearchParams().get("showtime") ?? "";
  return <AffectedOrdersList initialShowtimeId={showtime} />;
}

export default function Page() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
