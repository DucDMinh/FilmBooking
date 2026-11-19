Agent: reviewer

# Review: feature-cyberplex-reskin phase-1-task-01, round 1

- **Task:** `tasks/feature-cyberplex-reskin/phase-1-task-01.md` (CR-010, re-skin CYBERPLEX, phần nền: tokens, font, utility, focus, scrub CSS, `<Scrub>`, components/ui)
- **Review level:** STRICT
- **Lý do chọn STRICT:** sửa file dùng chung toàn app (`globals.css`, `layout.tsx`, 14 file `components/ui/*`). Đây là shared component / design-system contract, mọi màn đều dùng.
- **Blast radius:** toàn bộ `apps/web`. Mọi Button (99 chỗ gọi `outline/ghost/secondary`, 17 chỗ `gradient`), Badge, Dialog/AlertDialog/Sheet, Tabs, Table, Input/Select, Toast, font và màu toàn cục. Diff không đụng API, DB, `packages/shared`.
- **Phạm vi diff:** `git diff -- apps/web` (16 file) và file mới `apps/web/src/components/motion/scrub.tsx`, `apps/web/src/components/motion/__tests__/scrub.test.tsx`. Các file ngoài `apps/web` (`.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `apps/api/package.json`, `package.json`, `supabase/config.toml`) không thuộc task nên không review.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter ./apps/web typecheck` / `lint` (lệnh brief yêu cầu) | **Blocked** bởi agent-guard (không nằm trong allowlist). Không thử biến thể khác của lệnh này. |
| `pnpm typecheck` (allowlist, chạy cho cả 3 workspace, bao trùm web) | PASS (shared, api, web) |
| `pnpm lint` (allowlist) | PASS (shared, api, web) |
| `pnpm test` (allowlist) | PASS. web 49 file / 622 test; api 29 / 658; shared 2 / 31; scripts 31 / 31 |
| `pnpm build` (allowlist) | PASS. Next 16.4.6 build xong 41 trang tĩnh, api build xong |
| Soi CSS build `apps/web/.next/static/chunks/3p4__f4itunj5.css` | Có `@keyframes scrubPop` (đủ 0/70/100%), khối `@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){…}}`, `[data-scrub-group]{view-timeline…}`, `[data-scrub]:focus-within{opacity:1;animation:none;translate:0;scale:1}`, `@media print{…animation:none!important}`, `.scrub-inset-0{--scrub-inset:0px}`, `.panel-cyber{…}`, `zoom-in-96` thành `--tw-enter-scale:calc(96*1%)`, `.btn-primary:focus-visible{--focus-inset:var(--color-fg-on-brand)}`, `.chamfer-*:focus-visible{box-shadow:inset…;outline:none}`, `h1,h2,h3,h4{font-family:var(--font-heading)}`. Các longhand `animation-timeline/range` **không** bị gộp thành shorthand `animation` (nếu gộp sẽ reset timeline). Số `/*` và `*/` trong `globals.css` cân nhau; không còn lỗi comment đóng sớm. |
| oxlint | skip, oxlint not configured (không có `.oxlintrc.json`) |
| aislop `scan --changes --json` | skip, `aislop: command not found` |
| ocr `review --format json` (v1.13.9) | `terminal_state: partial`: model Gemini trả 429 `RESOURCE_EXHAUSTED` (hết quota free tier). Hai comment trả về đều thuộc file ngoài task (`supabase/config.toml` low, `apps/api/package.json` medium). Không có finding CRITICAL/MAJOR nào cho `apps/web`. Kết quả không đầy đủ nên không dùng làm căn cứ PASS/FAIL. |
| AI-friendly web gate | N/A (task nền tảng UI, không đổi route public, robots, sitemap) |

## Đối chiếu từng điểm kiểm bắt buộc

1. **Token:** khớp tokens §5.2 và §5.1: `--color-bg #070709`, `--color-brand #FCEE09`, `--color-fg-on-brand #07070A`, `--color-fg-muted #8A8AA0`, `--color-border-input #6E6E86`, `--color-danger-text #FF4D6D`, `--color-brand-line`, `--color-line-brand`, `--cut-*`, `--clip-*`, `--scrub-*`, `--enter-*`, `--scale-*`, `--radius: 0px`, `--radius-*: 0px`. Tên token cũ giữ nguyên. `--shadow-cta-glow` đã bỏ. Biến shadcn khớp §5.1. Thiếu `--dur-wipe` và `--stagger` của §5.2 (xem MINOR-6).
2. **Font:** đúng 4 họ. Chakra Petch, Be Vietnam Pro, JetBrains Mono nạp `latin, latin-ext, vietnamese`; Orbitron chỉ `latin`, weight đúng bảng §2.1, `display: swap`. Layout không còn Inter hay Rajdhani. `--font-heading` bắt đầu bằng Chakra rồi Be Vietnam; Orbitron chỉ có trong `--font-display` (T3 đạt). `global-error.tsx` còn nạp Inter nhưng không biến nào còn tham chiếu `--font-inter`, nên trang lỗi rơi về `system-ui` (fallback trong `var()`). Không gây lỗi. Ghi residual.
3. **Scrub CSS:** từng keyframe, selector hướng, khối nhóm, `animation-range` và quy tắc `focus-within` khớp `docs/design/cyberplex/preview.html:81-117`. Chỗ khác duy nhất là selector class của preview (`.sec-head .h2`, `.film__media`) được đổi sang thuộc tính (`[data-scrub-wipe]`, `[data-scrub-media]`), hợp lý. Không có glitch. Có bọc reduced-motion và `@supports`, có `@media print`, có `--scrub-inset: min(36%, 300px)` và `scrub-inset-0`. Không có JS hay scroll listener. `drawX` animate `transform` và `beamLine` animate `top`, đều giống preview (xem MINOR-7).
4. **Focus (T7):** `.chamfer-lg|md|sm|seat` và `.btn-primary` dùng vòng inset; `.btn-primary` dùng vòng tối. Button tự vẽ inset qua `focus-visible:shadow-[inset…]`. Tab active dùng `--focus-inset` tối. Dialog và AlertDialog có `outline-hidden`. Không thấy chỗ nào đặt outline lên phần tử clip-path. Hai lỗ nhỏ ghi ở MINOR-2 và MINOR-3.
5. **API components/ui:** chỉ đổi chuỗi class. Chữ ký export, props, `asChild` và Slot, `data-slot`, `sr-only "Đóng"`, Radix focus trap đều giữ nguyên. `gradient` vẫn là alias, hiển thị như `default`. Dialog và AlertDialog dùng fade cùng `zoom-in-96`, 200ms; dưới reduced-motion có quy tắc base `animation-duration: 0.01ms !important`. SelectContent và DropdownMenu không có clip-path nên không cắt portal. Chiều cao nút: default 46px, lg 56px, icon 44px, sm 44px ở mobile (36px ở desktop `md:h-9`, có từ trước task).
6. **Tương phản:** Badge danger, FormMessage, FormLabel lỗi và DropdownMenuItem destructive đã đổi sang `text-danger-text`. Không còn chữ `#FF003C` trên nền elevated trong `components/ui`. Nút destructive là chữ tối trên nền crimson (5.09, đạt).
7. **Test:** `layout.test.tsx` chỉ đổi phần font và token, và thêm test CSS (chamfer, scrub gate, đếm comment, focus). Assertion về `--text-caption` chuyển từ khối mobile sang toàn cục; không nới assertion nghiệp vụ nào. Test Scrub hợp lý nhưng khoá hành vi `--i` mặc định (xem MINOR-1).
8. **Verify:** xem bảng trên.
9. **Hồi quy màn khác:** xem phần Residual.

## Findings

### MAJOR

**MAJOR-1: Badge mất cỡ chữ HUD 11px trên mọi badge vì tailwind-merge xoá `text-hud`.**
- Vị trí: `apps/web/src/components/ui/badge.tsx:11` (base có `text-hud`) và `apps/web/src/lib/utils.ts:9-11` (nhóm `font-size` mở rộng chưa có `hud`).
- Cơ chế: `Badge` dựng class bằng `cn(badgeVariants({ tone }), className)`, tức qua twMerge. Trong tailwind-merge 3.7.0, `text-{x}` chỉ được coi là font-size khi `x` là cỡ dạng t-shirt hoặc có trong nhóm mở rộng. `hud` không có trong danh sách (`display, h1, h2, h3, body, body-sm, small, caption`), nên `text-hud` bị xếp vào nhóm **text-color** (`color: [isAny]`, `bundle-mjs.mjs:706`, `:1619`). Class tone đứng sau (`text-fg-secondary`, `text-success`, `text-danger-text`…) cùng nhóm nên `text-hud` bị loại.
- Hậu quả: mọi Badge (trạng thái đơn, vai trò, chip…) mất `font-size: 11px` và line-height 1.8, rồi kế thừa cỡ của phần tử cha (body 15px, bảng 13px). Kết quả là chữ HOA đậm, tracking 0.12em, to hơn thiết kế (tokens §2.2 `--text-hud`, §3.1 chip `--cut-sm`), dễ tràn trong bảng admin. Builder ghi "Badge theo tokens" nhưng không test nào render Badge qua `cn` nên lỗi không bị bắt (false confidence).
- Đề xuất: thêm `"hud"` vào nhóm `font-size` của `extendTailwindMerge` trong `lib/utils.ts`, và thêm một test render `<Badge tone="danger">` khẳng định class chứa cả `text-hud` lẫn `text-danger-text`.

### MINOR

- **MINOR-1: `<Scrub>` luôn ghi `--i` inline, làm hỏng cơ chế lệch pha theo cột mà spec yêu cầu.** Vị trí: `apps/web/src/components/motion/scrub.tsx:37,49` (`i = 0` mặc định) và test khoá hành vi này ở `__tests__/scrub.test.tsx:29`. Spec §16.4 (design-spec dòng 845) yêu cầu lưới phim đặt `--i` bằng CSS (`:nth-child(4n+k){--i:k-1;--n:4}`, tablet `2n`, mobile `--i:0`). Style inline luôn thắng stylesheet, và server component không truyền được `i` thay đổi theo breakpoint. Đề xuất: chỉ ghi `--i` khi có truyền `i` (giống cách xử lý `n`), vì CSS đã có `var(--i, 0)`; sửa test tương ứng. Nên sửa ngay vòng 2 vì phase 2 phụ thuộc component này.
- **MINOR-2: nút đóng Dialog nằm sát đường cắt chamfer.** `apps/web/src/components/ui/dialog.tsx:58`: nút ở `top-3 right-3` (12px), cỡ 44px, có góc trên-phải nằm đúng trên đường chéo cắt 24px của `panel-cyber`. Phần góc của `ring-2` và của outline toàn cục (offset 3px) bị clip-path cắt. Vòng focus vẫn thấy phần lớn. Đề xuất: lùi nút vào (vd `top-4 right-5`) hoặc dùng vòng inset cho nút này.
- **MINOR-3: danh sách focus-inset thiếu `.frame` và `.panel-cyber`.** `apps/web/src/app/globals.css:202-206`. Phần tử focus được (link hoặc card) dùng class `frame` sẽ bị cắt outline. Hiện chưa có chỗ dùng; phase 2 cần nhớ (hoặc thêm vào danh sách ngay).
- **MINOR-4: Sheet chưa có panel chamfer và viền gradient.** `apps/web/src/components/ui/sheet.tsx:64` chỉ đổi sang `border-line-brand bg-panel`, trong khi task mục 6 và design-spec §16.3 ghi "Dialog/Sheet/AlertDialog panel chamfer-lg + viền gradient". Có thể là lựa chọn hợp lý cho drawer sát mép, nhưng phải ghi lý do trong task file, hoặc áp dụng theo spec.
- **MINOR-5: Toast chưa có chuyển động vào `translateY(12px) → 0` 300ms** (design-spec §16.3). Sonner có animation riêng, nên có thể chấp nhận; ghi rõ là giữ mặc định của sonner.
- **MINOR-6: thiếu token `--dur-wipe: 700ms`, `--stagger: 90ms`** của tokens §5.2. Hiện chưa dùng vì chuyển động chạy theo cuộn. Thêm vào cho đủ hợp đồng token, hoặc ghi rằng hai token này lỗi thời so với mô hình scrub.
- **MINOR-7: `drawX` animate `transform`, `beamLine` animate `top`** (`globals.css:325,327`). Cả hai sao chép từ preview và chỉ dùng cho trang trí, nhưng nằm ngoài danh sách được phép của tokens §4.3 và NFR-19 (`top` gây layout). Chấp nhận vì theo nguồn đã kiểm; nên ghi là ngoại lệ có chủ đích.
- **MINOR-8: `globals.css` dài 369 dòng**, vượt ngưỡng 300 dòng của AI-readable. tokens §5.2 yêu cầu một file nên không chặn. Đây là 1 indicator, dưới ngưỡng FAIL (≥ 3).
- **MINOR-9: `buttonVariants({ variant: "link" })` gọi trực tiếp (không qua `cn`) vẫn dịch 1px khi hover.** Trong CSS build, `hover:[transform:none]` đứng trước `hover:[transform:translateY(-1px)]` nên bị thắng. Qua `<Button>` thì twMerge đã gộp đúng. Ảnh hưởng nhỏ.

## Residual (việc của task sau, không phải lỗi task-01)

- Biến thể `outline` nay là khung crimson (đúng tokens §5.3), nhưng nhiều chỗ ở admin và trang khách đang dùng `outline` cho hành động trung tính ("Huỷ", "Xem"). Việc này xung đột với khoá vai trò màu T2 ("crimson = nguy hiểm"). Cần remap ở từng chỗ gọi trong phase 2. `ghost` và `secondary` nay là ô có khung (đúng §5.3), nên nút icon trong bảng admin sẽ có khung; phase 2 cần rà lại.
- Ở chỗ gọi: `shadow-cta-glow` nay là class không có tác dụng (login, register, quên/đặt lại mật khẩu, xác nhận email). `className="font-semibold"` ghi đè `font-bold` của CTA. `sessions-card.tsx:52` vẫn dùng `text-danger` và `border-danger-line` (không còn tác dụng vì outline dùng shadow). `phim/[slug]/page.tsx:205` dùng `bg-gradient-brand` (alias nay ra vàng đặc, không có clip, outline focus vẫn đúng). Còn nhiều `text-danger` và `text-caption` ở màn. Tất cả thuộc task-02 hoặc phase 2.
- `rounded-*` ở màn ra vuông vì radius = 0. Đây là hành vi mong muốn; chỗ cần chamfer sẽ đổi ở phase 2.
- Hai chỗ gọi `DialogContent` (`change-email-dialog.tsx:81`, `delete-account-dialog.tsx:283`) truyền `border-border-subtle bg-surface`, có thể lẫn với `panel-cyber`. Khác biệt nhìn gần như không thấy; dọn ở phase 2.
- `global-error.tsx` vẫn nạp Inter nhưng không dùng (trang lỗi ra system-ui). Không hỏng; dọn khi đụng file.
- Dưới reduced-motion, hover nút vẫn dịch 1px nhưng tức thì (transition 0.01ms). Đạt chữ "rút về tức thì" của NFR-19.
- Chưa có Playwright trên màn thật dùng `<Scrub>` (AC-32). Thuộc task motion ở phase sau.

## Verdict

**FAIL**: có 1 MAJOR (MAJOR-1: Badge mất `text-hud` do twMerge, là vi phạm token trên shared component và không có test bắt).

Danh sách sửa cho vòng 2 (builder):
1. `apps/web/src/lib/utils.ts`: thêm `"hud"` vào nhóm `font-size` của `extendTailwindMerge`, và thêm test Badge qua `cn` (MAJOR-1).
2. `apps/web/src/components/motion/scrub.tsx`: chỉ ghi `--i` khi có truyền `i`; sửa `scrub.test.tsx:29` (MINOR-1).
3. `apps/web/src/components/ui/sheet.tsx`: áp chamfer và viền gradient theo §16.3, hoặc ghi lý do không áp trong task file (MINOR-4).
4. Tuỳ chọn: lùi nút đóng Dialog khỏi đường cắt (MINOR-2), thêm `.frame` và `.panel-cyber` vào danh sách focus-inset (MINOR-3).
