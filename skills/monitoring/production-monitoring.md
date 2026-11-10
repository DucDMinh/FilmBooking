# Production Monitoring Setup (Web)

Set up end-to-end production monitoring: health check endpoint, uptime, structured logging, error tracking, and dashboards. Ensures the deployed app is observable and issues are caught early.

> **BẮT BUỘC:** Áp dụng khi setup/deploy production monitoring, health check, uptime, hoặc error tracking.

## When to Use

- Post-deploy monitoring setup
- Adding health check / readiness endpoints
- Configuring uptime monitoring and alerting
- Setting up structured logging + error tracking
- Building a dashboard from telemetry

## Essential Principles

1. **Health check endpoint** — expose `GET /health` (and `/ready` for readiness) that verifies DB/connectivity. Uptime monitors hit this.
2. **Uptime monitoring** — use an uptime service (UptimeRobot, StatusCake, or Grafana Cloud) polling `/health`; alert on failure.
3. **Structured logging** — JSON logs with `trace_id`, severity, service name. Never log secrets/PII.
4. **Error tracking** — capture uncaught exceptions + rejected promises; correlate with traces.
5. **Dashboards + alerts** — visualize error rate, latency (p95), request volume; alert on threshold breach.

## Health Check Pattern (Node.js/Next.js)

```ts
// app/api/health/route.ts (Next.js) or /health route
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;   // verify DB reachable
    return Response.json({ status: 'ok', uptime: process.uptime() });
  } catch (err) {
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
```

## Checklist (review gate)

- [ ] `/health` + `/ready` endpoints exist (verify deps reachable)
- [ ] Uptime monitor configured polling `/health`, alerting on 5xx/timeout
- [ ] Structured JSON logging with `trace_id` correlation
- [ ] Uncaught exceptions captured to error tracking
- [ ] No secrets/logs PII/stack traces in production logs
- [ ] Throughput/latency/error-rate metrics exported (OTel)
- [ ] Dashboard + alert configured (p95 latency, error rate)

## Output

Monitoring config + checklist. **Any missing health endpoint or secrets-in-logs blocks PASS.**

## Tone

Be specific — "500s return HTML stack trace to client at server/error.ts:9" not "error handling bad".
