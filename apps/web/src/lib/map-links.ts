export interface DirectionsTarget {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  name: string;
  address: string;
}

/** Toạ độ hợp lệ = cả hai là số hữu hạn (loại null/undefined/NaN/Infinity). */
export function hasValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

/**
 * Link chỉ đường dùng chung cho trang rạp, bản đồ và popup.
 * Dùng Google Maps vì host openstreetmap.org bị DNS một số nhà mạng VN chặn (bug cinema-map).
 */
export function buildDirectionsUrl({ latitude, longitude, name, address }: DirectionsTarget): string {
  if (hasValidCoordinates(latitude, longitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`;
}
