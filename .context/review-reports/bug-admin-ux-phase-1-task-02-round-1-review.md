# Review — bug-admin-ux · phase-1-task-02 · round 1

Agent: reviewer

- **Review level:** NORMAL
- **Reason:** Đây là thay đổi UI thuần: thêm nút client gọi `signOutAction` đã có sẵn. Không đổi auth logic, API, schema hay proxy. Action, proxy và layout guard được đọc đối chiếu nhưng không bị sửa.
- **Blast radius:** `components/common/sign-out-button.tsx` (mới, hiện chỉ dùng ở khu vực nội bộ), `AdminShell` topbar, `AdminMobileNav` Sheet, header `app/staff/layout.tsx`. Mọi trang `/admin/*` và `/staff/*` đều render nút này.

## Verify commands + result

Lệnh dạng `cd "E:/FilmBooking/apps/web" && pnpm …` bị agent-guard chặn (chỉ cho phép cd vào `.worktrees/`), nên tôi không chạy được lệnh filter riêng apps/web. Tôi chạy đúng các lệnh trong allowlist `project-config.md` từ thư mục gốc repo:

| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS: web 33 files / 451 tests, api 25/483, shared 2/31, scripts 16/16 |
| `pnpm lint` | PASS (shared, api, web sạch) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `git diff --ignore-cr-at-eol --stat -- apps/web/src/components/admin/__tests__/shell.test.tsx` | Rỗng (chỉ có cảnh báo LF→CRLF), tức nội dung không đổi |
| aislop / oxlint / ocr | Bỏ qua: không có trong allowlist verify của project-config, và oxlint chưa cấu hình |

## Checklist theo brief

1. **Nút có thật ở desktop, mobile và staff.**
   - `admin-shell.tsx`: dùng class `hidden md:inline-flex`. `cn` (tailwind-merge) gộp class: `hidden` thắng `inline-flex` gốc của buttonVariants, còn `md:inline-flex` được giữ lại. Kết quả là nút hiện từ md trở lên.
   - `admin-sidebar.tsx:107-109`: chân Sheet mobile, nút `w-full`, chiều cao h-11 (≥ 44px). Nút mở Sheet có class `md:hidden`, nên hai nút bổ sung cho nhau và không chồng nhau.
   - `staff/layout.tsx:37`: nút `ml-auto` trong header flex. Trang staff không có phần tử sticky/fixed nào che header.
2. **Phiên bị xoá thật.**
   - `signOutAction` (`app/auth/actions.ts:19-35`) gọi `supabase.auth.signOut()`, xoá mọi cookie `sb-*` (kể cả chunk `.0/.1`) và `fb-remember`.
   - Sau đó vào `/admin` thì bị chặn ở hai lớp: `proxy.ts:36` (không có user và path được bảo vệ thì redirect `/dang-nhap?next=…`) và `admin/layout.tsx:33` (không có access token thì redirect).
   - Phía client không giữ dữ liệu phiên: `lib/supabase/browser.ts` đặt `persistSession:false`, cookie phiên là HttpOnly, và repo không dùng React Query/SWR.
   - Theo docs Next 16.4.6, xoá cookie trong Server Action sẽ tự re-render trang hiện tại. Thêm `router.replace` + `router.refresh` là đủ, và `replace` khiến nút Back không quay lại trang admin đã cache.
3. **Test.**
   - Mock `signOutAction` trả `{ success: true }` / `{ error }`, khớp với `ActionResult` thật. Mock router và toast không che lỗi logic.
   - Test mobile dùng `within(dialog)` nên chứng minh được nút nằm trong Sheet.
   - Test bấm đúp (promise treo) và test lỗi (toast, không điều hướng, nút enable lại) đều kiểm hành vi thật của component.
   - "Đỏ trước fix" ở đây chỉ là đỏ do chưa resolve được module. Tuy vậy, các assertion `getByRole("button",{name:"Đăng xuất"})` sẽ đỏ thật nếu thiếu nút trong shell, nên tôi chấp nhận.
4. **`shell.test.tsx`:** đã xác nhận chỉ khác line ending, nội dung không đổi.
5. **a11y/UX.** Có `type="button"`, `disabled` khi đang pending, có guard `if (pending) return`, `aria-label` đổi theo trạng thái, icon `aria-hidden`, nhãn tiếng Việt. Style dùng `Button` variant `outline` size `sm` sẵn có, khớp repo. File 56 dòng, hàm `handleSignOut` khoảng 17 dòng.

## Findings

Không có finding mức Critical/Major nào. Các mục dưới là ghi chú Low hoặc nợ có sẵn, không chặn PASS:

- **L1 (test fidelity, Low).** Test "topbar có nút Đăng xuất" (`sign-out.test.tsx:44-51`) chạy trên jsdom, vốn không áp CSS. Vì vậy test vẫn xanh kể cả khi nút bị ẩn ở mọi breakpoint. Tôi đã kiểm tay class `hidden md:inline-flex` là đúng. Khả năng hiển thị theo responsive 375/768/1280 chưa được kiểm trên trình duyệt thật; task file cũng ghi "chưa verify thủ công".
- **L2 (Low, có sẵn, ngoài scope).**
  - Đường lỗi: `signOutAction` (`actions.ts:32-33`) trả thẳng `err.message`, có thể là chuỗi tiếng Anh nội bộ, và toast hiển thị nguyên chuỗi đó.
  - Thứ tự xoá: nếu `supabase.auth.signOut()` ném lỗi (mạng/GoTrue) thì cookie không bị xoá, người dùng phải bấm lại.
  - Cả hai đều có từ trước task này. Có thể ghi vào gap register nếu muốn.
- **L3 (Low).** `sessionStorage["staff.cinemaId"]` không bị xoá khi đăng xuất. Nếu một nhân sự khác đăng nhập trên cùng tab, rạp cũ có thể được chọn sẵn. API vẫn tự kiểm quyền theo rạp, nên đây chỉ là UX, không phải lỗ hổng.
- **L4 (residual risk).** Sau action, Next tự re-render `/admin`, và layout gặp `redirect("/dang-nhap?next=/admin")`. Song song đó client gọi `router.replace("/dang-nhap")`. Cả hai đường đều kết thúc ở `/dang-nhap`, URL có thể kèm hoặc không kèm `?next=/admin`. Tôi chưa quan sát trên trình duyệt xem có nháy trang hay không.
- **Ngoài phạm vi.** Có `apps/web/AGENTS.md` untracked do `next dev` tự sinh, không thuộc task này. Không nên gộp vào commit của task, trừ khi dispatcher chủ động quyết định.

Surgical diff đạt: mọi dòng thay đổi đều trace về task, không có refactor kèm theo.

## Verdict

**NORMAL PASS**
