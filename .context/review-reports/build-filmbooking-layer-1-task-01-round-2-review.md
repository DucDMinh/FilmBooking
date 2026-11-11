Agent: reviewer

# Review: build-filmbooking layer-1 task-01, round 2 (provisional)

Review level: STRICT, unchanged from round 1. The diff is the shared token layer and the shared UI component library.

Context: partway through the round, the dispatcher corrected the brief. Mobile web responsive is still in scope, so MAJOR-1 from round 1 stays open, and the dispatcher asked for a provisional verdict. The builder appears to be editing at the same time. This report records the state of the worktree at about 11:11–11:12, and some of it may already have changed.

## Verify commands + result

| Command | Result |
|---|---|
| `pnpm build` | PASS. Next 16.4.6. Routes: `/_not-found`, `/khong-co-quyen`. |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | **FAIL**. web: 9 passed, 1 failed (10 tests); shared 14/14. The failing test is `globals.css > thang chữ mobile (< 768px) theo design-tokens §2.2, sàn 11px`, which fails with `expected '' to contain '--text-display: 32px'`. |

## Status of round-1 findings

| Finding | Status | Evidence |
|---|---|---|
| MAJOR-1: mobile type scale and 11px caption floor | **OPEN, in progress** | globals.css now has an override block (`@media (max-width: 767.98px)` at line 163, `--text-caption: 11px` at line 169). The new test does not pass, though. Grep shows `layout.test.tsx:61` as `/@media (max-width: 767.98px)s*{s*:roots*{([^}]*)}/`. The backslashes in `\s*` and the escapes for `(`, `)` and `.` appear to be missing, so the regex never matches and `mobile === ""`. Fix: escape the regex properly, e.g. `/@media \(max-width: 767\.98px\)\s*\{\s*:root\s*\{([^}]*)\}/`, then rerun the test. |
| MINOR-1: package.json scripts | Closed (accepted by dispatcher) | |
| MINOR-2: route `/khong-co-quyen` vs task file | Closed (accepted by dispatcher); the task file still needs reconciling at close-out | |
| MINOR-3: Button `link` overridden by size | Closed | `button.tsx:30` `compoundVariants: [{ variant: "link", class: "h-auto min-h-0 px-0" }]` |
| MINOR-4: `outline-none` focus ring | Closed | Grep finds no `outline-none` in `apps/web/src`; button uses `outline-hidden` |
| MINOR-5: test hygiene | Closed | `layout.test.tsx:25` `vi.restoreAllMocks()`; the config is now `vitest.config.mts` and the ESM warning is gone |
| MINOR-6: global-error | Closed | `src/app/global-error.tsx` provides its own `<html lang="vi">`/`<body>`, reloads Inter and imports globals.css. The builder says Next 16.4.6's `error-boundary.js:113-114` passes both reset and retry. I did not re-check that this round. |

## New observations (MINOR)
- `global-error.tsx:40`: the "Về trang chủ" `<a>` has no 44px touch target on mobile. Fix: add `inline-flex min-h-11 items-center`.
- `apps/web/next-env.d.ts` is now an untracked file. Committing it is normal Next practice; the dispatcher should confirm it belongs in the commit.

## Responsive Checklist Gate
Only the heading item changes from round 1. It is still FAIL until MAJOR-1 is closed and its test passes. The other items are as in round 1: OK, or N/A where they don't apply.

## Skill gates
Same as round 1. aislop and ocr are not installed. oxlint is not configured. AI-readable is OK. ai-friendly-web and blitzstrike are N/A.

## Verdict: ❌ FAIL (provisional)

The only blocker is MAJOR-1: the mobile type-scale test fails. The other round-1 findings are closed.
