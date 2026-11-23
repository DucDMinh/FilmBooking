# Bug no-refund-warning-config · phase-1-task-01 — Hiển thị nội dung cảnh báo không hoàn tiền Admin cấu hình ở trang thanh toán (CR-019)

- **Classification / Risk:** BUG. Risk: màn xác nhận/thanh toán (R-71, R-133), DTO `BookingSummaryResponse` dùng chung. Reviewer: **NORMAL** (DTO shared + luồng thanh toán, không đụng auth/DB schema).
- **Change doc:** `spec/changes/2026-11-23-no-refund-warning-config.md` (acceptance ở đó).

## Root cause (đã chứng minh, không cần explore)
- `apps/web/src/components/booking/no-refund-warning.tsx:30-70` (`NoRefundWarning`) dùng câu chính sách cố định; không có prop nhận nội dung.
- `app_settings.no_refund_warning` (Admin sửa ở `/admin/cau-hinh`, `settings-form.tsx:31`, schema `packages/shared/src/schemas/admin.ts:77,87`, seed `supabase/migrations/20261111010000_core_identity_chain.sql:347`) không được code nào của khách đọc.
- `app_settings_select` RLS cho `anon, authenticated` đọc (migration `:449`) nên không cần migration.

## Hướng sửa gợi ý (builder được chọn cách gọn hơn nếu có lý do)
1. API: `buildBookingSummary`/`getSummary` (`apps/api/src/modules/booking/booking.service.ts` ~:129-143, `booking.helper.ts`) đọc `app_settings.key = 'no_refund_warning'` (giá trị jsonb string) và trả `BookingSummaryResponse.noRefundWarning?: string`. Lỗi đọc / thiếu / rỗng → bỏ trường (web dùng mặc định), KHÔNG làm hỏng summary.
2. Shared: thêm `noRefundWarning?: string` vào `BookingSummaryResponse` (`packages/shared/src/schemas/booking.ts`).
3. Web: `NoRefundWarning` nhận `policyText?` và hiển thị thay câu chính sách cố định (giữ `whitespace-pre-line`, văn bản thuần, không `dangerouslySetInnerHTML`); vẫn có câu riêng nêu tên rạp + giờ chiếu (R-71). Không có `policyText` → dùng câu mặc định hiện tại. `xac-nhan/page.tsx` truyền `summary.noRefundWarning`. Hộp thoại `PolicyConfirmDialog` và checkbox gating giữ nguyên.
4. Test: API trả nội dung cấu hình / fallback khi thiếu hoặc lỗi; web hiển thị nội dung cấu hình, giữ xuống dòng, thoát HTML, fallback mặc định; cập nhật `confirm.test.tsx` nếu mock summary cần.
5. `docs/API_SPEC.md`: thêm `noRefundWarning?` vào `GET /bookings/:id`.
