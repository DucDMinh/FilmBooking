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
            "toast-in !rounded-none !border-border !border-l-[3px] !border-l-brand !bg-surface !text-popover-foreground !shadow-overlay",
          description: "!text-fg-secondary",
          success: "!border-l-success",
          error: "!border-l-danger",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
