/**
 * Kiểm tra xem suất chiếu đã bị đóng bán online chưa (R-67):
 * 1. Suất có status là CLOSED hoặc CANCELLED
 * 2. Hoặc thời điểm hiện tại đã vượt qua mốc (startsAt - cutoffMinutes).
 * Tách khỏi component "use client" để cả trang server (/rap/[code]) và client dùng chung một hàm.
 */
export function isShowtimeOnlineClosed(
  startsAt: string | Date,
  status: string,
  cutoffMinutes = 15,
  now: Date = new Date(),
): boolean {
  if (status === "CLOSED" || status === "CANCELLED") {
    return true;
  }
  const startTime = typeof startsAt === "string" ? new Date(startsAt).getTime() : startsAt.getTime();
  const cutoffTime = startTime - cutoffMinutes * 60 * 1000;
  return now.getTime() >= cutoffTime;
}
