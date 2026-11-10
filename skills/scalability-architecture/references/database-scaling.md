# Database Scaling — Cache, Replica, Partitioning, Sharding, Warehouse

Database thường là **điểm nghẽn lớn nhất**. Đây là thứ tự tối ưu — làm từ trên xuống, KHÔNG nhảy cóc:

```text
1. Tối ưu query + index          ← luôn làm trước
2. Cache (Redis)                  ← giảm tải đọc
3. Scale backend ngang            ← giảm connection áp lực
4. Tách tác vụ nền qua queue      ← giảm tải request
5. Read replica                   ← tách đọc/ghi
6. Partitioning                   ← chia bảng lớn
7. Sharding / Distributed SQL     ← cuối cùng mới cân nhắc
```

---

## 1. Primary + Read Replica

```text
Write / Update / Delete  →  Primary DB
Read (đa số)             →  Read Replicas
```

- Ghi vào primary.
- Đọc scale ra nhiều replica.
- Cần chấp nhận chút **replication lag**.
- Màn hình cần dữ liệu tức thời → route đến primary.

### Route read/write (ví dụ Node)
```js
// write → primary pool
pool = new Pool({ host: process.env.DB_PRIMARY })
replicaPool = new Pool({ host: process.env.DB_REPLICA })

// SELECT → replica
const rows = await replicaPool.query('SELECT ...')
// INSERT/UPDATE/DELETE → primary
await pool.query('UPDATE ...')
```

> ⚠️ Không dùng replica cho dữ liệu vừa mới ghi cần tức thời (session vừa tạo, order vừa đặt).

---

## 2. Cache (Redis)

Dùng Redis cho:
- Session / token
- Cache user / profile
- Cache danh sách sản phẩm, config
- Rate limit
- Distributed lock
- Counter / ranking / leaderboard
- Short-lived token (OTP, refresh rotation)

### Mô hình cache-aside
```text
Backend → Redis
        ↘ nếu cache miss → Database
        → ghi lại vào Redis (với TTL)
```

Quy tắc:
- Luôn có **TTL** (tránh cache vô hạn).
- Có chiến lược **invalidation** rõ ràng (xóa/update khi data đổi).
- **Không cache mọi thứ** — chỉ cache thứ đọc nhiều, đổi ít.

---

## 3. Partitioning

Chia bảng lớn theo:
- **Thời gian** (ngày/tháng/năm) — logs, transactions, events.
- **Tenant / region** — dữ liệu theo khách hàng/khu vực.
- **Hash range** — chia đều theo khóa.

```text
transactions_2026_01
transactions_2026_02
transactions_2026_03
```

Hữu ích với **dữ liệu lịch sử lớn** — query chỉ chạy trên partition cần, dễ archive/drop partition cũ.

---

## 4. Sharding

Khi một DB không đủ tải **hoặc** dữ liệu vượt khả năng 1 node:

```text
Shard 1: user_id 1 → 10 triệu
Shard 2: user_id 10 triệu → 20 triệu
Shard 3: ...
```

Shard theo:
- `user_id` / `tenant_id`
- Khu vực
- Hash của khóa

### Cân nhắc
- ✅ Scale lớn thật sự.
- ⚠️ Query cross-shard khó (join, transaction, aggregate).
- ⚠️ Cần chiến lược rebalance, migration phức tạp.
- 🔒 **Chỉ dùng sau khi đã tối ưu index, query, replica, partitioning** — đây là bước cuối, tốn kém nhất.

> Nếu có thể, ưu tiên dùng **distributed SQL** (CockroachDB, TiDB, YugabyteDB, AWS Aurora, Cloud Spanner) để có sharding nhưng vẫn query bình thường — giảm gánh nặng vận hành so với sharding tự quản.

---

## 5. Tách OLTP / Data Warehouse

KHÔNG để database giao dịch (OLTP) xử lý luôn báo cáo nặng.

```text
OLTP DB → CDC/ETL → Data Warehouse (báo cáo, BI, analytics)
                  → Read Model / Search (OpenSearch, Elasticsearch)
```

- **OLTP**: giao dịch realtime (đơn hàng, user, payment).
- **Read Model / CQRS**: màn hình đọc nặng (feed, dashboard) — materialize sẵn.
- **Data Warehouse**: báo cáo, BI, thống kê, analytics lịch sử.

---

## Checklist database (theo Tier)

### Tier Standard
- [ ] Index hợp lý cho query chính (WHERE, JOIN, ORDER)
- [ ] Connection pool
- [ ] Migration + backup
- [ ] Không N+1 query

### Tier High Traffic
- [ ] Redis cache + session (có TTL + invalidation)
- [ ] Read replica + route read/write
- [ ] Partitioning cho bảng lớn (logs/transactions)
- [ ] Query plan review cho query chậm

### Tier Enterprise
- [ ] Sharding hoặc distributed SQL (khi cần thiết)
- [ ] Data warehouse + CDC/ETL tách báo cáo
- [ ] Read model / CQRS cho màn hình đọc nặng
