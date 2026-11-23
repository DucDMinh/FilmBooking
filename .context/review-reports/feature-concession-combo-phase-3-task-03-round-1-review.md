Agent: reviewer

# Review — feature/concession-combo (CR-018) · phase-3-task-03 · round 1

- **Review level:** STRICT
- **Reason:** Task này đụng luồng xác nhận đơn/thanh toán (tổng tiền theo R-72), đổi contract API dùng chung (`ScanTicketResponse` trong `packages/shared`), API soát vé đọc bằng service role, và web đọc `order_combos` qua RLS `can_view_order`.
- **Blast radius:**
  - Trang `/dat-ve/don/[id]/xac-nhan`.
  - `PriceBreakdown`, dùng chung với các màn tóm tắt đơn.
  - `TicketDetail`, hiện ở `/dat-ve/don/[id]/ket-qua`, `/ve/[bookingCode]` và "Vé của tôi". `ORDER_COLUMNS` giờ embed thêm `order_combos`: nếu thiếu migration thì cả truy vấn vé lỗi và trả về `[]`.
  - Màn `/staff/soat-ve` và `POST /checkin/scan`.
  - Kiểu `ScanTicketResponse.order.combos` (bắt buộc).
- **Phạm vi:** chỉ phần phase 3 trong working tree. Phase 1 và 2 đã PASS và chưa commit, nên không review lại.

## Verify commands + result

Các lệnh `pnpm -C apps/web test` và `pnpm -C apps/api test` bị agent-guard chặn vì không nằm trong allowlist. Tôi chạy các alias tương đương có trong `.context/project-config.md`.

| Lệnh | Kết quả |
|---|---|
| `pnpm test` (đệ quy: shared, api, web, scripts) | PASS. shared 44/44 · api 31 file, 697/697 · web 56 file, 752/752 · scripts 31/31 |
| `pnpm typecheck` (shared, web, api) | PASS |
| `pnpm lint` (eslint: shared `src`, api `src test`, web `src`) | PASS, 0 lỗi |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, không có trong allowlist / ocr not installed |
| AI-friendly web gate | N/A (chỉ màn trong luồng đặt vé và staff, không thêm route public mới) |

Test flaky cũ CR-013 `account.test.tsx` không tái hiện ở lần chạy này và không liên quan đến task.

## Kiểm chéo với schema thật

- `order_combos(combo_name, quantity)` khớp cột thật trong migration `20261123120000_concession_combo.sql:25-35`. Quan hệ embed qua FK `order_id → orders(id)` hợp lệ.
- Web đọc vé bằng client của user. RLS `order_combos_select` dùng `can_view_order(order_id)` (`20261111030100_booking_tables.sql:549-565`), gồm chủ đơn, admin và STAFF/MANAGER của rạp. `fetchMyOrder(s)` luôn lọc `user_id`, nên khách chỉ thấy combo của đơn mình. Đơn của người khác không lộ ra trên "Vé của tôi". Có `GRANT select ... to authenticated` (migration :51). OK.
- `checkin_ticket` trả `order_id` (`20261117130000_order_level_qr_fixes.sql:380`). `loadCombos` chỉ select `combo_name, quantity`, nên response không lộ `unit_price` hay `id`. Test e2e có assert điều này, và mock `fakeAdmin` trả cả `unit_price`/`id` để kiểm phép lọc. Mock không bịa thêm hành vi.
- Mọi nơi tạo `ScanTicketResponse` đều đã thêm `combos`:
  - `checkin.service.ts:63`
  - `staff-pages.test.tsx:71`
  - `checkin-result.test.tsx`
  - `checkin.e2e-spec.ts:205`
  - Nhánh USED, WRONG_CINEMA và TOO_EARLY không có `order`, nên không bị ảnh hưởng.
  - Các int-spec (`rls-scope`, `cancel-showtime`) chỉ assert từng trường, không `toEqual` cả object, nên không vỡ.
  - Typecheck xanh.
- Trạng thái đơn: selector bị khoá khi `status !== "holding"` (gồm cả `pending_payment`), khớp RPC chỉ cho đổi khi `holding` (migration :99-105). Khi hết hạn giữ chỗ (`expired`), trang chuyển sang EmptyState và selector bị unmount. OK.
- R-72: trang thay toàn bộ `summary` bằng số server trả về (`onSummaryChanged={setSummary}`), client không tự tính. Nhánh voucher bị gỡ đọc `summary.voucher` mới, nên `VoucherInput` hiển thị đúng.

## Findings

### Blocker
Không có.

### Major

**M1. Ảnh combo seed bị vỡ trên trang xác nhận và không có fallback**
- Vị trí: `apps/web/src/components/booking/concession-selector.tsx:133-134`, `apps/web/src/components/common/remote-image.tsx:14-28`, `supabase/migrations/20261123120000_concession_combo.sql:221-224`.
- Seed ghi `image_url = '/images/combos/*.webp'` (đường dẫn tương đối), nhưng repo không có `apps/web/public/` (Glob `apps/web/public/**/*` trả về rỗng).
- Với đường dẫn tương đối, `new URL(src)` ném lỗi, nên `RemoteImage` rơi sang `<img>` thường. `<img>` đó chỉ nhận `className="object-cover"`, thiếu `size-full`, khác các nơi gọi khác như `movie-card.tsx:58` và `home-hero.tsx:48`.
- Kết quả: cả 4 combo seed hiện icon ảnh vỡ kèm alt text tràn trong ô 56px. Icon `Popcorn` fallback chỉ hiện khi `imageUrl === null`, không có `onError`.
- Đây là hình ảnh chính của AC "danh sách combo có hình ảnh" trên màn thanh toán.
- Test không bắt được lỗi này vì fixture dùng `imageUrl: null`.
- Cách sửa: thêm asset hoặc đổi seed sang host được phép, thêm `size-full`, và fallback sang icon khi ảnh lỗi.

**M2. Nút +/- 32×32px vi phạm quy tắc vùng chạm ≥ 44×44 trong design-spec**
- Vị trí: `concession-selector.tsx:157` và `:171` (`className="h-8 w-8 p-0"`).
- `.context/design-spec.md:739` quy định nút/chip/nav ≥ 44×44. Ngoại lệ duy nhất là ghế, và ghế có cơ chế bù (zoom + danh sách bỏ ghế ≥ 44).
- Nút combo là thao tác chính trên mobile (375px) trong luồng trả tiền, và không có gì bù.
- Builder đã tự nêu vấn đề này, nhưng tự nêu không hạ mức lỗi.

**M3. AI-readable gate: có ≥ 3 indicator, nên FAIL theo luật gate**
1. Hàm `ConcessionSelector` dài khoảng 165 dòng (`concession-selector.tsx:20-186`), vượt `max_function_lines: 50`. Phần card và phần nút số lượng nên tách thành component con.
2. Số `20` lặp lại ở `:172` và `:173` (cùng `qty >= 20` và `Math.min(20, …)`), không có hằng số dùng chung. Schema zod `updateOrderCombosSchema` và RPC cũng đang giữ giới hạn này riêng.
3. Comment kiểu WHAT ở `:31` ("Map số lượng hiện tại theo comboId") và `:63` ("Tạo mảng items mới").
4. Comment sai sự thật ở `apps/api/src/modules/checkin/checkin.service.ts:117`: "nhân viên không có RLS trên order_combos". Thực tế `can_view_order` có nhánh `has_cinema_role(... STAFF, MANAGER)` (`booking_tables.sql:562`), nên `.admin()` là thừa quyền. `this.supabase.forUser(user.jwt)` đủ để đọc và đúng nguyên tắc least-privilege. Hiện chưa rò dữ liệu, vì `orderId` lấy từ RPC đã kiểm quyền rạp và chỉ select tên + số lượng. Nhưng comment sẽ dẫn người sau hiểu sai mô hình quyền.
5. Contract `ScanTicketResponse.order.combos` đã đổi nhưng `docs/API_SPEC.md` chưa cập nhật. Grep "combos" trong `docs/` ra 0 kết quả. Việc này có thể để close-out xử lý, nhưng phải có trước khi commit.

### Minor

- **m1. Combo bị ngừng bán khiến selector bị kẹt.**
  - Vị trí: `concession-selector.tsx:32-35`, `:64-67`.
  - `currentQuantities` lấy từ `summary.combos`, còn danh sách nút lấy từ `/combos` (chỉ gồm combo active). Nếu admin tắt một combo trong lúc đơn đang `holding`, combo đó không còn nút "−", nhưng mọi lệnh PUT sau vẫn gửi id của nó. RPC ném `COMBO_NOT_FOUND`, toàn bộ lệnh rollback, và khách không đổi được combo nào nữa.
  - Gợi ý: lọc `items` theo danh sách combo đang active, hoặc hiện combo đã ngừng bán kèm nút bỏ.
- **m2. Lỗi HOLD_EXPIRED từ PUT combo không chuyển trang sang trạng thái hết hạn.**
  - Vị trí: `xac-nhan/page.tsx:136-141` so với `:77`.
  - `pay()` gọi `setExpired(true)` khi gặp HOLD_EXPIRED, còn selector chỉ hiện alert. Trang vẫn trông như thanh toán được cho tới khi countdown về 0.
  - Gợi ý: thêm callback `onExpired`.
- **m3. Race giữa voucher và combo.**
  - `VoucherInput.onChanged={load}` (GET) và PUT combo có thể chạy chồng nhau. Response về sau sẽ ghi đè state, nên GET cũ có thể đè summary mới vừa có combo. UI khi đó lệch DB cho tới lần tải sau. Tiền thật vẫn lấy từ DB nên không mất tiền, nhưng hiển thị không còn minh bạch theo R-72.
  - Selector không bị khoá khi voucher đang `busy`.
- **m4. Voucher bị gỡ âm thầm.** RPC gỡ voucher khi subtotal xuống dưới `min_order_amount` (migration :180-188). UI chỉ mất dòng voucher, không có thông báo nào cho khách.
- **m5. `loadCombos` nuốt lỗi im lặng** (`checkin.service.ts:126`).
  - Lỗi đọc hiển thị y hệt trường hợp "không có combo", nên nhân viên có thể không phát hàng khách đã trả tiền.
  - Không làm hỏng lượt soát là hợp lý, nhưng ít nhất cần log hoặc gắn cờ cảnh báo.
- **m6. Kết quả USED không kèm combo, mâu thuẫn với hướng dẫn trên vé.**
  - Vị trí: `checkin.service.ts:67-71` và câu "Nhận bắp nước tại quầy … bằng mã QR" ở `ticket-card.tsx:63`.
  - Nếu khách đã soát ở cửa rồi mới ra quầy bắp nước quét QR, kết quả là USED và không có danh sách combo. R-100 ghi "Đánh dấu / kiểm tra combo khi soát vé", nhưng hiện chưa có cơ chế đánh dấu đã phát, nên còn rủi ro nhận trùng.
  - Đây là gap về spec: cần ghi gap hoặc làm rõ, không chặn riêng task này.
- **m7. `key={combo.name}` có thể trùng** vì tên combo không unique: `checkin-result.tsx:74` và `ticket-card.tsx:57`.
- **m8. Test yếu.**
  - Test `disabled` (`concession-selector.test.tsx:126-137`) có tên "khoá cả hai nút", nhưng sau `rerender(disabled)` chỉ assert nút "−". Nút "+" vốn đã bị khoá do qty=20, nên vế "khoá cả hai" chưa được kiểm.
  - Chưa có test khoá các card khác khi một lệnh cập nhật đang chạy.
  - Chưa có test ảnh hoặc fallback ảnh.
  - Chưa có test nhánh lỗi của `loadCombos`.
- **m9. `useCallback` vô tác dụng.** Dependency `currentQuantities` là object tạo mới mỗi lần render, nên memo không có tác dụng (`concession-selector.tsx:81`).

### Đạt
- Tiếng Việt có dấu đầy đủ.
- Selector được gói trong `section` có `aria-labelledby`, nút có `aria-label` riêng cho từng combo, và lỗi hiện qua `role="alert"`.
- Layout lưới 1 cột trên mobile, 2 cột từ `sm`.
- Ghi chú nhận bắp nước bị ẩn với đơn `affected`.
- Màn soát vé chỉ hiện tên và số lượng, không có PII hay giá.

## Verdict

**FAIL**, do 3 lỗi Major: M1 ảnh combo vỡ trên màn thanh toán, M2 vùng chạm 32px vi phạm design-spec, M3 AI-readable gate vượt ngưỡng.

Builder cần sửa M1–M3 trong round 2. Nên sửa thêm m1, m2 và m5. m6 chuyển cho change-request hoặc spec-validator để ghi gap về R-100.
