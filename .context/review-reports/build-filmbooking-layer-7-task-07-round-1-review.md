Agent: reviewer

# Review: build-filmbooking layer-7 task-07, round 1

Phạm vi: Web admin người dùng và phân quyền (màn 26), cấu hình chuỗi (màn 28 + B23), audit log (màn 28). POS đã bỏ.
Worktree: `E:/FilmBooking/.worktrees/layer-7__task-07` (branch `wt/layer-7__task-07`, chưa commit).

## Review level
**STRICT**

## Reason
Task đụng auth/RBAC: gán vai trò theo rạp, cấp/gỡ Admin, khoá tài khoản. Nó cũng sửa cấu hình toàn chuỗi (giữ ghế, chính sách) và đọc audit log. Đây đều là risk đỏ.

## Blast radius
- File mới (untracked): 3 page (`admin/nguoi-dung`, `admin/cau-hinh`, `admin/audit-log`), `role-assign-dialog.tsx`.
- Builder thêm ngoài danh sách Files: `users-admin.tsx`, `settings-form.tsx`, `audit-log-view.tsx`, `__tests__/users-settings-audit.test.tsx`. Cả 4 đều là file mới, không đụng shared/API, và dispatcher đã nêu trong brief. Ghi nhận, không chặn.
- Không sửa API, `packages/shared` hay migration. Endpoint được gọi: `GET /me`, `GET /admin/cinemas`, `GET /admin/users`, `PATCH /admin/users/:id/lock`, `PATCH /admin/users/:id/admin-role`, `GET|POST /admin/cinemas/:id/staff`, `PATCH|DELETE /admin/cinemas/:id/staff/:userId`, `GET /admin/settings`, `PATCH /admin/settings/:key`, `GET /admin/audit-logs`.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (exit 0) |
| `pnpm lint` | PASS (shared, api, web) |
| `cd apps/web && pnpm test` | PASS, 25 file, 365 test |
| `cd apps/web && pnpm exec vitest run` (lần 2, kiểm flaky) | PASS, 25 file, 365 test |
| `pnpm build` | PASS. Có route `/admin/nguoi-dung`, `/admin/cau-hinh`, `/admin/audit-log` |
| `npx oxlint apps/web/src/components/admin` | 0 finding trong file mới. Có 1 warning cũ ở `catalog-admin.test.tsx:311`, không thuộc task |
| `npx aislop scan --changes --json` | score 100 (Healthy). Lưu ý: file untracked có thể không được tính vào `--changes` |
| `ocr` | skip, ocr not installed |
| AI-friendly web gate | N/A (màn admin nội bộ) |

## Cross-boundary check (web ↔ API ↔ DB)
- Mock khớp contract thật. Đường dẫn và method đúng controller (`users.controller.ts`, `settings.controller.ts`, `audit.controller.ts`, `cinemas.controller.ts:49-50`). Body `{locked}`, `{isAdmin}`, `{role}`, `{value}`, `{email|userId, role}` khớp schema `packages/shared/src/schemas/admin.ts`.
- Seed `app_settings` (`20261111010000_core_identity_chain.sql:343-348`) lưu jsonb số cho 3 key phút và jsonb string cho 2 key text. Trong test cũng là number/string, khớp DB thật. `toTypedValue` gửi số cho key số, nên không bị 400 do sai kiểu.
- Query audit được build bằng chính `listAuditLogsQuerySchema` (uuid, regex tableName, ISO có offset), nên không gửi query sai.
- Quyền: `GET /admin/users`, lock, admin-role và audit-logs đều là `@Roles("ADMIN")`. UI chỉ gọi các endpoint này khi role là ADMIN (có test xác nhận Manager không gọi `/admin/users`). Manager chỉ thao tác rạp có `role = MANAGER` trong `me.cinemas`. Tầng bảo vệ thật là `@CinemaScope` + RLS.

## Kiểm AC
- **AC-1 (Manager không thấy Manager/Admin trong dialog gán): PASS.** `assignableRoles("MANAGER")` trả `["STAFF"]`. Dialog không có lựa chọn Admin, và test kiểm option list.
- **AC-2 (Audit before/after dạng diff): PASS.** `diffAuditData` chỉ liệt kê field khác nhau, xử lý được INSERT/DELETE. Sheet hiện 2 cột Trước/Sau.
- Settings: GET lỗi thì hiện ErrorState, không render form, nên không thể ghi null đè lên. Chỉ PATCH key đã đổi. Validate client theo `APP_SETTING_VALUE_SCHEMAS`. PATCH lỗi thì hiện lỗi theo field và toast.error, không báo thành công. PASS.
- Lock/Admin/Gỡ Staff đều qua ConfirmActionDialog. Dialog chỉ đóng và toast success khi API thành công. Lỗi hiện `role=alert`. PASS.

## Findings

### MAJOR-1: Không thu hồi được gán rạp. Gán MANAGER không gỡ được ở bất kỳ màn nào (R-105, R-39, design-spec màn 26)
- `users-admin.tsx:118-276` (`AdminUsersPanel`): Admin chỉ có "Gán vai trò", "Khoá", "Cấp/Gỡ Admin". Không có hành động "Gỡ khỏi rạp", dù API `DELETE /admin/cinemas/:id/staff/:userId` cho phép ADMIN (`users.controller.ts:273-311`).
- `users-admin.tsx:354` (`ManagerStaffPanel`): nút Gỡ chỉ hiện ở dòng STAFF (đúng, vì API cấm Manager gỡ Manager). Nhưng Admin không bao giờ vào được panel này (`users-admin.tsx:426`).
- `role-assign-dialog.tsx`: mỗi lần chỉ chọn một rạp, không có multi-select để bỏ chọn rạp như design-spec mô tả ("multi-select rạp").
- Hệ quả: một khi đã gán Manager tại rạp X thì không ai gỡ được qua UI. Admin cũng không gỡ được Staff ở rạp không có Manager. Cách duy nhất là khoá cả tài khoản. Thu hồi quyền là một nửa của RBAC. R-105 giao Admin "gán rạp", và Manager còn có quyền "thêm/bớt", nên Admin đang có ít quyền hơn Manager.
- Đề xuất: thêm hành động "Gỡ khỏi rạp" cho từng assignment trong `AdminUsersPanel`, gọi DELETE, có ConfirmDialog, chỉ toast khi API thành công. Thêm test happy + lỗi 4xx.

### MAJOR-2: Dialog "Đổi vai trò" luôn chọn sẵn STAFF, nên bấm Lưu sẽ hạ quyền Manager ngầm
- `role-assign-dialog.tsx:62` và `:70`: `role` khởi tạo và reset về `"STAFF"` mỗi lần mở dialog, không lấy theo `existing?.role`. Khi đổi rạp trong select (`:126`), role cũng không đồng bộ lại.
- Repro (đọc code): Admin bấm "Gán vai trò" cho user đang là MANAGER ở rạp đầu danh sách. Dialog hiện tiêu đề "Đổi vai trò" và select hiện "Nhân viên (Staff)". Bấm Lưu mà không đổi gì sẽ gửi `PATCH /admin/cinemas/:id/staff/:userId {role:"STAFF"}`. Manager bị hạ xuống Staff và mất quyền quản lý rạp, trong khi UI báo "Đã đổi vai trò".
- False-confidence test: test "Admin đổi vai trò người đã có gán ở rạp: PATCH" (`users-settings-audit.test.tsx:156-173`) chỉ thử STAFF→MANAGER nên không bắt được lỗi này.
- Đề xuất: khi mở dialog hoặc đổi `cinemaId`, set `role = existing?.role ?? "STAFF"`. Nếu role không đổi thì disable Lưu hoặc không gọi API. Thêm test: user MANAGER, mở dialog, select phải hiện Manager, bấm Lưu thì không PATCH sang STAFF.

### MINOR-1: Lọc audit "theo người" gần như không dùng được; cột người thực hiện chỉ có id rút gọn
- `audit-log-view.tsx:242` chỉ hiện 8 ký tự đầu của `actorId`. Filter (`:200`) lại bắt UUID đầy đủ, và Admin không có cách lấy UUID đó từ UI.
- Design-spec màn 28 yêu cầu "Người thực hiện (vai trò + tên)". API `AuditLogDto` không trả tên/email, nên phần này là gap phụ thuộc API.
- Đề xuất tối thiểu ở web: hiện full id (`title`/tooltip) hoặc có nút copy. Bấm vào actor thì điền vào filter. Tên/vai trò cần task API enrich.

### MINOR-2: Màn Cấu hình lệch design-spec (không chặn, dự án demo)
- Manager đang thấy chính sách chuỗi ở chế độ read-only (`settings-form.tsx:176`). Spec nói Manager "không thấy chính sách", chỉ thấy cấu hình rạp. Không phải lỗ hổng bảo mật vì API cho Manager GET và dữ liệu vốn công khai.
- Thiếu ConfirmDialog "Thay đổi áp dụng cho đơn/đăng ký mới", hiển thị phiên bản/thời điểm điều khoản, và preview `NoRefundNotice`.
- Lưu nhiều key là tuần tự và không atomic. Nếu một phần lỗi thì key đã lưu vẫn giữ, còn key lỗi giữ bản nháp. Cách xử lý này chấp nhận được và đã báo rõ bằng toast.error.

### MINOR-3: Kích thước file/hàm (AI-readable)
- `users-admin.tsx` ~430 dòng và `audit-log-view.tsx` ~321 dòng, vượt mức ≤300.
- Các component dài hơn 50 dòng: `AdminUsersPanel` ~158, `AuditLogList` ~137, `ManagerStaffPanel` ~103, `SettingsEditor` ~89.
- Precedent: layer trước ghi component React >50 dòng là MINOR (`cinema-selector`), còn file service >300 dòng thì bị yêu cầu tách.
- Tính 2 indicator (file >300, hàm >50). Tên rõ, không magic number, comment nói WHY, nên dưới ngưỡng FAIL (≥3).
- Đề xuất khi sửa MAJOR-1/2: tách `ConfirmActionDialog` và `ManagerStaffPanel` ra file riêng để `users-admin.tsx` ≤300.

### MINOR-4 / Residual risk (không chặn task web này): API không chặn tự khoá, tự gỡ Admin, và không có guard Admin cuối cùng
- UI đã disable tự khoá và tự gỡ Admin (`users-admin.tsx:223,233`, có test).
- Tuy vậy, API `lockUser` (`users.controller.ts:118-147`) và `applyAdminRole` (`:315-337`) không so `user.id === userId`. RLS `user_roles_admin_delete` (`core_identity_chain.sql:404`) chỉ check `is_admin()`. Không có guard last-admin ở cả API lẫn DB.
- Kịch bản mất hết Admin:
  - Admin duy nhất gọi API trực tiếp để tự gỡ hoặc tự khoá.
  - Hai Admin gỡ quyền của nhau gần như đồng thời. Qua UI vẫn làm được vì mỗi người gỡ người kia.
  - Khi đó chuỗi không còn Admin, và chỉ khôi phục được bằng SQL trực tiếp.
- Spec (R-105, R-17) không nêu ràng buộc "Admin cuối cùng". Xác suất thấp với dự án demo.
- Đề xuất: tạo **task API backlog riêng**, không thuộc task web này:
  - (a) trả 409/422 khi tự khoá hoặc tự gỡ Admin;
  - (b) guard last-admin, tốt nhất ở DB (trigger hoặc lock trong transaction) để chống race;
  - (c) test e2e tương ứng.

### Ghi chú khác (OK)
- Có ErrorState cho `/me`, `/admin/cinemas`, danh sách users, staff, settings và audit, kèm nút retry.
- Phân trang users/audit dùng `total/pageSize` từ API.
- Không có XSS: chỉ render text, không dùng `dangerouslySetInnerHTML`. Diff audit dùng `JSON.stringify` rồi render dạng text.
- Các test kiểm lỗi 403/500 đều assert không gọi toast success.

## Verdict
**FAIL**

Lý do: 2 MAJOR trên luồng RBAC.
- MAJOR-1: không có cách thu hồi gán rạp, và gán Manager không gỡ được.
- MAJOR-2: dialog đổi vai trò chọn sẵn STAFF, nên hạ quyền Manager ngầm. Test hiện tại không bắt được.

Verify commands đều xanh, AC-1 và AC-2 đạt. Builder sửa 2 MAJOR, thêm test tương ứng, và nên xử lý MINOR-1, MINOR-3 trong cùng round. MINOR-4 đi thành task API backlog riêng.
