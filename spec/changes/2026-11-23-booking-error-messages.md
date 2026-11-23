---
id: booking-error-messages
type: bug
status: in_progress
created: 2026-11-23
---

# Lỗi đặt vé hiện chung chung "Dữ liệu chưa hợp lệ", cần ghi đúng lỗi

## Yêu cầu
User (2026-11-23, `/change`): "trong các trường hợp đặt vé lỗi đang ghi lỗi chung chung là 'dữ liệu chưa hợp lệ'. Sửa lại để ghi đúng lỗi".

## Bối cảnh / tái hiện (bug)
- Màn/route/role: luồng đặt vé của khách: chọn ghế `/dat-ve/[showtimeId]` (giữ ghế), xác nhận `/dat-ve/don/[id]/xac-nhan` (xác nhận tuổi, điều khoản, tạo thanh toán), ô nhập voucher.
- Root cause (đọc code, chưa tái hiện bằng trình duyệt): `apps/web/src/lib/api/client.ts` `toApiError` bỏ thông điệp cụ thể của server và chỉ map theo mã lỗi (`error-messages.ts`). Nhiều lỗi đặt vé khác nhau cùng mang mã `VALIDATION_ERROR` nên đều hiện "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.":
  - `DOB_REQUIRED` (khách chưa có ngày sinh khi đặt phim giới hạn tuổi), `INVALID_SEATS`, `DUPLICATE_SEATS`, `SEAT_REQUIRED` (RPC `hold_seats`, `booking.helper.ts` `handleHoldError`);
  - phiên bản điều khoản không hợp lệ (`booking.service.ts` `saveConsent`);
  - voucher lỗi không nằm trong bảng map (`handleVoucherBusinessError` nhánh default, `applyVoucher` nhánh lỗi RPC khác);
  - các nhánh `VALIDATION_ERROR` khác trong `apps/api/src/modules/booking` và `payment`.
- Expected: mỗi lỗi hiện đúng nguyên nhân và hướng xử lý bằng tiếng Việt (vd thiếu ngày sinh thì nói cần cập nhật ngày sinh trong hồ sơ, kèm đường dẫn).
- Actual: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường." cho mọi trường hợp trên.

## Acceptance (bắt buộc)
- [ ] Khách chưa có ngày sinh đặt phim T13/T16/T18 (nếu RPC yêu cầu) thấy thông báo nêu rõ cần cập nhật ngày sinh trong hồ sơ, có đường dẫn tới `/tai-khoan`; không còn "Dữ liệu chưa hợp lệ".
- [ ] Ghế không hợp lệ cho suất (`INVALID_SEATS`), danh sách ghế trùng, chưa chọn ghế: mỗi trường hợp một thông báo riêng, đúng nguyên nhân.
- [ ] Phiên bản điều khoản không hợp lệ và mọi lỗi voucher (kể cả mã lỗi RPC chưa có trong bảng map) có thông báo cụ thể; mã lỗi lạ rơi về thông báo chung "Đã có lỗi xảy ra" thay vì "Dữ liệu chưa hợp lệ".
- [ ] Rà soát mọi nhánh `VALIDATION_ERROR` trong luồng đặt vé và thanh toán (API + web), liệt kê trong task file nhánh nào đã tách mã và nhánh nào giữ nguyên (lỗi biểu mẫu thật).
- [ ] Mã lỗi mới thêm vào catalog dùng chung (`packages/shared/src/errors.ts`) kèm HTTP status, thông báo web, `docs/API_SPEC.md`; không đổi tên mã đã phát hành; web vẫn phủ đủ `Record<ErrorCode,…>`.
- [ ] Có test cho từng mã mới (API map đúng mã/status; web hiện đúng thông báo); `pnpm lint`, `pnpm typecheck`, `pnpm test` PASS.

## Ghi chú
- Bug-fix thuần, không đổi requirement trong `SPECIFICATIONS.md` (catalog mã lỗi chỉ ở `docs/API_SPEC.md`): không bump spec, vẫn sinh `spec/test-scope/current.json` (`trigger: bug-fix`).
- Liên quan R-68 (kiểm tra độ tuổi), R-61..R-67 (giữ ghế), R-71 (điều khoản), R-90..R-95 (voucher).
