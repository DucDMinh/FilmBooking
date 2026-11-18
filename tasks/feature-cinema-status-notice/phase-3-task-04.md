# Feature cinema-status-notice · phase-3-task-04 — Web: thông báo rạp đã đóng cửa (không 404) + admin hẹn lịch 7 ngày

- Classification / Risk: MODIFY (UI). Reviewer **NORMAL** (không auth/DB; nhưng chạm điều hướng công khai). Phụ thuộc task-03 (DTO `scheduledStatus`/`scheduledEffectiveAt`, `SetCinemaStatusResultDto`, `GET /cinemas/:code` 200).
- Hợp đồng: `spec/changes/2026-11-18-cinema-status-notice.md`. Spec: R-136, R-137, AC-26..28.

## Thiết kế
1. `apps/web/src/app/(public)/rap/[code]/page.tsx`:
   - `fetchCinemaDetail` vẫn trả `null` khi 404 (mã sai → `notFound()` như cũ); lỗi khác không còn nuốt thành 404 giả? (giữ hành vi cũ nếu đổi sẽ rộng; chỉ cần 404 thật vẫn 404).
   - `cinema.status !== "OPEN"` → render component thông báo (mới, `apps/web/src/components/catalog/cinema-closed-notice.tsx`): tiêu đề "Rạp {tên} đã đóng cửa" (`CLOSED`), "…đang tạm đóng cửa" (`TEMP_CLOSED`), "…sắp khai trương" (`COMING_SOON`); mô tả ngắn + địa chỉ/hotline nếu có; nút "Xem các rạp khác" → `/rap`; **không** hiện lịch chiếu/bản đồ/yêu thích. Vẫn có `CinemaTag` giám sát. `generateMetadata`: tiêu đề theo trạng thái; thêm `robots: noindex` cho rạp không hoạt động; JSON-LD chỉ cho rạp `OPEN` (không quảng bá rạp đóng).
   - Rạp `OPEN` có `scheduledStatus` + `scheduledEffectiveAt` → banner (Alert/noteBox có sẵn trong design system) đầu trang: "Rạp sẽ đóng cửa / tạm đóng cửa / mở lại … từ ngày dd/mm/yyyy" kèm hướng dẫn hoàn tiền tại quầy trước ngày đó với đóng/tạm đóng (văn phong khớp email). Ngày theo giờ Việt Nam (`toVnParts`).
2. Admin:
   - `cinema-status-dialog.tsx`: viết lại — chọn trạng thái mới (loại trạng thái hiện tại), hiện câu giải thích động: "Thay đổi có hiệu lực vào {dd/mm/yyyy} (sau 7 ngày). Hệ thống gửi email tới toàn bộ khách hàng ngay bây giờ…" + (đóng/tạm đóng) "Các suất còn lại sẽ tự huỷ khi đến hạn; khách có vé đến quầy hoàn tiền trước ngày đó." Nút xác nhận "Hẹn đổi trạng thái & gửi email"; thành công: toast kèm số email; `onChanged` trả kết quả để danh sách cập nhật `scheduled*` (**status giữ nguyên**). Bỏ toàn bộ nhánh 409 sold showtimes (danh sách suất chặn + link huỷ hàng loạt). Rạp đã có lịch: dialog hiện lịch hiện tại + cảnh báo "hẹn lại sẽ thay lịch cũ và gửi lại email" + nút **"Huỷ lịch"** (gọi cùng endpoint với `status` = trạng thái hiện tại; cảnh báo sẽ gửi email đính chính cho toàn bộ khách; toast theo `scheduleCancelled`).
   - `apps/web/src/app/admin/rap/page.tsx`: cột trạng thái hiện thêm Badge lịch đang chờ ("Sẽ đóng cửa 25/11" …) khi có `scheduledStatus`; sửa handler `onChanged`.
   - `cinema-form.tsx`: không cho sửa `status` khi chỉnh rạp có sẵn (đã chỉ đọc?) — kiểm tra và bảo đảm `PATCH /cinemas/:id` không còn gửi `status` thay đổi.
3. Test (vitest, jsdom): trang rạp CLOSED/TEMP_CLOSED/COMING_SOON hiện đúng thông báo + không hiện lịch chiếu + không gọi `notFound`; mã sai vẫn `notFound`; rạp OPEN có lịch → banner (đóng và mở); rạp OPEN không lịch → không banner; dialog admin: chọn trạng thái, câu giải thích có ngày +7, submit gọi `PATCH /admin/cinemas/:id/status`, hiển thị số email, không còn UI 409; trang admin hiện badge lịch; test cũ liên quan cập nhật.

## KHÔNG làm
Không đụng `supabase/**`, `apps/api/**`, `packages/shared/**` (thiếu type → báo lại). Không `git add/commit/checkout/reset/stash/clean`. Không đụng file dirty của user (`.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `apps/api/package.json`, `supabase/config.toml`, `package.json`).

## Files to Modify
`apps/web/src/app/(public)/rap/[code]/page.tsx`, `apps/web/src/components/catalog/cinema-closed-notice.tsx` (mới), `apps/web/src/components/admin/cinema-status-dialog.tsx`, `apps/web/src/app/admin/rap/page.tsx`, `apps/web/src/components/admin/cinema-form.tsx` (nếu cần), test liên quan.

## Verify
`pnpm --filter ./apps/web test`, `pnpm --filter ./apps/web lint`, `pnpm --filter ./apps/web typecheck`; (primary) kiểm tra giao diện thật sau khi xong nếu dựng được stack.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: `/rap/<mã rạp đóng>` → trang 404; admin đổi trạng thái tức thì.
- Expected: trang thông báo "đã đóng cửa" (200); admin hẹn lịch 7 ngày.
- Actual after: `/rap/<mã rạp CLOSED|TEMP_CLOSED|COMING_SOON>` render trang thông báo (không `notFound()`, không lịch chiếu/bản đồ/yêu thích/JSON-LD, metadata noindex); mã sai vẫn `notFound()`; rạp OPEN có lịch hiện banner (ngày giờ VN + hướng dẫn hoàn tiền trước hạn); admin dialog hẹn lịch +7 ngày/huỷ lịch qua `PATCH /admin/cinemas/:id/status`, danh sách hiện Badge lịch chờ, không còn nhánh 409. Test web 610 PASS (vitest jsdom); lint + typecheck 3 workspace XANH. Chưa kiểm giao diện thật trên trình duyệt (primary kiểm).
- Status: PASS (reviewer STRICT PASS round 1; MINOR F-01..F-03 đã vá, web 615 test)
