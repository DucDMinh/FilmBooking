# Task 10: Fix phase review layer 7 — điều hướng rạp → phòng & sơ đồ ghế, nav ngày lễ, dọn nhãn EXCHANGED

## Layer
7 (fix sau phase review — `.context/review-reports/build-filmbooking-layer-7-phase-review.md`, blocker GAP-008)

## Classification / Risk
BUG (navigation) · risk thấp — chỉ web, không đổi API/schema.

## Root cause
- Task-02 tạo route `/admin/rap/[id]/phong` và `/admin/rap/[id]/phong/[roomId]`, nhưng không có link nào từ trang rạp; `nav-config.ts:25` trỏ `/admin/phong` (route không tồn tại); `__tests__/shell.test.tsx:153` khoá href cũ.
- `/admin/ngay-le` (task-04) không có trong sidebar (chỉ link từ trang giá).
- `order-utils.ts:74` còn nhãn `EXCHANGED` "Đã đổi vé" (đổi suất đã bỏ khỏi spec).

## Files to Create/Modify
- `apps/web/src/app/admin/rap/[id]/page.tsx` (link "Phòng & sơ đồ ghế" → `/admin/rap/${id}/phong`, không hiện khi tạo mới)
- `apps/web/src/app/admin/rap/page.tsx` (link phòng ở mỗi dòng rạp, nếu hợp lý)
- `apps/web/src/components/admin/nav-config.ts`
- `apps/web/src/components/admin/__tests__/shell.test.tsx`
- `apps/web/src/components/admin/order-utils.ts`
- test liên quan

## Acceptance
- Từ `/admin/rap` → chi tiết rạp → phòng → sơ đồ ghế đi được hoàn toàn bằng click (R-38, R-47, R-48).
- Sidebar không còn href tới route không tồn tại; quyết định cho mục "Phòng & sơ đồ ghế": trỏ `/admin/rap` (chọn rạp trước) hoặc tới `/admin/rap/<cinema đang chọn>/phong` khi có `?cinema=`.
- Sidebar có mục ngày lễ cho Admin (đúng quyền API holidays).
- Không còn nhãn EXCHANGED.

## Verify
`pnpm typecheck`, `pnpm lint`, `cd apps/web && pnpm test`, `pnpm build`.
