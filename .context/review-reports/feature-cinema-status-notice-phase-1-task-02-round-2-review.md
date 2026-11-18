# Review — feature-cinema-status-notice · phase-1-task-02 · round 2

Agent: reviewer
Task: `tasks/feature-cinema-status-notice/phase-1-task-02.md` (template mail `CINEMA_STATUS_NOTICE`)
Round 1 report: `.context/review-reports/feature-cinema-status-notice-phase-1-task-02-round-1-review.md` (FAIL: F1, F2 MAJOR; F3–F5 MINOR)
Files reviewed: `apps/api/src/modules/mail/templates.ts`, `apps/api/test/mail-templates.spec.ts` (`git diff`)
Cross-checked: `supabase/migrations/20261118100000_cinema_status_schedule.sql` (`schedule_cinema_status` :363-424, `apply_due_cinema_status_changes` :461-488), enum `cinema_status` (`20261111010000_core_identity_chain.sql:24` = COMING_SOON/OPEN/TEMP_CLOSED/CLOSED)

## Review level
NORMAL

## Reason
Pure template change + tests; no DB/auth/API contract change. Content is a mass email about money (refund deadline) and cinema availability, so wording was checked against the real DB payload/job behaviour.

## Blast radius
- New export `renderCinemaStatusNoticeEmail`, `formatDateVN`; router case `CINEMA_STATUS_NOTICE`; `NoteKind` gains `info` (additive).
- No other template body changed (diff only adds). Mass mail to every confirmed account.

## Verify commands + result
| Command | Result |
|---|---|
| `pnpm test` | PASS — shared 31; api 29 files / 632 tests (round 1: 623, +9 new); web 47 / 595; scripts 31 |
| `pnpm lint` | PASS (shared/api/web) |
| `pnpm typecheck` | PASS (shared/api/web) |
| `pnpm --filter ./apps/api …` | not attempted (blocked in round 1, not re-tried) |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, not installed / not in allowlist |

## Verification of round-1 findings

### F1 (refund wording) — FIXED
- `refundNoticeContent` (templates.ts, new helper): "các suất chiếu diễn ra **từ ngày X trở đi** … đến quầy vé **trước ngày X**". Used for both html (bold) and text (identity emphasize) via `cinemaFollowUp` → html and text cannot drift.
- Matches DB: effective = `now() + 7 days` (:382, mid-day), job cancels `starts_at > now()` (:481) → day-X shows after the effective time are covered.
- Mutation: reverting to "sau ngày X" → red at the CLOSED noteBox test (`toContain("từ ngày 25/11/2026 trở đi")` + `not.toContain("sau ngày 25/11/2026")`, both html and text) and the 17:00Z timezone test.

### F2 (correction falsely saying "vẫn hoạt động") — FIXED
`readCinemaNoticeFields` now reads `current_status` (upper/trim); `renderCinemaStatusCorrection` branches on `CLOSED_STATE_PHRASES.get(currentStatus)`.
Truth table vs. DB payload (on cancel: `target_status` = cancelled `scheduled_status`, `current_status` = `v_cinema.status`, :372/:414-415):

| current | target (cancelled) | Output | Correct? |
|---|---|---|---|
| OPEN | CLOSED / TEMP_CLOSED / COMING_SOON | subject "vẫn hoạt động bình thường"; "không cần đến rạp hoàn tiền" | Yes — shows continue |
| OPEN | OPEN | same | Unreachable (cannot schedule OPEN while OPEN) |
| TEMP_CLOSED | OPEN | neutral subject; "giữ nguyên trạng thái hiện tại (đang tạm đóng cửa). Ngày mở cửa dự kiến không còn áp dụng." | Yes |
| TEMP_CLOSED | CLOSED / COMING_SOON | neutral; "(đang tạm đóng cửa)"; no reopen sentence | Yes |
| COMING_SOON | OPEN | "(đang ở trạng thái sắp khai trương)" + reopen sentence | Yes |
| COMING_SOON | CLOSED / TEMP_CLOSED | "(đang ở trạng thái sắp khai trương)" | Yes |
| CLOSED | OPEN | "(đã đóng cửa)" + reopen sentence | Yes |
| CLOSED | TEMP_CLOSED / COMING_SOON | "(đã đóng cửa)" | Yes |
| missing | any | treated as OPEN | DB always sends `current_status` (enum column); acceptable fallback (INFO) |
| unknown target | any | generic "thay đổi trạng thái hoạt động" | Yes, no throw |

No non-OPEN branch contains "vẫn hoạt động", "tiếp tục hoạt động", "không cần đến rạp hoàn tiền", or the refund deadline (subject, preheader, body all branched).
- Mutation: dropping the `current_status` read → all four "KHÔNG hoạt động" tests red (subject + `expectNoFalseClaims`). Making the reopen sentence unconditional → `TEMP_CLOSED -> CLOSED` test red (`not.toContain("Ngày mở cửa dự kiến")`). Dropping it → TEMP_CLOSED/COMING_SOON→OPEN tests red.
- The old test that locked in the wrong behaviour (looping target OPEN under the "vẫn hoạt động" subject) is gone; the OPEN-current loop now only covers CLOSED/TEMP_CLOSED/COMING_SOON × {OPEN, missing}.

### F3 (vacuous XSS test for cinema_code) — FIXED
New test uses `target_status: "OPEN"` so the button renders; asserts `toContain("Xem lịch chiếu")`, `not.toContain("<img")`, and the exact `href` with `encodeURIComponent(code)`. Removing `encodeURIComponent` → href assertion red.

### F4 (timezone tests only checked subject) — FIXED
17:00Z test asserts html+text contain "trước ngày 26/11/2026", "từ ngày 26/11/2026 trở đi", no "25/11/2026", and text "Ngày đóng cửa: 26/11/2026". 23:30Z test likewise asserts the deadline in html+text.

### F5 (subject CR/LF) — FIXED (beyond requirement)
`cinemaName` is normalised with `.replace(/\s+/g, " ")`; test covers both the change and correction subjects.

## Regressions
None. The diff is additive only (new helpers, new `info` note style, new router case). All existing template tests pass (api 632/632).

## New findings (round 2)
- **INFO-1** — Notice for a cinema that is already not operating (e.g. TEMP_CLOSED scheduled → CLOSED) still shows the refund box "vui lòng đến trực tiếp quầy vé của rạp". Its future shows were already cancelled when TEMP_CLOSED took effect (:477-482), so the sentence is conditional and practically vacuous. Wording is a bit odd but not false. Non-blocking.
- **INFO-2** — "từ ngày X trở đi" also covers day-X shows before the effective time, which are NOT cancelled. This errs on the safe side (customers may ask for a refund they did not need, but nobody misses a refund). Accepted, as recommended in round 1.
- **INFO-3** — `reopenCancelled` compares by object identity (`f.copy === CINEMA_STATUS_COPY.get("OPEN")`). This works because `copy` comes from that same Map, but it is slightly indirect. Non-blocking.
- **INFO-4** — `templates.ts` is still over 300 lines (the file was already over before this task). The new functions are each under 50 lines.

Vietnamese/tone: diacritics are complete. "đang tạm đóng cửa", "đang ở trạng thái sắp khai trương", "đã đóng cửa", "Ngày mở cửa dự kiến không còn áp dụng", "CINEMO xin lỗi vì sự bất tiện này" all read naturally and politely.

## Verdict
**NORMAL PASS**. F1–F5 are fixed correctly, and the new tests would fail on the relevant mutations. Every `schedule_cancelled` × `current_status` × `target_status` combination produces true content. Verify commands are green. Only INFO notes remain.
