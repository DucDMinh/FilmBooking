# Review: bug booking-error-messages, phase-1 task-01, round 1

Agent: reviewer

- Review level: **STRICT**
- Reason: đổi catalog mã lỗi dùng chung (`packages/shared/src/errors.ts`, `Record<ErrorCode,…>` ở web) và đổi HTTP status hợp đồng API (`/bookings/holds` 400→422, `/consent` 400→409, `/voucher` 400→500 cho nhánh lạ).
- Blast radius: API `modules/booking` (helper + service), shared error catalog, web `error-messages.ts`, `seat-picker.tsx`, `voucher-input.tsx`, trang xác nhận `dat-ve/don/[id]/xac-nhan`, `docs/API_SPEC.md`. Phạm vi review: `git diff 6727e5d..HEAD` (commit `5337099`, merge `8ff2d52`, fix-forward `51a2179`).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `cd "E:/FilmBooking/apps/api" && pnpm typecheck && pnpm lint && pnpm test` | **BLOCKED** bởi hook: `[agent-guard] reviewer/spec-validator: chỉ được cd "<worktree>" && <lệnh> với thư mục trong .worktrees/`. Không thử biến thể khác. |
| `cd apps/web && pnpm typecheck && pnpm lint && pnpm test` | Không chạy (cùng chặn). |
| `cd packages/shared && pnpm test` | Không chạy (cùng chặn). |
| Số liệu dispatcher (shared 39, api 692, web 696 PASS; typecheck + lint sạch) | **Dispatcher báo, reviewer CHƯA tự kiểm.** |
| aislop / oxlint / ocr | skip (không chạy được lệnh trong repo gốc từ reviewer) |

Ghi chú: đọc diff bằng `git -C "E:/FilmBooking" diff 6727e5d..HEAD` (lệnh đọc, sau khi `cd ... && git diff` bị hook chặn).

## Đối chiếu chéo DB thật

- `hold_seats` (bản mới nhất `20261112140000_hold_seats_hardening.sql`): raise `SEAT_REQUIRED: …` (52), `DUPLICATE_SEATS: …` (55), `DOB_REQUIRED: …` (172), `INVALID_SEATS: …` (213, 223), đều errcode 22023, mỗi thông điệp chỉ có MỘT tiền tố. Không mã nào là chuỗi con của mã khác (`SEAT_REQUIRED` không trùng `SEAT_TAKEN`), nên thứ tự `includes` trong `handleHoldError` (booking.helper.ts:35-38) an toàn.
- `apply_voucher_core` (`20261112070000_voucher_rate_limit_fix.sql`): các mã raise P0001 là `ORDER_NOT_FOUND`, `VOUCHER_INVALID`, `ORDER_NOT_HOLDING`, `ORDER_EXPIRED`, `VOUCHER_ALREADY_APPLIED`, `VOUCHER_EXPIRED`, `VOUCHER_NOT_APPLICABLE`, `VOUCHER_MIN_NOT_MET`, `VOUCHER_EXHAUSTED`, `VOUCHER_USER_LIMIT_REACHED`, cộng `RATE_LIMITED` của wrapper. Tất cả đã có case trong `handleVoucherBusinessError`; nhánh default mới (`INTERNAL_ERROR`) không nuốt mã nghiệp vụ nào. `VOUCHER_USER_LIMIT_REACHED` vẫn ra `VOUCHER_EXHAUSTED`. `FORBIDDEN` raise errcode 42501 nên wrapper re-raise, rơi vào nhánh `error` của `applyVoucher`, vẫn map `FORBIDDEN` (booking.service.ts:227). Đơn bị khoá `for update` (dòng 54/91) trước khi kiểm `VOUCHER_ALREADY_APPLIED`, nên double-submit không tạo 23505 thành 500.
- Đổi status: grep toàn repo (trừ node_modules/worktrees) không có e2e, test-scope hay client nào đọc status cũ 400 của các lỗi này. Web booking phân nhánh theo `code`, không theo `status`; chỗ kiểm `status === 400` ở `dat-ve/[showtimeId]/page.tsx:51` là GET seatmap, không bị đổi. Proxy `/api/proxy` chuyển nguyên status/body. Test e2e cũ duy nhất bị ảnh hưởng (`A/MAJOR-2`) đã sửa đúng chỗ hợp đồng đổi.

## Findings

### CRITICAL
Không có.

### MAJOR

1. **Repro Verification chưa PASS (đây là cổng chặn bắt buộc cho bug task).** `tasks/bug-booking-error-messages/phase-1-task-01.md:45` ghi "CHƯA chạy được test/typecheck/lint", dòng 59 `Status: BLOCKED`. Không có bằng chứng red-then-green. Kết quả verify ở repo gốc của dispatcher chưa được ghi vào Evidence. Theo luật reviewer, status khác PASS thì bắt buộc FAIL. Cách sửa: ghi lệnh + kết quả verify ở repo gốc (và fix-forward `51a2179`) vào Repro Verification, đặt `Status: PASS`.

2. **Test kiểm sai bề mặt của AC chính (thiếu ngày sinh).** `DOB_REQUIRED` chỉ phát sinh từ RPC `hold_seats` (migrations ở trên; grep TS: chỉ `booking.helper.ts:35` ném mã này). Như vậy khách chỉ gặp nó ở bước chọn ghế, tức toast có action "Cập nhật hồ sơ" ở `apps/web/src/components/booking/seat-picker.tsx:143-147`. Nhánh này **không có test nào** (grep `__tests__` không thấy `DOB_REQUIRED`/`Cập nhật hồ sơ` ngoài `confirm.test.tsx`). Test duy nhất cho link `/tai-khoan` (`confirm.test.tsx:239-253`) nằm ở trang xác nhận, nơi các API được gọi (`age-confirm`, `consent`, `payment`) không bao giờ trả `DOB_REQUIRED`. Đó là false-confidence đối với AC "có đường dẫn tới /tai-khoan". (Link ở trang xác nhận do thiết kế task yêu cầu nên giữ được; vấn đề là thiếu test cho đường thật.) Cách sửa: thêm test cho `SeatPicker`: `POST /bookings/holds` reject `DOB_REQUIRED`, rồi assert `toast.error` được gọi với `ERROR_MESSAGES.DOB_REQUIRED` và action `label: "Cập nhật hồ sơ"`, bấm action thì `router.push("/tai-khoan")`.

### MINOR

3. **Danh sách rà soát thiếu module `cancellation`** (brief và AC-4 yêu cầu "mọi nhánh"). `cancellation.service.ts:44,105,135,166,352,365,434,459,520,656` và `cancellation.controller.ts:71` còn `VALIDATION_ERROR`. Tôi đã kiểm: mọi route của controller có `@Roles("MANAGER"|"ADMIN"|"STAFF")` (dòng 92-236), nên khách đặt vé không gặp. Cần bổ sung vào Evidence của task với kết luận GIỮ (ngoài luồng khách).
4. **Lối còn lại khách có thể thấy "Dữ liệu chưa hợp lệ":** `payment.service.ts:306-309` (`resolveRedirectUrl`) trả `VALIDATION_ERROR` khi origin trình duyệt khác `WEB_ORIGIN`. Web gửi URL tuyệt đối `window.location.origin` (`xac-nhan/page.tsx:68-71`), nên nếu web chạy trên host không nằm trong `WEB_ORIGIN` (www/apex, preview) thì khách sẽ thấy thông báo chung. Builder ghi GIỮ với lập luận "khách không gặp", lập luận này chỉ đúng khi cấu hình chuẩn. Đây là rủi ro tồn dư, không chặn.
5. `SEAT_REQUIRED` không tới được qua API: `holdSeatsSchema.seatIds.min(1)` (`packages/shared/src/schemas/booking.ts:15`) chặn trước bằng zod 400 `VALIDATION_ERROR`. UI đã chặn chọn 0 ghế, nên đây chỉ là tồn dư. Tương tự `DUPLICATE_SEATS`: schema không chặn trùng, nên RPC vẫn có thể trả mã này.
6. Case `VOUCHER_NOT_APPLICABLE_CINEMA` trong `handleVoucherBusinessError` (booking.helper.ts:66-67) hiện không được `apply_voucher_core` phát ra (core chỉ raise `VOUCHER_NOT_APPLICABLE`). Code này vô hại nhưng hiện không có tác dụng.
7. Nhánh default voucher và nhánh `error` của `applyVoucher` nay ra 500, nên `captureServerError` (all-exceptions.filter.ts:80) bắn Sentry. Chấp nhận được vì đây là lỗi thật cần sửa ánh xạ, chỉ cần ghi nhận để tránh nhiễu.
8. `CONSENT_VERSION_INVALID` 409: web không gửi `version` (`xac-nhan/page.tsx:67`) nên client hiện tại không gặp. Chọn 409 nằm trong phương án task cho phép.

## Các điểm đạt
- Mã mới thêm đủ ở `ERROR_CODES` + `ERROR_HTTP_STATUS`, không đổi tên mã cũ; web `Record<ErrorCode,…>` phủ đủ.
- Thông báo tiếng Việt có dấu, không em-dash, nêu nguyên nhân + hướng xử lý, khác nhau từng đôi.
- Voucher: rỗng/Enter và quá 50 ký tự có thông báo riêng, không gọi API, có test. `VOUCHER_CODE_MAX_LENGTH` khớp `applyVoucherSchema` max(50).
- Không đổi logic giữ ghế, đếm giờ, gating checkbox R-71. Không động `SPECIFICATIONS.md`, `supabase/migrations`.
- `docs/API_SPEC.md`: bảng 409/422 và các dòng `/bookings/holds`, `/consent`, `/voucher` đã reconcile đúng code.
- `booking-errors.spec.ts`: mock RPC trả đúng thông điệp thật của migration (cả 2 biến thể `INVALID_SEATS`), có kiểm cả status.
- Diff gọn, trace đủ về task; hàm/file trong giới hạn.

## Verdict: **FAIL**

Cần sửa theo thứ tự:
1. Ghi bằng chứng verify ở repo gốc vào Repro Verification và đặt `Status: PASS` (MAJOR-1).
2. Thêm test `SeatPicker` cho toast `DOB_REQUIRED` + action `/tai-khoan` (MAJOR-2).
3. Bổ sung `cancellation` (và ghi rủi ro `resolveRedirectUrl`) vào danh sách rà soát của task (MINOR-3/4).
