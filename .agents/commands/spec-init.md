---
description: "Dựng spec (reverse-engineer) cho project CŨ đã có code nhưng chưa có spec. Read-only, chạy 1 lần."
argument-hint: "[module|path]"
---
# /spec-init — Dựng spec cho project CŨ (code đã có, chưa có spec)

Đọc codebase có sẵn → dựng ngược spec + versioning + scope bàn giao cho template test. Chạy **1 lần** cho project legacy.

## Cách dùng
```
/spec-init                    → scan toàn bộ codebase → dựng spec
/spec-init <module|path>      → chỉ dựng spec cho 1 module (project lớn)
/spec-init --dry-run          → chỉ liệt kê R-xx dự kiến, không ghi file (user xem trước)
```

## Báo danh dashboard (prompt-level)
`/spec-init` chạy trong session chính, hook `Agent` không bắt được, nên **tự gọi** đầu/cuối:
```bash
node tools/agent-live.mjs enter --agent spec-init --role spec-init   # → Oracle, phase publishing
# ... chạy flow ...
node tools/agent-live.mjs leave --agent spec-init
```
Lỗi/thiếu file này KHÔNG chặn flow (dashboard là phụ).

## Flow
1. Scan codebase (modules, routes, models, screens, jobs) — read-only
2. Trích requirement `R-xx` từ **hành vi thực tế** (mỗi cái có nguồn `file:line`)
3. Sinh `SPECIFICATIONS.md` (spec_version 1.0.0, ghi `[reverse-engineered from code]`)
4. Khởi tạo `spec/CHANGELOG.md` + `spec/updates/<date>-reverse-spec.md`
5. Sinh `spec/test-scope/current.json` (trigger `initial-build`, toàn bộ R-xx, risk `high`)
6. `spec-validator` cross-check → báo số req + danh sách `[cần xác nhận]`

## Sau khi xong
- Commit `SPECIFICATIONS.md` + `spec/*`
- Bên test: `/spec-link <git-url>` → `/coverage --init` → chạy characterization + test
- Thay đổi tiếp theo dùng `/spec-publish` (không chạy lại `/spec-init`)

## Rule
- Dựng ngược từ code, KHÔNG bịa; không chắc → `[cần xác nhận]`
- Không sửa code
- Project lớn → chia module, ưu tiên nghiệp vụ/module hay sửa