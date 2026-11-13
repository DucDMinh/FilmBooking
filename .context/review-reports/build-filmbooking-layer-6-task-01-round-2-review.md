# Review — build-filmbooking layer-6 task-01 — round 2

Agent: reviewer
Ngày: 2026-11-14
Worktree: E:/FilmBooking/.worktrees/layer-6__task-01 (chưa commit)
Round trước: `build-filmbooking-layer-6-task-01-round-1-review.md` (FAIL: MAJOR-1 API_SPEC; còn MINOR-1, MINOR-2, NIT-1, NIT-2)

## Review level
STRICT. Lý do: payment (createPayment, huỷ link PayOS), shared schema, wiring global, tài liệu API as-built.

## Blast radius
- `payment.service.ts`: luồng tạo link thanh toán.
- `docs/API_SPEC.md`: tài liệu as-built cho 9 module.
- `webhook.e2e-spec.ts`: test.
- Web màn xác nhận (`apps/web/src/app/(public)/dat-ve/don/[id]/xac-nhan/page.tsx`), vì có thể nhận 409 mới.

## Verify commands + kết quả
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/api && pnpm test` | PASS, 23 file / 460 test (round 1: 457, thêm 3) |
| aislop / oxlint / ocr | skip: không có trong allowlist verify của lượt này |

## Đối chiếu các finding của round 1

### MAJOR-1 (API_SPEC lệch code): ĐÃ SỬA
Đã đối chiếu từng dòng với decorator thật:
- **Booking:** khớp 8 route trong `booking.controller.ts:30-100`. Chỉ seatmap có `@Public`.
- **Payment:** khớp `payment.controller.ts:30,43,54` và `webhook.controller.ts:33`. Mô tả 400/409 đúng code.
- **Checkin:** khớp `@Roles("STAFF")` + `@CinemaScope()`. "Manager/Admin cũng qua" đúng, vì `RolesGuard` cho Admin qua và dùng `satisfies` theo cấp bậc (`roles.guard.ts:27-30`).
- **Admin:** khớp `users.controller.ts:71-275`:
  - lock / admin-role / roles/admin là ADMIN;
  - staff GET/POST/DELETE là ADMIN+MANAGER kèm CinemaScope; PATCH staff là ADMIN.
  - settings: GET cho ADMIN+MANAGER, PUT/PATCH chỉ ADMIN;
  - vouchers: GET cho ADMIN+MANAGER, ghi chỉ ADMIN;
  - audit, audit-logs: ADMIN.
- **Orders:** khớp `orders.controller.ts:29-106`, gồm cả các alias `/admin/...` và `todo`.
- **Report:** khớp `report.controller.ts:291-367` (MANAGER).
- **Cancellation:** khớp `cancellation.controller.ts:89-244`. Đã bỏ `GET cancelled-showtimes` (ghi chú route này nằm ở ReportModule), đã bổ sung nhóm affected-orders kèm quyền STAFF.

### MINOR-1 (trả checkoutUrl khi đơn đã đổi trạng thái): ĐÃ SỬA
- **Code:** `payment.service.ts` update đơn có `.in(status).select("id")`. Nếu 0 dòng được cập nhật thì code gọi `cancelPaymentRecordThenLink` cho payment vừa insert (lấy id qua `.insert().select("id").single()`) rồi ném 409 `CONFLICT`, không trả checkoutUrl.
- **Test:** có 2 test cho race, một với paid và một với cancelled. Cả hai kiểm 409, kiểm đơn không bị ghi đè; test cancelled còn kiểm payment mới thành CANCELLED và PayOS được gọi huỷ đúng orderCode.
- **UX web:** `xac-nhan/page.tsx:73-79` bắt `ApiError` và hiện `err.message` ("Đơn không còn ở trạng thái chờ thanh toán"). Không có redirect nào sang PayOS. Bấm lại thì:
  - đơn đã paid: server trả `PAID` (payment.service.ts:122-129), web chuyển tới `ket-qua`;
  - đơn đã cancelled/expired: lại 409, hoặc màn `PAYABLE_STATUSES` chặn khi reload.

  Vậy khách không thể thanh toán đơn đã đổi trạng thái.

### MINOR-2 (link huỷ lỗi của chính đơn không được thử lại): ĐÃ SỬA
- **Code:** truy vấn payment của chính đơn nay lọc `status in (PENDING, CANCELLED)`, `payment_link_id not null`, `link_cancelled_at is null`.
- **Test:** test mới dựng payment `CANCELLED` + `pl-stuck` + `link_cancelled_at = null`, rồi kiểm PayOS được gọi huỷ lại và `link_cancelled_at` được ghi.
- **Rủi ro lặp vô hạn:** không có. Payment chỉ được thử lại mỗi lần khách gọi createPayment.

### NIT-1 (JSDoc sai hành vi webhook): ĐÃ SỬA
JSDoc nay ghi đúng: webhook vẫn `confirm_paid`, và huỷ lỗi sẽ được thử lại.

### NIT-2 (so sánh origin chưa chuẩn hoá): ĐÃ SỬA
`allowedOrigins = WEB_ORIGIN.map((o) => new URL(o).origin)`. `env.ts` đã validate `z.url()` nên `new URL` không ném lỗi. Path tương đối vẫn ghép sau origin đã chuẩn hoá, không mở bypass mới.

## Findings mới (round 2)

### NIT-3: lỗi DB khi update đơn bị coi như "đơn đã đổi trạng thái"
`payment.service.ts`: phần `const { data: updatedOrders } = ...` bỏ qua `error`. Nếu DB lỗi, khách nhận 409 kèm thông điệp "đơn không còn chờ thanh toán", đồng thời link vừa tạo bị huỷ. Kết quả an toàn (không lộ link, không mất tiền) nhưng thông điệp sai. Nên phân biệt lỗi và ném 500. Không chặn.

### NIT-4: chưa có test cho trường hợp `WEB_ORIGIN` viết hoa
Test "WEB_ORIGIN được chuẩn hoá" thực chất kiểm candidate viết hoa, không kiểm cấu hình `WEB_ORIGIN` viết hoa. Code đúng; chỉ ghi nhận độ phủ test.

### NIT-5: alias dạng `...` trong API_SPEC chưa liệt kê hết
Dòng Cancellation dùng `.../:orderId/refund` và `.../:orderId/resend-email`, chưa ghi rõ alias `/orders/:orderId/refund` và `/orders/:orderId/resend-email`. Dòng Admin ghi chung "Manager (`@CinemaScope`)", nhưng settings/vouchers không gắn CinemaScope. Không sai ý, chỉ chưa thật chính xác.

## Regression
- Không thấy regression.
- Luồng 0đ, consent, hold hết hạn và trả PAID giữ nguyên.
- Truy vấn huỷ link cho đơn cũ (orphan) giữ nguyên, chỉ thay phần thân bằng helper.
- 457 test cũ vẫn pass.

## Residual
- Trang `/dat-ve/don/[id]/ket-qua` thuộc layer-6-task-05; cần merge task-05 trước khi demo luồng thanh toán.
- Reconcile không quét payment `CANCELLED` có link sống. Nếu mất webhook trên link cũ huỷ lỗi thì không đối soát tự động, chỉ được thử huỷ lại khi khách tạo link mới. Chấp nhận được cho bản demo.

## Verdict
**STRICT PASS**: không còn MAJOR/MINOR. Chỉ còn NIT-3, NIT-4, NIT-5, không chặn.
