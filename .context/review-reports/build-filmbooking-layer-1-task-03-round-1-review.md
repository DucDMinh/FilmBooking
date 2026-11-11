# Review: build-filmbooking layer-1 task-03, round 1

Agent: reviewer

- **Task:** `tasks/build-filmbooking/layer-1-task-03.md`. Core migration: profiles, roles and cinema assignment, cinemas, settings, consent, favorites, audit, plus RLS helpers.
- **Worktree:** `E:\FilmBooking\.worktrees\layer-1__task-03` (not committed)
- **Files reviewed:**
  - `supabase/migrations/20261111010000_core_identity_chain.sql` (482 lines)
  - `supabase/tests/010_core_rls.test.sql` (328 lines)

## Review level
**STRICT**

## Reason
The task touches auth/RBAC, per-cinema tenant isolation (NFR-05, AC-16/17), schema/migration, SECURITY DEFINER functions, and an audit trail (R-107). Each of these is a red risk.

## Blast radius
- **Downstream layers:** every later RLS policy depends on `is_admin()` and `has_cinema_role()` (showtimes, orders, tickets, reports, POS).
- **Auth:** the `auth.users` triggers fire on every signup and email change. If they error, signup is blocked.
- **Public read paths:** anon can read `app_settings`, `cinemas` and `provinces`.
- **Audit:** `audit_logs` is the R-107 audit source for the whole system.

## Verify commands + result
| Command | Result |
|---|---|
| `cd "/e/FilmBooking/.worktrees/layer-1__task-03" && git status --short && pnpm db:start ...` | **Blocked** by `agent-guard`: `[agent-guard] reviewer/spec-validator: chỉ được \`cd "<worktree>" && <lệnh>\` với thư mục trong .worktrees/` |
| `cd "/e/FilmBooking/.worktrees/layer-1__task-03" && pnpm db:start` (the exact form from the brief) | **Blocked**, same hook message |
| `pnpm db:test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | Not run. Per the Tool Loop Guard, I stopped after the hook denial and did not try other variants |
| `pnpm db:stop` | Not needed. `db:start` never ran, so no stack was started |

- **Static check of the test count:** `010_core_rls.test.sql` has `plan(66)` and `000_smoke.test.sql` has `plan(7)`. That totals 73, which matches the builder's "73 PASS" claim. I still could **not** confirm independently that the tests actually PASS.
- **Unverifiable:** the DoD requires `pnpm db:test` PASS and a clean migration apply. I could not confirm either.

## Responsive Checklist Gate
N/A. The diff is SQL only and has no UI.

## Skill gates
| Gate | Result |
|---|---|
| aislop | skip: Bash blocked by the hook |
| oxlint (anti-slop) | N/A: no TS/JS in the diff |
| ocr (open-code-review) | skip: Bash blocked, cannot check whether `ocr` is installed |
| AI-readable | OK (1 indicator). The migration (482 lines) and the test (328 lines) exceed 300 lines, which is an acceptable exception for a migration and test fixture. Naming is clear. Comments explain WHY and cite R-xx. Indirection is shallow. No magic numbers besides the documented defaults |
| ai-friendly-web | N/A: not public-facing web |
| blitzstrike | skip: no permitted environment |

## Checks that passed
- All 10 tables have RLS ENABLE.
- The migration `REVOKE`s all on tables and sequences from `anon` and `authenticated`, then `GRANT`s back the minimum.
- `is_admin()` and `has_cinema_role()`:
  - Both are SECURITY DEFINER with `search_path=''`, fully qualified names, and trust only `auth.uid()`.
  - Neither leaks data (they return only a boolean about the caller).
  - EXECUTE is revoked from `public` and `anon`.
- The 4 trigger functions have EXECUTE revoked from `public`, `anon` and `authenticated`.
- **Privilege escalation is blocked:**
  - `user_roles` INSERT and DELETE are Admin only; there is no UPDATE policy or grant.
  - `staff_assignments` UPDATE is Admin only.
  - A Manager can only INSERT or DELETE `role='STAFF'` rows at their own cinema.
  - A Manager cannot insert or update cinemas outside their assignment; the WITH CHECK on `id` blocks changing `id` to another cinema.
- **Cross-cinema reads are blocked:** `cinema_settings`, `staff_assignments` and `audit_logs` all filter by `has_cinema_role(cinema_id, …)`.
- **Profile IDOR is blocked:**
  - SELECT allows only your own profile, Admin, or a Manager reading staff of their own cinema.
  - UPDATE allows only your own profile, and the column grant excludes `id`, `email` and `updated_at`.
- **Guard bypass when `auth.uid()` is null:** not exploitable through PostgREST. `auth.uid()` reads the JWT claims GUC, and an authenticated client cannot call `set_config` (it is in `pg_catalog`, outside the exposed schema). anon has no UPDATE grant on `cinemas`.
- **Migration is additive:** no DROP, no type change, no backfill. The `app_settings` seed is idempotent. It is not `HIGH_RISK_MIGRATION`. `extensions.citext` exists from migration `20261111000000_extensions.sql`.
- **AC coverage:** the tests cover RLS on all tables, AC-16 core (cinema_settings and staff_assignments for HN01 vs HN02), customers seeing only their own profile/consent/favorites (AC-17 core), auto-created profiles with citext email, audit on cinemas with before/after, actor and cinema_id, and adding a cinema with a plain INSERT.

## Findings

### [CRITICAL]
None found in the code.

### [MAJOR]
1. **[MAJOR] Verification is unverifiable (process blocker, separate from the code findings).**
   - Every verify command (`db:start`, `db:test`, lint/typecheck/test/build) was blocked by the `agent-guard` hook, even in the exact form from the brief.
   - The DoD requires `pnpm db:test` PASS and a clean migration apply. Under STRICT, these cannot be accepted from the builder's report alone.
   - **Fix:** the primary or the user must fix the hook's path matcher for `/e/...` paths (or allow the Windows form), then re-run `pnpm db:start && pnpm db:test` in the worktree. Round 2 needs this evidence.

2. **[MAJOR] `provinces` has no audit trigger.** (`20261111010000_core_identity_chain.sql:300-309`; grants and policies at :367-374)
   - Admin can INSERT, UPDATE and DELETE `provinces`, but none of these writes are audited.
   - R-107 requires an audit record for every data change made by Admin/Manager/Staff/POS, and R-107 is in this task's requirement list.
   - **Fix:** add `create trigger provinces_audit after insert or update or delete on public.provinces for each row execute function public.audit_row_change();`, plus a test.

3. **[MAJOR] `consents.accepted_at` can be forged by the client.** (`:463` `grant select, insert on public.consents to authenticated`)
   - The insert grant is table-level, so a client can send its own `accepted_at` (and `id`) and backdate consent evidence.
   - This contradicts the comment "bằng chứng bất biến" ("immutable evidence") and weakens R-03 (and R-132 later on).
   - **Fix:** use a column-level grant, `grant insert (user_id, consent_type, version, metadata) on public.consents to authenticated;`, or force `accepted_at := now()` in a BEFORE INSERT trigger. Add a test showing that a supplied `accepted_at` is rejected or ignored.

4. **[MAJOR] Important escalation and IDOR vectors have no tests** (STRICT: important logic without tests). The policies look correct when read, but there is no regression guard. Missing pgTAP tests in `010_core_rls.test.sql`:
   - **(a)** Manager HN01 runs `UPDATE staff_assignments SET role='MANAGER'` on a STAFF row at their own cinema → 0 rows.
   - **(b)** Manager HN01 deletes the MANAGER row (their own or another manager's) at HN01 → 0 rows.
   - **(c)** Manager inserts `user_roles` ADMIN → 42501. Only the customer case is tested now.
   - **(d)** Manager HN01 reads the profile of `staff2`/`mgr2` (HN02) → 0 rows. This is the cross-cinema profile IDOR.
   - **(e)** Manager HN01 reads the profile of a customer not assigned to their cinema → 0 rows.

### [MINOR]
5. **`staff_assignments.assigned_by` and `created_at` can be set by the client** (`:420` table-level grant). A Manager can forge who assigned whom. `audit_logs.actor_id` is still correct. **Fix:** default `assigned_by` to `auth.uid()` and use a column-level insert grant `(user_id, cinema_id, role)`, or force it in a trigger. The same applies to `favorite_cinemas.created_at` (low impact).
6. **The guard in `cinemas_guard_manager_columns` (`:322`) skips its check when `auth.uid()` is null.** This is not exploitable through PostgREST today. For hardening, identify trusted callers by the role (`auth.role() = 'service_role'` or `current_user`) instead of a null uid. A future `SECURITY DEFINER` RPC that clears the claims could otherwise slip past the guard.
7. **anon can read every `app_settings` key (`:443`).** The current data is not sensitive, but any key Admin adds later (for example an internal config) becomes public automatically. **Suggestion:** add an `is_public boolean` column and filter the anon policy on it.
8. **`profiles.avatar_url` has no scheme check (`:65`).** It comes from `raw_user_meta_data`, which the user controls, and the user can also update it. **Suggestion:** add `check (avatar_url ~ '^https://')`, or sanitize on the frontend.
9. **`profiles.email` is citext UNIQUE (`:60`).** If `auth.users` ever allows duplicate email (SSO users are exempt from the `users_email_partial_key` index), then `handle_new_user` raises 23505 and the signup fails. This is residual risk; record it so the SSO decision takes it into account.
10. **A Manager can assign any user (if they have the UUID) as STAFF at their cinema**, then read that user's profile PII. This is the intended "Gán Staff cho rạp" capability, but the API layer should restrict it (for example, look the user up by email with confirmation). Residual risk.
11. **Audit when writes come through the service role:** `actor_id` will be null for POS/Nest writes. A later layer needs to pass the actor (a GUC or explicit column) to satisfy R-107 ("ai"). Not in scope for this task.

## Residual risk
- The migration has not been applied, and `db:test` has not been run independently (the hook blocked it).
- The behaviour of the `auth.users` triggers against real GoTrue (OAuth, identity linking) can only be checked with an integration test.

## Verdict
**FAIL**

- **Blockers for round 2:**
  - MAJOR #1: verify evidence must be re-run once the hook is fixed.
  - MAJOR #2: add the `provinces` audit trigger.
  - MAJOR #3: lock the consent insert columns.
  - MAJOR #4: add the escalation/IDOR tests.
- The MINOR items are recommended but do not block.
