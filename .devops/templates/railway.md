# Railway Deployment Template

## Prerequisites
- Railway account (https://railway.app)
- `railway` CLI installed (`npm i -g @railway/cli`)

## Setup

```bash
# Login
railway login

# Initialize project
railway init

# Link to existing project
railway link
```

## Configuration

```toml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node dist/server/index.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 10
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

## Environment Variables

```bash
# Set variables
railway variables set DATABASE_URL="postgresql://..."
railway variables set JWT_SECRET="your-secret"
railway variables set NODE_ENV="production"
railway variables set PORT="3000"
```

## Database

```bash
# Add PostgreSQL plugin
railway add --plugin postgresql

# Get connection string
railway variables get DATABASE_URL
```

## Deploy Commands

```bash
# Deploy current directory
railway up

# Deploy with specific environment
railway up --environment staging
railway up --environment production
```

## Health Check

```bash
# Get deployment URL
railway status

# Check health
curl -s https://{project}.up.railway.app/api/health | jq .
```

## Features
- ✅ Persistent processes (WebSocket support)
- ✅ Built-in PostgreSQL/MySQL/Redis
- ✅ Auto-scaling
- ✅ Preview deployments on PRs
- ✅ No cold starts

## Best For
- Full-stack apps with WebSocket
- Apps needing persistent DB
- Background jobs / workers
- Production-grade deployments
