# Spec Init — dựng spec cho project CŨ (code đã có, chưa có spec)

> **Mục đích:** project đã chạy/thừa kế (legacy) chưa có `SPECIFICATIONS.md` → đọc code có sẵn, **dựng ngược** ra spec + versioning + scope bàn giao cho template TEST.
> Khác `spec-publish.md` (sau bug/feature) — cái này là **bootstrap 1 lần cho code đã có**.

## Khi nào dùng
- Nhận project cũ: code đã chạy nhưng không có spec/docs
- Muốn bên test có spec + độ phủ để test (đặc biệt legacy chưa test)
- Chạy **1 lần** ở đầu; sau đó dùng `/spec-publish` cho các thay đổi tiếp theo

## Quy trình

### 1. Scan codebase (không sửa gì)
- Liệt kê: modules/packages, routes/endpoints, models/schema, screens/components, jobs/queues, integrations
- Đọc: `package.json`/`requirements.txt`, route/controller, schema/migration, README, config
- Nguồn phụ nếu có: docs/ cũ, OpenAPI, ERD, comment, test cũ

### 2. Trích requirements từ hành vi thực tế
Với mỗi đơn vị chức năng → 1 requirement `R-xx` **mô tả hành vi code đang làm** (không phải điều mơ ước):
- Nhóm theo domain/module (auth, billing, catalog...)
- Mỗi `R-xx`: title + behavior (input → output) + nguồn (file:line)
- Ghi rõ chỗ **không chắc** = `[cần xác nhận]` — KHÔNG bịa

### 3. Sinh `SPECIFICATIONS.md`
- Frontmatter: `spec_version: 1.0.0` + `updated_at`
- Section theo module, mỗi feature = `R-xx` + behavior + ghi chú `[reverse-engineered from code]`

### 4. Khởi tạo `spec/`
- `spec/CHANGELOG.md`: dòng `1.0.0 | <date> | initial | Reverse-engineered spec từ code có sẵn`
- `spec/updates/<date>-reverse-spec.md`: ghi nguồn (code scan), phạm vi, điểm `[cần xác nhận]`
- `spec/archive/` (trống, dùng sau)

### 5. Sinh `spec/test-scope/current.json` (bàn giao TEST)
```jsonc
{
  "specVersion": "1.0.0",
  "scopeVersion": 1,
  "generatedAt": "<iso>",
  "trigger": "initial-build",
  "workItem": "reverse-spec-from-code",
  "specRefs": ["R-01", "R-02", "..."],   // TOÀN BỘ req (vì chưa test gì)
  "changed": { "files": [...], "modules": [...] },
  "impact": { "direct": [toàn bộ module], "dependents": [], "regression": [] },
  "acceptance": ["(điền tiêu chí nếu suy được từ code, còn lại ghi [cần xác nhận])"],
  "risk": "high"                          // legacy chưa test → risk cao
}
```
> `risk: high` → bên test sẽ bắt buộc characterization test + mutation verify trước khi sửa.

### 6. Validate + bàn giao
- Chạy `spec-validator` → cross-check spec vs code (không sót module nào)
- Báo user: số `R-xx` đã dựng, danh sách `[cần xác nhận]`
- Commit: `SPECIFICATIONS.md` + `spec/*` — bên test `/spec-link` là đọc được ngay

## Rules
1. **Dựng ngược từ code, không bịa** — mỗi req phải có nguồn `file:line`.
2. Chỗ không chắc → `[cần xác nhận]`, không đoán thành hành vi.
3. `risk: high` mặc định (legacy chưa test).
4. Đây là bootstrap — sau đó mọi thay đổi dùng `/spec-publish`.
5. Không sửa code trong bước này (chỉ đọc).
6. Nếu project quá lớn → chia theo module, ưu tiên module có nghiệp vụ/được sửa nhiều.
