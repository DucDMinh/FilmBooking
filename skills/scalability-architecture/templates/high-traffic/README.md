# Tier High Traffic — Infra templates

Dùng khi user chọn **High Traffic** (nhiều user/CCU, read-heavy, tác vụ nền nhiều).

Kiến trúc mục tiêu:
```text
CDN/WAF → LB → Backend x N (auto-scale)
                → Redis (session/cache/rate limit)
                → Queue + Workers (email/notify/report)
                → DB Primary + Read Replica
```

## docker-compose.yml (mẫu đầy đủ)

```yaml
version: "3.9"

services:
  api:
    build: .
    environment:
      DATABASE_URL: ${DATABASE_URL}        # primary
      DATABASE_REPLICA_URL: ${DATABASE_REPLICA_URL}
      REDIS_URL: ${REDIS_URL}
      PORT: 3000
    depends_on:
      - redis
      - db-primary
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      replicas: 3
      restart_policy:
        condition: any
    restart: unless-stopped

  worker:
    build: .
    command: ["node", "dist/worker.js"]   # xử lý queue
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    depends_on: [redis]
    deploy:
      replicas: 2                          # worker scale độc lập theo queue
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  db-primary:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - db-primary-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  db-replica:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db-replica-data:/var/lib/postgresql/data
    depends_on: [db-primary]
    # Trong production thường dùng managed replica (RDS/Aurora) thay vì tự replication
    # → ghi chú: dùng streaming replication từ primary

volumes:
  redis-data:
  db-primary-data:
  db-replica-data:
```

## Redis — session, cache, rate limit

### Session store
```js
// session lưu ở Redis (KHÔNG trong RAM instance) — mọi instance đọc chung
import session from 'express-session'
import { RedisStore } from 'connect-redis'
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: 'lax' },
}))
```

### Cache aside (có TTL + invalidation)
```js
async function getProduct(id) {
  const cached = await redis.get(`product:${id}`)
  if (cached) return JSON.parse(cached)
  const row = await db.query('SELECT * FROM products WHERE id=$1', [id])
  await redis.setex(`product:${id}`, 3600, JSON.stringify(row.rows[0])) // TTL 1h
  return row.rows[0]
}
async function invalidateProduct(id) {
  await redis.del(`product:${id}`)
}
```

### Distributed rate limit
```js
// giới hạn theo IP + user — dùng Redis để đúng trên nhiều instance
app.use(rateLimit({
  store: new RedisStore({ client: redisClient, prefix: 'rl:' }),
  windowMs: 60_000,
  max: 100, // 100 req/phút
}))
```

## Queue + Worker (tác vụ nền)

```js
// producer (trong request)
import { Queue } from 'bullmq'
const emailQueue = new Queue('email', { connection: redisClient })
app.post('/api/signup', async (req, res) => {
  await db.query('INSERT INTO users ...')
  await emailQueue.add('welcome', { userId: user.id }) // KHÔNG gửi email trong request
  res.status(201).json({ ok: true })
})

// worker (process riêng — worker.js)
import { Worker } from 'bullmq'
new Worker('email', async (job) => {
  if (job.name === 'welcome') await sendWelcomeEmail(job.data.userId)
}, { connection: redisClient, concurrency: 5 })
```

> Tác vụ nặng: email, notification, report, webhook, image processing, import/export → **đưa vào queue**.

## Read / Write routing (primary + replica)

```js
const primaryPool = new Pool({ connectionString: process.env.DATABASE_URL })
const replicaPool = new Pool({ connectionString: process.env.DATABASE_REPLICA_URL })

export const db = {
  // SELECT → replica (đọc)
  async read(text, params) { return replicaPool.query(text, params) },
  // INSERT/UPDATE/DELETE → primary (ghi)
  async write(text, params) { return primaryPool.query(text, params) },
}

// Màn hình cần dữ liệu tức thời (vừa ghi) → dùng db.write hoặc primary riêng
```

## Circuit breaker + timeout (external calls)

```js
import { CircuitBreaker } from 'opossum' // npm: opossum
const breaker = new CircuitBreaker(doExternalCall, {
  timeout: 5_000,               // timeout
  errorThresholdPercentage: 50, // mở mạch khi 50% lỗi
  resetTimeout: 30_000,         // thử lại sau 30s
})
breaker.fallback(() => ({ error: 'external service unavailable' }))
```

## Observability (bắt buộc High Traffic)

```text
Metrics → Prometheus → Grafana
Logs    → Loki / OpenSearch
Traces  → OpenTelemetry → Jaeger / Grafana Tempo
```

- Export **metrics** (request rate, latency, error rate, queue depth, DB pool usage).
- **Structured logs** (JSON, có trace_id) → dễ query.
- **Tracing** qua OTel cho request xuyên service/dependency.

Ví dụ express metric:
```js
// request latency histogram (Prometheus client)
const hist = new promClient.Histogram({ name: 'http_request_duration_seconds', help: '...', buckets: [0.1, 0.3, 1, 3, 10] })
app.use((req, res, next) => { const end = hist.startTimer(); res.on('finish', () => end({ route: req.path })); next() })
```

## Auto-scaling guideline

Scale theo (chọn 1 hoặc combo):
- **CPU**: >70% trong N phút → thêm instance.
- **Memory**: >80% → thêm.
- **Queue depth**: queue backlog > ngưỡng → thêm worker.
- **Request latency p99** vượt target → thêm backend.

> Trong Docker Swarm / K8s dùng điều kiện scale tự động. Manual: có script/runbook rõ ràng.

## Backup + RTO/RPO (High Traffic)
- Automated DB backup hàng ngày + PITR.
- Multi-AZ cho backend + DB standby với failover.
- Ghi RTO/RPO target vào spec và có runbook failover.

## Checklist Tier High Traffic
- [ ] Redis: session, cache (TTL + invalidation), rate limit
- [ ] Queue + worker cho tác vụ nền
- [ ] Idempotency key cho endpoint ghi
- [ ] Read replica + route read/write (chấp nhận replication lag)
- [ ] Circuit breaker + timeout cho external calls
- [ ] Observability: metrics/logs/tracing
- [ ] Auto-scaling guideline
- [ ] Multi-AZ + DB standby với failover
