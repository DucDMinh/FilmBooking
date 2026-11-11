Agent: reviewer

# Review: build-filmbooking layer-1 task-01, round 1

Scope: scaffold Next.js App Router, Tailwind v4 CINEMO tokens, shadcn/ui, and the 404/500/403 system pages.
Worktree: `E:\FilmBooking\.worktrees\layer-1__task-01` (uncommitted: 1 modified file, 27 new files)

## Review level: STRICT

Reason: the diff adds the base token layer (globals.css) and the shared UI component library (16 shadcn components plus `cn`) that every later screen will import. It also adds the 403 surface. Shared components and the shared token layer are a STRICT trigger.

Blast radius: all of `apps/web`. Every later UI task inherits the tokens, Button/Input/Select/Dialog/Form, the root layout (font, lang, Toaster) and next.config (transpilePackages for `@filmbooking/shared`). The modified `apps/web/package.json` scripts change what the root `pnpm -r` verify commands pick up.

## Verify commands + result

All commands were run in the worktree.

| Command | Result |
|---|---|
| `pnpm build` | PASS. Next 16.4.6 (Turbopack). Routes: `/_not-found`, `/khong-co-quyen`, both static. |
| `pnpm lint` | PASS (shared + web) |
| `pnpm typecheck` | PASS (shared + web) |
| `pnpm test` | PASS. shared 14/14, web 8/8. Warning: vitest.config.ts is ESM loaded as CJS because there is no `"type":"module"`. |

`next start` was not run, so no process is left running.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| build/typecheck/lint/test PASS | OK | Table above |
| globals.css matches design-tokens.md; no light mode or theme toggle | Partly met, see MAJOR-1 | Lines 1–160 match §4.2 exactly (compared line by line). No `.dark`, no `prefers-color-scheme`, `color-scheme: dark`. sonner is fixed to `theme="dark"` and next-themes is not used. The §2.2 mobile type scale and the user's 11px mobile caption floor (design-spec.md:741) are missing. |
| 404/500/403 in Vietnamese with a link to home | OK | not-found.tsx, error.tsx, khong-co-quyen/page.tsx; tests cover heading, link `href="/"` and the Retry button |
| No SERVICE_ROLE or non-`NEXT_PUBLIC_*` variables in client code | OK | Grep for `process.env`, `SERVICE_ROLE` and `next-themes` in `apps/web/src` found nothing |

Contrast (WCAG): `--primary-foreground` and `--destructive-foreground` use `--color-fg-on-brand` (#0B0D12), so text on coral and danger buttons is dark, as design-spec §15 requires (§5 table: 6.52 / 6.77). OK.

No raw hex in components. The only hex outside CSS is `themeColor: "#0B0D12"` in layout.tsx, a meta value with a comment explaining why. The tests contain hex only in assertions.

## Responsive Checklist Gate

Breakpoints 375/768/1280. No browser was available, so these results come from reading the CSS.

| Item | Result | Evidence |
|---|---|---|
| No horizontal scroll | OK (CSS math) | System pages use `w-full max-w-lg px-4`, flex-col, buttons `w-full sm:w-auto`. The longest h1 wraps; nothing has a fixed width. |
| Mobile-first `min-width` queries | OK | Tailwind `sm:` and `md:` throughout. The only `max-width` query is the iOS 16px input rule copied from §4.2. |
| Grid uses auto-fit/minmax | N/A | No grid in this diff |
| Container not fixed px | OK | `max-w-lg` |
| Font-size in rem | OK, token-mandated | px values come from the approved token file (§4.2 lines 339–346, copied verbatim). The builder did not introduce them. |
| Heading fluid / mobile scale | **FAIL, see MAJOR-1** | No clamp (acceptable, since the design system uses per-breakpoint steps), but the per-breakpoint step from §2.2 is not implemented either. h1 stays 32px at 375 instead of 26; display stays 44 instead of 32; caption stays 10 instead of 11. |
| Media: max-width, aspect-ratio, srcset | N/A | No images in this diff |
| Touch target ≥ 44px | OK | Button h-11 / size-11; Input h-11 below md; Checkbox 20px + `after:-inset-3` = 44px; Dialog/Sheet close size-11; Select/Dropdown items `min-h-11` below md. Tabs trigger height not checked (read cap), see Residual. |
| Nav hamburger | N/A | No nav in this task |
| Table scroll wrapper | Not checked | table.tsx not read in detail (read cap), see Residual |
| No bare 100vh | OK | `min-h-dvh` (body and pages) |
| prefers-reduced-motion | OK | globals.css base layer |
| No `overflow:hidden` hiding bugs | OK | None in the pages |

The heading item fails, so the gate fails.

## Skill gates

| Gate | Result |
|---|---|
| aislop | skip, `aislop` not installed (exit 127) |
| oxlint (anti-slop) | skip, oxlint is not configured in the repo. An ad-hoc `npx oxlint apps/web/src` with default rules reported no diagnostics. ESLint is the configured linter and passes. |
| ocr (open-code-review) | skip, ocr not installed |
| AI-readable | OK. Names are clear, functions are short, comments explain why (for example the twMerge extension and why `weight` is not passed to Inter). Fewer than 3 indicators. |
| ai-friendly-web | N/A. This is a scaffold with no public content pages yet. |
| blitzstrike | N/A. No auth, API or input handling in this task. |

## Findings

### [MAJOR-1] Mobile type scale and the 11px mobile caption floor are not implemented
- File: `apps/web/src/app/globals.css:52-59`
- What's wrong: `--text-*` has only desktop values. design-tokens §2.2 defines the mobile (<768) column as display 32, h1 26, h2 20, h3 17, caption 11. User decision #3 (design-spec.md:608 and :741) says "Sàn 10px desktop / 11px mobile". AC2 requires matching the tokens in design-tokens.md. Every later screen inherits this layer, and on 375px the system pages already render h1 at 32px and display at 44px.
- Root cause: the §4.2 code block in design-tokens.md is internally inconsistent with §2.2 and the user's decision. The builder copied it verbatim, so this is a gap in the source doc rather than a builder slip, but the deliverable still misses a ratified decision.
- Fix (small, inside the file list): Tailwind v4 utilities resolve through `var(--text-*)`, so add this to globals.css:
  ```css
  @media (max-width: 767.98px) {
    :root { --text-display: 32px; --text-h1: 26px; --text-h2: 20px; --text-h3: 17px; --text-caption: 11px; }
  }
  ```
  Alternatively, write it mobile-first with `@media (min-width: 768px)` restoring the desktop values. Add a test that asserts the mobile override exists. The dispatcher should also record a reconcile note for the design-tokens §4.2 block so later tasks don't re-copy the gap. That doc fix goes through the proper process; the builder should not edit intent docs.

### [MINOR-1] Scope: `apps/web/package.json` modified outside the file list
- The task Notes say not to modify package.json and to report Blocked for files outside the list. The builder added a `scripts` block. No dependencies or lockfile changed.
- AC1 cannot be met without these scripts, so the task plan is what's wrong. The change is reasonable, but the dispatcher needs to ratify it and confirm that no other layer-1 task touches `apps/web/package.json`, to avoid a merge conflict.

### [MINOR-2] Task file route does not match the implementation
- `tasks/build-filmbooking/layer-1-task-01.md:42` lists `apps/web/src/app/forbidden/page.tsx`, but the build ships `/khong-co-quyen` (which follows design-spec). Reconcile the task file at close-out.

### [MINOR-3] Button `link` variant is overridden by the default size
- `apps/web/src/components/ui/button.tsx:20,23`: cva puts size after variant, so twMerge lets `h-11 px-5` override `h-auto px-0`. The link variant becomes a 44px padded box instead of inline text.
- Fix: add a `size: "inline"` option, or use `compoundVariants` for link.

### [MINOR-4] Focus ring is a box-shadow over `outline-none`, so it disappears in forced-colors mode
- `button.tsx:9`, `input.tsx:12`, `checkbox.tsx:18`, and similar: `outline-none` removes the global `:focus-visible` outline, and Windows High Contrast does not paint box-shadow rings.
- Fix: use `outline-hidden` (Tailwind v4 keeps a transparent outline in forced-colors), or keep the base outline.

### [MINOR-5] Test hygiene
- `layout.test.tsx:80`: the `console.error` spy is never restored. Add `vi.restoreAllMocks()` in afterEach.
- `apps/web/package.json` has no `"type": "module"`, which causes vitest's ESM-as-CJS warning. Harmless today, but it will break when Vite switches to the native config loader. Rename to `vitest.config.mts`, or decide on `"type":"module"`.

### [MINOR-6] Follow-ups (not blocking)
- The "Về trang chủ" links point to `/`, which is not in the route table yet (it will come from the home page task).
- There is no `global-error.tsx`, so errors thrown in the root layout itself are not caught by the Vietnamese 500 page. Consider adding it in a later task.
- `h1` uses `font-bold` (750) while §2.2 says 760. Trivial.

## Residual risk
- No browser check, so the responsive results are CSS math only.
- tabs.tsx trigger height and table.tsx scroll wrapper were not read in detail (STRICT read cap reached).
- error.tsx uses the `retry` prop. Next 16.4.6's `error-boundary.d.ts` declares both `reset` and `retry`, but runtime passing of `retry` was not confirmed. The test injects `retry` itself, so it would not catch a mismatch.

## Verdict: ❌ FAIL

Reason: MAJOR-1 (and the responsive gate item it causes). To fix: add the mobile `--text-*` override to globals.css and a test for it. MINOR-1 and MINOR-2 need dispatcher action. MINOR-3 to MINOR-5 are recommended in the same round.
