# Bug layer5-review · phase-1-task-03 — Booking Consent Atomicity, Ownership Scoping & Seatmap Visibility

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-A-booking.md` (A/MAJOR-2, A/MAJOR-3, A/MAJOR-4, A/MAJOR-5) & Review Round 1 FAIL report
- Root cause:
  1. **A/MAJOR-2**: Lưu bằng chứng đồng ý (R-71, R-133, AC-08) không nguyên tử: `orders.update` và `consents.insert` chạy song song bằng `Promise.all` độc lập; `accepted_at` của consents dùng DB `now()` còn `orders.consent_at` dùng Node `Date.now()`; `version` do client tự do khai không đối chiếu server; IP bị gán mặc định `"127.0.0.1"` giả tạo khi thiếu.
  2. **A/MAJOR-3**: `releaseHold`, `applyVoucher`, `removeVoucher` không kiểm tra quyền sở hữu đơn ở tầng API; các RPC DB còn nhánh Staff/Manager của rạp (di sản POS), cho phép nhân viên thao tác huỷ đơn hoặc áp/gỡ voucher trên đơn của khách.
  3. **A/MAJOR-4**: `SeatmapService.loadShowtimeAndRoom` dùng client admin nhưng chỉ lọc `status === 'CANCELLED'`, bỏ qua điều kiện `cinemas.status = 'OPEN'` và `movies.status = 'PUBLISHED'` mà RLS công khai bắt buộc, làm lộ sơ đồ ghế của rạp đóng cửa hoặc phim chưa phát hành. Ở Round 1, query PostgREST select `cinemas(status)` trực tiếp từ bảng `showtimes` - trong khi schema DB thật không có quan hệ Foreign Key đơn lẻ `showtimes.cinema_id -> cinemas.id` (chỉ có composite FK tới `rooms`), dẫn tới lỗi `PGRST200` trên Supabase thật. `FakeDb` trong test gán quan hệ giả tạo False-confidence.
  4. **A/MAJOR-5**: Lệch HTTP status: AC-08 yêu cầu `409 CONSENT_REQUIRED` nhưng `packages/shared/src/errors.ts` định nghĩa `CONSENT_REQUIRED: 422`.
  5. **MINOR-1**: `booking.service.ts` có 366 dòng, vượt trần `max_file_lines: 300` trong `project-config.md`.
- Files to Create/Modify:
  - `apps/api/src/modules/booking/booking.service.ts`
  - `apps/api/src/modules/booking/booking.controller.ts`
  - `apps/api/src/modules/booking/booking.helper.ts`
  - `apps/api/src/modules/booking/seatmap.service.ts`
  - `packages/shared/src/errors.ts`
  - `packages/shared/src/schemas/booking.ts`
  - `apps/api/test/booking.e2e-spec.ts`
- Status: done
- Review: STRICT PASS (Round 2, .context/review-reports/bug-layer5-review-phase-1-task-03-round-2-review.md)
- Doc impact: no doc impact (chuẩn hóa HTTP status code 409 theo AC-08; không đổi public endpoint shape)

## Repro Verification
- Original repro:
  1. Gửi body consent với `{ version: "99.9.9" }` -> được chấp nhận không kiểm tra; IP vắng mặt biến thành "127.0.0.1"; insert consents lỗi thì đơn vẫn có `consent_at`.
  2. Nhân viên hoặc người dùng khác gọi `DELETE /bookings/:id/hold` hoặc `POST /bookings/:id/voucher` của khách khác -> được phép thực thi.
  3. Suất chiếu thuộc rạp `TEMP_CLOSED` hoặc phim `DRAFT` gọi `GET /showtimes/:id/seatmap` -> trả về sơ đồ ghế và giá bình thường thay vì 404. Ngoài ra query `cinemas(status)` trên `showtimes` nổ `PGRST200` vì không có foreign key relationship đơn lẻ trong PostgREST schema cache.
  4. Thanh toán khi chưa consent trả lỗi với mã HTTP 422 thay vì 409 theo AC-08.
- Expected:
  - `saveConsent` ghi nhận `consents` trước để lấy chính xác `accepted_at`, sau đó cập nhật `orders.consent_at = accepted_at`; kiểm tra `version` server-enforced; IP null nếu không có.
  - `releaseHold`, `applyVoucher`, `removeVoucher` kiểm tra chủ đơn (`order.user_id === user.id`) qua `verifyOrderActionEligibility`, từ chối 403 nếu không phải chủ đơn.
  - `loadShowtimeAndRoom` query `movies(status)` trên `showtimes` và query riêng `cinemas` song song với `rooms` qua `Promise.all`, kiểm tra `cinemas.status === 'OPEN'` và `movies.status === 'PUBLISHED'`, ném 404 NOT_FOUND nếu không thoả.
  - `CONSENT_REQUIRED` có status code là 409 trong `errors.ts`, đáp ứng AC-08.
  - `FakeDb` không gán join `row.cinemas` giả và mô phỏng lỗi `PGRST200` nếu query sai schema relationship.
  - `booking.service.ts` dưới 300 dòng tuân thủ `project-config.md`.
- Actual before fix: Thiếu kiểm quyền chủ đơn ở API, sơ đồ ghế lộ suất không công khai, consent không đồng bộ và tự khai version, status code 422, query `cinemas(status)` từ `showtimes` nổ `PGRST200` trên Supabase thật.
- Actual after fix:
  1. `saveConsent` insert bản ghi vào `consents` trước để lấy chính xác `accepted_at` do DB sinh, sau đó cập nhật `orders.consent_at = accepted_at`; kiểm tra server-enforced version (chỉ nhận "1.0.0", từ chối phiên bản khác với 400 VALIDATION_ERROR); lưu IP `null` nếu không có thay vì tự tiện fake "127.0.0.1".
  2. `releaseHold`, `applyVoucher`, `removeVoucher` gọi `verifyOrderActionEligibility` ở đầu hàm, kiểm tra `order.user_id === user.id`, từ chối 403 FORBIDDEN nếu là non-owner hoặc Staff/Manager.
  3. `loadShowtimeAndRoom` bỏ `cinemas(status)` khỏi query `showtimes`, truy vấn `cinemas` riêng độc lập bằng `Promise.all` cùng `rooms`, kiểm tra `cinemaStatus === 'OPEN'` và `movieStatus === 'PUBLISHED'`, ném 404 NOT_FOUND ("Suất chiếu không khả dụng") nếu không hợp lệ.
  4. `packages/shared/src/errors.ts` cập nhật `CONSENT_REQUIRED: 409`, đáp ứng đúng AC-08 và API_SPEC.
  5. `FakeDb` xoá gán quan hệ `row.cinemas` giả và mô phỏng lỗi `PGRST200` nếu câu query embedding `cinemas(` trên `showtimes`. Bổ sung test case regression.
  6. Tách helper sang `booking.helper.ts`, đưa `booking.service.ts` về 299 dòng (< 300 dòng), tuân thủ `max_file_lines: 300`.
- Evidence:
  - `pnpm exec vitest run test/booking.e2e-spec.ts`: 42/42 tests PASS.
  - `pnpm test`: PASS 100% (391 tests apps/api, 156 tests apps/web, 14 tests packages/shared, 16 tests scripts - tổng 577 tests).
  - `pnpm typecheck`: PASS 100% (packages/shared, apps/web, apps/api).
  - `pnpm lint`: PASS 100% (packages/shared, apps/web, apps/api).
  - `pnpm build`: PASS 100% (apps/api dist 96 files, apps/web static & dynamic routes).
- Status: PASS
