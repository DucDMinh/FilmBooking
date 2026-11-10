# Backend Patterns — Stateless, Modular Monolith vs Microservices, Queue, Resilience

## Nguyên tắc cốt lõi: Stateless Backend

Backend phải **stateless** để scale ngang được. Nghĩa là bất kỳ instance nào cũng xử lý được bất kỳ request nào.

```text
Backend stateless
  ├── KHÔNG lưu session trong RAM instance
  ├── KHÔNG lưu state trong biến toàn cục
  └── State chia sẻ đặt ở: Redis / DB / Object Storage
```

### Session
- **SAI:** session lưu trong memory của từng node (mất khi scale/restart, LB không biết route).
- **ĐÚNG:** session/token lưu ở **Redis** (hoặc JWT stateless) — mọi instance đọc chung.

### File upload
- **SAI:** lưu file lên disk của instance (không share được giữa các node).
- **ĐÚNG:** lưu vào **object storage** (S3-compatible) — instance nào cũng đọc được.

### Tác vụ nền
- Tác vụ nặng/không realtime → đưa vào **queue + worker**, không xử lý trong request.

```text
Request tạo đơn
  → Backend ghi order pending
  → Đẩy job vào queue
  → Worker xử lý thanh toán/email/notify
  → Cập nhật trạng thái
```

---

## Modular Monolith vs Microservices

### Modular Monolith (MẶC ĐỊNH — khuyên dùng)

Một codebase, chia module rõ ràng, boundary qua module/package:

```text
src/
├── modules/
│   ├── auth/
│   ├── user/
│   ├── order/
│   ├── payment/
│   └── notification/
```

**Ưu điểm:**
- Dễ phát triển, deploy 1 lần.
- Ít phức tạp vận hành.
- Chi phí thấp.
- Vẫn có thể scale ngang toàn bộ app.

**Nhược điểm:**
- Tải giữa module không tách riêng được (phải scale cả app).

→ **Chọn Modular Monolith trừ khi có lý do rõ ràng để tách.**

### Microservices (chỉ khi cần)

```text
auth-service
user-service
order-service
payment-service
notification-service
```

**Nên tách khi có:**
- Nhiều team, mỗi team ownership riêng một service.
- Module có nhu cầu scale/deploy hoàn toàn khác nhau.
- Tính tải/bottleneck khác biệt rõ rệt giữa module.

**Nhược điểm (đáng cân nhắc):**
- Khó debug, cần tracing/service discovery/message broker.
- Chi phí DevOps cao.
- Lỗi network dễ phát sinh.
- Không nên tách chỉ vì "hệ thống lớn".

> 💡 Con đường an toàn: bắt đầu **Modular Monolith**, tách service sau theo bottleneck/ownership thực tế.

---

## Resilience Patterns (bắt buộc khi Tier ≥ High Traffic)

### Timeout
- Mọi external call phải có timeout. Không để treo vô hạn.

### Retry (có giới hạn, có backoff)
- Retry khi lỗi tạm thời (network, 5xx, timeout), **không retry** lỗi 4xx.
- Dùng **exponential backoff + jitter**.

### Circuit Breaker
- Khi 1 dependency lỗi liên tục → mở mạch, fail fast thay vì gọi tiếp.
- Sau cooldown → thử lại (half-open).

### Bulkhead
- Cách ly tài nguyên giữa các dependency (không để 1 service chậm kéo sập toàn hệ thống).

### Idempotency Key
- Endpoint ghi (payment, order, webhook) phải chấp nhận **idempotency key** để chống ghi trùng khi retry.

```json
POST /orders
{
  "items": [...],
  "idempotency_key": "uuid-của-yêu-cầu"
}
```

### Rate Limiting
- Giới hạn request theo IP/user/API key.
- Thường đặt ở API Gateway hoặc middleware + Redis (distributed).

### Backpressure / Queue giới hạn
- Queue nên có giới hạn độ dài; khi full → trả lỗi sớm thay vì tích trữ vô hạn.

---

## Checklist backend (Tier ≥ High Traffic)
- [ ] Stateless instance (session/cache/state ở Redis/DB)
- [ ] File upload → object storage
- [ ] Tác vụ nền → queue + worker
- [ ] Timeout + retry (có backoff) + circuit breaker
- [ ] Idempotency key cho endpoint ghi
- [ ] Rate limiting
- [ ] Connection pool DB
- [ ] Graceful shutdown + health/readiness probe
