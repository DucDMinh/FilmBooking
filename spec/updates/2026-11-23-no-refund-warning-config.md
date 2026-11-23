# Spec Update — 2026-11-23 no-refund-warning-config
**spec_version:** 3.7.0 → 3.7.0 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · CR-019 · `tasks/bug-no-refund-warning-config/phase-1-task-01.md` (review NORMAL: round 1 FAIL do câu fallback web lệch chữ seed, round 2 PASS) · change doc `spec/changes/2026-11-23-no-refund-warning-config.md` · workItem `bug/no-refund-warning-config`

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Đưa hành vi về đúng ý của **R-106** (Admin cấu hình "nội dung cảnh báo không hoàn tiền"), **R-71** (cảnh báo nêu tên rạp + giờ chiếu; nút Thanh toán chỉ bật khi tick), **R-131** (không huỷ/không hoàn thống nhất mọi rạp), **R-133** (cảnh báo nhiều lớp). Liên quan **AC-08**.

## Lỗi đã sửa
1. Triệu chứng: Admin sửa "Nội dung cảnh báo không hoàn tiền" ở `/admin/cau-hinh` (khoá `app_settings.no_refund_warning`) nhưng khách không thấy nội dung đó ở đâu; màn xác nhận đơn dùng câu cố định trong code.
2. Root cause: `GET /bookings/:id` không trả cấu hình cho web nên giá trị không bao giờ được đọc; `NoRefundWarning` render chuỗi cứng.
3. Sửa — API: `booking.helper.ts` đọc `app_settings.no_refund_warning`; `booking.service.ts` `getBookingSummary` trả thêm `noRefundWarning?: string` (schema `packages/shared/src/schemas/booking.ts`). Cấu hình thiếu / rỗng / toàn khoảng trắng / không phải chuỗi / lỗi đọc → bỏ trường (API vẫn 200); lỗi đọc chỉ log `message`, không log nội dung.
4. Sửa — web: `NoRefundWarning` (`no-refund-warning.tsx`) nhận `policyText`; trống → `DEFAULT_NO_REFUND_POLICY` = nguyên văn câu seed SQL ("Vé đã thanh toán không thể huỷ, đổi hoặc hoàn tiền. Vui lòng kiểm tra kỹ suất chiếu, ghế và rạp trước khi thanh toán."). Hiển thị văn bản thuần (`whitespace-pre-line break-words`, không HTML); dòng "Vé chỉ dùng tại {tên rạp} - {địa chỉ}, suất {giờ} ngày {ngày}" luôn có; `dat-ve/don/[id]/xac-nhan/page.tsx` truyền `noRefundWarning`. Checkbox gating và hộp thoại xác nhận không đổi.
5. Doc as-built: `docs/API_SPEC.md` (`GET /bookings/:id` có `noRefundWarning?`).
6. Test: `apps/api/src/modules/booking/__tests__/booking-no-refund-warning.spec.ts`, `apps/web/src/components/booking/__tests__/confirm.test.tsx`.

## Thay đổi cần chú ý (bên test)
- DTO `BookingSummaryResponse` thêm trường tuỳ chọn `noRefundWarning` (có thể vắng); không đổi route, mã lỗi, DB, migration.
- Nội dung Admin nhập nay là nội dung công khai hiện cho khách, nguyên văn như chữ (HTML hiện thành chữ, không render).
- Câu chính sách Admin cấu hình không còn in đậm cụm "không thể huỷ, đổi hoặc hoàn tiền" như câu cố định cũ (chủ ý).

## Gap còn lại (GAP-041, `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`)
- `PolicyConfirmDialog` (hộp thoại trước thanh toán), email vé và trang chi tiết vé (R-133 (3), (5)) chưa dùng cấu hình; hộp thoại còn thiếu ngoại lệ "trừ rạp huỷ suất".
- Hằng mặc định ở web là bản sao chữ seed SQL, đổi seed phải đổi hằng.

## Test scope
`spec/test-scope/current.json` scopeVersion 37 → 38 (trigger `bug-fix`, workItem `bug/no-refund-warning-config`, specVersion 3.7.0).
