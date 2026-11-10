# Disaster Recovery & High Availability — RTO/RPO, Backup, Multi-AZ/Region, Failover

Phần này quan trọng nhất khi user yêu cầu **availability cao** (Tier High Traffic / Enterprise).

## Khái niệm: RTO & RPO

- **RTO (Recovery Time Objective):** thời gian tối đa hệ thống gián đoạn. "Sập xong trong 1 giờ phải chạy lại."
- **RPO (Recovery Point Objective):** lượng dữ liệu tối đa chấp nhận mất. "Mất tối đa 5 phút dữ liệu gần nhất."

```text
RPO = lỗ hổng dữ liệu  |  RTO = lỗ hổng thời gian
```

| Yêu cầu | RTO | RPO | Chiến lược |
|---------|-----|-----|------------|
| Thấp | Giờ | Giờ | Backup định kỳ hàng giờ/ngày |
| Trung bình | Phút | Phút | Backup + replication ngắn chu kỳ |
| Cao | Giây–phút | Giây | Multi-AZ/region, HA cluster, active-standby |

---

## Backup (bắt buộc mọi Tier)

- **Database:** dump / PITR (point-in-time recovery) định kỳ.
- **Object storage:** versioning + cross-region replication (nếu có).
- **Config / source:** nằm trong git (luôn có).
- **Test restore định kỳ** — backup không restore được thì coi như không có backup.

```bash
# Ví dụ PostgreSQL: automated dump hàng ngày + giữ N ngày
pg_dump -Fc "$DATABASE_URL" -f "backup_$(date +%F).dump"
```

---

## Single Region, Multi-AZ (Tier High Traffic)

Chạy ở nhiều **Availability Zone** trong cùng region — tránh chết hạ tầng vật lý đơn lẻ (mất điện, mất network rack).

```text
LB (multi-AZ)
  ├── Backend ở AZ-A
  ├── Backend ở AZ-B
  └── Backend ở AZ-C
DB: Primary (AZ-A) + Standby (AZ-B) → auto-failover
```

- Backend stateless → LB route bất kỳ AZ nào.
- DB dùng **multi-AZ / high availability cluster** → failover tự động khi primary chết.
- RTO giảm xuống phút-nhỏ, RPO giảm nhờ synchronous replication.

---

## Multi-Region (Tier Enterprise)

Khi user phân bố toàn cầu hoặc cần RTO rất thấp.

### Active-Passive
```text
Region 1 (active) → xử lý traffic chính
Region 2 (standby) → replica dữ liệu, failover khi Region 1 chết
```
- Đơn giản hơn, chi phí thấp hơn.
- Traffic bị chuyển hướng khi failover.

### Active-Active
```text
Region 1 (active) → một phần traffic
Region 2 (active) → một phần traffic
replicate dữ liệu 2 chiều
```
- Độ sẵn sàng cao, latency thấp cho user gần region.
- Phức tạp: xung đột ghi, consistency, request routing (anycast/LB global).

> Bắt đầu từ **active-passive** trước. Chỉ active-active khi thật sự cần global + chấp nhận phức tạp.

---

## Failover & Testing

### Graceful shutdown
- Backend bắt tín hiệu shutdown → ngừng nhận request mới → drain xong mới tắt.
- Kết hợp health/readiness probe để LB không route vào instance đang shutdown.

### Chaos / Failure testing
- Chủ động giết instance, chặn dependency, tạo latency cao để kiểm tra resilience.
- Đảm bảo circuit breaker + retry + failover hoạt động đúng.

### Load test
- Kiểm tra peak RPS thực tế, tìm bottleneck, xác định auto-scale ngưỡng.
- Dùng công cụ: k6, Artillery, Locust, Gatling.

---

## Checklist DR/HA theo Tier

### Tier Standard
- [ ] Automated DB backup + test restore định kỳ
- [ ] Có thể chạy lại toàn bộ từ git + `.env.local` (config-as-code)

### Tier High Traffic
- [ ] Multi-AZ backend + DB standby với failover
- [ ] RTO/RPO ghi rõ (target thực tế)
- [ ] Graceful shutdown + readiness probe
- [ ] Backup cross-check định kỳ

### Tier Enterprise
- [ ] Multi-region strategy (active-passive trước, active-active nếu cần)
- [ ] DR plan được test (failover drill định kỳ)
- [ ] Chaos testing + load test định kỳ
- [ ] SLO/SLA + SLI rõ ràng, có alerting
