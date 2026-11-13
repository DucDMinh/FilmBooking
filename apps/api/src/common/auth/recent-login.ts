/** Đăng nhập (amr) phải nằm trong ngần này giây mới coi là "vừa đăng nhập lại" cho thao tác nhạy cảm. */
export const RECENT_LOGIN_MAX_AGE_SECONDS = 5 * 60;
/** Độ lệch đồng hồ cho phép giữa GoTrue và API; `authTime` vượt xa hơn trong tương lai bị coi là không hợp lệ. */
export const CLOCK_SKEW_TOLERANCE_SECONDS = 60;

/**
 * Phép kiểm "đăng nhập gần đây" dùng chung. `authTime` là `AuthUser.authTime` (max amr timestamp, giây).
 * Fail-closed: null, quá hạn, hoặc nằm ở tương lai quá độ lệch cho phép -> false.
 */
export function isRecentLogin(
  authTime: number | null,
  maxAgeSeconds: number = RECENT_LOGIN_MAX_AGE_SECONDS,
  nowSeconds: number = Date.now() / 1000,
): boolean {
  if (authTime === null) return false;
  const age = nowSeconds - authTime;
  return age <= maxAgeSeconds && age >= -CLOCK_SKEW_TOLERANCE_SECONDS;
}
