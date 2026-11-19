import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Nút CYBERPLEX (design-tokens §5.3): chamfer --cut-md, nhãn Chakra Petch UPPERCASE. Vùng chạm >= 44px (h-11).
// Phần tử clip-path nên focus vẽ bằng vòng inset (T7), không dùng ring/outline ngoài. Khung 1px của outline/ghost
// cũng là box-shadow inset (CSS border không đi theo clip-path), nên focus thay thế khung khi đang focus.
// Hover dịch bằng `transform` (không `translate`) để không xung đột với [data-scrub] khi nút là phần tử scrub.
// Bóng cứng lệch (shadow-hard-*) của tham chiếu bị clip-path cắt mất khi đặt trên chính phần tử clip, nên không dùng.
const lift = "hover:[transform:translateY(-1px)] active:[transform:translateY(1px)]";
const framed =
  `${lift} chamfer-md bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--color-frame)] hover:shadow-[inset_0_0_0_1px_var(--color-brand)]`;

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-heading text-body-sm font-bold tracking-btn uppercase transition-[background-color,box-shadow,transform] duration-200 outline-hidden focus-visible:shadow-[inset_0_0_0_2px_var(--focus-inset,var(--color-brand))] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // CTA chính: vàng đặc. Tối đa 1 nút primary mỗi màn (design-tokens §8.1).
        default: `${lift} btn-primary hover:bg-brand-hover`,
        // Tên cũ của CTA chính; giữ để không đổi API, hiển thị y hệt `default` (gradient chỉ còn để trang trí).
        gradient: `${lift} btn-primary hover:bg-brand-hover`,
        destructive:
          `${lift} chamfer-md bg-destructive text-destructive-foreground hover:bg-danger-hover focus-visible:[--focus-inset:var(--color-fg-on-brand)]`,
        // Hành động phụ nhấn mạnh: khung crimson 1px, nền crimson 10%.
        outline:
          `${lift} chamfer-md bg-danger/10 text-foreground shadow-[inset_0_0_0_1px_var(--color-danger)] hover:bg-danger/20`,
        secondary: framed,
        ghost: framed,
        link: "text-link normal-case tracking-normal font-semibold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11.5 px-6",
        sm: "h-11 px-4 md:h-9 md:px-3",
        lg: "h-14 px-8 text-body",
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
