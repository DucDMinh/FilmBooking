Agent: reviewer

# Review: feature-cyberplex-reskin phase-2 task-06, round 1

- Task: `tasks/feature-cyberplex-reskin/phase-2-task-06.md` (CR-010: Admin và Soát vé, da CYBERPLEX nhẹ, không chuyển động)
- Worktree: `E:\FilmBooking\.worktrees\cyberplex-t06` (branch `wt/cyberplex-reskin__phase-2__task-06`, base 41b565b, diff chưa commit)
- Review level: **NORMAL**
- Reason: chỉ đổi giao diện (className, chuỗi hiển thị, variant nút). Không đụng API, DTO, schema, auth hay dữ liệu. Có 1 hàm thuần dùng chung trong UI (`diffAuditData`, sentinel `ABSENT`) đã kiểm riêng.
- Blast radius: 51 file trong `apps/web/src/{components/admin,components/staff,app/admin,app/staff}`, 4 test và task file. Không file nào nằm ngoài phạm vi hợp lệ. `components/ui/*` và `app/auth/callback/route.ts` không có trong diff.

## Verify (mỗi lệnh chạy 1 lần trong worktree)

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | `apps/web`: Done (PASS). `packages/shared`: PASS. `apps/api`: FAIL vì worktree thiếu `apps/api/node_modules` (TS2307 không tìm thấy `@nestjs/common`...). Lỗi do môi trường, api không có trong diff. |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` (gốc) | shared 31/31 PASS. Sau đó dừng ở `apps/api`: `vitest` không được nhận diện (thiếu node_modules, môi trường). |
| `pnpm test` trong `apps/web` | 627/629. 2 test fail ở `components/account/__tests__/account.test.tsx` (ChangePasswordForm: timeout 5s; chuỗi gõ bị xen `"1W2r3ongOld123"`). File này ngoài diff. |
| `pnpm test <account.test.tsx>` chạy riêng | 21/21 PASS, nên đây là test chập chờn khi máy tải nặng, không do task gây ra. |
| `pnpm build` | Không chạy theo brief (lỗi junction với Turbopack). Đã xác nhận `app/auth/callback/route.ts` KHÔNG có trong diff, nên lỗi `next build --webpack` báo ở `.next/types/app/auth/callback/route.ts` có từ trước và nằm ngoài scope. |
| aislop / oxlint / ocr | skip: chưa cấu hình hoặc chưa cài trong allowlist |

## Kiểm tra bắt buộc

1. **Script thay chuỗi không làm hỏng logic**
   - Các chỗ `—`/`–` đổi sang `-` đều là chuỗi hiển thị: placeholder giá trị rỗng, khoảng giờ `18:30-20:30`, phân trang `Đơn 1-20 / 21`, hint, title, option `- Chọn phim -`, placeholder ô giá.
   - Không chỗ nào là regex, key, tên cột CSV hay chuỗi định dạng ngày. Không có xuất CSV trong phạm vi. Key `ConflictList` dùng `|`, không bị đổi.
   - `audit-log-view.tsx:42` `ABSENT = "-"`: bộ lọc diff so sánh `JSON.stringify` trên giá trị THÔ (`:60`). `ABSENT` chỉ dùng khi định dạng hiển thị (`:45`), nên việc lọc và so sánh không đổi. Chỉ còn rủi ro hiển thị: một trường có giá trị chuỗi thật là `"-"` sẽ trông giống "không có trường". Xem MINOR-1.
   - Đã bỏ `rounded-*` mà vẫn giữ `overflow-hidden`/`overflow-x-auto` (`qr-scanner.tsx`, các wrapper bảng). Không mất phần cắt khung nào.
   - `text-danger` -> `text-danger-text` chỉ áp cho màu chữ. Nền và viền vẫn giữ `bg-danger-soft`/`border-danger-line`/`aria-invalid:border-danger`. Token `--color-danger-text` có ở `globals.css:42`.
2. **A11y**
   - Nút icon và nút ghost trong bảng vẫn có `aria-label`, ví dụ `price-matrix.tsx` "Xoá ngày lễ ...", "Xoá ghi đè ...".
   - `shadow-none bg-transparent` chỉ bỏ khung inset ở trạng thái thường. Hai lớp `focus-visible:shadow-[inset_0_0_0_2px ...]` và `hover:shadow-[... brand]` của `button.tsx:14,17` có modifier khác nên tailwind-merge vẫn giữ, focus và hover còn rõ.
   - Sidebar giữ `aria-current="page"`. `border-l-transparent`/`border-l-brand` được merge đúng (lớp sau thắng).
   - CheckinResult vẫn có chữ + icon + màu nền.
3. **Soát vé / CheckinResult**
   - Không có animation. Kết quả hiện ngay.
   - OK hiện đủ ghế theo đơn (R-98).
   - Sai rạp chỉ hiện tên + địa chỉ (R-102), không có tên khách hay ghế.
   - Chữ kết quả Chakra Petch 700 20px theo §16.3. `gradient` -> `default` (hai variant hiển thị y hệt nhau).
4. **Không có scanline/Scrub ở admin/staff.** `scanline` chỉ có ở `app/(public)/layout.tsx:56`. Không có `data-scrub`/`Scrub` trong admin/staff.
5. **Token:** không còn hex, `rounded`, `coral` trong phạm vi. Badge vai trò dùng `tone="brand"` (có trong `badge.tsx:20`). Biểu đồ dùng `bg-chart-1` (token `globals.css:146,178`).
6. **Remap `outline`:** chỉ còn 2 nút `outline` (khung crimson), cả hai là hành động nguy hiểm: "Xoá suất" (`lich-chieu/[id]/page.tsx:220`) và "Huỷ tất cả suất tương lai" (`lich-chieu/page.tsx:122`). Các nút trung tính (Huỷ, Để sau, Thử lại, Thêm giờ, Mở khoá ghế, Sao chép sơ đồ, Đăng xuất) đã chuyển sang `secondary`.
7. **Verify:** xem bảng trên.
8. **Rủi ro hồi quy:** thấp. Chỉ đổi className, chuỗi hiển thị và variant. Handler, props dữ liệu và luồng đều không đổi. 4 test cập nhật đúng chuỗi mới, không nới assertion.

## Findings

- BLOCKER: không có.
- MAJOR: không có.
- MINOR-1 `apps/web/src/components/admin/audit-log-view.tsx:42`: `ABSENT = "-"` dễ trùng với giá trị dữ liệu thật hơn so với `"—"`, nên trên màn diff không phân biệt được "trường vắng" với "giá trị là '-'". Đề xuất: dùng nhãn không thể là dữ liệu (vd `"(không có)"`) hoặc hiển thị kiểu chữ nghiêng/mờ cho trạng thái vắng.
- MINOR-2 `admin/manager-staff-panel.tsx:547`, `price-matrix.tsx`, `rooms-manager.tsx`, `users-admin.tsx`, `voucher-form.tsx`, `app/admin/phim/page.tsx`, `app/admin/rap/page.tsx`: `variant="ghost" className="shadow-none bg-transparent"` bị lặp ở 7 file và viết cùng dòng. Đề xuất: sau này thêm 1 variant/size `ghost` "trong bảng" vào `components/ui/button.tsx` (task khác) thay vì lặp lại.
- MINOR-3 Nhiều `h1` trang (`app/admin/{bao-cao,gia,lich-chieu,ngay-le,voucher}/page.tsx`) dùng `text-h2` trong khi `PageHeader` dùng `text-h1`, nên cỡ tiêu đề không đồng đều (từ trước, chỉ thêm uppercase). Đề xuất: dùng `PageHeader` thống nhất ở một lượt dọn sau.
- MINOR-4 `components/staff/checkin-result.tsx:122`: icon vẫn là `Circle*` trong khi §16.2 quy đổi "vòng tròn ✓/✕ → ô vuông chamfer có icon". Đề xuất: bọc icon vào ô vuông (không chamfer cắt nội dung) nếu muốn khớp sát §16.2. Không ảnh hưởng a11y.
- MINOR-5 (ngoài diff) `components/ui/button.tsx:12`: hover lift 1px và transition 200ms vẫn chạy ở admin/soát vé, trong khi §16.1 ghi "soát vé tắt hết chuyển động". Đây là component dùng chung của task trước. Đề xuất: ghi nhận cho spec-validator ở cuối phase.
- MINOR-6 `apps/web/src/app/staff/soat-ve/page.tsx:111`: pill mã rạp dùng `chamfer-sm`. Góc cắt nhỏ và có `px-3` nên không cắt chữ, vẫn đạt §16.1.

## Residual risk

- Chưa có smoke trực quan hay Playwright (cần API và đăng nhập). Responsive 375/768/1280 chưa soi bằng mắt.
- `account.test.tsx` chập chờn khi chạy cả suite trên máy tải nặng (ngoài scope).
- Typecheck/test của `apps/api` không chạy được trong worktree vì thiếu node_modules. Dispatcher cần chạy lại verify đầy đủ ở integration branch.

## Verdict

**NORMAL PASS**
