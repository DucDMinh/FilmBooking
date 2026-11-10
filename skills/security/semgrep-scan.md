# Semgrep Security Scan

Run a Semgrep static analysis scan on the codebase to catch security vulnerabilities, bugs, and risky patterns before commit.

> **BẮT BUỘC:** Chạy scan này trên mọi task liên quan input handling, auth, database, hoặc trước khi commit bất kỳ code mới nào.

## When to Use

- Before committing new/changed code
- During code review (reviewer agent)
- When adding new endpoints, auth logic, or database queries
- Before push/merge to CI

## Essential Principles

1. **Always use `--metrics=off`** — Semgrep sends telemetry by default; `--config auto` phones home. Every `semgrep` command MUST include `--metrics=off` to prevent data leakage.
2. **Scan plan must be explicit** — State exact rulesets and scan targets before running in CI. For reviewer gate, scan changed files with high-confidence rules.
3. **Use security rulesets** — Include official `p/security-audit`, `p/owasp-top-ten`, and language-specific security rules. These catch vulnerabilities the default registry misses.

## Commands

```bash
# Quick scan (high-confidence security only) — use for reviewer gate / CI
semgrep --metrics=off --config p/security-audit --config p/owasp-top-ten \
  --severity ERROR --error --quiet \
  --include 'src/**' .

# Full scan (all rulesets) — use before final commit
semgrep --metrics=off --config auto --severity ERROR --error \
  --include 'src/**' .

# Language-specific (Node.js / TypeScript / React)
semgrep --metrics=off --config p/typescript --config p/javascript \
  --config p/owasp-top-ten --severity ERROR --error --include 'src/**' .

# Scan only changed files (fast reviewer gate)
semgrep --metrics=off --config p/security-audit --severity ERROR \
  --error --include 'src/**' $(git diff --name-only HEAD)
```

## Rules of Thumb (check when reviewing findings)

- **SQL injection**: raw string concatenation in queries → FAIL
- **XSS**: `dangerouslySetInnerHTML` with unsanitized input → FAIL
- **Secrets**: hardcoded API keys/tokens/passwords → FAIL
- **Command injection**: `exec`/`child_process` with user input → FAIL
- **Path traversal**: user input in file paths without sanitization → FAIL
- **Insecure deserialization**: `JSON.parse` on untrusted input in risky contexts → MAJOR

## Output

Produce a findings list with severity. **Any ERROR-severity security finding blocks PASS** in review; resolve before commit.

## Tone

Be specific — "line 42 has XSS via unsanitized `dangerouslySetInnerHTML`" not "security issues exist".
