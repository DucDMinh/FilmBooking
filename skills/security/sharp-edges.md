# Secure Defaults & Sharp Edges Review

Identifies error-prone APIs, dangerous configurations, and "footgun" designs that enable security mistakes. Ensures code follows **secure-by-default** and **pit of success** principles.

> **BẮT BUỘC:** Áp dụng khi code/review config, auth, xử lý secret, hoặc thiết kế API/interface.

## When to Use

- Reviewing API or library design decisions
- Auditing configuration schemas for dangerous options
- Evaluating authentication/authorization interfaces
- Reviewing any code exposing security-relevant choices to developers
- Checking deployment config (.env, secrets, CORS, sessions)

## Check: Vulnerable Defaults

- **Fallback secrets** — any hardcoded fallback API key, password, or token (e.g. `DEFAULT_KEY = "..."`). FAIL.
- **Permissive access** — CORS `*`, wildcard origins, `chmod 777`, open DB ports, `root` user in prod. FAIL.
- **Default credentials** — weak default passwords, default JWT secret, default admin tokens. FAIL.
- **Fail-open security** — auth/config that defaults to "allow/trust" on error. FAIL.
- **Debug features in prod** — verbose error logs exposing stack traces, debug endpoints, `--inspect` enabled. MAJOR.
- **Weak cryptography** — MD5/SHA1, hardcoded nonces, ECB mode, deprecated crypto. FAIL.

## Check: API Usability / Footguns

- Functions that easily misuse auth (e.g. optional auth by default on protected routes). FAIL.
- Callbacks/sinks where user input flows to `exec`, `eval`, SQL, or HTML without explicit opt-in sanitization. FAIL.
- Type definitions that encourage bypassing validation (e.g. `any`, loosely typed request bodies on auth paths). MAJOR.

## Secure-By-Default Rules (template-enforced)

1. **Secrets**: NEVER hardcode. Always load from `.env` / env vars. No `.env` committed.
2. **Auth**: protected-route middleware is REQUIRED — no endpoint defaults to public unless explicitly annotated.
3. **CORS**: whitelist explicit origins, never `*` for credentialed requests.
4. **Validation**: every user input validated (schema) before reaching business logic or DB.
5. **Crypto**: only modern, audited algorithms (Argon2/bcrypt for passwords, RSA/OAEP or ECC for asymmetric, AES-GCM for symmetric).
6. **Errors**: sanitize error messages — no stack traces / internal paths leaked to client.

## Output

List findings with severity. **Any FAIL-severity finding blocks PASS** in review.

## Tone

Be specific — "CORS allows `*` on authenticated endpoint at server/index.ts:42" not "CORS configuration is loose".
