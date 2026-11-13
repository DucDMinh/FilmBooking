# Review — build-filmbooking layer-6 task-04 — round 1

Agent: reviewer

> Ghi chú: hook `agent-guard` chặn ghi report vào `.worktrees/layer-6__task-04/.context/review-reports/`. Report được ghi tại `E:/FilmBooking/.context/review-reports/` (repo chính).

- **Task:** Web xác nhận đơn (màn 08 / D3): tóm tắt, voucher, cảnh báo không huỷ/không hoàn + checkbox + AlertDialog
- **Worktree:** `E:/FilmBooking/.worktrees/layer-6__task-04` (branch `wt/layer-6__task-04`, base `aff1df1`, chưa commit)
- **Review level:** STRICT
- **Reason:** luồng thanh toán (payment), gọi API contract booking/payment (consent bằng chứng pháp lý R-71/R-133, tạo payment link, returnUrl/cancelUrl), điều hướng giữa các màn của task khác (task-05).
- **Blast radius:** 5 file mới, chỉ web: `app/(public)/dat-ve/don/[id]/xac-nhan/page.tsx`, `components/booking/{order-summary,voucher-input,no-refund-warning}.tsx`, `components/booking/__tests__/confirm.test.tsx`. Không đụng API/shared/DB. Nhưng URL điều hướng sau thanh toán (returnUrl, đơn 0đ, cancelUrl) là hợp đồng với màn 09/10 do task-05 build.
- **Surgical diff:** chỉ đúng 5 file trong "Files to Create/Modify". Không drive-by refactor.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared/api/web) |
| `pnpm lint` | PASS |
| `pnpm --filter @filmbooking/web test` | **guard chặn** (không có trong allowlist). Thay bằng `cd apps/web && pnpm test`: **13 file / 199 test PASS** |
| `pnpm test` (cả workspace) | web/shared PASS. api: 3 suite FAIL do `beforeAll` timeout 10s (`pricing`, `webhook`, `cancellation` e2e); 342 test PASS. **Không quy được cho diff này** (không đụng file API). Chưa chạy lại trên base để xác nhận |
| `pnpm --filter @filmbooking/web build` | **guard chặn** dạng `--filter`. Thay bằng `cd apps/web && pnpm build`: PASS, route `ƒ /dat-ve/don/[id]/xac-nhan` có trong output |
| aislop / oxlint / ocr | skip (không có trong allowlist / chưa cài) |
| AI-friendly web gate | N/A (màn trong luồng đặt vé cần đăng nhập, không public SEO) |

## Cross-boundary contract check (đã đối chiếu code thật)

| Gọi từ web | API thật | Kết luận |
|---|---|---|
| `GET /bookings/{id}` → `BookingSummaryResponse` | `booking.controller.ts:58`, shape `packages/shared/src/schemas/booking.ts:104-149` | Khớp |
| `POST /bookings/{id}/age-confirm` body `{}` | `booking.controller.ts:66` (không nhận body) | Khớp |
| `POST /bookings/{id}/consent` body `{}` | `consentSchema` version optional, server ép `SERVER_CONSENT_VERSION` (`booking.service.ts:166-169`) | Khớp; IP/UA do server lấy |
| `POST/DELETE /bookings/{id}/voucher` body `{code}` | `booking.controller.ts:88,100`, `applyVoucherSchema` | Khớp |
| Mã lỗi voucher | API: `VOUCHER_EXPIRED`, `VOUCHER_EXHAUSTED`, `VOUCHER_MIN_ORDER`, `VOUCHER_NOT_FOUND`, `VOUCHER_NOT_APPLICABLE_SHOWTIME` (`booking.helper.ts:46-76`); web `client.ts:41-47` map mã → `ERROR_MESSAGES` | Khớp, đủ 5 loại R-94 |
| `POST /bookings/{id}/payment` body `{returnUrl, cancelUrl}` → `{status, checkoutUrl, ...}` | `payment.controller.ts:30`, `createPaymentBodySchema` (`z.string().url()`), `payment.service.ts:72-268` | Shape khớp. Đơn 0đ trả `status: "PAID", checkoutUrl: null` (`:141-157`) |
| Double-submit | Web: nút disabled khi `paying`, dialog đóng trước khi gọi. API: dedupe in-flight theo bookingId (`payment.service.ts:77-89`), huỷ link PENDING cũ khi tạo lại (`:200-220`) | Chấp nhận được |

## Findings

### CRITICAL
Không có.

### MAJOR

**M1. returnUrl và điều hướng đơn 0đ trỏ sai màn đích so với design-spec route map, R-79, R-82 và hợp đồng task-05.**
`apps/web/src/app/(public)/dat-ve/don/[id]/xac-nhan/page.tsx:69` và `:72`
```ts
json: { returnUrl: `${origin}/dat-ve/don/${id}/thanh-toan`, cancelUrl: `${origin}/dat-ve/don/${id}/xac-nhan` },
...
else router.push(`/dat-ve/don/${id}/thanh-toan`);
```
- **returnUrl:** `.context/design-spec.md:75` ghi `/dat-ve/don/[orderId]/ket-qua` = "Đang xác nhận → thành công / thất bại **[returnUrl R-79]**". `:326` màn 10 có trạng thái "Đang xác nhận thanh toán (returnUrl)". R-79: quay về returnUrl → màn "Đang xác nhận thanh toán" polling. Code đặt returnUrl = `/thanh-toan`, tức màn 09 VietQR "Quét mã…". Khách trả xong trên PayOS sẽ bị đưa lại màn quét QR.
- **Đơn 0đ:** `.context/design-spec.md:313` "Tổng = 0đ (R-82) → **bỏ 09, sang thẳng 10**". `tasks/build-filmbooking/layer-6-task-05.md:14` "đơn 0đ đi thẳng tới thành công". Code đưa đơn đã `PAID` sang `/thanh-toan`.
- **Test khoá hành vi sai:** `confirm.test.tsx:135` `expect(push).toHaveBeenCalledWith("/dat-ve/don/order-1/thanh-toan")`.
- **Về miễn trừ của dispatcher:** "route do task-05 làm sau — không tính lỗi" chỉ bao việc route **chưa tồn tại**. Nó không bao việc chọn **sai màn đích**. Màn đích đúng `/ket-qua` cũng do task-05 build, nên sửa không bị chặn.
- **Sửa bắt buộc:** returnUrl → `${origin}/dat-ve/don/${id}/ket-qua`; đơn 0đ → `router.push(\`/dat-ve/don/${id}/ket-qua\`)`; cập nhật test `:135` (và assert body payment chứa returnUrl đúng).
- **Câu hỏi phối hợp, không thuộc phần builder sửa trong task-04:** design-spec `:313` muốn 08 → tạo link → **09**, còn code redirect thẳng `checkoutUrl` của PayOS. API không có endpoint trả lại `checkoutUrl`/dữ liệu QR sau khi tạo (`PaymentStatusDto` chỉ có status), nên 09 chỉ lấy được link bằng cách POST lại. Dispatcher cần chốt luồng 08→09 hay 08→PayOS, rồi ghi vào handoff task-05.

### MINOR

- **m1. Lỗi tạo thanh toán `HOLD_EXPIRED` không chuyển sang trạng thái hết hạn.** `page.tsx:73-78`. Chỉ hiện text, nút Thanh toán vẫn bật, bấm lại sẽ lỗi lặp. Design-spec `:316`: hết giờ giữ → `HoldExpiredDialog`. Nên `setExpired(true)` khi `err.code === "HOLD_EXPIRED"`.
- **m2. Hết hạn giữ ghế dùng EmptyState + link `/lich-chieu`** (`page.tsx:95-108`) thay cho `HoldExpiredDialog` "Chọn lại ghế" → `/dat-ve/[showtimeId]` cùng suất (design-spec `:316`, `:553`). `summary.showtime.id` có sẵn.
- **m3. cancelUrl = `/xac-nhan` lệch hợp đồng task-05** (`layer-6-task-05.md:14` "cancelUrl → thất bại + quay lại"; design-spec `:328` thất bại ở màn 10). Về chức năng vẫn chạy: đơn `pending_payment` vẫn nằm trong `PAYABLE_STATUSES`, link PENDING cũ sẽ bị huỷ ở lần tạo kế tiếp (`payment.service.ts:200-220`) và tự hết hạn ở `hold_expires_at`. Cần chốt với task-05.
- **m4. Thiếu link "← Đổi ghế"** quay về 06 mà vẫn giữ ghế (design-spec `:312`).
- **m5. Mobile: CTA không dính đáy.** Design-spec `:315`. `page.tsx:115` có `pb-28 … lg:pb-8` nhưng nút ở `:138` không sticky, nên chỉ thừa padding.
- **m6. (Ngoài scope, follow-up API) returnUrl/cancelUrl không có whitelist.** `packages/shared/src/schemas/payment.ts:20-21` nhận URL bất kỳ, `payment.service.ts:226-228` dùng thẳng, không so với `WEB_ORIGIN`. Open redirect qua link PayOS của chính đơn người gọi, tác động thấp. Web gửi đúng `window.location.origin`.
- **m7. Hiện thẳng enum loại ghế** `({seat.type})` ở `order-summary.tsx:105`. Nên đổi sang nhãn tiếng Việt.
- **m8. Test voucher không phủ phần map mã → thông điệp thật.** `confirm.test.tsx:13-25` mock cả `@/lib/api/client` (kể cả `ApiError`) và đưa sẵn `ERROR_MESSAGES[code]` vào message. Không có test web nào chạy `toApiError`/`messageForErrorCode` thật. Hành vi production đúng (tôi đã đọc `client.ts:41-47`), nên chỉ ghi MINOR. Nên thêm test cho `client.ts`.
- **m9. Thiếu test lỗi giữa chừng có mã thật** (consent OK, payment trả `HOLD_EXPIRED`/`CONFLICT`). Hiện chỉ có `UNKNOWN` (`confirm.test.tsx:160-174`).
- **m10. a11y:** dòng gợi ý "Nút chỉ khả dụng sau khi xác nhận điều khoản" (`page.tsx:142-144`) chưa nối vào nút bằng `aria-describedby`.
- **m11. Proxy/middleware chưa bảo vệ `/dat-ve`.** Đã có follow-up. Page tự redirect `/dang-nhap?next=` khi gặp `UNAUTHENTICATED` (`page.tsx:43-45`).

## Đã kiểm, đạt

- AC-08: chưa tick thì nút disabled (`page.tsx:112,138`). Phim T13+ chưa xác nhận tuổi thì cần thêm checkbox tuổi. AlertDialog hiện đúng `cinema.name` + `cinema.address` + giờ/ngày suất (`no-refund-warning.tsx:93-98`). Thứ tự gọi age-confirm (nếu cần) → consent → payment đúng (test `:116-117`, `:153-157`).
- R-131: không có nút huỷ đơn/vé.
- R-72: giá lấy nguyên từ server. VND hiển thị bằng `formatVnd`, không có thập phân.
- R-94: đủ 5 mã lỗi voucher map đúng tiếng Việt.
- Double-submit: chấp nhận được.
- Lỗi giữa chừng (consent OK, payment fail): giữ đơn, hiện Alert "Không tạo được thanh toán. Thử lại." đúng design-spec `:316`.
- Kích thước file/hàm hợp lý. Không thấy đủ 3 AI-chaos indicator.

## Verdict

**FAIL**: 1 MAJOR (M1: returnUrl + đơn 0đ trỏ `/thanh-toan` thay vì `/ket-qua`). Builder sửa M1 kèm test. Nên sửa luôn m1, m2 vì cùng chỗ và rẻ. Dispatcher cần chốt luồng 08→09 hay 08→PayOS và đích của cancelUrl (m3) với task-05.
