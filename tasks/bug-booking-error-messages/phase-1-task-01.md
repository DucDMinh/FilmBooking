# Bug booking-error-messages · phase-1-task-01 — Ghi đúng lỗi đặt vé thay vì "Dữ liệu chưa hợp lệ"

- Classification / Risk: BUG (CR-017). Reviewer **NORMAL** (thêm mã lỗi vào catalog dùng chung `packages/shared`; web `Record<ErrorCode,…>` bắt buộc phủ đủ; không đổi DB/nghiệp vụ). Sau CR-016 hoặc song song (file không trùng).
- Spec: R-68, R-61..R-67, R-71, R-90..R-95 (không đổi requirement). Doc as-built: `docs/API_SPEC.md` (bảng mã lỗi + mô tả `/bookings/*`).

## Root cause (đã đo bằng đọc code)
`apps/web/src/lib/api/client.ts` `toApiError` bỏ `message` của server, chỉ map theo `code` qua `error-messages.ts`; `VALIDATION_ERROR` → "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.". Phía API nhiều lỗi nghiệp vụ khác nhau cùng ném `VALIDATION_ERROR`:
- `apps/api/src/modules/booking/booking.helper.ts` `handleHoldError`: `DOB_REQUIRED`, `SEAT_REQUIRED`, `DUPLICATE_SEATS`, `INVALID_SEATS` (RPC `hold_seats`, thông điệp tiếng Việt nằm sau tiền tố `CODE:`).
- `handleVoucherBusinessError` nhánh `default` (`error_code` chưa có trong bảng, vd `VOUCHER_NOT_APPLICABLE_CINEMA` có trong catalog nhưng chưa được map) và `booking.service.ts` `applyVoucher` nhánh lỗi RPC khác.
- `booking.service.ts` `saveConsent`: "Phiên bản điều khoản không hợp lệ".
- Các nhánh `VALIDATION_ERROR` khác trong `modules/booking`, `modules/payment` (rà soát bằng `graphify query`/grep, ghi danh sách vào Evidence).

## Thiết kế
1. **Tách mã lỗi**: thêm mã riêng vào `packages/shared/src/errors.ts` (`ERROR_CODES` + `ERROR_HTTP_STATUS`), ví dụ `DOB_REQUIRED` (422), `INVALID_SEATS` (422), `SEAT_REQUIRED` (422; hoặc gộp có `details.reason` nếu hợp lý), `CONSENT_VERSION_INVALID` (409 hoặc 422), và mã voucher còn thiếu. Không đổi tên mã cũ. Mỗi trường hợp một thông báo đúng nguyên nhân.
2. **API**: `handleHoldError`, `handleVoucherBusinessError` (bổ sung `VOUCHER_NOT_APPLICABLE_CINEMA` nếu RPC trả, và nhánh default KHÔNG còn ném `VALIDATION_ERROR` với `errorCode` thô: ghi log + trả mã/ thông báo phù hợp, không lộ mã nội bộ cho người dùng), `applyVoucher`, `saveConsent`: ném mã mới; `AppException` giữ `message` tiếng Việt cho log. Cập nhật test API.
3. **Web** `apps/web/src/lib/api/error-messages.ts`: thêm thông báo cho mã mới (Vietnamese có dấu, nêu nguyên nhân + hướng xử lý, vd thiếu ngày sinh: "Vui lòng cập nhật ngày sinh trong hồ sơ trước khi đặt vé phim có giới hạn độ tuổi."). `VALIDATION_ERROR` giữ nguyên cho lỗi biểu mẫu thật.
4. **Hiển thị**: `components/booking/seat-picker.tsx` (toast lỗi giữ ghế: với `DOB_REQUIRED` kèm hành động/đường dẫn tới `/tai-khoan`), `app/(public)/dat-ve/don/[id]/xac-nhan/page.tsx` (lỗi xác nhận tuổi, điều khoản, tạo thanh toán hiện đúng thông báo, cùng đường dẫn khi thiếu ngày sinh), `components/booking/voucher-input.tsx` (lỗi voucher cụ thể; nhập rỗng hoặc quá dài kiểm phía client với thông báo riêng "Vui lòng nhập mã giảm giá"). Không đổi logic giữ ghế, đếm giờ, gating checkbox R-71.
5. **Doc reconcile**: `docs/API_SPEC.md` (bảng mã lỗi theo HTTP status + dòng `/bookings/holds`, `/consent`, `/voucher`): thêm mã mới; không động vào `SPECIFICATIONS.md`.
6. **Rà soát**: liệt kê trong Evidence mọi nhánh `VALIDATION_ERROR` đã xem ở `modules/booking`, `modules/payment` và web, nhánh nào tách và nhánh nào giữ (lỗi biểu mẫu thật).

## KHÔNG làm
Không đụng `supabase/migrations` (thông điệp RPC giữ nguyên), `SPECIFICATIONS.md`, `spec/**`, giao diện trang catalog/skeleton/scrub (CR-016), `components/admin/**`, luồng auth. Không đổi hợp đồng body request.

## Files to Create/Modify
- `packages/shared/src/errors.ts`
- `apps/api/src/modules/booking/booking.helper.ts`
- `apps/api/src/modules/booking/booking.service.ts`
- `apps/api/src/modules/booking/__tests__/booking-errors.test.ts`
- `apps/web/src/lib/api/error-messages.ts`
- `apps/web/src/lib/api/__tests__/error-messages.test.ts`
- `apps/web/src/components/booking/seat-picker.tsx`
- `apps/web/src/components/booking/voucher-input.tsx`
- `apps/web/src/app/(public)/dat-ve/don/[id]/xac-nhan/page.tsx`
- `docs/API_SPEC.md`

## Verify
Test-first: test tái hiện (RPC lỗi `DOB_REQUIRED:` … → API ném mã `DOB_REQUIRED`, không phải `VALIDATION_ERROR`; web hiện đúng thông báo) fail trước, pass sau. `pnpm typecheck`, `pnpm lint`, `pnpm test` (shared + api + web) trong worktree (nếu `apps/api` thiếu node_modules trong worktree thì tạo junction như CR-016 hoặc chạy ở root sau merge và ghi rõ). Nếu chạy được Supabase local + API: gọi thật `POST /bookings/holds` với tài khoản chưa có ngày sinh đặt phim T18 và xác nhận mã lỗi + thông báo.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: `POST /bookings/holds` khách thiếu ngày sinh, phim T18 → web hiện "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.".
- Expected: thông báo nêu cần cập nhật ngày sinh trong hồ sơ, kèm đường dẫn; mỗi lỗi đặt vé có thông báo riêng.
- Actual after: (builder điền)
- Evidence: (builder điền, gồm danh sách nhánh VALIDATION_ERROR đã rà)
- Status: (builder điền)
