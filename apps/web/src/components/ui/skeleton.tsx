import type * as React from "react";

import { cn } from "@/lib/utils";

// Shimmer bằng opacity; tắt khi người dùng bật reduced-motion (design-spec §6).
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-surface-elevated motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
