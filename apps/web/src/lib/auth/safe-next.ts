/**
 * Chỉ chấp nhận đường dẫn nội bộ; loại URL tuyệt đối, `//host`, `/\host`, ký tự điều khiển
 * (chống open redirect). Mọi nơi đọc `?next=` rồi redirect (đăng nhập, OAuth callback)
 * BẮT BUỘC gọi hàm này trước khi redirect.
 */
export function sanitizeNext(next: string | string[] | null | undefined): string | null {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  if ([...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) {
    return null;
  }
  return value;
}
