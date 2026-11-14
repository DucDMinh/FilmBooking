# Review — build-filmbooking · layer-8 · task-04 · round 2

Agent: reviewer
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-04` (branch `wt/layer-8__task-04`, chưa commit)
Round trước: `build-filmbooking-layer-8-task-04-round-1-review.md` (FAIL, MAJOR-1)

## Review level
**STRICT**. Giữ nguyên mức của round 1: test cho auth/lockout/OAuth, email hàng loạt, huỷ suất, hoàn tiền; helper chạy SQL vào schema `auth`.

## Reason
Re-review sau khi builder sửa MAJOR-1 và các MINOR. Trọng tâm: xác nhận MAJOR-1 đóng thật và phần sửa không sinh xanh giả hay flaky mới.

## Blast radius
Không đổi so với round 1. Chỉ có 3 file test/helper untracked và task file. Không đụng source hay migration (`git status --short` sạch ngoài các file này).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `cd apps/api && pnpm test:int cancel-showtime auth-flows` (lần 1) | PASS 30/30 (22.2s) |
| `cd apps/api && pnpm test:int cancel-showtime auth-flows` (lần 2) | PASS 30/30 (21.5s) |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip: chưa cài / chưa cấu hình / chưa cài |

## Xác minh các điểm sửa

### MAJOR-1: ĐÃ ĐÓNG
`cancel-showtime.int-spec.ts:205-219`
- Buyer "late" giờ giữ `seatIds[PAID_ORDERS]` (`:214`), là ghế của đơn holding.
- Test AC-24 trước đó (`:201-202`) đã assert đơn này `cancelled`, nên ghế này là ghế được nhả, không phải ghế SOLD.
- Hai assertion phân biệt được nguyên nhân:
  - `hold.status === 409` (`:215`).
  - `hold.body.error.code === "SHOWTIME_CANCELLED"` (`:216`).
- Phân tích theo DB thật:
  - Nếu suất KHÔNG bị huỷ: ghế trống thì hold thành 201; ghế còn kẹt thì code là lỗi ghế, không phải `SHOWTIME_CANCELLED`.
  - Code `SHOWTIME_CANCELLED` chỉ sinh từ nhánh kiểm `showtimes.status` trong `hold_seats` (`20261112140000_hold_seats_hardening.sql:111`), map ở `booking.helper.ts:22`.
  - Vì vậy ca này chỉ xanh khi suất đã bị huỷ.
- Check `HELD = 0` (`:217-218`) giờ có nghĩa: nó xác nhận ghế holding đã được nhả và hold mới không tạo HELD.
- Seatmap chốt `toBe(409)` (`:207`).
- Comment `:110` đã sửa đúng thực tế (10 paid + 1 holding + 1 probe, không còn ghế trống).
- Không tạo phụ thuộc thứ tự mới: ca này vốn đã chạy sau ca huỷ suất trong cùng describe tuần tự, giống round 1.

### MINOR round 1: trạng thái
| # | Nội dung | Trạng thái |
|---|---|---|
| 1 | Mailpit null → `null === null` | **Đã sửa**: `auth-flows.int-spec.ts:124-127` warn + `return` tường minh. Assertion chính (429 + `retryAfter`) vẫn chạy trước. |
| 3 | JSDoc `runLocalSql` | **Đã sửa**: `app-harness.ts:76-80` ghi rõ hàm không tự kiểm local, guard nằm ở `loadLocalSupabaseEnv`. |
| 8 | Status lỏng | **Đã sửa**: các ca POST dùng `toBe(201)`, PATCH/GET dùng `toBe(200)` (`cancel-showtime:164,188,269,286,326,390,399`). Mặc định Nest POST là 201, và 2 lần chạy thực tế đều khớp. |
| 9 | Intent dùng 1 lần | **Đã sửa**: `auth-flows.int-spec.ts:247-252`. Assert đúng 1 intent google có `consumed_at` khác null. Chèn identity google thứ hai (provider_id mới, không tạo intent) bị `OAUTH_AUTO_MERGE_BLOCKED`, khớp nhánh 2 của `guard_identity_insert` (`20261113090000_identity_link_intent_hardening.sql:45-74`): user đã có identity và không còn intent chưa dùng. Chứng minh đúng tính single-use. |
| 2 | `drainOutbox` quét toàn DB | Giữ nguyên, residual (xem dưới). Không làm sai suite khác (đã kiểm ở round 1). |
| 5 | Helper ngoài danh sách file / trùng `helpers/api-app.ts` của task-01 | Giữ nguyên. Gom sau merge layer-8. |
| 6 | Probe biến AC-24 thành 11 đơn, phụ thuộc thứ tự trong describe | Giữ nguyên. Assertion dùng `orders.length` nên nhất quán. |
| 7 | Bucket rate-limit theo IP giả không dọn | Giữ nguyên, vô hại trên local. |
| 10 | Danh sách suất công khai chưa kiểm | Giữ nguyên, không bắt buộc. |

## Findings

### MAJOR
Không có.

### MINOR (không chặn, mang sang)
- MINOR-6: `cancel-showtime.int-spec.ts:156` `orders.push(probe)`. AC-24 chạy với 11 đơn paid, và các `it` phụ thuộc thứ tự (lọc `-t` sẽ hỏng).
- MINOR-5: `helpers/app-harness.ts` trùng chức năng `helpers/api-app.ts` (task-01). Gom lại sau merge.
- MINOR-7: `rate_limit_buckets` theo IP giả không được dọn.

### Residual risk
- `drainOutbox` (`app-harness.ts:63-72`) và assert "mọi dòng còn PENDING" (`cancel-showtime.int-spec.ts:238`) có thể flaky nếu có drainer đồng thời trên cùng DB local. Đó có thể là agent khác chạy song song, hoặc pg_cron `job-send-emails` khi vault đã cấu hình `api_base_url`; mặc định local chưa cấu hình nên cron bỏ qua. Trong một lượt `test:int` tuần tự (`fileParallelism: false`) không bị ảnh hưởng.
- AC-04 dựa trên mô phỏng trigger thay vì chạy OAuth thật. Checklist kiểm tay 4 mục trong task file đã phủ phần UI/OAuth thật.

## Verdict
**STRICT PASS**

MAJOR-1 đã đóng: ca giữ ghế sau huỷ suất giờ chỉ xanh khi suất thực sự bị huỷ. Các MINOR quan trọng (1, 3, 8, 9) đã sửa đúng. 2 lần chạy int đều 30/30, lint và typecheck xanh. Còn lại 3 MINOR không chặn và residual về drain outbox dùng chung DB.
