# Tier Enterprise — Checklist & Guide

Dùng khi user chọn **Enterprise Scale** (rất lớn, HA cao, multi-region, dữ liệu lớn).

> ⚠️ **Cảnh báo:** Tier này phức tạp + tốn kém. Chỉ kích hoạt khi spec **CHỨNG MINH** cần (CCU >100k, RTO/RPO thấp, global traffic, data vượt 1 node). Không chọn chỉ vì "hệ thống lớn".

Kiến trúc mục tiêu:
```text
Global CDN/WAF
  → Multi-AZ / Multi-Region
  → API Gateway
  → Modular Monolith HOẶC Services (tách theo bottleneck/ownership)
  → Redis Cluster
  → Kafka / Event Bus (event-driven, khi cần)
  → DB Sharding / Distributed SQL
  → Data Warehouse (báo cáo/BI)
```

## Đây là GUIDE + CHECKLIST, không phải code cứng

Ở mức Enterprise, mỗi hệ thống là khác nhau — không có docker-compose "một cỡ cho tất cả". Agent phải:
1. Đọc hết `references/*.md` (tiers, backend-patterns, database-scaling, capacity-planning, disaster-recovery).
2. Hỏi/cập nhật Scalability Profile (CCU, RPS, read/write, SLA, RTO/RPO, region, ownership model).
3. Đề xuất kiến trúc cụ thể cho project này — ghi rõ từng quyết định + lý do.
4. Trình user duyệt **trước khi code** (postponement: không tự ý triển khai toàn bộ).

---

## Checklist Enterprise (Gate — trước khi PASS phần hạ tầng)

### Multi-region & HA
- [ ] Multi-AZ bắt buộc (backend + DB standby failover)
- [ ] Multi-region: **active-passive** mặc định; chỉ active-active khi thật sự cần global + chấp nhận phức tạp
- [ ] Global traffic routing (anycast / DNS failover / CDN origin failover)
- [ ] DR plan được test định kỳ (failover drill) — RTO/RPO ghi rõ và đạt được

### Database
- [ ] DB Primary + Read Replica (bắt buộc, từ High Traffic)
- [ ] Partitioning cho bảng lớn (logs, transactions)
- [ ] **Sharding HOẶC distributed SQL** — chỉ khi 1 node không đủ tải/lưu trữ
  - Ưu tiên distributed SQL (CockroachDB/TiDB/Aurora/Spanner) để giảm gánh nặng vận hành sharding thủ công
- [ ] Data warehouse + CDC/ETL tách báo cáo khỏi OLTP
- [ ] Read model / CQRS cho màn hình đọc nặng (nếu đo được bottleneck)

### Backend / Architecture
- [ ] **Modular monolith trước** — chỉ tách microservices khi có lý do rõ ràng (nhiều team ownership, tải/deploy khác biệt)
- [ ] Event-driven (Kafka/event bus) — chỉ khi cần decouple + scale độc lập giữa domain
- [ ] Stateless backend + Redis Cluster (session/cache/rate limit/lock/counter)
- [ ] Queue + workers (BullMQ/Kafka/SQS) + concurrency có giới hạn
- [ ] Idempotency + circuit breaker + timeout + backpressure đầy đủ

### Reliability & Delivery
- [ ] SLO/SLA + SLI rõ ràng, có alerting (4 golden signals: latency, traffic, errors, saturation)
- [ ] Auto-scaling theo CPU/memory/queue/latency-p99
- [ ] Load test định kỳ (peak RPS thật) — k6/Artillery/Locust
- [ ] Chaos / failure testing định kỳ (giết instance, block dependency, inject latency)
- [ ] Backup + PITR + test restore định kỳ
- [ ] Observability đầy đủ (metrics/logs/tracing) + đúng thứ tự: đã tối ưu query/index trước khi scale infra

---

## Quyết định cần trình user duyệt (không tự ý chọn)

1. **Region layout:** single-region multi-AZ / multi-region active-passive / active-active?
2. **DB strategy:** distributed SQL (recommended) hay sharding tự quản? Nếu sharding: shard key gì (`user_id`/`tenant_id`/hash)?
3. **Service boundary:** giữ modular monolith hay tách service nào? Lý do (ownership? tải? deploy cycle)?
4. **Event platform:** có cần Kafka/event bus không? Dùng cho use-case nào?
5. **Cost/ops tradeoff:** chấp nhận độ phức tạp vận hành bao nhiêu để đạt RTO/RPO?

> 💡 Nếu không có câu trả lời rõ ràng → hạ xuống **High Traffic** + ghi rõ "Enterprise-ready nhưng chưa kích hoạt". Đợi tải thật tới mới nâng cấp.

---

## Quy trình triển khai Enterprise (gợi ý)

```text
1. Thu thập Scalability Profile (con số thật)
2. Đọc toàn bộ references
3. Viết Architecture Decision Record (ADR) — từng quyết định + lý do + tradeoff
4. Trình user duyệt ADR
5. Chia layer/task hạ tầng (Graph agent) — ưu tiên: stateless → Redis → queue → replica → partition → sharding/event/multi-region
6. Triển khai từng bước, đo + verify ở mỗi bước
7. Load test + DR drill trước khi coi là hoàn thành
```
