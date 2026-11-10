# Vercel Deployment Template

## Prerequisites
- Vercel account linked to Git provider
- `vercel` CLI installed (`npm i -g vercel`)

## Setup

```bash
# Login
vercel login

# Link project
vercel link

# Set environment variables
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add FRONTEND_URL production
```

## Configuration

```json
// vercel.json
{
  "buildCommand": "<build_command from project-config>",
  "outputDirectory": "dist/client",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ],
  "functions": {
    "api/**/*.ts": {
      "runtime": "@vercel/node@3"
    }
  }
}
```

## Deploy Commands

```bash
# Deploy to preview (staging)
vercel deploy

# Deploy to production
vercel deploy --prod
```

## Health Check

```bash
# Check deployment status
curl -s https://{project}.vercel.app/api/health | jq .

# Expected: { "status": "ok", "timestamp": "..." }
```

## Limitations
- Serverless functions (no WebSocket in free tier)
- 10s execution limit (free) / 60s (pro)
- No persistent file storage (use S3/Cloudinary)
- Cold starts on serverless

## Best For
- Static frontend + API routes
- JAMstack architecture
- Projects without WebSocket needs
- Quick MVP deployments
