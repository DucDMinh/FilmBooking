# Phase Review: Layer 6 (build/build-filmbooking)

Agent: spec-validator
Range: aff1df1..41d717d (branch staging @ 41d717d)
Sources: tasks/build-filmbooking/layer-6-task-01..07.md, SPECIFICATIONS.md (1.1.0), docs/specs/2026-11-10-filmbooking-mvp-design.md, .context/design-spec.md, code thật (apps/api, apps/web, supabase/migrations), review reports round-1/2 của 7 task.

## Verdict: ⚠️ GAPS FOUND

Không xác nhận BLOCKER nào. Có GAP đã biết và một số lệch so với Files/AC của task file. Lưu ý: verify commands (pnpm typecheck/lint/test) CHƯA CHẠY lại: Bash bị agent-guard chặn, không retry. Kết quả dispatcher (api 468, web 270, shared 14, db:test 810, test:int 5) chỉ ghi nhận, không tự xác minh.

**Residual risk:** verify commands Blocked; chưa đọc database.types.ts (task-01), chưa đọc apps/api/vitest.integration.config.ts và smoke.int-spec.ts nội dung (task-07, chỉ xác nhận file tồn tại), chưa kiểm R-67 cutoff cấu hình theo rạp, chưa kiểm e2e app smoke seatmap.

## Bảng AC theo task

| Task | AC / Req | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|---|
| 01 | Smoke seatmap 200, webhook thiếu chữ ký bị từ chối, /jobs/send-emails không secret → 401 | ✅ (401 đã xác minh) / chưa kiểm (seatmap e2e) | apps/api/src/common/auth/job-secret.guard.ts (fail-closed, 401); webhook.controller.ts:51 trả 200 `success:false "Invalid signature"` (chuẩn PayOS, spec "200/400") | Seatmap route tồn tại: booking.controller.ts:30 |
| 01 | AppModule import 9 module layer 5 | ✅ | apps/api/src/app.module.ts:37-53 (Auth, Me, Catalog, CinemaOps, AuthExt, Profile, Identity, Pricing, Booking, Payment, Mail, Jobs, Checkin, Admin, Orders, Report, Cancellation) | Pos đã bỏ đúng |
| 01 | Payment redirect whitelist / cancel hardening | ✅ | apps/api/src/modules/payment/payment.service.ts:292-308 (resolveRedirectUrl: cùng origin WEB_ORIGIN hoặc path tương đối) | |
| 01 | lint/typecheck/test/build PASS | ⚠️ Blocked | Không chạy lại được | Dispatcher báo PASS |
| 02 | Đơn pending PAID trên PayOS mà webhook lỡ → paid, đúng 1 vé | ✅ (test) | apps/api/src/modules/jobs/reconcile.service.ts:174-193 → paymentService.handleWebhook; test reconcile.e2e-spec.ts:209 (chạy lại → alreadyPaid) | |
| 02 | Đơn pending CANCELLED trên PayOS → nhả ghế | ✅ (test) | reconcile.service.ts:157-168 → cancel_stale_payment (migration 20261113180000_cron_http_jobs.sql:56-90 → mark_payment_cancelled); test :243 | |
| 02 | Migration không literal URL/secret; thiếu vault → log lỗi, không crash | ✅ | 20261113180000_cron_http_jobs.sql:29-35 (vault.decrypted_secrets, raise warning, return null); :6-8 chỉ comment | |
| 02 | Test local gọi trực tiếp /jobs/* | ✅ | reconcile.e2e-spec.ts (đường gọi trực tiếp Nest) | |
| 02 | pg_cron mỗi phút / mỗi 5 phút, timeout đủ cho cold start | ✅ | cron_http_jobs.sql:104-105, timeout_milliseconds 60000 | |
| 03 | AC-06 SEAT_TAKEN → toast, ghế chuyển Đang giữ, bỏ khỏi lựa chọn | ✅ (test) | seat-picker.tsx:95,127; seat-map.test.tsx:402 | |
| 03 | AC-07 / R-60 ghế hết hạn ≤ 2s, realtime theo suất | ✅ (test) | use-showtime-seats.ts:88 (channel seats:<id>, filter showtime_id), :125 (tick 1s, expires_at qua → FREE); seat-map.test.tsx:286-325 | |
| 03 | aria-label "Hàng E ghế 5, VIP, 120.000 đồng, trống"; bàn phím | ✅ (test) | seat-rules.ts:57-58; seat-map.tsx:80,123,126 (roving tabindex); seat-map.test.tsx:141-152, 196 | |
| 03 | Ghế thứ 9 bị chặn; ghế lẻ báo trước khi gọi API | ✅ (test) | seat-picker.tsx:117-119 (MAX_SEATS_PER_ORDER); :209-212; seat-map.test.tsx:227-249 | |
| 03 | Hết giờ giữ → HoldExpiredDialog | ✅ (test) | seat-picker.tsx:254; seat-map.test.tsx:421-438 | |
| 03 | R-68 T13+ tick độ tuổi; chưa đăng nhập → LoginRequiredDialog (next); chưa xác nhận email → chặn | ✅ (UI) | seat-picker.tsx:45,220-232,253 (next=/dat-ve/<id>); seat-map.test.tsx:255-283 | |
| 03 | R-64 (web) confirm khi giữ đơn suất khác | ❌ GAP | Không có ConfirmDialog trong web (grep không thấy). API tự huỷ đơn cũ: payment.service.ts:159-180 | Design §06 "ConfirmDialog đơn cũ" chưa build |
| 03 | R-67 cutoff 15' cấu hình theo rạp | ⚠️ chưa kiểm | Web có hiển thị "Ngừng bán online" (design-spec §ShowtimeChip) | Known gap API-side; chưa xác minh code API |
| 04 | AC-08 checkbox gating, AlertDialog tên+địa chỉ rạp, xác nhận → consent rồi payment | ✅ (test) | xac-nhan/page.tsx:118,167-173 (canPay), :63-71 (age-confirm → consent → payment); no-refund-warning.tsx:72-85 (PolicyConfirmDialog); confirm.test.tsx:103 | |
| 04 | Voucher lỗi đúng mã (hết hạn, đã dùng, chưa đạt tối thiểu) | ✅ (test) | confirm.test.tsx:242-246 (VOUCHER_EXPIRED/EXHAUSTED/MIN_ORDER/NOT_FOUND/NOT_APPLICABLE); thông điệp lấy từ err.message của API | Map phụ thuộc message API; ghi nhận |
| 04 | Không có nút huỷ đơn sau thanh toán (R-131) | ✅ | xac-nhan/page.tsx không có nút huỷ; chỉ "← Đổi ghế" trước thanh toán | |
| 04 | Tổng tiền VND không thập phân | ✅ | formatVnd (order-summary.tsx:108-124) | |
| 04 | Trang xác nhận khi đơn không còn hiệu lực | ✅ | xac-nhan/page.tsx:96-115 | |
| 05 | Polling dừng khi paid/failed/timeout, hướng dẫn liên hệ; không tin query string | ✅ | payment-result.tsx:13-14 (3s, 120s), :18-23, :56-98, :141-152 (CONTACT_HINT); ket-qua/page.tsx:15-17 | |
| 05 | Chưa xác nhận email xem /ve → rỗng | ✅ | ve/page.tsx:33-35 | |
| 05 | /ve/[code] người khác → 404 | ✅ | ve/[bookingCode]/page.tsx:16-19; ticket-data.ts:109-115 (eq user_id) | |
| 05 | QR từ qr_token, không PII | ✅ | ticket-qr.tsx:84-85; ticket-data.ts:3 (qr_token 128-bit) | |
| 05 | Thanh toán: chuyển PayOS checkout | ✅ (quyết định dispatcher) | xac-nhan/page.tsx:71 window.location.assign(checkoutUrl) | Không có màn 09 VietQR — theo quyết định đã chốt |
| 05 | File task `dat-ve/don/[id]/thanh-toan/page.tsx` | ⚠️ INFO (MISSING file) | Glob không thấy file này | Hệ quả của quyết định bỏ màn 09 |
| 05 | cancelUrl → "thất bại + quay lại" | ⚠️ INFO (lệch mô tả task) | xac-nhan/page.tsx:69 cancelUrl = /dat-ve/don/<id>/xac-nhan (theo quyết định dispatcher); đơn chuyển cancelled chỉ qua webhook/reconcile (R-77) | Trên xac-nhan, đơn còn pending_payment vẫn hiển thị nút Thanh toán. Ghi nhận, không tính gap |
| 05 | R-87 tab Sắp tới / Đã xem | ⚠️ PARTIAL (INFO) | ve/page.tsx:59-60 nhãn "Đã qua", không có tab | Design §ĐÃ XEM |
| 05 | R-87 tăng độ sáng tối đa khi mở QR | ⚠️ PARTIAL (INFO) | ticket-qr.tsx:44-42 dùng Wake Lock (giữ màn sáng), không chỉnh độ sáng | |
| 06 | AC-12 USED: thời điểm + người soát lần đầu, nền đỏ | ✅ | checkin-result.tsx:68-75, :123-124; checkin.service.ts:60-63 | |
| 06 | AC-13 WRONG_CINEMA: tên + địa chỉ đúng, không tên khách/ghế, không check-in | ✅ | checkin-result.tsx:77-84; checkin.service.ts:65-74 (whitelist, không PII); HINT "Vé không bị đánh dấu check-in" | |
| 06 | Không có quyền camera → fallback nhập mã | ✅ | qr-scanner.tsx:13,65-68; soat-ve/page.tsx:117-128 | |
| 06 | Kết quả có text + icon | ✅ | checkin-result.tsx:117,128-129 | |
| 06 | R-97 chọn rạp làm việc, nhiều rạp | ✅ | chon-rap/page.tsx:25-35,38-42; staff/layout.tsx:26-29 (guard role) | |
| 06 | R-98 OK hiển thị nhãn tuổi | ❌ GAP | checkin-result.tsx:57-65 không có ageRating; checkin.service.ts:45-58 không trả ageRating | Known gap API-side |
| 06 | R-98 bước "Xác nhận check-in" (design §B) | ❌ GAP | Quét = check-in tự động (checkin_ticket RPC, 20261111040400...sql:35); không có bước xác nhận | Known gap |
| 06 | R-98 "Sai suất" | ⚠️ INFO (lệch/không rõ) | Không có status WRONG_SHOWTIME; "suất đã kết thúc" hiện gộp vào EXPIRED (RPC :219) | Cần PO làm rõ mapping |
| 06 | R-101 log mọi lượt quét | ✅ | RPC ghi checkin_logs ở mọi nhánh (20261111040400...sql:74-269) | |
| 07 | pnpm test:int smoke, bỏ qua khi không có Docker | ⚠️ chưa kiểm | Files tồn tại: vitest.integration.config.ts, helpers/supabase-test.ts, factories.ts, local-guard.ts, smoke.int-spec.ts | Dispatcher báo test:int 5 PASS |
| 07 | Factory cô lập theo test | ⚠️ chưa kiểm nội dung | — | |

## Gaps

**BLOCKER:** không có (không xác nhận AC bắt buộc nào của layer chưa đạt).

**GAP (ghi gap register, xử lý layer sau):**
1. R-98 nhãn tuổi trên kết quả OK (task-06; API checkin.service.ts không trả ageRating).
2. R-98 bước "Xác nhận check-in" (design-spec §B, check-in hiện tự động khi quét).
3. R-64 web ConfirmDialog khi giữ đơn suất khác (design §06). API có huỷ đơn cũ nhưng không có xác nhận phía khách.
4. R-67 cutoff cấu hình theo rạp (known API-side; chưa kiểm code).
5. R-98 "Sai suất" chưa có biến thể riêng; cần PO quyết mapping (EXPIRED gộp "suất đã kết thúc").
6. R-87 tab "Đã xem" và nhãn/độ sáng QR (PARTIAL nhẹ).

**INFO:**
- task-05 Files thiếu `dat-ve/don/[id]/thanh-toan/page.tsx` — hệ quả quyết định bỏ màn 09 VietQR (đã chốt).
- cancelUrl → /xac-nhan (quyết định đã chốt). Ghi nhận rủi ro: đơn cancel trên PayOS vẫn pending_payment cho đến khi webhook/reconcile (R-77) → xac-nhan vẫn cho bấm Thanh toán lại. Đáng theo dõi.
- task-02 file list ghi migration `20261111060000_cron_http_jobs.sql`; file thật là `20261113180000_cron_http_jobs.sql`. Task file cần sửa cho khớp (không ảnh hưởng hành vi).
- Verify commands không chạy lại được (Bash bị chặn); dựa vào kết quả dispatcher.

## Conflicts (spec vs as-built)

- **Cross-doc (design-spec ↔ code):** design §B yêu cầu CTA "Xác nhận check-in" và nhãn tuổi trên VÉ HỢP LỆ; code không có. Hai mục này là GAP đã nêu ở trên, không phải conflict giữa tài liệu intent.
- **SPECIFICATIONS.md R-87 ("Đã xem") ↔ UI ("Đã qua")**: lệch nhãn, INFO.
- **SPECIFICATIONS.md R-98 ("Sai suất") ↔ shared ScanResult (không có WRONG_SHOWTIME)**: cần làm rõ.
- **API_SPEC.md / ERD.md:** chưa đối chiếu trong lượt này (chưa kiểm). Ghi "chưa kiểm"; cần reconcile endpoint mới của layer 6 (/jobs/reconcile, /checkin/scan, /bookings/:id/payment-status, /bookings/:id/age-confirm, /bookings/:id/consent, /ve) và bảng email_outbox/checkin_logs/payments vào docs.

## Kết luận

Layer 6 đạt phần lớn AC kiểm được (task 01, 02, 03, 04, 05, 06 có bằng chứng file:line và test). Không có BLOCKER xác nhận. Có 4 GAP đã biết cần đưa vào gap register (R-98 nhãn tuổi, R-98 Xác nhận check-in, R-64 web confirm, R-67 cutoff theo rạp) cùng các INFO ở trên. Verdict: ⚠️ GAPS FOUND. Cần chạy lại pnpm typecheck/lint/test ở lượt có quyền Bash để đóng residual risk.
