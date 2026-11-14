Agent: reviewer

# Review — build-filmbooking layer-7 task-06 — Round 2

Worktree: `E:/FilmBooking/.worktrees/layer-7__task-06` (branch `wt/layer-7__task-06`, chưa commit)
Round trước: `.context/review-reports/build-filmbooking-layer-7-task-06-round-1-review.md` (FAIL: F1–F4 MAJOR, F5–F6 MINOR)

## Review level
**STRICT**

## Reason
Task ghi nhận hoàn tiền thủ công (tiền thật, server không cho ghi lại), xuất CSV có PII, phân quyền theo rạp, và gọi API contract `CancellationModule` có sẵn.

## Blast radius
- Chỉ đụng file mới của task: 2 page dưới `app/admin/don-bi-anh-huong/`, `affected-orders-api.ts`, `affected-orders-list.tsx`, `affected-order-detail.tsx`, `affected-resolution-form.tsx`, file test. Không sửa file nào đã có.
- `affected-orders-list.tsx` dài đúng 300 dòng, chạm trần ≤300.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 25 file, 372 test (tăng 17 so với round 1) |
| `cd apps/web && pnpm exec vitest run` (lần 2) | PASS: 25 file, 372 test. Không flaky, `pricing-voucher` không timeout |
| `pnpm build` | PASS |
| aislop / ocr | skip: không có trong allowlist / chưa cài |
| oxlint | skip: repo chưa cấu hình oxlint |
| AI-friendly web | N/A: màn admin nội bộ |

## Xác minh các fix của round 1

| # | Kết quả | Bằng chứng |
|---|---|---|
| F1 số tiền | **Đã sửa đúng root cause** | Xem chi tiết ngay dưới bảng. |
| F2 nút gửi lại | **Đã sửa** | Xem chi tiết ngay dưới bảng. |
| F3 phân trang | **Đã sửa** | Xem chi tiết ngay dưới bảng. |
| F4 `?cinema=` | **Đã sửa** | Xem chi tiết ngay dưới bảng. |
| F5 lỗi 422 không có issues | **Đã sửa** | `affected-resolution-form.tsx:89-92`: 422 rơi vào `_form` được gắn sang ô số tiền. Các 422 không kèm issues ở server (`cancellation.service.ts:358,371,440`) chỉ còn ca "vượt tổng tiền" đi được tới server, vì ô trống và mã GD rỗng đã bị chặn ở client. Test ở dòng 167. |
| F6 thu hồi URL tải CSV | **Đã sửa** | `affected-orders-api.ts:68`: `setTimeout(revokeObjectURL, 10_000)`. |

**F1 — số tiền hoàn (`affected-resolution-form.tsx`):**
- `parseRefundAmount` (`:19-31`) chỉ nhận chuỗi toàn chữ số, hoặc nhóm nghìn khớp `^\d{1,3}([.,\s]\d{3})+$`. Dạng khác trả NaN và bị chặn (`:61-63`). Vì vậy `"200.000"` thành 200000, còn `"20.00"`, `"1.5"`, `"1e5"`, `"0x10"`, `"-5"`, `"abc"` đều bị chặn.
- Có dòng preview `Sẽ ghi nhận: <formatVnd>` (`:53-55,117`) để người dùng thấy số tiền trước khi xác nhận.
- Số tiền lớn hơn `totalAmount` bị chặn ngay ở client (`:65-68`). Ô trống vẫn đi qua zod và báo theo field (AC-25).
- Test: `test.tsx:138-165` có `it.each` cho cả ca hợp lệ và không hợp lệ, kiểm cả body gửi đi `refundedAmount === 200000`.

**F2 — nút gửi lại email (`affected-orders-api.ts`):**
- `canResendEmail` (`:23-27`) chỉ cho gửi lại khi email `FAILED`, hoặc chưa có email (`null`) và đơn có `contactEmail`. Điều kiện này khớp server (`cancellation.service.ts:522-552`) và spec §24/§34.
- 409 có thông điệp riêng (`:29-32`).
- Áp dụng ở cả danh sách (`list.tsx:260`) và chi tiết (`detail.tsx:113`).
- Test cũ khẳng định sai đã được thay. Test mới phủ SENT, PENDING, `null`, thiếu email và 409 (`test.tsx:200-247,349-358`).

**F3 — phân trang:**
- Gửi `limit=20&offset` (`list.tsx:36,76`). Tên tham số khớp `listAffectedOrdersQuerySchema`: `limit` là `z.coerce`, khoảng 1–200, còn `offset` ≥ 0 (`packages/shared/src/schemas/cancellation.ts:48-49`). Server áp vào `.range(offset, offset+limit-1)` (`service.ts:251`).
- Đổi bộ lọc thì quay về trang đầu (`:82`). Có nút Trang trước/sau (`:278-295`) và dòng "Đơn a–b / total" (`:208`).
- Lọc email có ghi chú rõ là chỉ áp dụng trong trang và không áp vào CSV (`:192-195,209`). Không còn EmptyState sai khi trang hiện tại không khớp (`:203,211-215`).
- Test: `test.tsx:249-282`.

**F4 — `?cinema=` từ topbar:**
- `resolveCinemaFilter` (`list.tsx:49-53`): Admin chỉ dùng giá trị khi là UUID hợp lệ. Staff/Manager chỉ dùng khi là rạp được gán, theo `me.cinemas[].cinemaId` đúng schema `me.ts:4`. Giá trị `all` hoặc thiếu thì không gửi, và server tự giới hạn theo rạp được gán.
- `cinemaId` được gửi cho cả danh sách lẫn CSV. Tham số `cinemaId` có trong cả list schema và export schema (`cancellation.ts:45,54`).
- `/me` lỗi thì hiện ErrorState có nút thử lại (`:197-198`). Danh sách chờ `/me` tải xong mới gọi (`:85`).
- Test: `test.tsx:284-314`.

## Findings (round 2)

Không có CRITICAL hay MAJOR. Có 4 điểm MINOR, không chặn:

- **M1** `affected-orders-api.ts:24`: `canResendEmail` trả `false` khi đơn đã `refunded_manual`, trong khi server vẫn cho gửi lại email của đơn này (`service.ts:511`). Spec §24 chỉ nói "Gửi lại khi email lỗi", không giới hạn trạng thái đơn. Đây là lựa chọn bảo thủ, chấp nhận được ở bản demo; nên ghi lại để PO quyết định.
- **M2** `list.tsx:82,84-99`: khi đổi bộ lọc trong lúc đang ở trang khác 0, hệ thống bắn 1 request thừa với offset cũ. Request đó bị huỷ nhờ cờ `active` nên không sai dữ liệu, chỉ tốn một lượt gọi.
- **M3** `list.tsx:203-204`: nếu dữ liệu đổi đồng thời khiến offset vượt `total`, ví dụ người khác đã xử lý hết đơn ở trang cuối, màn hình hiện EmptyState mà không còn nút "Trang trước". Đổi bộ lọc hoặc tải lại trang sẽ thoát được. Hiếm gặp.
- **M4** `affected-resolution-form.tsx:19`: regex chấp nhận dấu phân cách lẫn lộn, ví dụ `"1.000,000"` thành 1000000. Đây không phải lỗi lệch 1000 lần: preview hiển thị số đã định dạng và có chặn vượt tổng tiền, nên rủi ro thấp.

Các gap đã ghi ở round 1 F7 (field Ngày/Phương thức, link dashboard `?status=pending`, dạng card khi màn < 1024px) vẫn để cho gap register / task khác, không tính cho task-06.

### AI-readable gate
Có 1 indicator: các component dài hơn 50 dòng. Dưới ngưỡng 3 nên không FAIL.

## Verdict
**STRICT PASS**
