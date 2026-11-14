Agent: reviewer

# Review — build-filmbooking layer-7 task-10 — round 2

- Task: `tasks/build-filmbooking/layer-7-task-10.md` (GAP-008 / GAP-011 / GAP-027)
- Round 1: `.context/review-reports/build-filmbooking-layer-7-task-10-round-1-review.md` (FAIL: MAJOR-1, MAJOR-2, MINOR-1)
- Diff: chưa commit, main checkout `E:/FilmBooking`, branch `layer-7-integration`
- Review level: **NORMAL**
- Reason: chỉ điều hướng web, không đổi API/schema/quyền. Shell admin là component dùng chung nên đã soát regression của sidebar và mobile nav.
- Blast radius: `admin-shell.tsx`, `admin-sidebar.tsx` (desktop + mobile Sheet), `nav-config.ts`, `/admin/rap`, `/admin/rap/[id]`, `order-utils.ts`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` (root) | PASS — web 29 file / 439 test (+1 file, +6 test so với round 1), api 480, shared 14, scripts 16 |
| `pnpm build` | PASS |
| aislop / oxlint / ocr | skip (ngoài allowlist, oxlint chưa cấu hình, chưa cài ocr) |

## Đối chiếu finding round 1

### MAJOR-1 (dead link khi `?cinema=all`): ĐÃ SỬA
- `admin-shell.tsx:52-59` truyền `scope` (đã đi qua `useAdminScope` → `resolveScope`) xuống `AdminSidebar` và `AdminMobileNav`. Sidebar không còn tự đọc `?cinema=` thô để dựng đường dẫn phòng.
- `nav-config.ts` `resolveNavHref`: khi `null`, `""` hoặc `"all"` thì trả `href` (`/admin/rap`), còn lại trả `/admin/rap/<encode(id)>/phong`.
- Kết quả theo vai trò:
  - Admin chọn "Toàn chuỗi" → `/admin/rap?cinema=all`, hợp lệ.
  - Manager hoặc Staff dán `?cinema=<rạp không được gán>` → `resolveScope` fallback về rạp được gán đầu tiên, nên link trỏ đúng rạp của họ.
  - Manager không có `?cinema=` → rạp đầu tiên của họ.
- Mobile nav dùng chung `NavList` và nhận cùng `cinemaId={scope}`, nên hành vi giống desktop.
- Test: `shell.test.tsx` có các ca `resolveNavHref` (`c1`, `null`, `"all"`, `""`) và render `AdminSidebar` với `c1` và `all`.

### MAJOR-2 (thiếu test link rạp → phòng): ĐÃ SỬA
- File mới `apps/web/src/app/admin/rap/__tests__/rap-room-links.test.tsx`:
  - Danh sách rạp với ADMIN và MANAGER: link `/admin/rap/c1/phong`.
  - Chi tiết rạp: có nút "Phòng & sơ đồ ghế".
  - Trang `id=moi`: không có nút.
- Mock khớp contract thật: `/me` với `isAdmin`/`cinemas[].role` đi qua `useAdminMe` → `resolveAdminRole` thật, `/admin/cinemas`, `/admin/cinemas/${id}`, `/cinemas/${id}/settings` đúng đường dẫn mà trang gọi. Mock trả lỗi cho đường dẫn lạ, nên test không pass giả.

### MINOR-1 (mất scope, hai mục cùng active): ĐÃ SỬA
- `admin-sidebar.tsx`: `formatNavHref(resolveNavHref(item, cinemaId), cinemaParam, …)` giữ `?cinema=` cho mọi mục, kể cả mục phòng.
- `isNavEntryActive`:
  - Trên trang phòng (`/admin/rap/<id>/phong[/…]`), chỉ mục "Phòng" active.
  - Trên `/admin/rap` và `/admin/rap/<id>`, chỉ mục "Rạp chiếu" active.
  - Mục external không bao giờ active (giữ hành vi cũ).
  - Các mục còn lại vẫn dùng `isNavItemActive`.
- Có test cho cả hai trường hợp active.

## Findings mới

- NIT-1: `nav-config.ts` `resolveNavHref` so sánh với literal `"all"` thay vì dùng hằng `ALL_CINEMAS` (`use-admin-scope.ts:6`). Nếu sau này đổi hằng thì hai chỗ sẽ lệch nhau. Không chặn PASS.
- Residual (không chặn): Admin tự gõ `?cinema=<id không tồn tại>` vào URL. Khi đó `resolveInitialCinemas` (`admin-shell.tsx:23-29`, logic có sẵn từ trước, không thuộc diff này) thêm rạp tạm, nên link phòng trỏ tới id đó và trang phòng ra 404 có kiểm soát qua `notFound()`. Ca này chỉ xảy ra khi tự sửa URL, không phải luồng click, và API vẫn kiểm quyền.
- Mobile nav chưa có test render riêng cho mục phòng, nhưng dùng chung `NavList`, `cinemaId` lấy từ cùng nguồn, và test cũ mở Sheet vẫn pass. Chấp nhận được.

## Đã kiểm, OK (giữ từ round 1)
- Ngày lễ: nav chỉ cho ADMIN, khớp quyền ghi ở API (`GET` holidays là public, `POST`/`DELETE` là `@Roles("ADMIN")`). Manager xem bản chỉ đọc qua link trong `/admin/gia`.
- Không còn `/admin/phong`. Key của `li` là `label`, duy nhất. Đã bỏ `EXCHANGED`.
- Surgical diff: mọi dòng đều trace được về GAP-008/011/027 và các finding round 1.

## Verdict

**NORMAL PASS**: MAJOR-1, MAJOR-2 và MINOR-1 của round 1 đã được sửa và có test. Verify đều xanh. Chỉ còn NIT-1 và một residual tự gõ URL, không chặn.
