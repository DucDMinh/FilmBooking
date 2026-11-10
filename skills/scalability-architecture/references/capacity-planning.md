# Capacity Planning — Ước tính tải và chọn Tier từ con số thực tế

Đây là cách biến câu nói mơ hồ "nhiều user" thành **con số đo được** để chọn kiến trúc đúng.

## Đổi CCU → request rate

Số request mỗi giây (RPS) = số user đồng thời × số request mỗi user mỗi giây (trung bình).

```text
RPS ≈ CCU × req_per_user_per_second
```

**Ví dụ:**
- 10.000 CCU, mỗi user ~1 request / 10 giây → RPS ≈ 10.000 × 0.1 = **1.000 RPS**
- 100.000 CCU, mỗi user ~1 request / giây → RPS ≈ **100.000 RPS** (rất nặng)

> ⚠️ CCU thôi chưa đủ. Một hệ 100k user nhưng chỉ 1 req/phút (≈1.700 RPS) có thể NHẸ hơn hệ 10k user nhưng 20 req/giây (≈200k RPS).

## Các con số cần thu thập khi brainstorm

Khi user bật **Scalability Option**, hỏi (từng câu một):

1. **Số user đồng thời dự kiến (CCU)**
   - "Khoảng bao nhiêu user online cùng lúc vào giờ cao điểm?"
2. **Peak requests per second (RPS)**
   - "Ước tính đỉnh tải bao nhiêu request/giây? (nếu chưa biết, cho số user + tần suất thao tác)"
3. **Tỉ lệ đọc/ghi (read/write ratio)**
   - "Chủ yếu đọc hay ghi? Ví dụ xem tin (đọc nhiều) vs chat/nhập liệu (ghi nhiều)?"
4. **Peak/off-peak chênh lệch**
   - "Tải cao điểm gấp mấy lần tải bình thường? (vd 10x khi có event/khuyến mãi)"
5. **Tăng trưởng trong 6–12 tháng**
   - "Kỳ vọng user tăng gấp mấy lần trong năm tới?"
6. **Availability target (SLA)**
   - "Yêu cầu uptime bao nhiêu? 99% / 99.9% / 99.99%?"
7. **Recovery requirement (RTO/RPO)**
   - RTO: "Nếu sập, chấp nhận downtime tối đa bao lâu?"
   - RPO: "Chấp nhận mất dữ liệu tối đa bao lâu?" (vd 5 phút / 1 giờ)

## Bảng quy đổi gần đúng → gợi ý Tier

| RPS (đỉnh) | CCU (gần đúng) | Gợi ý Tier |
|------------|----------------|------------|
| < 100      | < 1k           | Standard |
| 100 – 1k   | 1k – 10k       | Standard / High Traffic |
| 1k – 10k   | 10k – 100k     | High Traffic |
| > 10k      | > 100k         | Enterprise |

> Đây là ước tính gần đúng. Quyết định cuối dựa trên **RPS, latency target, read/write ratio, payload, storage growth** — không chỉ CCU.

## Công thức nhanh cho capacity

### Backend instances
```text
instances ≈ peak_RPS / (RPS mỗi instance)
```
Ví dụ: 1.000 RPS, mỗi instance xử lý 200 RPS → cần ~5 instance (thêm buffer + N+1 cho HA).

### Database
- Read-heavy (ratio đọc/ghi cao) → cần read replica.
- Write-heavy → cần tối ưu ghi, tách queue, có thể shard sớm hơn.

### Storage growth
```text
storage_1_năm ≈ (bytes/user/month) × user × 12
```
- Vượt vài trăm GB → cân nhắc partitioning + archive.
- Vượt vài TB → cân nhắc sharding / distributed SQL / lưu blob ở object storage.

## Nguyên tắc
- **Luôn bắt đầu từ con số** — nếu user không có số liệu, mặc định Tier Standard và thiết kế horizontal-scaling-ready (để sau này nâng cấp không phải viết lại).
- **Over-provision có chủ đích nhưng đừng over-engineering** — triển khai đủ cho peak hiện tại + một bước tăng trưởng, rồi scale theo đo lường thực tế.
- Ghi đầy đủ các con số này vào **`SPECIFICATIONS.md` (mục Scalability Profile)** để mọi agent cùng tham chiếu.
