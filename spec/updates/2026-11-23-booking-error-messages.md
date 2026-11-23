# Spec Update — 2026-11-23 booking-error-messages
**spec_version:** 3.6.1 → 3.6.1 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · CR-017 · `tasks/bug-booking-error-messages/phase-1-task-01.md` (review STRICT: round 1 FAIL do thiếu test SeatPicker DOB_REQUIRED, round 2 PASS) · change doc `spec/changes/2026-11-23-booking-error-messages.md` · workItem `bug/booking-error-messages`

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên (catalog mã lỗi chỉ nằm ở `docs/API_SPEC.md`).
- Không đổi requirement; đưa hành vi về đúng ý của **R-68** (kiểm tra độ tuổi cần ngày sinh), **R-61…R-67** (giữ ghế), **R-71** (đồng ý điều khoản), **R-90…R-95** (voucher, trong đó **R-94** lỗi voucher phân biệt rõ): mỗi lỗi đặt vé hiện đúng nguyên nhân, không còn gộp chung thành "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.". Liên quan **AC-08** (xác nhận điều khoản trước khi thanh toán).

## Lỗi đã sửa
1. Triệu chứng: nhiều lỗi đặt vé khác nhau (thiếu ngày sinh, ghế trùng/không hợp lệ/chưa chọn, phiên bản điều khoản sai, voucher lỗi lạ) đều hiện "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.".
2. Root cause: web `toApiError` (`apps/web/src/lib/api/client.ts`) bỏ `message` của server, chỉ map theo `code`; API ném chung `VALIDATION_ERROR` cho các lỗi nghiệp vụ khác nhau (`handleHoldError`, `handleVoucherBusinessError` nhánh mặc định, `applyVoucher` nhánh lỗi RPC, `saveConsent`).
3. Sửa — mã lỗi mới (`packages/shared/src/errors.ts`, kèm HTTP status):

| Mã | HTTP | Khi nào |
|---|---|---|
| `DOB_REQUIRED` | 422 | Khách chưa có ngày sinh khi đặt phim giới hạn tuổi (`hold_seats`) |
| `SEAT_REQUIRED` | 422 | Chưa chọn ghế (API thực tế ít phát vì zod `seatIds.min(1)` chặn trước bằng 400; UI đã chặn) |
| `DUPLICATE_SEATS` | 422 | Danh sách ghế trùng |
| `INVALID_SEATS` | 422 | Ghế không hợp lệ cho suất (không thuộc phòng, lối đi, ghế hỏng) |
| `CONSENT_VERSION_INVALID` | 409 | Phiên bản điều khoản gửi lên không hợp lệ (`POST /bookings/:id/consent`) |

4. Sửa — voucher: `handleVoucherBusinessError` nhánh mặc định (mã RPC chưa ánh xạ) và `applyVoucher` nhánh lỗi RPC chung nay ném `INTERNAL_ERROR` (500, "Không áp dụng được voucher", có log, không lộ mã nội bộ) thay vì `VALIDATION_ERROR`; thêm case `VOUCHER_NOT_APPLICABLE_CINEMA` (422). `VALIDATION_ERROR` chỉ còn cho lỗi biểu mẫu thật (zod pipe).
5. Sửa — web: `error-messages.ts` thêm thông báo tiếng Việt cho 5 mã mới; chọn ghế (`seat-picker.tsx`) hiện toast `DOB_REQUIRED` kèm nút "Cập nhật hồ sơ" → `/tai-khoan`; trang xác nhận (`dat-ve/don/[id]/xac-nhan/page.tsx`) hiện liên kết "Cập nhật hồ sơ" khi `DOB_REQUIRED`; `voucher-input.tsx` chặn phía client với thông báo riêng: ô trống "Vui lòng nhập mã giảm giá." (kể cả bấm Enter khi trống), quá 50 ký tự "Mã giảm giá tối đa 50 ký tự." (khớp schema API).
6. Doc as-built: `docs/API_SPEC.md` (bảng mã lỗi theo HTTP status; dòng `POST /bookings/holds`, `/consent`, `/voucher`).

## Thay đổi HTTP status (CHÚ Ý bên test)
- `POST /bookings/holds`: 4 lỗi `DOB_REQUIRED` / `SEAT_REQUIRED` / `DUPLICATE_SEATS` / `INVALID_SEATS` đổi từ **400 `VALIDATION_ERROR`** sang **422** với mã riêng.
- `POST /bookings/:id/consent`: phiên bản điều khoản sai đổi từ **400 `VALIDATION_ERROR`** sang **409 `CONSENT_VERSION_INVALID`** (test e2e API `A/MAJOR-2` đã cập nhật kỳ vọng).
- `POST /bookings/:id/voucher`: mã lỗi RPC lạ / lỗi RPC chung đổi từ **400 `VALIDATION_ERROR`** sang **500 `INTERNAL_ERROR`** (kèm sự kiện Sentry).
- Test tự động nào (API hoặc e2e) đang kỳ vọng 400 `VALIDATION_ERROR` cho các trường hợp trên phải đổi theo.

## Rà soát nhánh `VALIDATION_ERROR` còn lại (GIỮ, không tách)
- `payment.service.ts` `resolveRedirectUrl` (returnUrl/cancelUrl sai origin): tham số request sai, web tự dựng từ `window.location.origin`; khách chỉ gặp khi cấu hình `WEB_ORIGIN` lệch (rủi ro tồn dư chấp nhận).
- Web `app/api/proxy/[...path]/route.ts` (đường dẫn proxy sai, body quá lớn), `components/admin/*` (form admin), `ZodValidationPipe` (body sai schema), `modules/cancellation` (route nhân sự MANAGER/ADMIN/STAFF): lỗi biểu mẫu thật hoặc ngoài luồng khách.

## Ảnh hưởng
- Module: api `booking` (helper + service), shared `errors`, web `lib/api/error-messages`, web booking (`seat-picker`, `voucher-input`, trang xác nhận), `docs/API_SPEC.md`. Không đổi DB, migration, RPC, hợp đồng body request, `SPECIFICATIONS.md`.
- Test: tách mã đúng ở API (unit + e2e); web hiện đúng thông báo; luồng chọn ghế, xác nhận điều khoản, voucher.
- Hồi quy: giữ ghế thành công / `SEAT_TAKEN` / `HOLD_LIMIT` / `AGE_RESTRICTED` không đổi; voucher hợp lệ và các mã `VOUCHER_*` đã ánh xạ (hết hạn, hết lượt, chưa đủ giá trị, không áp dụng cho suất) vẫn đúng thông báo; checkbox điều khoản R-71 gating không đổi; form biểu mẫu thật vẫn hiện "Dữ liệu chưa hợp lệ".
- Residual: API gần như không phát `SEAT_REQUIRED` (zod chặn trước, 400); `VOUCHER_NOT_APPLICABLE_CINEMA` chưa có đường phát từ `apply_voucher_core` (vô hại); voucher mã lạ nay 500 nên sinh sự kiện Sentry; chưa chạy thật với Supabase local + tài khoản chưa có ngày sinh đặt phim T18 (đã verify bằng test: shared 39, api 692, web 697 PASS, typecheck + lint sạch ở repo gốc sau merge `8ff2d52`).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 36, specVersion 3.6.1 (trigger bug-fix).
