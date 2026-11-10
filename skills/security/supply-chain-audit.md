# Supply Chain Risk Audit

Identifies dependencies at heightened risk of exploitation or takeover. Assesses the dependency attack surface and flags unmaintained, low-popularity, or risky packages.

> **BẮT BUỘC:** Chạy `npm audit` + review dependency risk trong mọi task install dependency, và ở bước CI/DevOps trước khi deploy.

## When to Use

- After adding/updating any dependency
- Before push/merge to CI
- During final review / pre-deploy
- When onboarding a new npm package

## When NOT to Use

- Active vulnerability scanning at runtime (use `npm audit` live) — this complements it
- License compliance auditing

## Risk Criteria (a dependency is high-risk if it has ANY of:)

- **Single/unknown maintainer** — not organization-backed; anonymous identity (left-pad-style risk).
- **Unmaintained/stale** — no updates for a long period, archived, or explicitly deprecated.
- **Low popularity** — few stars/downloads relative to peers.
- **High-risk features** — FFI, deserialization, third-party code execution, eval-based loaders.
- **Past high/critical CVEs** — especially many relative to popularity.
- **No security contact** — missing `.github/SECURITY.md`, `CONTRIBUTING.md`, or security disclosure.

## Commands

```bash
# Active vulnerability scan — REQUIRED gate
npm audit --audit-level=high
# → exit non-zero if high/critical vulns (used by CI to block)

pnpm audit --audit-level=high   # if using pnpm

# List direct deps + their popularity for review
npm ls --depth=0
npm view <pkg> time.modified maintainers 2>/dev/null
```

## Workflow

1. Run `npm audit --audit-level=high` — **any high/critical vuln blocks PASS/commit** until resolved or documented exception.
2. For newly added direct dependencies, evaluate against the Risk Criteria above.
3. Flag high-risk dependencies with the specific risk factor + suggested alternative (more popular / well-maintained split-in).
4. Summarize overall dependency security posture + recommendations.

## Output

Findings list with severity. **High/critical CVE or flagged high-risk new dep blocks PASS.**

## Tone

Be specific — "`left-pad-fork@1.0.0` single anonymous maintainer, unmaintained 2yr, suggests `pad`" not "some deps are risky".
