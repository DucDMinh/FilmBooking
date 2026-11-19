import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Tone khớp design-tokens §1.4: nền soft + chữ cùng tông (không viền: border không đi theo clip-path chamfer-sm).
// Chữ lỗi dùng danger-text (danger #FF003C chỉ đạt 4.33 trên bề mặt sáng). Badge luôn có chữ (không chỉ dựa vào màu).
// neutral dùng text-fg-secondary (muted trên neutral-soft chỉ 3.91:1 - fail AA).
const badgeVariants = cva(
  "chamfer-sm inline-flex min-h-7 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden px-2.5 py-1 font-heading text-hud font-bold tracking-[0.12em] whitespace-nowrap uppercase [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-soft text-fg-secondary",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger-text",
        info: "bg-info-soft text-info",
        brand: "bg-brand-soft text-brand",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

function Badge({ className, tone, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
export type { BadgeProps };
