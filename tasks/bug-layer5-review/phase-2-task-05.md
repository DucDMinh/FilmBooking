# Bug layer5-review · phase-2-task-05 — Checkin Status Color & Cancellation Safety

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-C-checkin-cancel.md` (C4-1, C8-1, C8-2, C8-3)
- Root cause:
  1. **C4-1**: `packages/shared/src/schemas/checkin.ts` định nghĩa màu cho `USED` và `TOO_EARLY` là `"yellow"`, trái AC-12 ("báo đỏ 'Đã sử dụng'"), R-98 và design-spec (chỉ OK là green, còn lại là danger red).
  2. **C8-1**: `affected-csv.ts` thiếu escape chống formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`) cho các trường do người dùng nhập (`note`, `refundReference`, `contact_phone`, `contact_email`).
  3. **C8-2**: `cancellation.service.ts:492-531` (`resendCancelledNotification`) cho phép resend cả email `SENT` và `PENDING` đang được worker claim (gây gửi trùng), không giới hạn/cooldown, tải toàn bảng `email_outbox` để lọc JS (cắt 1000 dòng), nuốt lỗi update/insert, payload thiếu thông tin rạp/phim.
  4. **C8-3**: Ghi nhận hoàn tiền `refundManual` không nguyên tử, 2 request đồng thời tạo 2 dòng `REFUNDED_MANUAL` dẫn tới tính đúp tiền hoàn trong báo cáo; `refundedAmount` cho phép 0 hoặc vượt `total_amount`; update `orders` thừa và bỏ qua lỗi.
- Files to Create/Modify:
  - `packages/shared/src/schemas/checkin.ts`
  - `packages/shared/src/schemas/cancellation.ts`
  - `apps/api/src/modules/cancellation/affected-csv.ts`
  - `apps/api/src/modules/cancellation/cancellation.service.ts`
  - `apps/api/test/checkin.e2e-spec.ts`
  - `apps/api/test/cancellation.e2e-spec.ts`
- Status: done

## Repro Verification
- Original repro:
  1. Quét vé đã sử dụng -> API trả màu "yellow" thay vì "red".
  2. Ghi chú hoàn tiền chứa `=HYPERLINK(...)` -> xuất CSV chạy lệnh trong Excel.
  3. Bấm gửi lại email trên đơn đã gửi thành công -> gửi lặp lại email cho khách.
  4. 2 request hoàn tiền đồng thời tạo 2 dòng hoàn tiền cho 1 đơn; số tiền hoàn cho phép 0đ.
- Expected:
  - Màu `USED` và `TOO_EARLY` là `"red"`.
  - CSV escape các ký tự khởi đầu bằng `=`, `+`, `-`, `@`, `\t`, `\r` với dấu `'`.
  - Chỉ cho phép resend email khi `status = 'FAILED'`, lọc trực tiếp DB theo `order_id`, bổ sung cooldown/giới hạn.
  - Hoàn tiền thủ công kiểm tra `0 < refundedAmount <= total_amount`, chặn hoàn trùng.
- Actual before fix: Màu vàng, nguy cơ formula injection, spam email trùng, hoàn tiền không nguyên tử.
- Actual after fix:
  1. C4-1: `packages/shared/src/schemas/checkin.ts` định nghĩa màu `USED: "red"`, `TOO_EARLY: "red"`. `checkin.e2e-spec.ts` assert rõ ràng màu red.
  2. C8-1: `affected-csv.ts` escape các ký tự formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`) với tiền tố `'`. E2E test assert escape chuẩn xác.
  3. C8-2: `cancellation.service.ts` `resendEmail` lọc trực tiếp theo `order_id` trong payload, chặn 409 CONFLICT nếu trạng thái là `PENDING` hoặc `SENT`, chỉ resend khi `FAILED` hoặc chưa có email; payload bổ sung đủ `cinema_name`, `movie_title`, `room_name`, `showtime_starts_at`. Bắt lỗi DB insert/update.
  4. C8-3: `recordRefund` kiểm tra status đơn `affected`, kiểm tra trùng qua `affected_order_actions` (409 CONFLICT), schema và service bắt buộc `0 < refundedAmount <= total_amount` (422), bắt lỗi insert/update.
- Evidence:
  - Vitest: 42/42 tests PASS (`apps/api/test/checkin.e2e-spec.ts` 16 tests, `apps/api/test/cancellation.e2e-spec.ts` 26 tests).
  - Lint: `pnpm eslint` trên 6 files không có lỗi hoặc cảnh báo.
  - Typecheck: `packages/shared` PASS, `apps/api` không có lỗi liên quan đến các file thuộc task.
- Status: PASS
