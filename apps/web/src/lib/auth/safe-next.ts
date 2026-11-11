/**
 * Chỉ chấp nhận đường dẫn nội bộ; loại URL tuyệt đối, `//host`, `/\host`, ký tự điều khiển
 * (chống open redirect). Mọi nơi đọc `?next=` rồi redirect (đăng nhập, OAuth callback)
 * BẮT BUỘC gọi hàm này trước khi redirect.
 */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if ([...next].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return null;
  return next;
}
