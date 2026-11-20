/** Ô chọn/nhập của bộ lọc (design-spec §16.3): vuông, nền surface-input, focus viền vàng; ≥ 16px dưới md để iOS không zoom. */
export const FIELD_CLASS =
  "flex h-11 w-full min-w-0 rounded-none border border-border-input bg-surface-input px-3 text-base text-fg outline-hidden transition-colors duration-150 focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand md:h-10 md:text-body";

/**
 * Ô chọn `<select>` gốc ở trạng thái đóng (design-spec "Input/Select/Textarea"): cùng kiểu với ô nhập, cao 44/40px.
 * Popup xổ xuống và mũi tên do `globals.css` (`::picker(select)`, `::picker-icon`) lo. `items-center justify-between`
 * để mũi tên nằm bên phải khi trình duyệt dùng `appearance: base-select`.
 * Bố cục ngoài (khối, chiều rộng) để chỗ dùng thêm; `w-full min-w-0` mặc định như `FIELD_CLASS`.
 */
export const SELECT_FIELD_CLASS =
  "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-none border border-border-input bg-surface-input px-3 text-base text-fg outline-hidden transition-colors duration-150 focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger md:h-10 md:text-body";

/** Nhãn HUD phía trên ô. */
export const FIELD_LABEL_CLASS = "hud";
