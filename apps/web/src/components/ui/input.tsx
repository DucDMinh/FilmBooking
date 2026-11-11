import type * as React from "react";

import { cn } from "@/lib/utils";

// text-base (16px) dưới md để iOS không tự zoom khi focus; từ md dùng cỡ body 14px.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-sm border border-input bg-surface-input px-3 text-base text-foreground transition-colors duration-150 outline-hidden placeholder:text-muted-foreground md:h-10 md:text-body",
        "file:inline-flex file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-danger aria-invalid:ring-danger/30",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
