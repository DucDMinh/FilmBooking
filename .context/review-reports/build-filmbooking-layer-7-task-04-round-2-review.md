# Review: build-filmbooking layer-7 task-04 (Web admin bảng giá, ngày lễ, voucher), round 2

Agent: reviewer

- **Worktree:** `E:/FilmBooking/.worktrees/layer-7__task-04` (branch `wt/layer-7__task-04`, chưa commit, 6 file untracked)
- **Files:** `apps/web/src/components/admin/price-matrix.tsx` (499), `voucher-form.tsx` (461), `app/admin/{gia,ngay-le,voucher}/page.tsx`, `components/admin/__tests__/pricing-voucher.test.tsx` (19 test)
- **Round 1:** `.context/review-reports/build-filmbooking-layer-7-task-04-round-1-review.md` (FAIL: M1, M2)

## Review level
**STRICT**

## Reason
Task đụng RBAC theo vai trò của từng rạp (Admin / Manager / Staff), dữ liệu giá tiền (R-72) và các API mutate price-rules, holidays, vouchers.

## Blast radius
Chỉ có 3 màn admin mới. Không sửa file dùng chung (`use-admin-scope.ts`, `nav-config` chỉ được import). API/RLS vẫn là lớp kiểm quyền thật.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` (lần 1) | PASS: 19 files, 288/288 (64.8s) |
| `cd apps/web && pnpm exec vitest run` (lần 2, full suite) | PASS: 19 files, 288/288 (30.9s) |
| `pnpm build` | PASS (có route `/admin/gia`, `/admin/ngay-le`, `/admin/voucher`) |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, not installed |
| AI-friendly web gate | N/A (admin nội bộ) |

Hai lần chạy full suite ở hai mức tải khác nhau (65s và 31s) đều xanh. Test từng flaky ở round 1 nay pass ổn định.

## Xác nhận fix round 1

### M1 (input bị reset, bảng unmount khi lưu): FIXED đúng root cause
- Đã bỏ `useEffect(() => setText(initial))`. `PriceCell` khởi tạo state một lần, và cha đặt `key={`${source}:${amount}`}` (`price-matrix.tsx:333`). Ô chỉ khởi tạo lại khi giá trị server đổi, nên không còn effect muộn ghi đè chữ đang gõ.
- `load(background=true)` sau khi mutate không đặt `status="loading"` (`:211-229, :245`), nên bảng giữ nguyên mounted. Các ô khác đang sửa dở có key không đổi, nên chữ đang nhập được giữ.
- Thêm `latestLoad` (request id) để bỏ response của lần load cũ (`:209, :220`). Cách này cũng đóng MINOR-2 round 1 (race `?cinema=`).
- Test mới `:193-210` chứng minh đúng hành vi: lưu ô VIP xong, ô Thường vẫn giữ "90000" sau lần reload thứ 2. Test `:144-163` giờ chờ heading "Giá tại HN01" trước khi gõ. `scopeCinemas` của Manager lấy từ `memberships`, nên `cinemaId` ổn định ngay từ render đầu và không có reload chen giữa.

### M2 (quyền sửa ghi đè không xét vai trò theo rạp): FIXED
- `gia/page.tsx:20` truyền `me.cinemas` (shape `{cinemaId, role: STAFF|MANAGER}` khớp `packages/shared/src/schemas/me.ts:5,13`).
- `price-matrix.tsx:237-238`: `editingOverride = cinemaId !== null && (isAdmin || memberships.some(m => m.cinemaId === cinemaId && m.role === "MANAGER"))`. Điều kiện này khớp `pricing.service.ts` (`cinemaRoles.get(cinemaId) === "MANAGER"`, Admin short-circuit; roles.guard.ts:27 cho Admin qua `@Roles("MANAGER")`).
- Non-admin chỉ thấy rạp được gán (`:200`), còn `resolveScope` bỏ qua `?cinema=` lạ.
- Test mới: STAFF có rạp gán chỉ đọc (`:165-172`); MANAGER HN01 + STAFF HN02 thì HN01 sửa được, HN02 chỉ đọc (`:174-191`).

### MINOR round 1 đã xử lý thêm
- #3: chặn `amount` vượt int4 (`MAX_PRICE_VND`, `:49-58`), có test "2147483648".
- #4: thông điệp lỗi voucher đã tiếng Việt, `details.field` của API được map vào trường (`voucher-form.tsx:125-137, :202-205`).
- #5: thêm option COMBO khi voucher đang là COMBO (`:285`).
- #7: thêm trạng thái "Sắp chạy" (`:142`), có test.
- #8: xoá ngày lễ qua AlertDialog, có test xác nhận.

## Findings (round 2)

Không có CRITICAL/MAJOR.

### MINOR (không chặn)
1. **Vẫn chưa có ConfirmDialog khi đổi giá** (design §35, R-72). Hiện chỉ có toast nêu "áp dụng cho đơn giữ ghế sau thời điểm lưu" (`price-matrix.tsx:263`). Giữ như round 1.
2. **Background reload lỗi bị nuốt** (`:225`). Nếu lưu thành công nhưng reload fail, ô vẫn hiện chữ mới kèm nút "Lưu" (key không đổi), còn map `overrides` thì cũ. Bấm Lưu lần nữa trên ô vừa tạo ghi đè sẽ POST trùng → 409 kèm toast lỗi. Không mất dữ liệu, xác suất thấp.
3. **Admin mở `?cinema=<id>`:** trước khi `/cinemas` về, lần render đầu là scope chuỗi và có thể sửa được trong khoảnh khắc ngắn, sau đó chuyển sang loading/rạp. Lần load cũ đã được request id chặn, nên đây chỉ là chớp UI.
4. `validFrom/validTo` vẫn theo múi giờ trình duyệt (MINOR-6 round 1, chấp nhận cho demo).

### Gaps (giữ từ round 1, không chặn)
Chưa có ghi đè SHOWTIME, chưa có cột "đã dùng", chưa có chọn phim/khung giờ cho voucher, nav thiếu `/admin/ngay-le` (nav-config nằm ngoài allowlist).

### AI-readable gate
- 2 file > 300 dòng (499, 461).
- Hàm > 50 dòng: `PriceMatrix` ~170, `VoucherForm` ~190, `HolidayManager` ~140, `VoucherManager` ~105.

Không có tên mơ hồ / magic number (`MAX_PRICE_VND`, `PAGE_SIZE` có tên) / indirection. Comment giải thích WHY. Tổng 2 indicator, dưới ngưỡng 3. Ghi nhận là nợ kỹ thuật vì allowlist file hạn chế việc tách.

### Surgical diff
OK: đúng 5 file allowlist + 1 test.

### Security
Không XSS, không secret. UI chỉ là lớp ẩn; API (roles.guard + pricing.service + RLS vouchers) vẫn kiểm quyền thật. Hiển thị quyền nay khớp với API.

## Verdict
**STRICT PASS**

M1 và M2 đã sửa đúng root cause, có test hồi quy cho từng ca. Full suite xanh 2/2 lần, typecheck/lint/build PASS. Các MINOR còn lại không chặn.
