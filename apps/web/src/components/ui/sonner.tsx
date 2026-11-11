"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Chỉ dark (D1/T1): cố định theme="dark", KHÔNG dùng next-themes.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-md !border-border !bg-popover !text-popover-foreground !shadow-overlay",
          description: "!text-fg-secondary",
          success: "!border-success-line",
          error: "!border-danger-line",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
