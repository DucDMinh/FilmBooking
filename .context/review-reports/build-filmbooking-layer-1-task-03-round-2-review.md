# Review: build-filmbooking layer-1 task-03, round 2

Agent: reviewer

- **Task:** `tasks/build-filmbooking/layer-1-task-03.md`
- **Worktree:** `E:\FilmBooking\.worktrees\layer-1__task-03` (not yet committed)
- **Files:**
  - `supabase/migrations/20261111010000_core_identity_chain.sql`
  - `supabase/tests/010_core_rls.test.sql`
- **Previous round:** `build-filmbooking-layer-1-task-03-round-1-review.md` (FAIL, 4 MAJOR)

## Review level
**STRICT**

## Reason
Same as round 1. The task covers auth/RBAC, per-cinema RLS (NFR-05, AC-16/17), migration/schema, SECURITY DEFINER helpers, and audit (R-107).

## Blast radius
- Every later RLS policy depends on `is_admin()` and `has_cinema_role()`.
- The `auth.users` triggers run on every signup and email change.
- anon can read `app_settings`, `cinemas` and `provinces`.
- `audit_logs` is the audit source for R-107.

## Verify commands + result
| Command | Result |
|---|---|
| `cd "E:/FilmBooking/.worktrees/layer-1__task-03" && pnpm db:start` | OK. The output said "Starting database from backup", so it reused the existing volume (no reset, no volume deletion) |
| `... && pnpm db:test` | **PASS**: Files=2, Tests=88 (`000_smoke` 7 + `010_core_rls` 81) |
| `... && pnpm lint` | PASS (`packages/shared` eslint) |
| `... && pnpm typecheck` | PASS (`packages/shared` tsc) |
| `... && pnpm test` | PASS (vitest 14/14) |
| `... && pnpm build` | Not run. The diff is SQL only, so build does not affect it |
| `... && pnpm db:stop` | OK, stopped (backup kept) |

**The DB from backup has the current migration.** The new round-2 tests rely on objects that exist only in the current version of the migration, and they pass:
- `provinces` audit (INSERT + UPDATE)
- `accepted_at` rejected with 42501 (column grant)
- `assigned_by` rejected with 42501 and defaulting to the actor

## Round 1 findings: closure
| # | Round 1 finding | Status | Evidence |
|---|---|---|---|
| 1 | Verify could not be checked (hook path) | **Closed** | db:test 88 PASS, lint/typecheck/test PASS (run by me) |
| 2 | `provinces` had no audit | **Closed** | migration :301-302 `provinces_audit`; test :345-354 |
| 3 | Client could forge `consents.accepted_at` | **Closed** | :470-471 column grant `insert (user_id, consent_type, version, metadata)`; test :141-151 (42501 + `accepted_at = now()`) |
| 4 | Escalation/IDOR tests were missing | **Closed** | test :215-239 |

Tests covering MAJOR #4 (test :215-239):
- Manager UPDATE `role='MANAGER'` → 0 rows.
- Manager DELETE of a MANAGER row → 0 rows.
- Manager INSERT `user_roles` ADMIN → 42501.
- Manager HN01 reading profiles of HN02 staff/manager → 0 rows.
- Manager reading the profile of an unrelated customer → 0 rows.
- Manager reading the profile of staff at their own cinema → 1 row.

## Round 1 MINORs that were fixed
- **MINOR #5 `assigned_by`:** now `default auth.uid()` plus column grant `insert (user_id, cinema_id, role)` (:116, :425-426); tests :225-246. `favorite_cinemas` uses the same column grant (:478-479).
- **MINOR #6 guard:** now SECURITY INVOKER and checks `current_user in ('anon','authenticated') and not is_admin()` (:320-335).
  - Through PostgREST, `current_user` is always anon or authenticated, and clearing JWT claims cannot get past the check.
  - service_role and the owner (migrations, jobs) are not blocked. Test :356-361 covers this.

## Re-check of the new changes (no regressions found)
- **Guard function permissions:** EXECUTE is revoked from `authenticated` on the guard function, but trigger firing does not check EXECUTE. Inside it, the call to `is_admin()` runs as invoker and `authenticated` has EXECUTE on it, so it works.
- **`staff_assignments` UPDATE grant:** the grant is table-wide, but the only UPDATE policy is Admin only. Manager and Staff get 0 rows, as tested.
- **Migration:** still additive. No DROP, no type change, no backfill. It is not `HIGH_RISK_MIGRATION`.

## Responsive Checklist Gate
N/A. The diff is SQL only and has no UI.

## Skill gates
| Gate | Result |
|---|---|
| aislop | skip: not in the allowed verify command list |
| oxlint (anti-slop) | N/A: no TS/JS in the diff |
| ocr | skip: not in the allowed command list |
| AI-readable | OK (1 indicator: file longer than 300 lines, acceptable for a migration and test fixture). Comments explain why, names are clear |
| ai-friendly-web | N/A: internal DB layer |
| blitzstrike | skip: no permitted environment |

## Findings

### [CRITICAL]
None.

### [MAJOR]
None.

### [MINOR] (carried over from round 1, not blocking; recommend follow-ups)
1. **anon can read every `app_settings` key** (:447-449). If a sensitive key is added later, it becomes public. Suggestion: add an `is_public` column and filter the anon policy on it.
2. **`profiles.avatar_url` has no scheme check** (:65). Suggestion: add `check (avatar_url ~ '^https://')`, or sanitize on the frontend.
3. **`profiles.email` is citext UNIQUE.** If SSO allows duplicate emails in `auth.users`, signup fails (23505). Residual risk.
4. **A Manager can assign any user (if they know the UUID) as STAFF** and then read that user's profile. This is the intended capability, but the API layer should restrict it, for example by looking the user up by email.
5. **Writes through the service role (POS/Nest) record `actor_id = null`.** A later layer needs to pass the actor to satisfy R-107 ("ai").
6. **The guard only checks `current_user`.** A future SECURITY DEFINER RPC that updates `cinemas` will skip the guard (`current_user` becomes the owner), so such an RPC must do its own permission check. Recommend recording this in the RPC conventions.

## Residual risk
- `db:start` reused the volume backup, so a clean apply on a fresh volume was not verified independently. The objects that exist only in the current migration version are present (proven by passing tests), so the risk is low. CI on a new volume will confirm.
- The `auth.users` triggers have not been checked against real GoTrue (OAuth, identity linking).

## Verdict
**PASS**

There are no CRITICAL or MAJOR findings. All 4 round-1 MAJORs are closed with test evidence, and the verify commands pass.
