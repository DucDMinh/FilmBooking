# spec/test-scope/

> Hợp đồng bàn giao cho template AUTOTEST — do template DEV sinh sau mỗi bug-fix/feature-update.
> `current.json` = scope mới nhất (kèm `specVersion` + `scopeVersion`). Archive bản cũ khi cần.
> Schema + version scheme: `docs/SPEC_VERSIONING.md`.

## current.json (template)

```jsonc
{
  "specVersion": "1.5.0",
  "scopeVersion": 4,
  "generatedAt": "2026-10-05T13:39:00+07:00",
  "trigger": "bug-fix | feature-update | initial-build",
  "workItem": "bug-login-timeout",
  "specRefs": ["R-01", "R-05"],
  "changed": { "files": ["src/auth/login.ts"], "modules": ["auth"] },
  "impact": {
    "direct": ["auth.login"],
    "dependents": ["portal.session"],
    "regression": ["payment.checkout"]
  },
  "acceptance": ["login < 2s"],
  "risk": "low | medium | high"
}
```
