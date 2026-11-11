---
description: "Read-only soi/kiểm tra một màn hoặc khu vực, liệt kê defect. KHÔNG sửa code."
argument-hint: "<màn hình | khu vực>"
---

Chạy **Bug discovery (sweep)** — chế độ **READ-ONLY** — trong `AGENTS.md`,
`.agent/workflows/bug.md` (§2b Bug discovery) cho khu vực/màn sau:

`$ARGUMENTS`

> ⚠️ **This command is prompt-enforced read-only**; the final `git status --short` check is
> **mandatory**. If any file other than `scan.md` changed, **stop and report the violation**.
> Không đổi command này thành builder flow — không build, không fix, không sửa code.

Bạn là người **soi lỗi**, KHÔNG phải người sửa lỗi. Tuyệt đối tuân thủ:

1. **KHÔNG sửa code** — không edit bất kỳ file nguồn nào, không refactor, không format.
2. **KHÔNG gọi subagent `builder` / `builder-strong`**.
3. **KHÔNG update** `.context/progress.json`, **KHÔNG commit / push / deploy**.
4. **KHÔNG sửa mò** — chỉ ghi nhận điều quan sát được, đánh dấu rõ chỗ chưa chắc chắn.
5. Chỉ được phép **tạo/ghi đúng một file**: `tasks/bug-<slug>/scan.md`
   (`<slug>` = slug ngắn mô tả khu vực, vd `bug-checkout-flow`).
6. Nếu khu vực mơ hồ tới mức không xác định được phạm vi → hỏi lại 1 lần rồi mới soi.

## Báo danh dashboard (prompt-level)
`/bug-check` chạy trong session chính → **tự gọi** `enter`/`leave` (hook `Agent` không bắt được):
```bash
node tools/agent-live.mjs enter --agent bug-check --role bug-check   # → Sherlock, phase debugging
# ... soi xong ...
node tools/agent-live.mjs leave --agent bug-check
```
Lỗi/thiếu file này KHÔNG chặn việc soi.

## Cách soi (chỉ đọc)

- Đọc `.context/project-config.md` trước để lấy `source_roots`; nếu `source_roots: []` hoặc placeholder
  → ghi `skip, no app configured` / `[cần xác nhận]`, không tự hardcode path app.
- Phân loại phạm vi trước khi soi:
  - **SINGLE-SURFACE**: 1 màn/luồng cụ thể.
  - **CROSS-CUTTING**: lỗi lặp hệ thống như theme/dark mode, permission, i18n, tenant/campus,
    responsive, format tiền/ngày, a11y, loading/empty state.
- SINGLE-SURFACE: xác định màn hình / module / route / file liên quan.
- CROSS-CUTTING: bắt buộc enumerate toàn bộ surface ứng viên trước khi kết luận, **CẤM sampling**.
  Theo từng `source_roots`, liệt kê page `**/page.tsx`, layout `**/layout.tsx`, component dùng chung
  `**/components/**/*.tsx`, CSS `**/*.css`.
- CROSS-CUTTING query count-based: đếm match theo từng file. File `count=0` vẫn coi là đã soi và ghi coverage;
  file `count>0` chỉ đọc đúng vùng match để xác nhận, loại trừ variant hợp lệ như `dark:` hoặc design token đúng.
- Chia batch 15–25 file/batch; append `scan.md` sau **mỗi batch**, không chờ cuối.
- Không kết luận khi coverage chưa đủ. Chỉ dừng khi 100% surface đã enumerate hoặc liệt kê rõ `## Chưa soi`
  với lý do và `% đã soi`.
- Đọc code + trace luồng; đối chiếu `docs/**`, `SPECIFICATIONS.md`, `.context/project-config.md`.
- Với mỗi nghi vấn: xác định **tái hiện** (điều kiện, bước), **expected vs actual**,
  **root cause kèm `file:line`** (nếu chưa chắc ghi `nghi ngờ` + lý do).
- CRUD/capability: **KHÔNG đánh giá cấp module**. Mỗi API collection/mutation
  (`GET/POST/PATCH/DELETE /module/resource`) là **một dòng capability riêng**.
- `Create UI = Có` chỉ khi đúng resource đó có nút/form; không suy từ resource khác cùng module.
- API có `POST` nhưng FE chỉ list, không có nút/form/empty CTA → ghi DEFECT hoặc `[cần xác nhận]`.
- Empty state không chỉ cách tạo data nguồn → ghi DATA_SETUP/UX_DEFECT.
- Ưu tiên chạy check read-only để có bằng chứng (đọc `.context/project-config.md` →
  `web_typecheck_command`, `web_lint_command`, `api_typecheck_command`, `api_lint_command`,
  `test_command`; `check_commands` chỉ là alias tổng hợp nếu project đã điền).
  Không chạy lệnh ghi/xóa/mutate dữ liệu. Nếu project chưa có app code hoặc command chưa cấu hình
  → ghi `skip, no app configured`, không coi là workflow fail.

## Output — bắt buộc ghi vào `tasks/bug-<slug>/scan.md`

```markdown
# Scan: <khu vực> — <YYYY-MM-DD>

## Phạm vi đã soi
- ...

## Classification
- Type: SINGLE-SURFACE | CROSS-CUTTING
- Source roots: ...

## Coverage
- Enumerated surfaces: <n>
- Đã soi: <n>
- Coverage: <percent>%

| File | Surface type | Batch | Count | Kết luận |
|---|---|---:|---:|---|
| `path/file.tsx` | page/layout/component/css | 1 | 0 | soi, no match |

## Chưa soi
- <file/surface> — <lý do> — <% còn lại>

## CRUD / Capability Matrix

| Module | Sub-resource/API | FE section/table | List | Create UI | Edit UI | Delete UI | Empty CTA | Evidence |
|---|---|---|---|---|---|---|---|---|
| ... | `GET/POST/PATCH/DELETE /module/resource` | ... | Có/Không | Có/Không/[cần xác nhận] | Có/Không | Có/Không | Có/Không | `file:line` |

## Defects

| # | Mô tả | Tái hiện | Expected | Actual | Root cause (file:line) | Severity | File cần sửa | Ước lượng |
|---|-------|----------|----------|--------|------------------------|----------|--------------|-----------|
| 1 | ... | ... | ... | ... | `path/file.ts:42` | blocker/high/medium/low | ... | S/M/L |

## Chưa xác minh / cần thêm info
- ...
```

## Kết thúc

1. In bảng defect ở trên cho user.
2. **DỪNG — chờ user chọn defect** muốn xử lý (user sẽ chạy `/bug` cho từng defect).
3. Chạy `git status --short` và tự kiểm: **chỉ `tasks/bug-<slug>/scan.md` được xuất hiện là file mới/thay đổi**.
   Nếu có file khác biến động → **stop and report violation** ngay (bạn đã vi phạm read-only).
