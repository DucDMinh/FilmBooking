# Environments Configuration

## Overview
Quản lý environments cho deployment pipeline.

## Environments

### Development (local)
- URL: `http://localhost:3000`
- Database: Local PostgreSQL / SQLite
- Purpose: Daily development
- Auto-deploy: No

### Staging
- URL: `https://staging.{domain}`
- Database: Separate staging DB (seeded with test data)
- Purpose: Integration testing, QA, demo
- Auto-deploy: On push to `develop` branch

### Production
- URL: `https://{domain}`
- Database: Production DB
- Purpose: Live users
- Auto-deploy: On push to `main` branch (after human approval)

## Environment Variable Management

```
.env.local           → Local development (gitignored)
.env.staging         → Staging values (gitignored or platform-managed)
.env.production      → Production values (NEVER in git, platform-managed only)
```

## Promotion Flow

```
feature branch → develop (auto-deploy staging)
                     ↓
              staging tests pass
                     ↓
         PR: develop → main (human review)
                     ↓
            main (deploy production with approval)
```

## Rules

1. **NEVER commit secrets** to git (use platform environment management)
2. **Staging mirrors production** — same infra, different data
3. **Production deploys require human approval** — no full auto
4. **Database migrations** run automatically on deploy
5. **Rollback** is always available within 1 command
