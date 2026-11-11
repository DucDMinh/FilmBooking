---
description: "Phát hành spec cho template test: bump spec_version + spec/updates/ + CHANGELOG + spec/test-scope/current.json."
argument-hint: "[--feature <slug> | --bug <slug>]"
---
# /spec-publish — Phát hành spec cho template test (thủ công / chạy lại)

Chạy quy trình `.agent/spec-publish.md` để bump version + sinh scope bàn giao cho test.

## Cách dùng
```
/spec-publish                 → chạy theo thay đổi gần nhất (đọc diff/context)
/spec-publish --feature <slug> → phát hành cho feature <slug>
/spec-publish --bug <slug>     → phát hành cho bug <slug>
```

## Báo danh dashboard (prompt-level)
`/spec-publish` chạy trong session chính → **tự gọi** `enter`/`leave` (hook `Agent` không bắt được):
```bash
node tools/agent-live.mjs enter --agent spec-publisher --role spec-publisher   # → Oracle, phase publishing
# ... xong ...
node tools/agent-live.mjs leave --agent spec-publisher
```
Lỗi/thiếu file này KHÔNG chặn flow.

## Flow
1. Xác định requirement mới/đổi (specRefs) + vùng ảnh hưởng (direct/dependents/regression)
2. Bump `spec_version` nếu requirement đổi; ghi `spec/updates/YYYY-MM-DD-<slug>.md`
3. Thêm dòng `spec/CHANGELOG.md`
4. Sinh `spec/test-scope/current.json` (tăng `scopeVersion`)
5. Báo: "spec vX.Y.Z + scope vN đã phát hành"

> Command này thường được **gọi tự động** ở cuối bug/feature workflow — dùng thủ công khi cần chạy lại hoặc phát hành tay.