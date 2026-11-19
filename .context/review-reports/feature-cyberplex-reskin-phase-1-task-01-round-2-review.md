Agent: reviewer

# Review: feature-cyberplex-reskin phase-1-task-01, round 2

- **Task:** `tasks/feature-cyberplex-reskin/phase-1-task-01.md` (CR-010, re-skin CYBERPLEX, phần nền)
- **Review level:** STRICT
- **Lý do chọn STRICT:** task sửa file dùng chung toàn app (`globals.css`, `lib/utils.ts` (`cn`), `components/ui/*`). Vòng này còn đụng `cn`, hàm mà mọi component đều gọi.
- **Blast radius:** toàn bộ `apps/web`. Ở vòng 2, thay đổi ở `lib/utils.ts` ảnh hưởng mọi lời gọi `cn` có `text-hud`. Hiện chỉ Badge dùng class này, và thay đổi chỉ thêm một giá trị vào danh sách font-size, nên không làm đổi cách gộp các class khác.
- **Phạm vi vòng 2:**
  - `lib/utils.ts`
  - `components/ui/__tests__/reskin.test.tsx` (mới)
  - `components/motion/scrub.tsx` và test của nó
  - `components/ui/{button,dialog,sonner}.tsx`
  - `app/globals.css` (thêm `.frame:focus-visible`, `toastIn`, comment ngoại lệ)
  - task file (ghi lý do Sheet)

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter ./apps/web …` | Không chạy lại. Ở vòng 1 agent-guard đã chặn lệnh này (**Blocked**), nên vòng này dùng thẳng lệnh gốc có trong allowlist. |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS. web **50 file / 628 test** (vòng 1 là 49/622, thêm `reskin.test.tsx` và test Scrub mới); api 29/658; shared 31; scripts 31 |
| `pnpm build` | PASS (Next 16.4.6, 41 trang; api build xong) |
| Soi CSS build `apps/web/.next/static/chunks/065d_iob-rabp.css` | Có các khối sau: `@keyframes scrubPop`, `@supports (animation-timeline:view())`, `[data-scrub]:focus-within`, `@keyframes toastIn{0%{translate:0 12px}to{translate:0}}`, `.toast-in{animation:toastIn .3s var(--ease-out)}` (nằm trong khối reduced-motion no-preference), `.frame:focus-visible` và `@media print{…}`. |
| oxlint / aislop / ocr | Lý do giống vòng 1: oxlint chưa cấu hình, aislop chưa cài, ocr hết quota Gemini nên không chạy lại. |

## Kiểm từng điểm coordinator yêu cầu

1. **MAJOR-1 đã đóng thật.**
   - `lib/utils.ts` đã thêm `hud` vào nhóm `font-size`.
   - Ca tự dựng `cn("text-hud", "text-danger-text")` được kiểm trong `reskin.test.tsx:15`, kết quả là `"text-hud text-danger-text"`, giữ cả hai class. `cn("text-body", "text-hud")` ra `"text-hud"`, tức hai class được gộp đúng như hai cỡ chữ.
   - Test render Badge với tone danger, brand và success đều có `text-hud` cùng class màu.
   - Đã rà các cỡ chữ tuỳ biến khác: các token `--text-*` trong `globals.css` gồm display, h1, h2, h3, body, body-sm, small, hud và caption, và nay đều có trong danh sách. Không còn class cỡ chữ tuỳ biến nào trong `components/ui` hay `lib` bị `cn` hiểu nhầm là màu rồi xoá.
   - `tracking-btn` và `tracking-hud` không có trong danh sách của tailwind-merge, nên được giữ nguyên chứ không bị xoá. Với nút link, `tracking-normal` đứng sau `tracking-btn` trong CSS build nên thắng, đúng ý.
2. **Không có hồi quy mới.**
   - `globals.css`: comment mới ở dòng 325 và 364 không chứa `/*` hay `*/` lồng. Test đếm comment cân nhau vẫn PASS và CSS build vẫn giữ đủ keyframes.
   - Toast: `toastIn` dùng thuộc tính riêng `translate`, không đụng `transform` mà Sonner tự điều khiển.
     - Trong `sonner/dist/styles.css`, animation swipe-out dùng selector `[data-sonner-toast][data-swipe-out=…]`. Selector này cụ thể hơn `.toast-in` nên vẫn thắng khi vuốt bỏ toast.
     - Dưới reduced-motion, Sonner tự đặt `animation: none !important`, và `.toast-in` vốn chỉ áp trong khối no-preference.
     - Lúc vào, chuyển động `translate` cộng dồn với hiệu ứng trượt bằng `transform` của Sonner. Không hỏng (xem Residual).
   - `lift` trong Button:
     - Có ở default, gradient, destructive, outline, secondary và ghost; nút link không có (test `reskin.test.tsx:37-42`).
     - Vì không còn hai class `hover:[transform]` mâu thuẫn, MINOR-9 cũng đóng khi gọi `buttonVariants({variant:"link"})` trực tiếp.
     - API props của Button không đổi.
   - Nút đóng Dialog ở `top-4 right-5`:
     - Góc trên-phải của nút ở (W-20, 16), nằm trong đa giác chamfer (đường cắt tại x=W-20 có y=4).
     - Góc ngoài của outline focus (offset 3px + 2px) ở (W-15, 11), cũng nằm trong (đường cắt tại đó có y=9). Vòng focus không còn bị cắt.
     - `DialogHeader pr-10` (40px) đủ chừa chỗ cho nút.
   - Scrub: chỉ ghi `--i` và `--n` inline khi có truyền. CSS dùng `var(--i, 0)` và `var(--n, 1)` nên mặc định vẫn đúng, và cách lệch pha bằng `:nth-child` của §16.4 nay dùng được. Test `scrub.test.tsx:26-30` đã cập nhật theo.
3. **Các MINOR khác của vòng 1:**
   - MINOR-3 đã đóng: `.frame:focus-visible` có trong danh sách focus inset.
   - MINOR-4 được chấp nhận: task file dòng 33 ghi lý do (Sheet neo mép màn hình, góc cắt sẽ cắt nút đóng và nội dung).
   - MINOR-5 đã đóng.
   - MINOR-7: đã có comment ghi ngoại lệ có chủ đích.

## Findings

### BLOCKER / MAJOR
Không có.

### MINOR (ghi Residual cho task sau, không chặn)
- **R-1:** gọi thẳng `buttonVariants({ variant: "link" })` mà không qua `cn` thì nút link vẫn UPPERCASE: trong CSS build, `.uppercase` đứng sau `.normal-case` nên thắng. Qua `<Button>` (có `cn`) thì đúng. Hiện chưa có chỗ nào gọi link variant theo cách này.
- **R-2:** lúc vào, toast vừa có `translate` 12px của `toastIn` vừa có hiệu ứng trượt bằng `transform` của Sonner, nên chuyển động hơi kép. Không hỏng; chỉnh khi rà trực quan.
- **R-3:** `.panel-cyber` chưa có trong danh sách focus inset. DialogContent đã có `outline-hidden` nên chưa có tác động.
- **R-4:** `globals.css` dài khoảng 377 dòng (1 indicator AI-readable). §5.2 yêu cầu một file nên không chặn.
- Các residual của vòng 1 vẫn còn và thuộc task-02 / phase 2:
  - remap `outline` ở các chỗ gọi (theo khoá vai trò màu T2)
  - `shadow-cta-glow` không còn tác dụng; `font-semibold` ghi đè `font-bold` của CTA
  - `text-danger` còn ở các màn
  - `global-error.tsx` vẫn nạp Inter nhưng không dùng
  - Playwright cho AC-32 trên màn thật

## Verdict

**STRICT PASS**: MAJOR-1 đã đóng, có test chứng minh (`cn` giữ `text-hud` khi đi cùng class màu). Các sửa đổi vòng 2 không gây hồi quy. typecheck, lint, test và build đều PASS, và CSS build giữ đủ scrub, toastIn, focus inset và print.
