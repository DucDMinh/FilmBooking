import type { ReactNode } from "react";

/**
 * Luồng đặt vé (design-spec §16.4): phần nằm trong khung nhìn lúc vào trang phải hiện đủ ngay, không chờ animation,
 * nên inset đáy của scrub về 0 cho cả route. Ghế đang chọn không bao giờ bị thu về.
 */
export default function DatVeLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="scrub-inset-0">{children}</div>;
}
