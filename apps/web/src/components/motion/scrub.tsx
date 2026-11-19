import type { CSSProperties, ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * Chuyển động chạy theo vị trí cuộn (design-spec §16.4). Hai component này CHỈ gắn thuộc tính; toàn bộ
 * hiệu ứng nằm ở CSS scroll-driven animations trong globals.css (`[data-scrub]`, `[data-scrub-group]`).
 * Không state, không effect, không scroll listener: chạy được trong server component.
 *
 * Lưu ý: không đặt class `translate-*` / `scale-*` của Tailwind lên phần tử Scrub (hai thuộc tính đó do
 * keyframe điều khiển); hover của phần tử dùng `transform`.
 */

/** ltr = nhóm A (đặt vé, trái sang phải); left/right = hai bên; down = trên xuống; beam = thẻ phim (rơi xuống + tia quét). */
type ScrubKind = "ltr" | "left" | "right" | "down" | "beam";

type PolymorphicProps<Tag extends ElementType> = {
  as?: Tag;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<Tag>, "as" | "className" | "children">;

type ScrubProps<Tag extends ElementType> = PolymorphicProps<Tag> & {
  kind: ScrubKind;
  /** Thứ tự trong nhóm (0-based): phần tử thứ i bắt đầu muộn hơn phần tử trước một đoạn cuộn. Bỏ trống thì không ghi `--i` inline (CSS `:nth-child` hoặc mặc định 0 của `var(--i, 0)` quyết định). */
  i?: number;
  /** Tổng số phần tử của nhóm. Bỏ trống thì kế thừa `--n` từ <ScrubGroup n> (hoặc 1 khi phần tử đứng riêng). */
  n?: number;
};

/** React ghi custom property nguyên văn (không thêm `px`), nên số thuần dùng được trong calc(). */
function withScrubVars(style: CSSProperties | undefined, vars: Record<string, number | undefined>): CSSProperties {
  const defined = Object.entries(vars).filter(([, value]) => value !== undefined);
  return { ...Object.fromEntries(defined), ...style } as CSSProperties;
}

function Scrub<Tag extends ElementType = "div">({
  kind,
  i,
  n,
  as,
  className,
  style,
  ...rest
}: ScrubProps<Tag> & { style?: CSSProperties }) {
  const Component: ElementType = as ?? "div";
  return (
    <Component
      data-scrub={kind}
      className={className}
      style={withScrubVars(style, { "--i": i, "--n": n })}
      {...rest}
    />
  );
}

type ScrubGroupProps<Tag extends ElementType> = PolymorphicProps<Tag> & {
  /** Tổng số phần tử con; các <Scrub> bên trong kế thừa `--n` nên chỉ cần truyền `i`. */
  n?: number;
};

/** Một timeline chung cho cả nhóm (nhóm nhỏ xếp dọc, hoặc khối cần "từng cái một"). */
function ScrubGroup<Tag extends ElementType = "div">({
  n,
  as,
  className,
  style,
  ...rest
}: ScrubGroupProps<Tag> & { style?: CSSProperties }) {
  const Component: ElementType = as ?? "div";
  return (
    <Component
      data-scrub-group=""
      className={className}
      style={withScrubVars(style, { "--n": n })}
      {...rest}
    />
  );
}

export { Scrub, ScrubGroup };
export type { ScrubGroupProps, ScrubKind, ScrubProps };
