import { formatVnd, formatVnDateTime } from "@filmbooking/shared";

import { cn } from "@/lib/utils";

/** Số tiền VND nguyên: 120000 -> "120.000 ₫". Luôn tabular để cột số thẳng hàng. */
export function Money({ amount, className }: Readonly<{ amount: number; className?: string }>) {
  return <span className={cn("tabular", className)}>{formatVnd(amount)}</span>;
}

/** Thời điểm hiển thị theo giờ Việt Nam (UTC+7), dạng "17:00 14/11/2026". Nhận Date hoặc chuỗi ISO. */
export function DateTime({
  value,
  className,
}: Readonly<{ value: Date | string; className?: string }>) {
  const instant = typeof value === "string" ? new Date(value) : value;
  // Dữ liệu API lỗi không được làm vỡ cả cây render.
  if (Number.isNaN(instant.getTime())) return <span className={className}>—</span>;
  return (
    <time dateTime={instant.toISOString()} className={cn("tabular", className)}>
      {formatVnDateTime(instant)}
    </time>
  );
}
