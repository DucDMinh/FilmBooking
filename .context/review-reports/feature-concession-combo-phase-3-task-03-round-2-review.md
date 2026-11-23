Agent: reviewer

# Review — feature/concession-combo (CR-018) · phase-3-task-03 · round 2

**Verdict: STRICT PASS (có điều kiện close-out)**

**Hai việc BẮT BUỘC làm trước khi commit:**
1. Thêm dòng gap R-100 vào `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` (hoặc mở change-request). Dòng gap phải mô tả cả hai chiều của lỗi m6, xem mục Residual. Không sửa intent spec cho khớp code.
2. Thêm mục `Residual` vào `tasks/feature-concession-combo/phase-3-task-03.md`, liệt kê m3, m4, asset ảnh seed, m-A đến m-G và gap R-100.

---

- **Review level:** STRICT (giữ như round 1).
- **Reason:** Task chạm luồng xác nhận đơn và thanh toán (tổng tiền theo R-72) và đổi contract dùng chung `ScanTicketResponse.order.combos` trong `packages/shared`. API soát vé chuyển từ service role sang client của nhân viên (RLS). Component dùng chung `RemoteImage` có thêm prop mới.
- **Blast radius:**
  - Các màn `/dat-ve/don/[id]/xac-nhan`, `/ket-qua`, `/ve/[bookingCode]`, "Vé của tôi", `/staff/soat-ve`.
  - API `POST /checkin/scan`.
  - `RemoteImage`, được dùng ở `movie-card`, `home-hero`, … Prop `onError` là tuỳ chọn, mặc định `undefined`, nên các nơi gọi cũ không đổi hành vi.
  - `MAX_COMBO_QUANTITY` trong shared.
- **Phạm vi:** phần phase 3 trong working tree. Phase 1 và 2 đã PASS ở report riêng.

## Verify commands + result

Tôi tự chạy lại các lệnh trong round này, đều nằm trong allowlist của `.context/project-config.md`. Lệnh `pnpm -C <pkg> test` bị agent-guard chặn.

| Lệnh | Kết quả |
|---|---|
| `pnpm test` (đệ quy: shared, api, web, scripts) | PASS: shared 44/44 · api 31 file, 698/698 · web 56 file, 757/757 · scripts 31/31 |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS, 0 lỗi (shared `src`, api `src test`, web `src`) |
| oxlint | skip, oxlint chưa được cấu hình |
| aislop / ocr | skip: aislop không có trong allowlist, ocr chưa cài |
| AI-friendly web gate | N/A (không có route public mới) |

Test flaky cũ CR-013 `account.test.tsx` không rớt ở lần chạy này, nên không cần chạy lại.

## Round-1 findings status

| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| **M1** Ảnh combo seed vỡ, không có fallback | **fixed** | `concession-selector.tsx:52-70`: `ComboThumbnail` giữ state `hasError`; khi `onError` thì hiện icon `Popcorn`; class `size-full object-cover` (:62). `remote-image.tsx:12-13,28-32` truyền `onError` cho cả `<img>` và `next/image`. Test ở `concession-selector.test.tsx:186-196` (`fireEvent.error`). Asset `/images/combos/*.webp` vẫn chưa có (Glob `apps/web/public/**` rỗng), nên ảnh seed luôn rơi về icon nhưng UI không còn vỡ. Xem Residual. |
| **M2** Nút +/- 32px, dưới mức 44px | **fixed** | `concession-selector.tsx:86,99` dùng `size-11 p-0`. Size mặc định của Button là `h-11.5 px-6` (`button.tsx:35`). tailwind-merge ^3.7 xếp `size-*` xung đột với `h-*`/`w-*`, nên `size-11` thắng, ra 44×44 (bằng `size: icon`). Test ở :198-203. |
| **M3** AI-readable gate (≥3 indicator) | **fixed** | Mọi hàm trong `concession-selector.tsx` ≤ 50 dòng; dài nhất là `ConcessionSelector` (:192-235, khoảng 43 dòng); cả file 236 dòng. Số 20 đã thay bằng `MAX_COMBO_QUANTITY` (`packages/shared/src/schemas/booking.ts:175`); schema dùng lại hằng này nên hành vi giữ nguyên (`min(0).max(20)`). Comment WHAT đã bỏ; comment còn lại là WHY (:27, :53, :149). Comment sai ở `checkin.service.ts` đã sửa đúng sự thật (:118-122), và hàm chuyển sang `forUser(user.jwt)` (:125). `docs/API_SPEC.md` đã cập nhật `GET /bookings/:id`, `GET /combos`, `PUT /bookings/:id/combos`, `POST /checkin/scan` (`combos: [{ name, quantity }]`). |
| m1 Selector kẹt khi có combo ngừng bán | **fixed** (xem m-B) | `concession-selector.tsx:150-152` chỉ gửi combo còn bán. Test ở :157-173. |
| m2 HOLD_EXPIRED từ PUT không chuyển trang | **fixed** | `concession-selector.tsx:158` gọi `onExpired`; `page.tsx:57,140` nối với `markExpired` (dùng chung với `HoldCountdown`). Test ở :175-184. `ORDER_NOT_HOLDING` cũng map sang `HOLD_EXPIRED` (`booking.service.ts:363-364`), khớp `pay()`. |
| m3 Race giữa voucher và combo | **deferred** (Builder chủ động) | Chấp nhận cho demo. Tiền thật lấy từ DB. |
| m4 Voucher bị gỡ âm thầm | **deferred** | Chấp nhận cho demo. Tổng tiền hiển thị vẫn đúng. |
| m5 `loadCombos` nuốt lỗi | **fixed** | `checkin.service.ts:129-132` gọi `Logger.warn` rồi trả `[]`. Test e2e ở `checkin.e2e-spec.ts:238-244`. |
| m6 USED không kèm combo (R-100) | **deferred → BẮT BUỘC ghi gap** | `TECHNICAL_REQUIREMENT_GAPS.md` chưa có dòng nào về combo/R-100 (grep 0 kết quả). Task file chưa có mục Residual. Chiều thứ hai nằm ở Residual. |
| m7 Key `combo.name` có thể trùng | **fixed** | `checkin-result.tsx:74`, `ticket-card.tsx:57` dùng `${name}-${index}` (list tĩnh nên index ổn). `PriceBreakdown` dùng `combo.id`. |
| m8 Test yếu | **fixed** | Test disabled assert cả hai nút (:137-139). Có thêm test khoá mọi card khi đang cập nhật (:142-155), test ảnh/fallback, và test nhánh lỗi `loadCombos`. |
| m9 `useCallback` vô tác dụng | **fixed** | Đã bỏ; `change` là hàm thường trong `useQuantityUpdate` (:141-166). |

## Kiểm chéo với schema thật

- **RLS khi soát vé đọc `order_combos`:**
  - Policy `order_combos_select` dùng `can_view_order(order_id)` (`20261123120000_concession_combo.sql:52-53`), có `grant select ... to authenticated` (:51).
  - `can_view_order` là `security definer` (`20261111030100_booking_tables.sql:549-565`). Hàm cho phép chủ đơn, `is_admin()`, hoặc `has_cinema_role(o.cinema_id, STAFF|MANAGER)`.
  - Kết quả: STAFF/MANAGER đúng rạp đọc được. STAFF rạp khác bị RLS lọc ra 0 dòng.
  - Ngoài ra `checkin_ticket` trả `WRONG_CINEMA` (không có `order`) trước khi `loadCombos` chạy, nên nhánh này không xảy ra trong thực tế.
  - Dùng `forUser` là đúng nguyên tắc least-privilege.
- **Test chứng minh đọc qua client của user:** `fakeClient.from` đọc `tableRows`, còn `fakeAdmin.from` đọc `accessRows` là kho khác (`checkin.e2e-spec.ts:39,59-66,70-77`). Nếu code quay lại `.admin()`, test :223-236 sẽ không thấy `Combo Solo` và FAIL. Test lọc theo `order_id`, có thêm hàng của đơn khác làm nhiễu.
- **Giới hạn:** mock không mô phỏng việc RLS từ chối STAFF rạp khác. Tôi chỉ xác minh điều này bằng cách đọc SQL. Chưa có pgTAP nào trong `supabase/tests/*` cho `order_combos` (m-D).
- **Mã lỗi khớp `docs/API_SPEC.md`:**
  - `COMBO_NOT_FOUND` → 404 `NOT_FOUND`
  - `ORDER_NOT_HOLDING` và `HOLD_EXPIRED` → 410 `HOLD_EXPIRED`
  - `INVALID_COMBO_QUANTITY` → `VALIDATION_ERROR`
  - Nguồn: `booking.service.ts:363-374`.

## Đánh giá m1: combo ngừng bán bị bỏ khỏi đơn ở lần đổi kế tiếp

- **Hành vi hiện tại:**
  - Combo ngừng bán vẫn nằm trong `summary.combos` và vẫn hiện ở `PriceBreakdown` (`order-summary.tsx:110-119`), nhưng không có stepper trong selector.
  - Nếu khách không đổi gì, đơn được thanh toán đúng giá đã chốt (khớp R-72).
  - Nếu khách đổi một combo khác, PUT không gửi combo ngừng bán. RPC xoá rồi chèn lại, nên combo đó biến mất khỏi đơn. Tổng tiền giảm và `PriceBreakdown` cập nhật ngay theo summary của server.
- **Kết luận:** chấp nhận được cho demo theo R-69/R-72. Khách không bị thu thừa, và số tiền hiển thị luôn là số của server. Chỉ thiếu thông báo kiểu "Combo X đã ngừng bán và được bỏ khỏi đơn" (m-B, Minor).

## Findings (round 2)

### Blocker
Không có.

### Major
Không có.

### Minor (không chặn)

- **m-A.** `/combos` chỉ được tải một lần (`concession-selector.tsx:28-50`).
  - Nếu admin tắt combo sau khi trang đã tải, khách bấm "+" sẽ nhận 404 "Combo không tồn tại hoặc đã ngừng bán". Các lần bấm sau vẫn kèm combo đó nên tiếp tục 404 cho tới khi khách tải lại trang.
  - Gợi ý: khi gặp `NOT_FOUND`, tải lại `/combos`.
- **m-B.** Combo ngừng bán bị bỏ khỏi đơn mà không có thông báo (`concession-selector.tsx:149-152`).
- **m-C.** Nút "Thanh toán" không bị khoá trong lúc PUT combo đang chạy (`page.tsx:122,141`).
  - Hệ quả: con số trên nút hoặc trong dialog có thể lệch trong thời gian rất ngắn.
  - Không sai tiền: DB khoá `FOR UPDATE`, và số tiền gửi PayOS lấy từ DB.
- **m-D.** Chưa có pgTAP cho RLS `order_combos_select`. Cần phủ các vai: chủ đơn, admin, staff đúng rạp, staff rạp khác. Đây là khoảng trống test của phase 1.
- **m-E.** Task file `phase-3-task-03.md:21` mô tả một dòng tổng "Bắp nước & Combo: …đ". Code lại hiện từng dòng combo kèm thành tiền. Cách này minh bạch hơn và chấp nhận được, nhưng nên ghi lại trong task file.
- **m-F.** Ghi chú nhận bắp nước hướng khách vào luồng mà hệ thống chưa hỗ trợ.
  - Vị trí: `ticket-card.tsx` (`ComboList`, câu "Nhận bắp nước tại quầy bắp nước của rạp bằng mã QR hoặc mã vé này."), cùng câu "Nhận tại quầy bằng mã vé." ở `concession-selector.tsx:179`.
  - Vấn đề: nhân viên quầy bắp nước chỉ xem được combo qua `/staff/soat-ve`, mà lượt quét đó là một lần check-in thật. Hệ quả mô tả ở chiều (b) trong Residual.
  - Hướng xử lý: đổi câu chữ, ví dụ "xuất trình vé tại quầy soát vé để nhận combo", hoặc giải quyết qua gap R-100.
- **m-G.** `booking.service.ts:373` vẫn hardcode "tối đa 20" trong thông báo lỗi, dù đã có `MAX_COMBO_QUANTITY`. File này thuộc phase 2, chỉ ghi nhận.

### Đạt
- Không có comment WHAT hay magic number mới trong phase 3.
- `RemoteImage.onError` là tuỳ chọn, nên các nơi gọi cũ không đổi hành vi.
- Response soát vé chỉ có tên và số lượng combo, không lộ `unit_price` hay `id`. Đã có test kiểm điều này.
- Bề rộng ở 375px: **tôi tính theo class, không render thật**. Stepper gồm 44 + 36 + 44px cộng gap, vừa trong card một cột.
- Tiếng Việt có dấu. Có `aria-label` riêng cho từng combo, `aria-live` cho số lượng, và `role="alert"` cho lỗi.

## Residual (đã có chủ đích): mức chấp nhận cho dự án demo

| Mục | Đánh giá |
|---|---|
| m3 race voucher ↔ combo | Chấp nhận. Chỉ lệch hiển thị tạm thời; tiền thật lấy từ DB. |
| m4 voucher bị gỡ âm thầm | Chấp nhận. Tổng tiền vẫn đúng; UX có thể cải thiện sau. |
| **m6: không có luồng nhận combo tách khỏi check-in (R-100)** | **BẮT BUỘC ghi gap, gồm CẢ HAI chiều.** (a) **Soát cửa trước, ra quầy sau:** quầy quét lại nhận `USED` (`checkin.service.ts`, nhánh USED không có `order`), nên không thấy combo. Thêm nữa, không có cờ "đã phát" nên có rủi ro nhận trùng. (b) **Ra quầy trước, soát cửa sau:** lượt quét OK ở `/staff/soat-ve` chạy `checkin_ticket`, hàm này soát **toàn bộ** vé của đơn (`20261117130000_order_level_qr_fixes.sql:347-351`, `set checked_in_at = v_now`). Khi khách tới cửa phòng chiếu, lượt quét trả `USED`. Ghi chú mới trên vé (m-F) lại hướng khách đi đúng đường này. Cả hai chiều chung một gốc: R-100 yêu cầu "kiểm tra và xác nhận trả bắp nước", tức một luồng redeem riêng, nhưng code chưa có. Không chặn task này, vì m6 đã được chủ động hoãn sang change-request. Nhưng bắt buộc ghi gap trước khi commit, và không được hạ intent spec cho khớp code. |
| Asset ảnh seed `/images/combos/*.webp` không tồn tại | Chấp nhận. UI rơi về icon nhờ fallback của M1. Nên thêm asset vào `apps/web/public/images/combos/` hoặc đổi seed sang host được phép, ghi vào backlog. |

## Verdict

**STRICT PASS.**
- M1, M2, M3 đã được sửa đúng và có test.
- Các minor đã sửa không gây lỗi mới.
- Tôi tự chạy lại verify, tất cả xanh: test 44 + 698 + 757 + 31, typecheck PASS, lint 0 lỗi.

Trước khi commit phải làm xong hai việc **BẮT BUỘC** ở đầu report:
1. Dòng gap R-100 trong `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`, mô tả cả hai chiều (a) và (b).
2. Mục Residual trong task file.
