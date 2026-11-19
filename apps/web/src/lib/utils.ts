import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Token CINEMO/CYBERPLEX (text-body, text-hud, font-heavy, rounded-hero...) không có trong bảng mặc định của
// tailwind-merge; thiếu khai báo thì `text-body` bị coi là màu chữ và xoá nhầm `text-fg`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h1", "h2", "h3", "body", "body-sm", "small", "hud", "caption"] },
      ],
      "font-weight": [{ font: ["regular", "heavy"] }],
      rounded: [{ rounded: ["seat", "hero"] }],
      shadow: [{ shadow: ["overlay", "cta-glow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
