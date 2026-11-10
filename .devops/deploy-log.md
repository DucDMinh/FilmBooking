# Deploy Log

> Written by the deploy workflow (CI/CD templates trong `.devops/`) on every deployment. One entry per deploy.

## Format

```markdown
### Deploy {N} — {environment}
- **Date:** YYYY-MM-DD HH:mm (UTC)
- **Platform:** vercel | railway | docker-vps | other
- **Git ref:** {branch} @ {commit sha}
- **Triggered by:** {task/layer or manual}
- **Result:** ✅ success | ❌ failed | ↩️ rolled back
- **Health check:** {endpoint} → {status}
- **Notes:** {errors, rollback reason, follow-up}
```

## Log

_No deployments yet._
