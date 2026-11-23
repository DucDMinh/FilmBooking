# Review: bug booking-error-messages, phase-1 task-01, round 2 (xác nhận hẹp)

Agent: reviewer

- Review level: **STRICT** (giữ mức của round 1: catalog mã lỗi dùng chung + đổi HTTP status API). Round này chỉ xác nhận các mục FAIL của round 1.
- Reason: round 1 FAIL vì MAJOR-1 (Repro Verification chưa PASS) và MAJOR-2 (thiếu test toast `DOB_REQUIRED` ở bước chọn ghế).
- Blast radius của diff `51a2179..HEAD` (commit `c6ce5e8`): chỉ 2 file, là `apps/web/src/components/booking/__tests__/seat-map.test.tsx` (+23 dòng test) và `tasks/bug-booking-error-messages/phase-1-task-01.md` (Evidence/Status). Không đổi source.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `git -C "E:/FilmBooking" diff 51a2179..HEAD` | Chạy được, đã đọc toàn bộ diff. |
| `cd "E:/FilmBooking" && git diff ...` | Bị hook agent-guard chặn (reviewer chỉ được `cd` vào `.worktrees/`). Không thử biến thể khác. |
| `cd apps/web && pnpm exec vitest run .../seat-map.test.tsx`, typecheck, lint | **Reviewer CHƯA tự chạy**, vì hook chặn `cd` vào repo gốc. Dispatcher báo 27/27 PASS, web typecheck và lint sạch sau `c6ce5e8`. |
| aislop / oxlint / ocr | skip (cùng lý do; diff round 2 chỉ là test + markdown) |

## Xác nhận từng finding round 1

### MAJOR-1: Repro Verification. ĐÃ ĐÓNG
- Dòng "Actual after" không còn "CHƯA chạy được". Nay ghi verify ở repo gốc: shared 39, api 692, web 697 PASS, typecheck và lint sạch.
- Evidence có mục VERIFY ở repo gốc sau merge `8ff2d52`. Mục này mô tả fix-forward `51a2179`: e2e `A/MAJOR-2` đổi kỳ vọng sang 409 `CONSENT_VERSION_INVALID`, và `voucher-input.tsx` thêm `onKeyDown` Enter khi ô trống (red-then-green có lý do kỹ thuật rõ: nút disabled nên submit ngầm không chạy).
- Số liệu nhất quán: web 696 trước khi thêm test, 697 sau khi thêm 1 test. Con số này khớp diff (+1 `it`).
- `Status: PASS`.
- Giới hạn: số liệu do dispatcher chạy, reviewer không tự chạy lại được vì hook. Bằng chứng ghi đủ lệnh, phạm vi và commit nên chấp nhận được.

### MAJOR-2: test toast `DOB_REQUIRED` ở SeatPicker. ĐÃ ĐÓNG
Test `seat-map.test.tsx:420-441` nằm trong `describe("SeatPicker — giữ ghế")`, tức đúng đường thật: `POST /bookings/holds` reject → `handleHoldError` (`seat-picker.tsx:143-146`).
- `apiFetch` reject `new ApiError("DOB_REQUIRED", message, 422)`. Đây là mock `ApiError` của file test, cùng class được import trong component (`vi.mock("@/lib/api/client")`), nên `instanceof` khớp.
- Có assert thật: `toast.error` gọi đúng 1 lần (có `vi.clearAllMocks()` trong afterEach, dòng 136), message khớp và `not.toMatch(/chưa hợp lệ/i)`, `action.label === "Cập nhật hồ sơ"`, `mockPush` chưa được gọi trước khi bấm, `onClick()` rồi `mockPush("/tai-khoan")`.
- Nếu xoá nhánh `DOB_REQUIRED` trong component thì toast rơi vào nhánh chung, không có `options`, nên test đỏ. Test không phải false-confidence.

### MINOR-3..7: đồng ý cách xử lý
- MINOR-3 (cancellation): đã ghi GIỮ kèm dòng cụ thể và lý do `@Roles` MANAGER/ADMIN/STAFF. Đồng ý.
- MINOR-4 (`resolveRedirectUrl`): đã ghi là rủi ro tồn dư chỉ xảy ra khi cấu hình `WEB_ORIGIN` lệch. Đồng ý.
- MINOR-5/6/7 (`SEAT_REQUIRED` bị zod chặn trước, `VOUCHER_NOT_APPLICABLE_CINEMA` không có đường phát, 500 bắn Sentry): đã ghi tồn dư. Đồng ý, không cần sửa thêm.
- MINOR-8 (`CONSENT_VERSION_INVALID` 409): không đổi, vẫn chấp nhận.

## Findings mới

### CRITICAL / MAJOR
Không có.

### MINOR / NIT
1. (NIT) Test MAJOR-2 tự cấp message cho `ApiError`, nên assert `not.toMatch(/chưa hợp lệ/)` chỉ kiểm component chuyển nguyên message. Ánh xạ mã → thông báo thật đã được `error-messages.test.ts:6-8` phủ (`messageForErrorCode("DOB_REQUIRED")` chứa "ngày sinh"/"hồ sơ"), và chuỗi trong test trùng y `error-messages.ts:35`. Không chặn.
2. (NIT) Dòng Evidence "web 696/696" (sau merge) và "697/697 sau khi thêm" đứng cùng một gạch đầu dòng nên hơi khó đọc, nhưng không mâu thuẫn.

## Không hồi quy
Diff `51a2179..HEAD` chỉ chạm 2 file trên. Không đụng source, migration, `SPECIFICATIONS.md` hay docs ngoài scope. Các file dirty khác trong `git status` (`design-spec.md`, `SPECIFICATIONS.md`, report/journal của `nav-skeleton-first-row`) không thuộc commit `c6ce5e8` và không thuộc task này.

## Verdict: **STRICT PASS**

Cả 2 MAJOR của round 1 đã đóng có bằng chứng, các MINOR đã ghi nhận đúng. Lưu ý tồn dư: reviewer không tự chạy lại test/typecheck/lint ở repo gốc vì hook agent-guard chặn. Kết quả 27/27 (file test) và 697 (web) là số liệu dispatcher báo, đã đối chiếu và khớp với diff.
