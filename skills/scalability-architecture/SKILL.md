---
name: scalability-architecture
description: "OPTIONAL scalability & infrastructure design cho opencode-project-template. Dùng khi user bật 'Scalability Option' trong Phase 1 Brainstorm (chọn tier Standard / High Traffic / Enterprise). Không mặc định áp dụng — chỉ triển khai khi user yêu cầu. Giúp chọn kiến trúc backend + database phù hợp CCU/user, tránh over-engineering."
---

# Scalability Architecture — Skill cho Web Template (OPTIONAL)

Skill này giúp thiết kế hạ tầng/backend/database cho hệ thống **nhiều user / CCU cao**, theo mô hình **Scalability Tiers** (Standard / High Traffic / Enterprise).

> ⚠️ **TÍNH CHẤT OPTIONAL:** Skill này **KHÔNG bắt buộc** và **KHÔNG tự động áp dụng**.
> Chỉ kích hoạt khi trong Phase 1 Brainstorm, user chọn bật Scalability Option.
> Mặc định template vẫn đi theo mô hình **Modular Monolith + stateless backend + PostgreSQL** đơn giản, chống over-engineering (ponytail ladder).

## WHEN TO USE

- **Phase 1 Brainstorm** (`.agent/brainstorm.md`): Hỏi user **Scalability Option** (bật/tắt). Nếu BẬT → hỏi thêm câu hỏi Scalability Profile, chọn Tier, ghi vào `SPECIFICATIONS.md`.
- **Phase 2.5 Design** (`.agent/design.md`): ĐỌC skill này trước khi viết design-spec; thêm mục **Architecture & Infrastructure** tương ứng Tier.
- **Phase 3 Task Graph** (`.agent/graph.md`): Sinh thêm tầng task hạ tầng nếu Tier ≥ High Traffic.
- **Phase 4 Loop** (`.agent/loop.md`): Coding Agent đọc file tier tương ứng trong `templates/` trước khi implement infra.
- **Phase 5 Review** (`.agent/reviewer.md`): Chạy **Scalability Checklist Gate** ở mức phù hợp Tier.
- **Bất kỳ lúc nào** user hỏi về hạ tầng/scale → tham chiếu `references/*.md`.

## FILES

- `references/scalability-tiers.md` — 3 Tier chi tiết (Standard / High Traffic / Enterprise): thành phần, khi nào dùng, không nên dùng gì.
- `references/backend-patterns.md` — Modular Monolith vs Microservices; backend stateless, sessions/Redis, queue/workers, rate limit, idempotency, circuit breaker.
- `references/database-scaling.md` — Primary/Read replica, caching (Redis), partitioning, sharding, tách OLTP/warehouse; thứ tự tối ưu.
- `references/capacity-planning.md` — Cách tính RPS, CCU→request rate, read/write ratio, peak; chọn Tier từ con số thực tế.
- `references/disaster-recovery.md` — RTO/RPO, backup, multi-AZ/region, failover, chaos testing.
- `templates/standard/` — Config mẫu cho Tier Standard (Docker compose, health check, migration, backup).
- `templates/high-traffic/` — Config mẫu cho Tier High Traffic (Redis, worker, read replica, auto-scaling, observability).
- `templates/enterprise/` — Checklist + guide cho Tier Enterprise (multi-region, sharding, event-driven, DR).

## SCALABILITY CHECKLIST GATE (điều kiện PASS review — theo Tier)

> Checklist này là **GATE** cho phần hạ tầng. Chỉ áp dụng mức tương ứng Tier user đã chọn.
> Task/Layer KHÔNG được PASS nếu còn mục FAIL ở mức Tier đã chọn.

### Tier Standard (bắt buộc — áp dụng mọi dự án)
- [ ] Backend **stateless** — session KHÔNG lưu trong RAM của từng instance
- [ ] Có **health check** endpoint + readiness probe
- [ ] Database có **migration** + **backup** strategy
- [ ] Connection pool cho database (không mở/đóng connection mỗi request)
- [ ] Có thể chạy ≥2 backend instance đằng sau 1 load balancer (không hardcode địa chỉ single instance)
- [ ] Env config qua biến môi trường (KHÔNG hardcode), `.env.local` chuẩn template
- [ ] Logging cơ bản + cấu hình cấp độ (info/warn/error)

### Tier High Traffic (bổ sung Tier Standard)
- [ ] **Redis** cho session/cache/rate limit (KHÔNG cache in-memory per instance)
- [ ] Tác vụ nặng (email, notify, report, webhook) đưa vào **queue + worker**, không xử lý trong request
- [ ] **Rate limiting** theo IP/user/API key
- [ ] **Idempotency key** cho các endpoint ghi (payment, order, webhook)
- [ ] **Read replica** + query route read/write tách biệt (nếu cần)
- [ ] Timeout + **circuit breaker** cho external calls
- [ ] Observability: metrics, logs, tracing (Prometheus/Grafana/Loki/OTel)
- [ ] Auto-scaling guideline (CPU/RAM/queue-based)

### Tier Enterprise (bổ sung High Traffic)
- [ ] Multi-region / Multi-AZ strategy + failover
- [ ] **Disaster recovery** plan ghi rõ RTO/RPO
- [ ] Sharding HOẶC distributed SQL (database-spec có khối lượng > single node năng lực)
- [ ] Event-driven architecture khi cần (Kafka / event bus) — chỉ khi thực sự cần
- [ ] CQRS / read model cho màn hình đọc nặng (nếu đo được bottleneck)
- [ ] Load test + chaos/failure testing định kỳ (SLO/SLA ghi rõ)

## INTEGRATION QUY TẮC (chống over-engineering)

> 💡 **Nguyên tắc vàng:** Không mặc định dùng microservices/Kubernetes/sharding chỉ vì user nói "nhiều user".
> Bắt đầu từ **Modular Monolith + stateless + PostgreSQL + horizontal-scaling-ready**.
> Chỉ nâng cấp Tier khi **con số thực tế** (RPS, CCU, read/write ratio, latency, storage) chứng minh cần thiết.

### Khi user nói "nhiều user" — hỏi cụ thể trước khi nghĩ tới scale
Chưa biết số liệu → chưa nói tới microservices/sharding. Hỏi:
- Mục tiêu bao nhiêu **CCU / user đồng thời**?
- **Peak RPS** ước tính?
- Tỉ lệ **đọc/ghi**?
- Tăng trưởng tải trong 6–12 tháng?
- Yêu cầu **availability** (SLA %) và **recovery** (RTO/RPO)?

### Mặc định (ponytail — đừng làm quá)
```text
Modular Monolith
+ Stateless Backend
+ Redis (optional)
+ Queue (optional)
+ PostgreSQL
+ Horizontal Scaling Ready
```
→ Chỉ thêm đúng cái đang cần, đúng thứ tự: CDN → Redis → scale ngang backend → queue → read replica → partition → (cuối cùng mới) sharding/microservices/multi-region.

## Integration Points (AGENT.md)

- **Phase 1 Brainstorm** (`.agent/brainstorm.md`): Thêm câu hỏi **Scalability Option** (bật/tắt). Nếu bật → hỏi Scalability Profile (CCU, RPS, đọc/ghi, SLA/RTO/RPO) → chọn Tier → ghi vào SPECIFICATIONS.md.
- **Phase 2.5 Design** (`.agent/design.md`): Nếu Tier ≥ Standard → ĐỌC skill này + `references/scalability-tiers.md` trước khi viết design-spec. Thêm mục **"Architecture & Infrastructure"** tương ứng Tier.
- **Phase 3 Task Graph** (`.agent/graph.md`): Nếu Tier ≥ High Traffic → sinh thêm layer/task hạ tầng (Redis, worker, replica, observability).
- **Phase 4 Loop** (`.agent/loop.md`): Đọc skill + file tier tương ứng trong `templates/` trước khi implement bất kỳ infra component.
- **Phase 5 Review** (`.agent/reviewer.md`): Chạy **Scalability Checklist Gate** (mức tương ứng Tier) trước khi PASS phần hạ tầng.
