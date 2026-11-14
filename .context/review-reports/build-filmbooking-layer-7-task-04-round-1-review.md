# Review — build-filmbooking layer-7 task-04 (Web admin bảng giá, ngày lễ, voucher) — round 1

Agent: reviewer

- **Worktree:** `E:/FilmBooking/.worktrees/layer-7__task-04` (branch `wt/layer-7__task-04`, chưa commit)
- **Files reviewed (untracked, all new):**
  - `apps/web/src/components/admin/price-matrix.tsx` (465 dòng)
  - `apps/web/src/components/admin/voucher-form.tsx` (437 dòng)
  - `apps/web/src/app/admin/gia/page.tsx`, `ngay-le/page.tsx`, `voucher/page.tsx`
  - `apps/web/src/components/admin/__tests__/pricing-voucher.test.tsx` (13 test)
- **Cross-boundary sources:** `apps/api/src/modules/pricing/pricing.{controller,service}.ts`, `apps/api/src/modules/admin/vouchers.controller.ts`, `apps/api/src/common/auth/{roles.guard,access.service}.ts`, `packages/shared/src/schemas/{pricing,admin}.ts`, `supabase/migrations/20261111030000_pricing.sql`, `supabase/migrations/20261111030100_booking_tables.sql` (RLS vouchers), `.context/design-spec.md` §3 / §35 / §25, `SPECIFICATIONS.md` R-52/R-53/R-72/R-90/AC-15.

## Review level
**STRICT**

## Reason
Task đụng RBAC (Admin vs Manager vs Staff, quyền theo từng rạp), bảng giá (dữ liệu tiền), và gọi API mutate dùng chung (price-rules, holidays, vouchers).

## Blast radius
Chỉ có màn admin `/admin/gia`, `/admin/ngay-le`, `/admin/voucher` (file mới, không sửa file dùng chung). Ghi sai giá ảnh hưởng mọi đơn giữ ghế sau thời điểm lưu (R-72). API vẫn tự kiểm quyền. Rủi ro chính là UX/quyền hiển thị và test không ổn định.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | **FAIL**: 1 failed / 282 passed (283). Hỏng: `pricing-voucher.test.tsx` › "Manager ở rạp mình không thấy ô sửa giá chuỗi: chỉ sửa ghi đè rạp". Chạy riêng file thì 13/13 PASS, nghĩa là test **flaky** khi chạy full suite. |
| `cd apps/web && pnpm build` | PASS (có route `/admin/gia`, `/admin/ngay-le`, `/admin/voucher`) |
| oxlint | skip, oxlint not configured (chỉ có template trong node_modules) |
| aislop | skip, `aislop` not installed (exit 127) |
| ocr | skip, ocr not installed |
| AI-friendly web gate | N/A (màn admin nội bộ, `robots: noindex`) |

## Cross-boundary checks (verified)
- **Admin qua được `@Roles("MANAGER")`: OK.** `roles.guard.ts:27`: `if (access.isAdmin) return true`. `pricing.service.ts:153,162,287` cũng short-circuit theo `isAdmin`. `access.service.ts:17-19`: `satisfies(MANAGER, STAFF)`, nên Manager qua được `GET /price-rules` (`@Roles("STAFF")`).
- **Enum/khung giờ: OK.** `SEAT_TYPES` NORMAL/VIP/SWEETBOX, `FORMATS` 2D/3D, `DAY_TYPES` NORMAL/WEEKEND/HOLIDAY, `TIME_BANDS` BEFORE_17/AFTER_17 khớp `packages/shared/src/schemas/pricing.ts:8-21` và migration pricing. API tính mốc 17h theo giờ VN (`pricing.service.ts:430`).
- **Body create/update/delete: OK.** POST gửi `{scope, cinemaId (null nếu CHAIN), seatType, format, dayType, timeBand, amount}`, khớp superRefine của `createPriceRuleSchema` cho CHAIN/CINEMA. PATCH gửi `{amount}`, khớp `updatePriceRuleSchema`. DELETE gửi `/price-rules/:id`. Holiday POST gửi `{holidayDate, name}`, DELETE gửi `/holidays/:date`, khớp controller.
- **Thứ tự ưu tiên hiển thị: OK** ở 2 cấp CINEMA › CHAIN (`price-matrix.tsx:304-306`), khớp `getShowtimePrices` (không có cấp SHOWTIME, xem gap).
- **Giá nguyên không âm: OK.** `parseVndAmount` dùng `/^\d+$/`. DB: `amount integer not null check (amount >= 0)`.
- **Voucher RLS: OK.** `vouchers_select` cho Admin hoặc người có `staff_assignments.role='MANAGER'` (`booking_tables.sql:639-644`), nên Manager xem được list qua `forUser(jwt)`. Insert/update/delete chỉ Admin.
- **Map lỗi voucher:** `CONFLICT` hiện ở trường `code` (API trả 23505 → CONFLICT), các lỗi còn lại hiện thành thông điệp chung của form.

## Findings

### MAJOR-1: Verify gate đỏ, test flaky và che một lỗi thật: input bị reset
- `cd apps/web && pnpm test` exit 1. Lần gọi POST thứ 4 trong test gửi `amount: 120000100000`. Input đã bị clear, sau đó bị đặt lại "120000", rồi "100000" mới được nối vào.
- Cơ chế reset nằm trong code thật:
  - `price-matrix.tsx:91-94`: `useEffect(() => { setText(initial) }, [initial])` chạy passive sau mount. Khi effect bị flush muộn (máy tải nặng, hoặc render từ promise ngoài act), nó ghi đè nội dung người dùng đã gõ.
  - `price-matrix.tsx:199-201, 228, 256`: mọi lần `mutate` gọi `load()`, `load()` đặt `status="loading"` và **unmount cả bảng**. Lưu một ô sẽ **xoá hết chỉnh sửa chưa lưu ở các ô khác**. Đây là lỗi người dùng nhìn thấy được.
- Test `pricing-voucher.test.tsx:143-161` thao tác khi load chưa ổn định: không chờ fetch `/cinemas` hay heading "Giá tại HN01". Pass hay fail tuỳ thời điểm, nên đây là **false-confidence test**.
- **Sửa:** khởi tạo state từ `amount` bằng `key` (ví dụ `key={`${k}:${amount}`}`) thay cho effect sync, hoặc chỉ sync khi không dirty. Refresh sau khi lưu phải giữ bảng mounted (cập nhật map tại chỗ, hoặc thêm cờ `refreshing` thay vì `status="loading"`). Test phải chờ trạng thái ổn định trước khi `clear/type`. Chạy full suite ≥2 lần cho xanh.

### MAJOR-2: Ô giá sửa được hiện cho người không có quyền (lệch "ẩn + API 403")
- `price-matrix.tsx:221`: `editingOverride = cinemaId !== null` không xét vai trò của user **tại rạp đó**. API (`pricing.service.ts:296-303`) đòi `cinemaRoles.get(cinemaId) === "MANAGER"`.
- `gia/page.tsx:17` chỉ truyền `cinemaId`, làm mất role theo từng rạp. `resolveAdminRole` gộp role lại thành role cao nhất.
- Trường hợp hỏng:
  - **(a) STAFF mở `/admin/gia` bằng URL.** Nav ẩn link nhưng page vẫn render. `resolveScope` chọn rạp gán đầu tiên, nên toàn bộ ô thành input có nút Lưu/Xoá, bấm vào thì nhận 403. Design-spec §3 dòng 113 ghi Staff thấy "—" ở mục Giá.
  - **(b) User MANAGER ở HN01 nhưng STAFF ở HN02.** Ở scope HN02 vẫn sửa được trên UI, lưu thì nhận 403 `FORBIDDEN_CINEMA`.
- Test `:136-141` né đúng ca này (STAFF với `assignedCinemaIds=[]`).
- **Sửa:** truyền `me.cinemas` (cinemaId + role) vào component, đặt `editingOverride = isAdmin || roleAt(cinemaId) === "MANAGER"`. Thêm test cho STAFF có rạp gán và cho Manager role hỗn hợp.

### MINOR
1. **Không có ConfirmDialog khi đổi giá.** Design §35 States ghi: "đổi giá → ConfirmDialog 'Giá mới áp dụng cho đơn giữ ghế sau thời điểm lưu…'" (R-72). Hiện chỉ có toast sau khi lưu (`price-matrix.tsx:246`).
2. **Race khi Admin mở `?cinema=<id>`.** Lần render đầu `allCinemas=[]`, nên `resolveScope` trả ALL và `load()` chạy chain-only. Sau khi `/cinemas` về thì chạy load lần hai. Hai load không có cancel. Nếu load đầu về sau, nó `setOverrides(new Map())` (`:207-208`), ô ghi đè hiện là "Kế thừa", và lưu sẽ POST trùng → 409. Xác suất thấp. Nên dùng cờ hủy / request id.
3. **Không giới hạn trên của `amount`.** `parseVndAmount` nhận tới 2^53, trong khi cột `integer` (int4) tràn ở > 2 147 483 647 → lỗi 22003 → API 500. Nên chặn ở client (và API).
4. **Thông điệp lỗi voucher là tiếng Anh từ zod** ("Percent must be <= 100", "Code must be 3-32 chars…", NaN). UI tiếng Việt; test còn assert chuỗi tiếng Anh (`:251`). `details.field` từ API VALIDATION_ERROR (vd `movieId`, `validTo`) chưa map vào trường.
5. **Sửa voucher `appliesTo=COMBO`:** select chỉ có ORDER/TICKET (`voucher-form.tsx:259-262`), nên hiển thị option không khớp state. Ít gặp ở MVP.
6. **`validFrom/validTo` theo múi giờ trình duyệt.** `datetime-local` + `new Date(s).toISOString()` (`voucher-form.tsx:69-100`) và `toLocaleDateString` hiển thị cũng theo máy. Trình duyệt Asia/Ho_Chi_Minh thì đúng. Admin ở múi giờ khác sẽ lệch giờ. Mức MINOR cho dự án demo, nên ghi chú hoặc ép +07:00. Ngoài ra `toLocalInput` cắt giây, nên sửa voucher khác sẽ làm thay đổi `validTo` có giây.
7. **`voucherStatus` không có trạng thái "chưa bắt đầu".** `validFrom` ở tương lai vẫn hiện "Đang chạy" (`:125-129`).
8. **Ngày lễ:** design ghi Dialog thêm + menu "•••". Hiện là form inline, xoá không confirm. Chấp nhận được, ghi nhận.

### Gaps (builder tự nêu, xác nhận, không chặn)
- Chưa có ghi đè theo suất (SHOWTIME). R-52 có yêu cầu nhưng mô tả task chỉ nói scope chuỗi/rạp.
- Không có cột "Đã dùng / tổng lượt" vì `VoucherDto` không có số lượt dùng (gap API).
- Form voucher chưa có chọn phim/khung giờ (R-90 "tuỳ chọn"). `movieId` không gửi nên được giữ nguyên khi sửa (đúng hành vi PATCH partial).
- Nav không có mục `/admin/ngay-le`. Có link từ `/admin/gia`, và nav-config nằm ngoài allowlist file.

### AI-readable gate
Indicators:
- (1) 2 file > 300 dòng (465, 437).
- (2) Hàm > 50 dòng: `PriceMatrix` ~160, `VoucherForm` ~180, `HolidayManager` ~125, `VoucherManager` ~105.

Không có tên mơ hồ / magic number / indirection đáng kể. Tổng 2 indicator, dưới ngưỡng 3 nên chưa FAIL vì gate này. Task allowlist giới hạn số file nên khó tách. Khi sửa MAJOR-1/2 nên tách `PriceCell`/`HolidayManager` thành hàm con nhỏ hơn trong cùng file.

### Surgical diff
OK: chỉ đúng 5 file trong allowlist + 1 test, không có drive-by refactor.

### Security
Không có XSS (React escape), không có secret. Query `cinemaId` lấy từ danh sách id hợp lệ. Quyền thật do API/RLS kiểm, nên MAJOR-2 không phải lỗ hổng bảo mật mà là lệch hiển thị quyền.

## Verdict
**FAIL**

Lý do: MAJOR-1 (verify `pnpm test` đỏ, test flaky che lỗi input bị reset và mất chỉnh sửa khi lưu) và MAJOR-2 (UI cho STAFF và Manager role hỗn hợp sửa giá ở rạp không có quyền MANAGER). Builder cần sửa 2 MAJOR, cân nhắc MINOR 1-4, rồi chạy lại full `cd apps/web && pnpm test` ít nhất 2 lần cho xanh.
