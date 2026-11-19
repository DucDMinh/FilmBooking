/** Ô chọn/nhập của bộ lọc (design-spec §16.3): vuông, nền surface-input, focus viền vàng; ≥ 16px dưới md để iOS không zoom. */
export const FIELD_CLASS =
  "flex h-11 w-full min-w-0 rounded-none border border-border-input bg-surface-input px-3 text-base text-fg outline-hidden transition-colors duration-150 focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand md:h-10 md:text-body";

/** Nhãn HUD phía trên ô. */
export const FIELD_LABEL_CLASS = "hud";
