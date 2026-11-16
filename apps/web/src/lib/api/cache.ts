/** Dữ liệu công khai (phim/rạp/tỉnh): cache ở Next 60s (ISR-style) để trang công khai không gọi API mỗi request. */
export const PUBLIC_CACHE = { next: { revalidate: 60 } } as const;
