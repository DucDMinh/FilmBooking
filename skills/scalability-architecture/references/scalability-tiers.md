# Scalability Tiers — Chọn mức hạ tầng phù hợp

Template cung cấp **3 mức scale** (Tier), user chọn trong Phase 1 Brainstorm khi bật Scalability Option. Chọn Tier theo **con số thực tế**, không theo cảm giác "nhiều user".

## Tóm tắt 3 Tier

| Tier | Dành cho | Backend | Cache/Queue | Database |
|------|----------|---------|-------------|----------|
| **Standard** | MVP, app vừa, traffic thấp-vừa | Modular monolith, stateless | Redis optional | PostgreSQL/MySQL primary |
| **High Traffic** | Nhiều user/CCU, peak đáng kể | Nhiều instance, auto-scale | Redis + Queue + Workers | Primary + Read Replica |
| **Enterprise** | Rất lớn, HA cao, multi-region | Services/modular, event-driven | Redis Cluster + Kafka | Sharding/Distributed SQL + Warehouse |

---

## Tier 1 — Standard

### Khi dùng
- MVP hoặc app có traffic thấp-vừa.
- Chưa có số liệu cụ thể chứng minh cần scale mạnh.
- Ưu tiên đơn giản, dễ maintain, chi phí thấp.

### Kiến trúc
```text
CDN
  → Load Balancer
  → Backend stateless (2+ instance)
  → PostgreSQL/MySQL (primary)
```

### Có sẵn
- Docker + health check + readiness probe
- Database migration + backup
- Logging cơ bản
- Connection pooling
- Có thể chạy nhiều backend instance đằng sau LB

### KHÔNG tự thêm (đừng làm quá)
- ❌ Kubernetes
- ❌ Kafka / event bus
- ❌ Microservices
- ❌ Sharding / distributed DB
- ❌ Multi-region

---

## Tier 2 — High Traffic

### Khi dùng
- Hệ thống thật sự có nhiều user/CCU (ví dụ hướng tới **10.000–100.000 CCU**).
- Peak tải đáng kể, read-heavy, tác vụ nền nhiều.
- Cần latency ổn định + auto-scale.

### Kiến trúc
```text
CDN/WAF
  → Load Balancer
  → Backend x N (auto-scale)
  → Redis (session/cache/rate limit)
  → Queue + Workers (email, notify, report, webhook)
  → DB Primary + Read Replica
```

### Có thêm (so với Standard)
- Redis cho session, cache, rate limit
- Background jobs (queue + worker)
- Read replica + tách read/write
- Rate limiting + idempotency key
- Circuit breaker + timeout cho external calls
- Observability: metrics/logs/tracing (Prometheus/Grafana/Loki/OTel)
- Auto-scaling guideline (CPU/RAM/queue-based)

### KHÔNG nên vội
- ❌ Multi-region (chưa cần nếu chưa có user phân bố toàn cầu)
- ❌ Sharding (chỉ khi 1 database không đủ tải/lưu trữ)

---

## Tier 3 — Enterprise Scale

### Khi dùng
- Hệ thống rất lớn (hướng tới **>100.000 CCU**) hoặc yêu cầu HA nghiêm ngặt.
- Cần RTO/RPO thấp, failover, global traffic.
- Dữ liệu vượt khả năng 1 node DB.

### Kiến trúc
```text
Global CDN/WAF
  → Multi-AZ / Multi-Region
  → API Gateway
  → Modular Monolith HOẶC Services
  → Redis Cluster
  → Kafka / Event Bus
  → DB Sharding / Distributed SQL
  → Data Warehouse (báo cáo/BI)
```

### Có thêm (so với High Traffic)
- Multi-region strategy + failover
- Disaster recovery plan (RTO/RPO)
- Sharding OR distributed SQL
- Event-driven architecture (chỉ khi thật sự cần)
- CQRS / read model cho màn hình đọc nặng
- Load test + chaos/failure testing
- SLO/SLA + SLI rõ ràng

### Cảnh báo
- ⚠️ Tier này **phức tạp & đắt** về vận hành. Chỉ kích hoạt khi spec CHỨNG MINH cần.
- Không chọn Tier 3 chỉ vì "hệ thống lớn" — phải có số liệu.
- Ưu tiên **modular monolith** trước khi nghĩ tới microservices. Tách service theo bottleneck/ownership thực tế.

---

## Hướng dẫn chọn Tier

```text
KHÔNG có số liệu / tập trung MVP
    → Standard

CCU 1k–10k, peak ổn định, read/vừa
    → Standard (nâng cấp sau nếu cần)

CCU 10k–100k, read-heavy, tác vụ nền nhiều
    → High Traffic

CCU >100k, HA cao, multi-region, data lớn
    → Enterprise
```

> ⚠️ CCU chỉ là 1 phần. Quan trọng hơn: **RPS, latency target, read/write ratio, payload size, query complexity, storage growth**.
> 100k user nhưng mỗi người 1 req/phút có thể nhẹ hơn 10k user mỗi người 20 req/giây. → Luôn đo con số thực tế.
