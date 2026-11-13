# Review — build-filmbooking layer-6 task-03 · round 1

> Ghi bởi dispatcher từ báo cáo reviewer (agent-guard chặn reviewer ghi trong worktree).

- **Agent:** reviewer
- **Review level:** STRICT
- **Reason:** realtime dùng chung, máy trạng thái giữ ghế (R-60..R-66, AC-06/07), cổng xác nhận tuổi.
- **Blast radius:** toàn file mới (chưa commit): `apps/web/src/app/(public)/dat-ve/[showtimeId]/page.tsx`, `components/booking/{seat-map,seat-legend,hold-countdown,hold-expired-dialog,login-required-dialog,seat-picker}.tsx`, `seat-rules.ts`, `lib/realtime/use-showtime-seats.ts`, test `components/booking/__tests__/seat-map.test.tsx`. Không đổi API/schema/shared. `seat-picker.tsx`, `seat-rules.ts` ngoài scope nhưng hợp lý — chấp nhận.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS — shared 14, api 414, web 206 (13 file), scripts 16 |
| `pnpm build` | PASS, có route `ƒ /dat-ve/[showtimeId]` |

`pnpm --filter @filmbooking/web test/build` bị guard chặn → chạy lệnh root thay. oxlint/aislop/ocr: skip.

## Đã khớp contract thật
- `GET /showtimes/:id/seatmap`, `POST /bookings/holds {showtimeId, seatIds}` → `orderId`/`holdExpiresAt`, `POST /bookings/:id/age-confirm`, `DELETE /bookings/:id/hold`; `SEAT_TAKEN` xử lý riêng.
- Realtime `seat_status_public`: bảng/cột/filter khớp migration, không PII.
- Cleanup interval/listener/channel khi unmount; chống bấm đôi; `sanitizeNext` chống open redirect; email chưa xác nhận bị chặn; tối đa 8 (sweetbox = 2); aria-label đúng định dạng, role=grid, roving tabindex.

## Findings

### MAJOR
- **M-1** Thiếu dòng nhắc "Không hỗ trợ huỷ / hoàn vé" (R-59, design §06). Chỉ có trong khối tuổi `seat-picker.tsx:211-226` (T13+). Đặt ở chân aside `seat-picker.tsx:227-240` dưới nút "Tiếp tục".
- **M-2** Giữ ghế thành công lại bị toast "vừa có người chọn": effect `seat-picker.tsx:86-93` bỏ chọn mọi ghế không còn FREE, không kiểm `holding`/`hold`; sự kiện INSERT HELD của chính mình tới khi còn `await` age-confirm (`:143`) / trước `router.push` (`:145`). Trái design §5.3 (ghế mình giữ hiện "Đang chọn"). Test `seat-map.test.tsx:305-319` không phủ.
- **M-3** Ghế lẻ client chặt hơn server/R-66: server (`20261112140000_hold_seats_hardening.sql:405`) chỉ báo khi `seg_available_before > 2`; client (`seat-rules.ts:79-85`) báo khi dãy trống > 1 → đoạn [A1,A2] giữa barrier chọn 1 ghế bị khoá oan (`seat-picker.tsx:134,161-163`). Client coi sweetbox là barrier (`seat-rules.ts:98`), server không. Test `:149-157` thiếu case đoạn ≤ 2.
- **M-4** (có điều kiện) Handler realtime không kiểm `showtime_id` (`use-showtime-seats.ts:81-90`, interface `:9-13`); override `:113` được đè SOLD; DELETE (filter có thể không áp) từ suất khác cùng phòng có thể làm ghế SOLD hiện Trống. Sửa: bỏ payload khi `row.showtime_id !== showtimeId`. Mock `fakeRealtime` (`:76-99`) bỏ filter.

### MINOR
- m-1 `page.tsx:32-39,53`: loadMovie lỗi → ageRating null → mất checkbox tuổi (R-68), server không kiểm age_confirmed khi thanh toán; tải cả danh sách phim để tìm 1 phim.
- m-2 `seat-picker.tsx:42-48`: hardcode đóng bán 15 phút (R-67 cấu hình theo rạp).
- m-3 `page.tsx:47-49`: suất đã huỷ hiện ErrorState chung.
- m-4 Thiếu ConfirmDialog đơn đang giữ ở suất khác (R-64) — gap API.
- m-5 Quay lại từ 08 khi còn giữ: ghế mình hiện "Đang giữ", không đếm ngược.
- m-6 `seat-legend.tsx:7-13` thiếu "Hỏng".
- m-7 `hold-expired-dialog.tsx:22-24` chưa liệt kê ghế bị nhả.
- m-8 Thiếu test age-confirm + nhả ghế khi lỗi (`seat-picker.tsx:143-148`), assert removeChannel, mock ApiError mất `details`, `createRealtimeClient` inline re-subscribe mỗi render.
- m-9 `use-showtime-seats.ts:107`: reset override lúc refetch có thể nuốt sự kiện.
- AI-readable gate: 2 indicator (SeatPicker ~195 dòng; magic number `hold-countdown.tsx:52-62`) — dưới ngưỡng.

## Verdict
**FAIL** — sửa M-1..M-4 + test cho M-2/M-3/M-4, review round 2.
