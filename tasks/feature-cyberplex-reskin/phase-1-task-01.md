# Feature cyberplex-reskin · phase-1-task-01 — Nền tảng: tokens, font, utility, focus, scrub CSS + `<Scrub>`

- Classification / Risk: MODIFY (UI). Reviewer **STRICT** (file dùng chung toàn app: `globals.css`, `layout.tsx`, `components/ui/*`). **Chạy tuần tự, đầu tiên**; task-02 và toàn bộ phase 2 phụ thuộc.
- Hợp đồng: `spec/changes/2026-11-19-cyberplex-reskin.md`. Spec: NFR-19, NFR-12, AC-32. Thiết kế: `skills/react-nodejs/design-tokens.md` (§0-§6, §8), `.context/design-spec.md` §16.1-§16.5, `docs/design/cyberplex/preview.html` (nguồn CSS scrub đã kiểm).

## Thiết kế
1. `apps/web/src/app/globals.css`: thay giá trị token theo tokens §5.2, **giữ nguyên tên** (`--color-brand`, `--color-fg-*`, `--color-seat-*`...). Thêm token mới (`--color-danger-text`, `--color-brand-line`, `--color-line-brand`, `--cut-*`, `--clip-*`, `--gradient-brand` mới, `--scrub-*`, `--enter-*`, `--scale-*`). shadcn: `--radius: 0`, biến theo §5.1. Bỏ `--shadow-cta-glow`.
2. `layout.tsx`: bỏ `Inter`; nạp bằng `next/font/google`: **Chakra Petch** (600,700; subsets latin, latin-ext, vietnamese), **Be Vietnam Pro** (400,500,600,700; latin, latin-ext, vietnamese), **JetBrains Mono** (400,500; latin, latin-ext, vietnamese), **Orbitron** (700,900; latin). Biến `--font-chakra`, `--font-be-vietnam`, `--font-jetbrains`, `--font-orbitron`; `--font-heading/-sans/-mono/-display` theo tokens §5.2. `display: 'swap'`.
3. `@utility`: `chamfer-lg|md|sm`, `frame` (khung 2 lớp), `hud`, `btn-primary` focus inset. Focus (T7): vòng inset cho phần tử `clip-path`, outline cho phần còn lại. `:focus-visible` toàn cục.
4. **Scrub CSS** (sao chép cấu trúc từ preview): keyframes `scrubPop`, `wipeIn`, `drawX`, `beamOpen`, `beamLine` (**không glitch**), hướng `data-scrub=ltr|left|right|down|beam`, `[data-scrub-group]`, bọc `@media (prefers-reduced-motion: no-preference)` + `@supports (animation-timeline: view())`, `@media print` tắt. `--scrub-inset: min(36%, 300px)` và quy tắc `--scrub-inset: 0px` cho footer / `/dat-ve/*` / trang ngắn (class tiện ích `scrub-inset-0`). Thêm `[data-scrub]:focus-within { animation: none; opacity: 1; translate: 0 0; scale: 1 }`. **Không JS.**
5. `apps/web/src/components/motion/scrub.tsx` (server component): `<Scrub kind i n as?>` (gắn `data-scrub` + `--i/--n`), `<ScrubGroup n>` (gắn `data-scrub-group`). Không state/effect.
6. `components/ui/*` (shadcn: button, badge, input, select, textarea, tabs, dialog, alert-dialog, sheet, sonner, table, checkbox, ...): radius 0; Button biến thể theo tokens §5.3 (`primary` vàng đặc chamfer-md, `danger`, `outline`, `ghost`); Badge/chip chamfer-sm; Dialog/Sheet/AlertDialog panel chamfer-lg + viền gradient, vào fade + scale .96→1 200ms; Toast viền trái 3px. Input/Select vuông, viền `border-input`, focus viền vàng. **Không đổi API props/hành vi** của các component.
7. Thay `bg-gradient-brand` (3 chỗ) bằng nút primary; `rounded-pill|full` cho chip/badge → `chamfer-sm` ở phạm vi file task này; phần còn lại ở task sau.

## KHÔNG làm
Không đổi route, logic, API, DB, `packages/shared`, `apps/api`, `supabase`. Không sửa màn cụ thể (site-header/footer = task-02; màn khách/booking/admin = phase 2). Không `window.addEventListener('scroll')`, không thêm thư viện animation. Không `git add/commit/checkout/reset/stash/clean` trong worktree ngoài commit task.

## Files to Modify
`apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/ui/*`, `apps/web/src/components/motion/scrub.tsx` (mới), test cho `Scrub` (render thuộc tính) nếu hợp lý.

## Verify
`pnpm --filter ./apps/web typecheck`, `pnpm --filter ./apps/web lint`, `pnpm --filter ./apps/web test` (test hiện có vẫn PASS; test bám class cũ thì sửa tối thiểu và ghi rõ). Kiểm: `pnpm --filter ./apps/web build` không vỡ.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: giao diện CINEMO coral, font Inter, radius 8-22.
- Expected: token CYBERPLEX, 4 font đúng subset, `Scrub` + CSS scrub có sẵn, focus inset.
- Actual after: _(builder điền)_
- Evidence: _(builder điền)_
- Status: pending
