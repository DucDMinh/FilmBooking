import { Scrub } from "@/components/motion/scrub";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  /** Nhãn HUD phía trên tiêu đề (chỉ khi mang thông tin, vd mã rạp). */
  kicker?: string;
  description?: string;
  /** h1 cho tiêu đề trang, h2 cho section. */
  level?: "h1" | "h2";
  id?: string;
  className?: string;
}

/**
 * Tiêu đề section kiểu CYBERPLEX (design-spec §16.4 nhóm B): cả khối rơi từ trên xuống, chữ wipe từ trái sang phải,
 * vạch gradient vẽ ra. Tất cả chạy theo cuộn bằng CSS (không glitch, WCAG 2.3.1); ngoài điều kiện hỗ trợ thì hiển thị tĩnh.
 */
export function SectionHeading({
  title,
  kicker,
  description,
  level = "h2",
  id,
  className,
}: Readonly<SectionHeadingProps>) {
  const Heading = level;
  return (
    <Scrub kind="down" className={className}>
      {kicker ? <p className="hud hud-brand mb-1">{kicker}</p> : null}
      <Heading
        id={id}
        data-scrub-wipe=""
        className={cn(
          "font-heading font-bold uppercase tracking-tight text-fg",
          level === "h1" ? "text-h1" : "text-h2",
        )}
      >
        {title}
      </Heading>
      <span data-scrub-rule="" className="rule-brand" aria-hidden="true" />
      {description ? <p className="mt-3 max-w-2xl text-body text-fg-secondary">{description}</p> : null}
    </Scrub>
  );
}
