# Spec Notes

## Purpose
Ghi chú khi dựng/validate spec (`/spec-init`) và khi change request cập nhật spec.

## Format

```markdown
### {Ngày} — {change request / spec-init}

**Nguồn:** code scan | spec/changes/<file>
**Ghi chú:** {điểm cần lưu}
```

## Log

### 2026-11-10 — spec-init (từ BRD)

**Nguồn:** `docs/BRD.md` v0.3 (greenfield — chưa có app code; traceability bằng mã BRD thay cho `file:line`)
**Ghi chú:**
- `SPECIFICATIONS.md` spec_version 1.0.0: 134 requirement R-01…R-134 (121 MVP — 10 gắn phase `[cần xác nhận]`, 13 GĐ2 — 1 gắn), 15 module; phủ 140/140 mã BR, 18/18 NFR, 26/26 AC; có ma trận truy vết BR → R.
- Phase tag theo BRD §15; mục §15 không nêu tường minh gắn `[cần xác nhận]` (voucher lõi, báo cáo MVP, R-28, R-82, R-119).
- 16 điểm cần xác nhận ghi trong `SPECIFICATIONS.md` § Điểm cần xác nhận (nổi bật: quyền ghi của Staff ở BR-ADM-14 vs §5.3; vòng đời đơn kênh POS; AC-25 tham chiếu báo cáo GĐ2; tạo đơn mới khi đơn cũ `pending_payment`).
- Database Schema / API Endpoints chỉ ở mức ý định — tên bảng/cột/endpoint do implementation quyết định.
- `spec/test-scope/current.json`: scopeVersion 1, trigger `initial-build`, risk `high`, `changed.files: []`.
- Chưa chạy `spec-validator` (cần session chính gọi).
