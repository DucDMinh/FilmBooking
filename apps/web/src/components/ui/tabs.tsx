"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

// Danh sách tab cuộn ngang khi hẹp (≥ 360px không vỡ layout).
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("inline-flex w-full items-center gap-1.5 overflow-x-auto p-px", className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "chamfer-md inline-flex min-h-11 shrink-0 items-center justify-center gap-2 bg-surface-tab px-5 font-heading text-body-sm font-bold tracking-btn whitespace-nowrap text-fg-secondary uppercase transition-colors duration-150 outline-hidden",
        "hover:text-foreground disabled:pointer-events-none disabled:opacity-45",
        // Tab đang chọn nền vàng: vòng focus inset (global, T7) đổi sang tối để còn thấy.
        "data-[state=active]:bg-brand data-[state=active]:text-fg-on-brand data-[state=active]:[--focus-inset:var(--color-fg-on-brand)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-hidden", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
