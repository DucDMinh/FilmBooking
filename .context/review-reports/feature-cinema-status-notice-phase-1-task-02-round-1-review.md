# Review — feature-cinema-status-notice · phase-1-task-02 · round 1

Agent: reviewer
Task: `tasks/feature-cinema-status-notice/phase-1-task-02.md` (template mail `CINEMA_STATUS_NOTICE`)
Contract: `spec/changes/2026-11-18-cinema-status-notice.md`, spec R-33, R-136, AC-27, AC-30
Files reviewed: `apps/api/src/modules/mail/templates.ts`, `apps/api/test/mail-templates.spec.ts`
Cross-checked against: `supabase/migrations/20261118100000_cinema_status_schedule.sql` (task-01, in progress; read only for the payload and job behaviour)

## Review level
NORMAL

## Reason
This is a pure template change with no DB, auth or API changes. However, it renders customer-facing text about money (refund deadline), built from strings stored in the DB, so I checked the escaping and the cross-boundary behaviour against the migration.

## Blast radius
- New exports `renderCinemaStatusNoticeEmail` and `formatDateVN`, plus a new router case `CINEMA_STATUS_NOTICE`.
- Shared `NoteKind` gains `info` (additive; existing `warning`/`danger` are unchanged).
- No other template was touched. All existing template tests still pass.
- The email goes to **every confirmed account** (mass mail), so a wording error reaches every customer.

## Verify commands + result
| Command | Result |
|---|---|
| `pnpm --filter ./apps/api test -- mail-templates` | **Blocked** by agent-guard (not in the allowlist) |
| `pnpm --filter ./apps/api lint` | **Blocked** (not in the allowlist) |
| `pnpm --filter ./apps/api typecheck` | **Blocked** (not in the allowlist) |
| `pnpm test` (allowlisted substitute) | PASS: shared 31, api 29 files / 623 tests, web 47 files / 595 tests, scripts 31 |
| `pnpm lint` (substitute) | PASS (shared/api/web) |
| `pnpm typecheck` (substitute) | PASS (shared/api/web) |
| oxlint | skip, oxlint not configured (no `.oxlintrc` in the repo) |
| aislop / ocr | skip, not installed / not in the allowlist |
| Mutation test | **not attempted**: the reviewer cannot edit source (Write is limited to review-reports). I reasoned through mutations instead (see below). |

## Findings

### F1 — MAJOR — Refund instruction leaves out shows on the effective day itself (mismatch with the DB job)
- `apps/api/src/modules/mail/templates.ts:690-692` (`refundNoticeContent`): "Quý khách đã đặt vé cho các suất chiếu diễn ra **sau ngày {X}** … đến quầy **trước ngày {X}**".
- DB:
  - `schedule_cinema_status` sets `scheduled_effective_at = now() + interval '7 days'` (migration :382). The effective moment therefore falls partway through day X (for example 15:00 VN).
  - `apply_due_cinema_status_changes` cancels every show with `st.starts_at > now()` at the moment the job runs (migration :477-482), and their `paid` orders become `affected`.
- Consequence:
  - Shows on **day X after the effective time** are cancelled.
  - In Vietnamese, "sau ngày X" reads as starting from X+1, so the people holding tickets for those day-X shows are **not told** they need to come in for a refund. They also get no per-order email (R-33 says no per-order mail).
  - Customers lose money, and the text contradicts what the system actually does.
- Note: the task design (`phase-1-task-02.md:9`) spelled out the "sau ngày" wording, so the builder followed it. Still, the actual DB behaviour wins, and the fix stays in the template.
- Fix:
  - Change it to "các suất chiếu diễn ra **từ ngày {X} trở đi**" (html + text). Keep "trước ngày {X}" as the deadline; it is conservative and consistent with that wording.
  - Update the matching test assertion (`mail-templates.spec.ts:272-279` currently asserts `"sau ngày 25/11/2026"`).

### F2 — MAJOR — Correction email states the cinema is "vẫn hoạt động bình thường" even when it is closed
- `apps/api/src/modules/mail/templates.ts:782-790` (`renderCinemaStatusCorrection`):
  - subject `[CINEMO] Đính chính: Rạp X vẫn hoạt động bình thường`
  - body "Rạp tiếp tục hoạt động như bình thường, quý khách không cần đến rạp hoàn tiền vé"
  - This text is the same for every target.
- DB:
  - A schedule is cancelled when `p_status = v_cinema.status` (migration :363).
  - The payload carries `target_status = scheduled_status` (:372) and `current_status = v_cinema.status` (:415).
- Cases that produce a false email sent to every customer:
  - `TEMP_CLOSED`, scheduled `OPEN`, admin cancels: the cinema **stays closed**, yet the email says "vẫn hoạt động bình thường". Customers may travel to a closed cinema.
  - `COMING_SOON → OPEN` cancelled: the cinema has never operated.
  - `TEMP_CLOSED → CLOSED` cancelled: the cinema is still temporarily closed.
- The payload already has `current_status`, but `readCinemaNoticeFields` (`templates.ts:706-720`) never reads it.
- The test `mail-templates.spec.ts:330-341` loops over all four targets (including `OPEN`) and asserts this subject, which locks the wrong behaviour in.
- Fix:
  - When `current_status !== "OPEN"` (or target `OPEN`), use different wording, for example "Đính chính: lịch {mở cửa/…} của rạp X từ ngày … đã được huỷ, rạp giữ nguyên trạng thái hiện tại". Do not say "vẫn hoạt động bình thường" or "không cần hoàn tiền".
  - Add tests for `target OPEN + current TEMP_CLOSED` and `current OPEN + target CLOSED`.
  - This refines R-136's "rạp tiếp tục hoạt động" (which is only true when the cinema is OPEN) and needs no spec change.

### F3 — MINOR — XSS test is vacuous for the `cinema_code` path
- `mail-templates.spec.ts:405-421`: `cinema_code: '"><img src=x>'` is used with target `CLOSED`. The button only renders for `OPEN`, so the code never reaches the HTML and `not.toContain("<img")` proves nothing for the URL.
- Reading the code, the path is safe: `encodeURIComponent` + `escapeHtml` in `button()` (`templates.ts:154-155`, ~`735`).
- Fix: add one case with `target_status: "OPEN"` and a malicious code.

### F4 — MINOR — Timezone tests only assert the subject
- `mail-templates.spec.ts:362-372`: the 17:00Z → 26/11 test checks only `subject`. It does not check the deadline in the noteBox or the "Ngày đóng cửa" row. The code shares one `f.date`, so the risk is low; asserting `text` contains "trước ngày 26/11/2026" would be enough.

### F5 — MINOR (pre-existing pattern) — DB string goes straight into the subject
- `templates.ts:752`, `templates.ts:783`: `cinema_name` goes into the subject unescaped. This is acceptable because the subject is not HTML. The transport is nodemailer (`mail.transport.ts:1`), which normalises CR/LF in header values, so there is no header injection. Other templates (`templates.ts:275/412/460`) follow the same pattern. No test covers it, so this is non-blocking.

### F6 — INFO
- When `effective_at` is missing the fallback text "từ ngày sắp tới" (`templates.ts:751`) reads awkwardly. The DB always sends `effective_at`, so this is cosmetic.
- `templates.ts` is now ~860 lines (>300). The file was already over the limit before this change; the diff only extends it. I am noting it, not blocking on it.
- Vietnamese diacritics are complete and the tone is polite. Unknown target falls back to the generic template without throwing (`templates.ts:646-652`, test :352-361). `hotline` null is handled with `?? DEFAULT_HOTLINE`, and `customer_name` null falls back to "quý khách" (matches `nullif(btrim(full_name),'')` in the migration). `formatDateVN` uses `timeZone: "Asia/Ho_Chi_Minh"`, which is correct.
- `jobs.controller`/`mail.service` do not whitelist kinds, so no change is needed there (confirmed: `mail.service.ts:110-112`).

## Reasoned mutation table (not run)
| Mutation | Would a test fail? |
|---|---|
| Change the deadline "trước ngày {date}" to another date or wording | Yes (`:273-279`, `:295`) |
| Drop `timeZone` in `formatDateVN` | Yes (17:00Z → 26/11 test) |
| Add the refund noteBox to OPEN or the correction email | Yes (`not.toContain(REFUND_DEADLINE)`) |
| Remove `escapeHtml` around the cinema name in the paragraph | Yes (`<script>`) |
| Remove encode/escape on the `cinema_code` URL | **No** (F3) |
| Correction email ignores `current_status` | **No**, and the test asserts the wrong behaviour (F2) |

## Verdict
**FAIL**. F1 and F2 are both MAJOR: the mass email sends wrong information that affects customers' money and travel, and it contradicts the actual behaviour of `schedule_cinema_status` / `apply_due_cinema_status_changes`. The fixes are small and stay in the template and its tests (the round 2 builder still must not touch `supabase/**`). F3 and F4 should go into the same round.
