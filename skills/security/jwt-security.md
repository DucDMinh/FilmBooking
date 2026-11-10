# JWT Vulnerability Testing (Web)

Tests JWT implementations for algorithm confusion, "none" algorithm bypass, kid/jku parameter injection, and weak secret exploitation. Ensures auth/session tokens are implemented securely — not just present.

> **BẮT BUỘC:** Áp dụng khi code/review bất kỳ logic JWT: sign, verify, middleware auth, refresh token, hoặc tích hợp OAuth2/OIDC/SSO.

## When to Use

- Creating or modifying JWT sign/verify logic
- Reviewing auth middleware that validates tokens
- Setting up refresh tokens, session management
- Any OAuth2/OIDC or SSO token handling

## Critical Do's (secure implementation)

1. **Algorithm pinning** — ALWAYS verify the `alg` against an allowlist (`RS256`/`ES256`). NEVER trust `alg` from the token header.
   ```js
   // CORRECT: pin algorithm
   jwt.verify(token, pubKey, { algorithms: ['RS256'] });
   // WRONG: trusts header alg → algorithm confusion / none bypass
   jwt.verify(token, pubKey);
   ```
2. **Reject `none` algorithm** — fail closed if `alg: "none"` received. Do NOT accept unsigned tokens on protected routes.
3. **Strong secret** — use a real random secret ≥32 bytes via env var, NEVER a hardcoded default (`"secret"`, `"jwt_secret"`). FAIL on weak secret.
4. **Signature verification before payload trust** — never use payload claims (userId, role) before verifying signature.
5. **`exp`/`nbf` checked** — token expiry enforced; reject expired/not-yet-valid tokens.
6. **`kid`/`jku` safety** — if `kid`/`jku` present, validate against allowlist; block header-supplied JWKS URLs that could point to attacker server (SSRF + key injection).

## Test Checklist (review gate)

- [ ] `alg` pinned server-side (no header alg trust)
- [ ] `none` algorithm rejected
- [ ] Secret from env, ≥32 bytes, not default/hardcoded
- [ ] Signature verified before claim use
- [ ] Expiry enforced
- [ ] No `kid`/`jku` injection (allowlisted JWKS only)
- [ ] Refresh tokens: rotating, stored securely, not leaking in logs/URL

## Output

Findings with severity. **Any FAIL (alg trust, none bypass, weak secret, missing exp) blocks PASS** in review. Resolve before commit.

## Tone

Be specific — "jwt.verify(token, secret) trusts header alg at auth/middleware.ts:31 — should pin ['RS256']" not "JWT not secure".
