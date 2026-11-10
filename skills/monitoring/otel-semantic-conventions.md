# OpenTelemetry Semantic Conventions

OpenTelemetry semantic convention lookup and naming guidance — attribute and span naming rules for consistent, compliant telemetry.

> **BẮT BUỘC:** Áp dụng khi đặt tên span/attribute/metric, hoặc kiểm tra OTel naming compliance.

## When to Use

- Naming spans, attributes, metrics, log fields
- Checking semantic convention compliance
- Ensuring consistent naming across services for good dashboards

## Essential Rules

1. **Span names** — use the "low-cardinality" operation name, not full URL with IDs. `GET /users/{id}` not `GET /users/12345`.
2. **Standard attributes** — prefer released semantic convention groups. Common ones:
   - `http.request.method`, `http.response.status_code`, `url.path`
   - `service.name`, `service.version`, `deployment.environment.name`
   - `error.type`, `exception.type`
3. **Avoid high-cardinality attributes** in metrics (user IDs, raw URLs, email) — explode cardinality and cost.
4. **Units** — metric names use SI units: `db.client.operation.duration` (s), memory (By), latency (s).
5. **Consistency** — same attribute names across services enable cross-service correlation.

## Quick Reference

| Concept | Use |
|---------|-----|
| Service identity | `service.name`, `service.version`, `deployment.environment.name` |
| HTTP server | `http.request.method`, `http.response.status_code`, `url.scheme`, `url.path` |
| Client errors | `error.type`, `exception.message` |
| DB | `db.system.name`, `db.collection.name`, `db.operation.name` |
| Messaging | `messaging.system`, `messaging.destination.name` |

## Checklist

- [ ] Span names low-cardinality (no raw IDs/URLs)
- [ ] `service.name` + `deployment.environment.name` set everywhere
- [ ] No PII/high-cardinality in attribute values
- [ ] Standard attributes used over custom ones when a convention exists

## Output

Naming applied/compliant. **Any raw-ID span name or high-cardinality/PII attribute blocks PASS.**

## Tone

Be specific — "span name uses raw order id GET /orders/1234 — use GET /orders/{id}" not "naming off".
