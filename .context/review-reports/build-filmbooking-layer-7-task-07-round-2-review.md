Agent: reviewer

# Review: build-filmbooking layer-7 task-07, round 2

Phạm vi: kiểm lại các lỗi round 1 (MAJOR-1, MAJOR-2, MINOR-1, MINOR-3) và soát regression.
Worktree: `E:/FilmBooking/.worktrees/layer-7__task-07` (chưa commit).

## Review level
**STRICT**

## Reason
Task sửa luồng RBAC: thu hồi gán rạp, đổi vai trò Manager/Staff. Đây là risk đỏ auth/permission.

## Blast radius
- Đã sửa: `users-admin.tsx` (256 dòng), `role-assign-dialog.tsx`, `audit-log-view.tsx`, `__tests__/users-settings-audit.test.tsx`.
- Tách mới: `confirm-action-dialog.tsx`, `manager-staff-panel.tsx`.
- Tất cả vẫn nằm trong `apps/web/src/components/admin`. Không đụng API, shared hay migration.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (exit 0) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS, 25 file, 369 test (+4 so với round 1) |
| `cd apps/web && pnpm exec vitest run` (lần 2) | PASS, 25 file, 369 test. Không thấy flaky |
| `pnpm build` | PASS, có đủ 3 route admin |
| `npx oxlint apps/web/src/components/admin` | 0 finding trong file của task. Warning cũ ở `catalog-admin.test.tsx:311` không thuộc task |
| `ocr` | skip, ocr not installed |

## Kiểm từng lỗi round 1

### MAJOR-1 (thu hồi gán rạp): ĐÃ SỬA
- `users-admin.tsx:120-141`: mỗi assignment (cả STAFF lẫn MANAGER) có nút "Gỡ khỏi rạp". Nút mở `ConfirmActionDialog` với `{kind:"remove", cinemaId, userId}`. `confirm` (`:56-58`) gọi `DELETE /admin/cinemas/${cinemaId}/staff/${userId}` đúng rạp của assignment, rồi toast và `load()`.
- Đối chiếu API/DB:
  - `removeStaff` (`users.controller.ts:273-311`) cho ADMIN xoá mọi role.
  - RLS `staff_assignments_delete` (`core_identity_chain.sql:440-444`) cho `is_admin()` xoá.
  - Contract khớp.
- Khi lỗi: `ConfirmActionDialog` giữ dialog mở, hiện `role=alert` và không toast. Có test 403 (`users-settings-audit.test.tsx:275-288`).
- Có test happy path gỡ cả Manager (`:260-273`), assert đúng URL DELETE.
- Manager vẫn chỉ thấy nút Gỡ ở dòng STAFF (`manager-staff-panel.tsx:93`), khớp API 403 và RLS.
- Còn thiếu multi-select rạp như design-spec (gap UI, xem MINOR-A). Tuy vậy, lỗi gốc là không có đường thu hồi quyền, và lỗi đó đã được khắc phục.

### MAJOR-2 (dialog chọn sẵn STAFF, hạ quyền ngầm): ĐÃ SỬA, đúng root cause
- `role-assign-dialog.tsx:66-79`: `existing` và `existingRole` tính theo `cinemaId` đang chọn. Effect `[open, cinemaId, existingRole]` set `role = existingRole ?? "STAFF"`.
  - Mở dialog thì vai trò lấy theo assignment của rạp đầu tiên.
  - Đổi rạp thì đồng bộ lại vai trò theo rạp mới, hoặc STAFF nếu rạp chưa gán.
  - Người dùng tự đổi select vai trò không làm effect chạy lại (dependency không đổi), nên lựa chọn không bị ghi đè.
- `:81, :165`: Lưu bị disable khi `role === existingRole`, nên không PATCH khi không có thay đổi.
- PATCH hay POST (`:98-104`) quyết định theo `existing` của rạp đích đang chọn. Rạp đã gán thì PATCH (endpoint Admin-only, khớp `viewerRole="ADMIN"`). Rạp chưa gán thì POST `{userId, role}`. Đúng contract `assignStaffSchema` và `updateAssignmentSchema`.
- Test mới (`:175-195`):
  - user là MANAGER: select hiện MANAGER, Lưu bị disable, click không gọi API;
  - đổi sang HN02: vai trò về STAFF và Lưu enable.
  - Test bao đúng kịch bản round 1 đã nêu. Không còn false-confidence.

### MINOR-1 (lọc audit theo người): ĐÃ SỬA (phần web)
- `audit-log-view.tsx:250-260`: actor là `<button>` có `title` chứa UUID đầy đủ và `aria-label`. Bấm vào thì `filterByActor` điền `draft` + `applied` và về trang 1. Có test (`:450`).
- Phần "vai trò + tên" vẫn phụ thuộc API, giữ nguyên là gap.

### MINOR-3 (kích thước): ĐÃ SỬA MỘT PHẦN
- `users-admin.tsx` còn 256 dòng, đã tách `ConfirmActionDialog` và `ManagerStaffPanel`.

## Findings mới / còn lại (không chặn)
- **MINOR-A:** Dialog gán vẫn chỉ chọn một rạp, không có multi-select như design-spec màn 26. Chức năng thu hồi đã có qua nút "Gỡ khỏi rạp", nên ghi là gap UI.
- **MINOR-B:** `audit-log-view.tsx` lên khoảng 343 dòng, vượt mức 300. `AdminUsersPanel` và `AuditLogList` vẫn dài hơn 50 dòng (JSX). Tính 2 indicator AI-readable, dưới ngưỡng FAIL (≥3), cùng precedent MINOR các layer trước. Có thể tách `AuditDiffSheet` + `diffAuditData` ra file riêng khi tiện.
- **MINOR-C (cosmetic):** `users-admin.tsx:119-120` vẫn render `<ul>` rỗng cạnh "—" khi user không có assignment. Không ảnh hưởng chức năng.
- **MINOR-D:** `filterByActor` chỉ áp actorId lên `applied` cũ. Nếu người dùng đã sửa field khác trong form mà chưa bấm Lọc, các field đó hiện trong form nhưng không được áp dụng. Lệch nhỏ, chấp nhận được.
- **Giữ nguyên từ round 1:**
  - MINOR-2: lệch design-spec màn Cấu hình.
  - MINOR-4: API không chặn tự khoá/tự gỡ Admin và không có guard Admin cuối cùng. Đề xuất **task API backlog riêng**: (a) 409/422 khi tự khoá hoặc tự gỡ Admin; (b) guard last-admin ở DB để chống race; (c) test e2e. Không chặn task web này.

## Regression
- Các test round 1 đều vẫn PASS: AC-1 (Manager chỉ thấy Staff), AC-2 (diff before/after), settings (GET lỗi không ghi, chỉ PATCH key đổi, validate), lock/admin có confirm, không tự khoá, ErrorState.
- Bộ test web đầy đủ chạy 2 lần đều xanh.

## Verdict
**STRICT PASS**

MAJOR-1 và MAJOR-2 đã sửa đúng root cause, có test bao đúng kịch bản lỗi, và contract khớp API + RLS thật. Các MINOR còn lại không chặn. MINOR-4 chuyển thành task API backlog.
