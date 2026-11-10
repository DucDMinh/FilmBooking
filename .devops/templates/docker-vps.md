# Docker + VPS Deployment Template

## Prerequisites
- VPS with Docker + Docker Compose installed
- SSH access to VPS
- Domain pointed to VPS IP

## Dockerfile

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN <install_command from project-config>
COPY . .
RUN <build_command from project-config>

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@db:5432/${DB_NAME}
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
```

## Deploy Script

```bash
#!/bin/bash
# deploy.sh

set -e

SERVER="user@your-vps-ip"
PROJECT_DIR="/opt/app"

echo "🚀 Deploying to VPS..."

# Build and push
docker build -t app:latest .
docker save app:latest | ssh $SERVER "docker load"

# Deploy on server
ssh $SERVER << 'EOF'
  cd /opt/app
  docker compose pull
  docker compose up -d --build
  # Run <migration_command from project-config> only if migration_required=true.
  # If db_tool: none, skip migration.
  echo "✅ Deployed successfully"
EOF

# Health check
sleep 5
curl -f https://yourdomain.com/api/health || echo "❌ Health check failed!"
```

## SSL with Certbot

```bash
# On VPS
docker run --rm -v ./certbot/conf:/etc/letsencrypt \
  -v ./certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot -d yourdomain.com
```

## Best For
- Full control over infrastructure
- Complex deployments (multiple services)
- Cost optimization at scale
- Self-hosted / air-gapped environments
