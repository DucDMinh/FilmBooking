import type { AgeRating } from "@filmbooking/shared";

import { cn } from "@/lib/utils";

const DESCRIPTIONS: Record<AgeRating, string> = {
  P: "phim phù hợp mọi lứa tuổi",
  K: "phim dành cho khán giả dưới 13 tuổi, xem cùng người giám hộ",
  T13: "phim dành cho khán giả từ 13 tuổi trở lên",
  T16: "phim dành cho khán giả từ 16 tuổi trở lên",
  T18: "phim dành cho khán giả từ 18 tuổi trở lên",
};

// Tone semantic theo design-tokens §1.7 (nền soft + chữ cùng tông, tỉ lệ ≥ 6:1).
const SEMANTIC_TONE: Record<AgeRating, string> = {
  P: "bg-success-soft text-success",
  K: "bg-info-soft text-info",
  T13: "bg-warning-soft text-warning",
  T16: "bg-brand-soft text-brand-hover",
  T18: "bg-danger-banner text-danger-strong",
};

export function AgeBadge({
  rating,
  tone = "neutral",
  className,
}: Readonly<{ rating: AgeRating; tone?: "neutral" | "semantic"; className?: string }>) {
  return (
    <span
      role="img"
      aria-label={`Phân loại ${rating}: ${DESCRIPTIONS[rating]}`}
      className={cn(
        "inline-flex min-w-8 items-center justify-center rounded-pill px-2 py-0.5 text-caption font-semibold",
        tone === "semantic" ? SEMANTIC_TONE[rating] : "bg-age-pill text-fg",
        className,
      )}
    >
      {rating}
    </span>
  );
}

