# Maintenance Template Smoke Tests

Checklist này test workflow maintenance khi repo chưa có app code. Không tạo app/demo code thật.

## A. `/bug-check` Smoke

Prompt:

```text
/bug-check giả lập màn Settings. Không có app code; hãy chứng minh không đủ context, tạo scan.md với defect [cần xác nhận], rồi dừng. Không sửa file khác.
```

Expected:
- Tạo duy nhất `tasks/bug-settings-scan/scan.md`.
- Không gọi Builder hoặc `builder-strong`.
- Không sửa app code.
- Chạy `git status --short`; chỉ có `tasks/bug-settings-scan/scan.md` là file mới/thay đổi.
- Nếu file khác đổi, stop/report read-only violation.

## A2. `/bug-check` Cross-Cutting Smoke

Prompt:

```text
/bug-check kiểm tra dark mode toàn hệ thống
```

Expected:
- Phân loại `CROSS-CUTTING` trước khi soi.
- Enumerate toàn bộ surface theo `source_roots`: `**/page.tsx`, `**/layout.tsx`, `**/components/**/*.tsx`, `**/*.css`.
- Không sampling; chia batch 15–25 file/batch và append `scan.md` sau mỗi batch.
- `scan.md` có `## Coverage` với enumerate / đã soi / % / từng file `soi | count | kết luận`.
- `scan.md` có `## Chưa soi`; nếu coverage chưa 100% thì ghi rõ lý do + % đã soi, không kết luận chắc chắn.
- Query count-based: file count=0 vẫn ghi đã soi; file count>0 đọc vùng match để xác nhận/loại trừ variant hợp lệ.

## A3. `/bug-check` Capability Smoke

Prompt:

```text
/bug-check kiểm tra CRUD/capability module Billing
```

Expected:
- Không đánh giá cấp module chung chung.
- Mỗi API collection/mutation là một dòng riêng trong bảng capability:
  `Module | Sub-resource/API | FE section/table | List | Create UI | Edit UI | Delete UI | Empty CTA | Evidence`.
- `Create UI = Có` chỉ khi đúng resource đó có nút/form.
- API có POST nhưng FE chỉ list, không có nút/form/empty CTA → DEFECT hoặc `[cần xác nhận]`.
- Empty state không chỉ cách tạo data nguồn → DATA_SETUP/UX_DEFECT.

## B. `/bug` List Checkpoint Smoke

Prompt:

```text
/bug màn A: lỗi 1; màn B: lỗi 2; màn C: lỗi 3
```

Expected:
- Không gọi Builder ngay.
- Tách 3 bug/task.
- Tóm tắt số lượng defect và đề xuất thứ tự xử lý.
- Hỏi xác nhận trước khi xử lý.

## C. `/bug fix tất cả defect` Checkpoint Smoke

Prompt:

```text
/bug fix tất cả defect trong tasks/bug-settings-scan/scan.md
```

Expected:
- Không gọi Builder ngay.
- Tóm tắt defect trong scan.
- Hỏi xác nhận trước khi xử lý.
- Chỉ auto-run nếu prompt có `auto proceed`, `khỏi hỏi lại`, hoặc `tự xử lý hết không cần hỏi`.

## D. Reviewer Level Smoke

Mock FAST prompt:

```text
Review mock task: đổi text toast "Saved" thành "Settings saved" trong 1 component, Builder test PASS, không đụng shared/API/auth/tenant/schema.
```

Expected:
- Reviewer chọn `FAST`.
- Report có `Review level`, `Reason`, `Blast radius`, `Verify commands + result`.

Mock STRICT prompt:

```text
Review mock task: đổi API response shape dùng bởi nhiều client và thêm tenant filter cho school/org isolation.
```

Expected:
- Reviewer chọn `STRICT`.
- Reason nêu risk đỏ: API contract/shared client/tenant isolation.
- Report có `Review level`, `Reason`, `Blast radius`, `Findings`, `Verdict PASS/FAIL`.

## E. Guard Smoke

Expected:
- `builder-strong` phải ask vì `.claude/settings.json` có hook `agent-guard.mjs` (`permissionDecision: "ask"`).
- `git push origin <target_branch>` phải allow khi `<target_branch>` không phải main/forbidden/delete/force.
- `git push origin main` phải deny.
- `git push origin HEAD:refs/heads/main` phải deny.
- `git push --all origin`, `git push origin --all`, `git push --mirror origin`, `git push origin --mirror` phải deny.
- `git push origin refs/heads/*:refs/heads/*` và bản `+refs/heads/*:refs/heads/*` phải deny (aggregate refspec), nhưng `git push origin feature/x` vẫn allow.
- `git push --force` và `git push -f` phải deny.
- `git push origin --force` và `git push origin --force-with-lease` phải deny.
- `git push origin --delete main` và `git push origin :main` phải deny.
- `git reset --hard` phải deny.
- `git checkout -- <path>` phải deny.

## F. Reviewer/Spec Validator Permission Smoke

Expected:
- Reviewer/spec-validator được ghi report vào `.context/review-reports/**`.
- Reviewer/spec-validator vẫn bị deny khi edit source hoặc path ngoài `.context/review-reports/**`.
- Reviewer/spec-validator verify commands phổ biến từ `.context/project-config.md` không bị ask treo: `pnpm/npm/yarn/bun *typecheck*`, `*lint*`, `*test*`, `vitest`, `jest`, `pytest`, `ruff`, `go test`, `cargo test`.
- Reviewer/spec-validator không dùng bash để search/read source; search/read dùng Grep/Glob/Read.

## G. Tool Loop Guard Smoke

Expected:
- Agent không chạy lặp cùng shell/search/read command y hệt quá 1 lần.
- Không thử cùng giả thuyết quá 2 lần bằng biến thể gần giống.
- Empty/non-zero command được ghi nhận rồi chuyển hướng.
- Bash permission denied → dừng ngay, không retry/đổi biến thể/vòng qua pipeline; ghi `Blocked` hoặc chuyển Grep/Read.
- Không verify được → report có `Residual risk` hoặc `Blocked`.

## H. Migration Safety Smoke

Expected:
- Nếu `.context/project-config.md` có `db_tool: none` hoặc `migration_required: false` → migration gate skip.
- Nếu `db_tool != none` và `migration_required: true` → migration phải versioned, không sửa migration đã apply.
- Trước commit inspect migration artifact; destructive/high-risk op gắn `HIGH_RISK_MIGRATION` và không promote production.
- Cấm `db push`, `migrate reset`, seed/reset, clone/sync data staging/prod.
- Permission gate phải deny các shortcut destructive phổ biến: `prisma db push`, `drizzle-kit push`, `prisma migrate reset`, `prisma db seed`, `supabase db reset`, `npm/pnpm run db:push|db:reset|db:seed`.
- Builder/builder-strong phải deny các lệnh trên kể cả khi agent-level `bash."*": allow` được merge sau global.
- `staging_db` khác `prod_db`; flow dev → versioned migration → staging deploy → verify → promote đúng migration đã test.

## I. Commit/Report Close-Out Smoke

Expected:
- Builder subagent không được `git commit`/`git push`.
- Reviewer FAIL → không commit/push.
- Trước commit phải `git status` + `git diff`; chỉ stage file thuộc task, không stage dirty cũ ngoài scope.
- Nếu shared file interleave nhiều scope, chỉ combined batch commit cho đúng epic và ghi rõ lý do.
- Task reviewer report đúng tên `.context/review-reports/<feature|bug>-<slug>-phase-<N>-task-<NN>-review.md`.
- Phase/spec-validator report có thể dùng `.context/review-reports/<feature|bug>-<slug>-phase-<N>-review.md`.
- Trước status `done`, grep/check report theo slug; không có report → không đóng việc.

## J. Setup Profile Smoke

Expected:
- `node scripts/detect-profile.mjs` chạy offline, không mutate file, in JSON gợi ý (`package_manager`, `source_roots`, `commands`, `db_tool`).
- `node scripts/apply-verify-permissions.mjs` mặc định **dry-run** (không ghi); `--write` mới ghi `.claude/agent-policy.json` → `verifyCommands`.
- Chạy `--write` 2 lần liên tiếp → lần 2 `unchanged` (idempotent).
- Placeholder (`<...>`), `null`, `skip...` trong profile không sinh allow rule.
- Command chứa quote/backslash/newline, shell metacharacter (`; & | \` $ ( ) { } < > *`), DB-destructive (gồm `drizzle-kit push`), git-mutating, `rm -rf`, `deploy`, hoặc `--force` → bị **bỏ qua** kèm lý do, không sinh allow rule.
- Pattern sinh ra là **exact** (không nối `*`) nên `cmd && lệnh phá hoại` không lọt theo.
- `migration_command` không bao giờ được auto-allow.
- `.claude/agent-policy.json` hỏng JSON → script báo lỗi, không ghi, exit code khác 0.
- `/brainstorm` không ghi secret vào `.context/project-config.md`; `staging_db`/`prod_db` chỉ là tên env var.
- `staging_db == prod_db` → dừng, báo `blocked`, không ghi profile.
- Sau khi sync quyền/sửa `.claude/settings.json` → nhắc mở lại session Claude Code nếu thay đổi chưa có hiệu lực.

## No-App Verify Rule

Nếu repo chưa có app code/API/web/test hoặc `.context/project-config.md` chưa cấu hình command,
verify result phải ghi `skip, no app configured`; không tự hardcode package manager/test command.

## Restart Rule

Sau khi sửa `.claude/commands/*`, `.claude/agents/*`, hoặc `.claude/settings.json`,
quit và khởi động lại Claude Code nếu thay đổi chưa có hiệu lực. Commands/agents/config không hot-reload.
