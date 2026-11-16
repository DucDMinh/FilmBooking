# Scan: Trang chi tiết phim `/phim/[slug]` — dải chọn ngày — 2026-11-16

## Phạm vi đã soi
- Trang `/phim/[slug]`: lấy dữ liệu, truyền props cho `ShowtimeSchedule`.
- Component `ShowtimeSchedule` / `ScheduleDateStrip` (lọc suất theo ngày).
- API `GET /movies/:slug?date=&province=` (`MoviesService.detail`) và `vnDayRange`.
- Repro trực tiếp trên web 3000 / API 3001 local (chỉ GET, không ghi dữ liệu).

## Classification
- Type: SINGLE-SURFACE
- Source roots: apps/web, apps/api, packages/shared, supabase

## Coverage
- Enumerated surfaces: 5
- Đã soi: 5
- Coverage: 100%

| File | Surface type | Batch | Count | Kết luận |
|---|---|---:|---:|---|
| `apps/web/src/app/(public)/phim/[slug]/page.tsx` | page | 1 | 3 | D1, D2, D3 |
| `apps/web/src/components/catalog/showtime-schedule.tsx` | component | 1 | 2 | D1, D2 |
| `apps/web/src/lib/vn-date.ts` | lib | 1 | 0 | soi, không lỗi (đã có `resolveScheduleDate`, chưa dùng ở trang này) |
| `apps/api/src/modules/catalog/movies.service.ts` | service | 1 | 1 | hành vi đúng thiết kế (mặc định chỉ trả 1 ngày); là điều kiện gây D1 |
| `apps/web/src/components/catalog/__tests__/schedule.test.tsx` | test | 1 | 1 | chỉ test lọc client với dữ liệu truyền sẵn, không phủ luồng trang → D1 lọt |

## Chưa soi
- Không có trong phạm vi. (Ngoài phạm vi, không đụng: `/phim` danh sách, `/rap/[code]` — trang rạp dùng link `?date=` nên không dính D1.)

## CRUD / Capability Matrix
Không áp dụng (trang chỉ đọc).

## Defects

| # | Mô tả | Tái hiện | Expected | Actual | Root cause (file:line) | Severity | File cần sửa | Ước lượng |
|---|-------|----------|----------|--------|------------------------|----------|--------------|-----------|
| D1 | Dải 7 ngày ở trang chi tiết phim chỉ có "Hôm nay" có suất; chọn 6 ngày còn lại luôn hiện "Không có suất chiếu" | Mở `/phim/spider-man-beyond-the-spider-verse` → bấm ngày 17/11…22/11 | Hiện suất của ngày đã chọn (API có 11 suất/ngày cho 17→22/11) | 0 suất cho mọi ngày ≠ hôm nay (API không `?date` = 12 suất, toàn bộ ngày 16/11; UI lọc client trên đúng tập đó) | Page lấy dữ liệu 1 lần không `date` (`phim/[slug]/page.tsx:76`); API chỉ trả 1 ngày, mặc định hôm nay (`movies.service.ts:257`, `:89-91`); `ShowtimeSchedule` chỉ lọc client (`showtime-schedule.tsx:180-192`) và đổi ngày bằng state nội bộ, không refetch/điều hướng (`showtime-schedule.tsx:147-156`) | high (chức năng chính đặt vé từ trang phim) | `phim/[slug]/page.tsx`, `showtime-schedule.tsx` (+ test) | M |
| D2 | Khi URL có `?date=`, bấm ngày khác trên dải không đổi gì | Mở `/phim/<slug>?date=2026-11-18` → bấm 19/11 | Chuyển sang 19/11 | Không đổi: `activeDate = propSelectedDate ?? internalDate` luôn lấy prop, `onDateChange` không được truyền (`page.tsx:223-227`) nên chỉ set state nội bộ không dùng | `showtime-schedule.tsx:148-156` + `phim/[slug]/page.tsx:226` | medium (chỉ vào được qua URL tay; cùng gốc D1 → nên sửa chung) | như D1 | S (gộp D1) |
| D3 | `?date=` hoặc `?province=` sai định dạng làm cả trang phim thành **404** dù phim tồn tại | `/phim/spider-man-beyond-the-spider-verse?date=abc` hoặc `?province=zzz` | Bỏ qua tham số sai (như `/lich-chieu` đã làm) hoặc báo lỗi tham số | Web 404 (API trả 400, `fetchMovieData` nuốt mọi lỗi → `null` → `notFound()`) | `phim/[slug]/page.tsx:34-40` (catch gom 400/5xx/mất kết nối thành `null`) + `:77-79`; tham số không được chuẩn hoá như `resolveScheduleDate` (`vn-date.ts:18`) | low–medium (lỗi do URL tay; nhưng API sập cũng ra 404 sai) | `phim/[slug]/page.tsx` | S |
| D4 | `?date=` ngoài khoảng 7 ngày (vd 2030-01-01) trả 200 nhưng không có ngày nào được chọn trên dải, trang trống | `/phim/<slug>?date=2030-01-01` | Về hôm nay (như `/lich-chieu`) | Dải không highlight, "Không có suất chiếu" | `showtime-schedule.tsx:148` (không validate) | low | cùng D3 (dùng `resolveScheduleDate`) | S (gộp D3) |

## Gợi ý gộp khi sửa (chưa làm)
- **D1 + D2** cùng root cause: trang không điều hướng theo ngày. Hướng nhất quán với `/lich-chieu` (commit 55f3373): trang server đọc `?date=` qua `resolveScheduleDate`, dải ngày đổi `?date=` bằng điều hướng, API được gọi lại cho ngày đó.
- **D3 + D4** cùng chỗ chuẩn hoá tham số, nên làm cùng task với D1/D2 → 1 bug, 1 commit.

## Chưa xác minh / cần thêm info
- Chưa chạy typecheck/lint/test vì đây là soi read-only và đã có bằng chứng bằng repro trực tiếp. 
- `?province=` hợp lệ: trang không có UI chọn tỉnh; chưa rõ có chủ đích hay thiếu (`[cần xác nhận]`, không tính là defect).
- Chưa kiểm tra giao diện trên trình duyệt thật (chỉ đối chiếu logic + dữ liệu API); D1 đủ chắc từ code + số liệu.
