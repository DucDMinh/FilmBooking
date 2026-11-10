# Tier Standard — Infra templates (mặc định)

Dùng khi user bật Scalability Option và chọn **Standard** (hoặc chưa có số liệu → mặc định Standard).

> 💡 Triết lý: đơn giản, dễ maintain, **horizontal-scaling-ready** (sau này nâng cấp không phải viết lại).

## docker-compose.yml (mẫu)

```yaml
version: "3.9"

services:
  api:
    build: .
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      PORT: 3000
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      replicas: 2    # chạy ≥2 instance: scale ngang, HA cơ bản
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Cổng bổ sung khi cần vài instance đằng sau 1 load balancer (Nginx/Traefik/Caddy)
  # lb:
  #   image: nginx:alpine
  #   ports: ["80:80"]
  #   volumes: ["./nginx.conf:/etc/nginx/nginx.conf:ro"]
  #   depends_on: [api]

volumes:
  db-data:
```

## Health check (backend — bắt buộc)

```js
// GET /health — readiness probe cho LB/orchestrator
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1')       // verify DB
    await redis.ping()                // verify Redis (nếu có)
    res.status(200).json({ status: 'ok' })
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message })
  }
})
```

## Connection pool (bắt buộc)

```js
// KHÔNG mở/đóng connection mỗi request — dùng pool.
const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,               // giới hạn connection tối đa
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})
```

## Backup (DB — hàng ngày, giữ N ngày)

```bash
#!/usr/bin/env bash
# scripts/backup.sh
DATE=$(date +%F)
DUMP_DIR=/backups
pg_dump -Fc "$DATABASE_URL" -f "$DUMP_DIR/db_${DATE}.dump"
# Giữ 7 bản gần nhất, xóa cũ
ls -1t "$DUMP_DIR"/db_*.dump | tail -n +8 | xargs -r rm
```

> Crontab: `0 2 * * * /app/scripts/backup.sh` — test restore định kỳ!

## Nginx LB đơn giản (khi chạy nhiều backend instance)

```nginx
http {
  upstream api_upstream {
    server api:3000;
    server api2:3000;
    server api3:3000;
  }
  server {
    listen 80;
    location / {
      proxy_pass http://api_upstream;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
    location /health {
      proxy_pass http://api_upstream;
    }
  }
}
```

## Checklist Tier Standard
- [ ] Backend stateless (session KHÔNG trong RAM instance)
- [ ] Health check + readiness endpoint
- [ ] Connection pool
- [ ] Migration + automated backup (test restore)
- [ ] Chạy được ≥2 instance sau LB
- [ ] Config qua env (KHÔNG hardcode)
- [ ] Logging cấp độ (info/warn/error)
