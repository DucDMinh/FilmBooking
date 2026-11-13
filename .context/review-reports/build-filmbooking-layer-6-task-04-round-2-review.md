# Review — build-filmbooking layer-6 task-04 — round 2

Agent: reviewer

- **Task:** Web xác nhận đơn (màn 08 / D3)
- **Worktree:** `E:/FilmBooking/.worktrees/layer-6__task-04` (chưa commit, 5 file untracked đúng danh sách Files to Create/Modify)
- **Review level:** STRICT
- **Reason:** luồng thanh toán, consent làm bằng chứng (R-71/R-133), returnUrl/cancelUrl là hợp đồng với task-05.
- **Blast radius:** chỉ web, 5 file mới. Không đụng API/shared/DB.
- **Quyết định dispatcher áp dụng cho round này:**
  - 08 redirect thẳng tới `checkoutUrl` của PayOS (không build màn 09 VietQR riêng).
  - returnUrl = `/ket-qua`.
  - cancelUrl = `/xac-nhan` (có chủ đích).
  - Đơn 0đ đi thẳng `/ket-qua`.
  - Route `/ket-qua` do task-05 làm sau.
  - Dùng EmptyState kèm nút "Chọn lại ghế" thay cho HoldExpiredDialog (file đó thuộc task-03).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | 13 file / **204 test PASS** |
| `cd apps/web && pnpm build` | PASS, có route `ƒ /dat-ve/don/[id]/xac-nhan` |
| aislop / oxlint / ocr | skip (không có trong allowlist / chưa cài) |
| AI-friendly web gate | N/A (màn cần đăng nhập) |

## Kiểm các finding round 1

| Round 1 | Trạng thái | Bằng chứng |
|---|---|---|
| **M1** returnUrl / 0đ sai màn đích | **ĐÓNG** | `page.tsx:69` returnUrl `${origin}/dat-ve/don/${id}/ket-qua`, cancelUrl `/xac-nhan` (theo dispatcher). `page.tsx:72` 0đ dùng `router.push('/dat-ve/don/${id}/ket-qua')`. Test assert body payment `confirm.test.tsx:129-134` và 0đ `:150` |
| m1 HOLD_EXPIRED | Đóng | `page.tsx:74` setExpired. Test `:191-207` |
| m2 Chọn lại ghế | Đóng (theo dispatcher) | `page.tsx:104-109` `/dat-ve/${summary.showtime.id}` + "Chọn suất khác". Test assert href `/dat-ve/s1` |
| m3 cancelUrl | Chấp nhận (dispatcher chốt) | — |
| m4 Đổi ghế | Đóng | `page.tsx:123-125`, `min-h-11` (≥44px) |
| m5 CTA sticky mobile | Đóng một phần, xem n1 | `page.tsx:147` |
| m6 whitelist API | Follow-up API, ngoài scope | — |
| m7 nhãn loại ghế | Đóng | `order-summary.tsx:12,106`. Key khớp `SEAT_TYPES` thật (`packages/shared/src/enums.ts:29`) |
| m8 test voucher qua apiFetch thật | Đóng | `confirm.test.tsx:62-69` stub `fetch`, chạy `apiFetch`/`toApiError` thật với body `{error:{code}}` đúng dạng `client.ts:41-47`, đủ 5 mã R-94 (`:241-258`). Hết false-confidence |
| m9 test lỗi giữa chừng có mã thật | Đóng | HOLD_EXPIRED `:191`, CONFLICT `:209` |
| m10 aria-describedby | Đóng | `page.tsx:153,160` |

## Regression check

- Gating AC-08, AlertDialog đúng tên + địa chỉ rạp, thứ tự age-confirm → consent → payment, không có nút huỷ (R-131), VND không có thập phân: còn nguyên, test vẫn PASS.
- Double-submit: nút vẫn disabled khi `paying`. Nút disabled nằm trong khối sticky mới, không đổi logic.
- Lỗi `HOLD_EXPIRED` chuyển sang EmptyState. Lúc đó `payError` không còn hiển thị, nhưng EmptyState đã đủ thông điệp nên chấp nhận được.

## Findings

### CRITICAL
Không có.

### MAJOR
Không có.

### MINOR (không chặn PASS)

- **n1. Sticky CTA bị giới hạn trong `<aside>`.** `page.tsx:147` đặt `max-lg:sticky max-lg:bottom-0` bên trong `aside`, nên khối này chỉ dính đáy khi `aside` đang nằm trong viewport. Trên mobile, `ShowtimeInfo` đứng trước, nên lúc mới vào trang CTA vẫn có thể nằm dưới màn hình. Ngoài ra `max-lg:-mx-4` không khớp padding `sm:p-6` của aside ở khoảng 640–1023px, và `pb-28` ở `:121` vẫn thừa. Muốn đúng "dính đáy" theo design-spec `:315` cần `fixed`, hoặc đặt khối CTA ngoài aside.
- **n2. Test:** helper `useRealApiFetchReturning` (`confirm.test.tsx:62`) đặt tên kiểu hook dù không phải hook. Dòng `import { ERROR_MESSAGES }` ở `:15` nằm sau khai báo `type` ở `:14`. Chỉ là vấn đề thẩm mỹ.
- **n3. (giữ từ round 1) m6:** API không whitelist returnUrl/cancelUrl. Đây là follow-up phía API.
- **n4. (giữ) Proxy chưa bảo vệ `/dat-ve`.** Đã có follow-up.

## Verdict

**STRICT PASS**: M1 đã đóng, có test assert body payment và đích của đơn 0đ. Các MINOR round 1 đã sửa hoặc được dispatcher chấp nhận. Không có regression. Chỉ còn MINOR n1–n4.
