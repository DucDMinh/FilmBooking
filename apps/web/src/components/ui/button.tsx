import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Vùng chạm ≥ 44px trên mobile (h-11); desktop dày đặc (bảng admin) mới thu nhỏ.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-body-sm font-semibold transition-colors duration-150 outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-brand-hover",
        // CTA chính của luồng đặt vé — tối đa 1 nút gradient mỗi màn (design-tokens §7).
        gradient: "bg-gradient-brand hover:shadow-cta-glow",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline: "border border-border-input bg-transparent text-foreground hover:bg-accent",
        secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        link: "rounded-sm text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-11 px-4 md:h-9 md:px-3",
        lg: "h-12 px-6 text-body",
        icon: "size-11",
      },
    },
    // link là chữ nội dòng: bỏ chiều cao/padding của size (compound đứng sau size nên thắng khi cn gộp).
    compoundVariants: [{ variant: "link", class: "h-auto min-h-0 px-0" }],
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
