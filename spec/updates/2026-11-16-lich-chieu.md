# Spec Update — 2026-11-16 lich-chieu
**spec_version:** 3.1.0 → 3.1.0 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · `tasks/bug-lich-chieu/phase-1-task-01.md` (review PASS round 2)

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` và `spec/CHANGELOG.md` giữ nguyên.
- Đây là làm hành vi trang `/lich-chieu` (web) đúng với requirement đã có: **R-35** (lọc lịch chiếu theo tỉnh/thành), **R-43** (lọc theo tỉnh/thành, rạp, ngày chiếu), **R-44** (lịch 7 ngày tới, chọn ngày), **R-37** (xem theo rạp), **R-46** (vẫn render phía server).

## Lỗi đã sửa (UI web, không đổi API)
1. Bộ lọc Khu vực / Phim / Rạp không điều hướng (select không có handler) → nay điều hướng bằng query URL `province`, `movie`, `cinema`, `date`; đổi tỉnh xoá `cinema`.
2. Mặc định chỉ hiện phim đầu tiên → nay hiện mọi phim đang chiếu có suất trong ngày (mỗi phim gọi `/movies/:slug?date=&province=`); chọn rạp → xem theo rạp (lọc thêm theo phim nếu có chọn).
3. Dải 7 ngày không đổi được → nay đổi `?date=`; một dải ngày dùng chung ở đầu kết quả.
4. Tham số URL không hợp lệ (`.`, `..`, `../../x`, rỗng, ngày ngoài hôm nay..+6) bị bỏ qua / rơi về hôm nay, không lỗi 500.

## Ảnh hưởng
- Module: web `/lich-chieu`, component dùng chung `ShowtimeSchedule` (prop mới `hideDateStrip`, mặc định false), `lib/vn-date.ts`, component mới `schedule-filters.tsx`.
- Test: tổ hợp lọc/ngày/tỉnh ở `/lich-chieu`, tham số URL độc hại, nhiều phim, `/phim/[slug]` không hồi quy.
- Không đổi DB / schema / API contract.
- Nợ ngoài phạm vi (bug riêng, chưa sửa): dải ngày ở `/phim/[slug]` vốn hỏng (API chỉ trả 1 ngày; có `?date=` thì `selectedDate` không có `onDateChange`).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 18, specVersion 3.1.0.
