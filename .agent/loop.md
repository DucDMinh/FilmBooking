# Loop Agent — Task Execution (ReAct Pattern, Parallel per-worktree)

> Engine thực thi task theo ReAct: Read → Plan → Act → Observe → Repeat.
> Trong 1 layer, các task độc lập chạy **SONG SONG** — mỗi task 1 **git worktree riêng**, mỗi builder agent chạy loop đầy đủ trong worktree của mình, rồi **dispatcher tự merge** bằng script.
> Điều phối: `AGENTS.md` + `.agent/FEATURE_WORKFLOW.md`. State: `.context/progress.json` (`features[]`/`bugs[]`).

## Role
- **Dispatcher** (loop chính): chia task độc lập trong layer thành các wave song song, setup worktree, spawn builder cho từng task, rồi **tự chạy bước merge** (`scripts/parallel-dispatch.mjs merge` + `cleanup`) và ghi progress.
- **Builder** (mỗi task 1 con, chạy song song): execute 1 task theo ReAct cycle (Read → Plan → Act → Observe) **bên trong worktree riêng** của mình rồi trả PASS/BLOCKED. Claude Code: builder không spawn subagent → **dispatcher** gọi reviewer, và reviewer PASS thì **dispatcher commit trong worktree** (`cd "<worktree>" && git add -A && git commit ...`).
- **Không có agent con tên `merger`.** Bước merge do **chính dispatcher** thực hiện tuần tự sau khi cả wave xong: gom branch về integration branch, verify tổng thể, ghi `progress.json` 1 lần.

## Trigger
- **`/start`** (project start): sau khi `graph` sinh layer plan + user duyệt plan → loop chạy layer 0 → …. (Đây là đường vào chính của initial build.)
- `change-request` hoặc `/change` chia xong phase/task (feature/bug)
- Hoặc resume từ `.context/progress.json`

---

## Parallel Execution Model (worktree-per-task)

> Đọc trước khi chạy 1 layer. Khi layer chỉ có 1 task → bỏ qua fan-out, chạy trực tiếp như cũ (để khỏi tốn worktree).

```
            ┌─────────────────────────────────┐
            │  DISPATCHER (loop chính)       │
            │  plan --layer N → các wave     │
            └──────────────┬─────────────┘
                          │  với mỗi wave:
        ┌───────────────┼──────────────┐   (spawn song song)
        ▼               ▼               ▼
  ┌────────┐    ┌────────┐    ┌────────┐
  │BUILDER │    │BUILDER │    │BUILDER │   mỗi con 1 worktree riêng
  │task-01 │    │task-02 │    │task-03 │   chạy FULL loop (Read→Plan→
  │(.wt/..)│    │(.wt/..)│    │(.wt/..)│   Act→Observe) → trả PASS; dispatcher gọi reviewer, PASS → commit trong worktree
  └────┬───┘    └────┬───┘    └────┬───┘
       └───────────┴───────────┘
                    ▼  (tất cả PASS + committed)
            ┌─────────────────────────────────┐
            │  DISPATCHER tự merge            │
            │  merge --layer N → verify tổng  │
            │  → update progress.json 1 lần  │
            │  → cleanup worktree            │
            └──────────────┬─────────────┘
                          ▼
                   HUMAN CHECKPOINT → layer N+1
```

### Đảm bảo độc lập — không giẫm chân nhau
1. **Nguồn gốc**: graph đã đảm bảo *task trong cùng layer không phụ thuộc nhau* (graph Rule #3).
2. **Check file trùng**: `plan --layer N` đọc trường **Files to Create/Modify** của mỗi task; 2 task khai trùng file → **không xếp cùng wave** (task sau đẩy sang wave kế). Mỗi wave = tập task chắc chắn không đụng file nhau.
3. **Cô lập vật lý**: mỗi task 1 **git worktree + branch riêng** (`.worktrees/<...>`, branch `wt/<...>`). Builder chỉ thấy working tree của mình → không thể ghi đè file của builder khác trong lúc chạy.
4. **State không tranh chấp**: builder con **KHÔNG** tự ghi `.context/progress.json`. Chỉ **dispatcher** ghi tập trung 1 lần sau khi gom xong (chống race condition).

### Dispatcher steps (loop chính, mỗi layer)
```
1. node scripts/parallel-dispatch.mjs plan --layer N
   → nhận JSON { waves: [[task...], [task...]] }
2. Với MỖI wave (tuần tự giữa các wave, song song TRONG wave):
   a. Với mỗi task trong wave:
        node scripts/parallel-dispatch.mjs setup --task <layer-N/task-NN>
        → nhận { worktree, branch }
        → nếu `.context/project-config.md` khai `worktree_setup_cmd`, script tự chạy hook đó
          (cwd = worktree, env WORKTREE_PATH / TASK_ID / WORKTREE_SLUG) để tạo DB riêng
          + ghi `.env.local` riêng. Hook fail → chỉ cảnh báo, KHÔNG chặn build.
   b. Spawn SONG SONG 1 builder/ task: gửi NHIỀU Agent tool call (`subagent_type: "builder"`) trong
      CÙNG MỘT message — Claude Code chạy chúng đồng thời, mỗi subagent có context riêng.
        task brief: "Worktree của bạn: <ĐƯỜNG DẪN TUYỆT ĐỐI tới .worktrees/...>.
                     Read/Edit/Write CHỈ dùng path tuyệt đối dưới worktree đó (không sửa file ở thư mục gốc);
                     mọi lệnh Bash chạy dạng `cd "<worktree>" && <lệnh>`.
                     Chạy loop Read→Plan→Act→Observe cho <task file>; chỉ touch file trong scope;
                     KHÔNG commit, KHÔNG ghi .context/progress.json; báo PASS/BLOCKED về."
        ngay TRƯỚC khi spawn, đánh dấu agent đang sống (display-only):
        node tools/agent-live.mjs enter --agent builder-<n> --role builder \
          --task <layer-N/task-NN> --title "<task title>" --phase building \
          --worktree <worktree>
        (n = số thứ tự builder trong wave; lỗi ở lệnh này KHÔNG được chặn build)
   c. Đợi TẤT CẢ builder trong wave xong (PASS hoặc BLOCKED).
      • builder PASS → node tools/agent-live.mjs leave --agent builder-<n>
        rồi node tools/agent-live.mjs enter --agent reviewer-<n> \
          --role reviewer --task <layer-N/task-NN> --title "<task title>" --phase review
        (gọi ngay trước khi spawn subagent reviewer; reviewer PASS → leave reviewer-<n>)
      • Reviewer: spawn `subagent_type: "reviewer"` cho mỗi task PASS (nhiều call trong 1 message = song song),
        brief ghi đường dẫn tuyệt đối worktree; reviewer chạy verify dạng `cd "<worktree>" && <lệnh>`.
          – reviewer PASS → dispatcher: `cd "<worktree>" && git add -A && git commit -m "<convention §2.8>"`
          – reviewer FAIL → SendMessage findings cho đúng builder đó (resume, giữ context) → review lại; tối đa 2 vòng
      • builder BLOCKED → leave builder-<n> (task quay về TODO)
3. Hết các wave → dispatcher TỰ chạy bước merge (phần dưới). KHÔNG spawn agent con nào.
```
> ⚡ Mỗi builder chạy **Execution Steps bên dưới y hệt như loop đơn luồng**, chỉ khác: `git`/commit diễn ra trong worktree của nó, và bước **6 (Progress Update)** → **KHÔNG** tự ghi, chỉ báo kết quả về dispatcher.

### Merge steps (dispatcher tự làm, sau khi layer xong)

> ⚠️ **Không có agent `merger`.** Đây là các bước *chính dispatcher* chạy tuần tự — merge chỉ là
> `scripts/parallel-dispatch.mjs merge` + `cleanup`, không phải một subagent riêng.
```
1. node scripts/parallel-dispatch.mjs merge --layer N
   → trước khi bắt đầu: node tools/agent-live.mjs enter --agent merger --role merger --phase merging
     (nhãn HIỂN THỊ cho dashboard biết đang ở bước merge — dispatcher tự gọi, không spawn agent)
   → gom mọi branch wt/layer-N__* về integration branch layer-N-integration.
   → NẾU CONFLICT: script DỪNG + in task gây conflict.
     → Xử lý: cho task đó chạy LẠI TUẦN TỰ trên integration branch (rebase/sửa tay),
       rồi merge tiếp các branch còn lại. (Conflict = dấu hiệu 2 task chưa thực sự độc lập → ghi `.context/error-memory.md` để graph lần sau tách kỹ hơn.)
2. Verify TỔNG THỂ trên integration branch (build/test/lint/typecheck theo project-config):
   từng task pass riêng KHÔNG đảm bảo ghép lại pass.
   → FAIL: gọi error-analyzer, fix trên integration branch, commit, verify lại.
3. Update `.context/progress.json` 1 LẦN — DÙNG HELPER, đừng tự viết JSON tay:
     node tools/progress-write.mjs complete --task <layer-N/task-NN> \
          --review "STRICT PASS" --round <R> [--report <review-report path>]
     node tools/progress-write.mjs block --task <id> --reason "..."
     node tools/progress-write.mjs set-layer --current <N+1> --total <M>
   Helper ghi atomic + dedupe theo task + tự xoá task khỏi inProgressTask/blockedTasks.
   (Schema `completedTasks` = mảng object `{task, review?, round?, report?, completedAt?}`.)
4. Merge integration branch về nhánh chính của project (theo DevOps/git policy).
5. node scripts/parallel-dispatch.mjs cleanup --layer N  (xoá worktree + branch tạm)
   → nếu khai `worktree_teardown_cmd`, script chạy hook đó TRƯỚC khi xoá (drop DB tạm / dọn .env.local riêng)
   → node tools/agent-live.mjs clear   (resets agents-live.json về rỗng)
6. → context-manager compact (bước 7 cũ) → HUMAN CHECKPOINT → layer N+1.
```

> 📺 **`agents-live.json` là file DISPLAY, không phải state.** `progress.json` vẫn là source of truth.
> Mất/hỏng `agents-live.json` KHÔNG ảnh hưởng loop — dashboard tự fallback suy luận từ worktree.
> Builder **vẫn KHÔNG** ghi `progress.json`; chỉ gọi `agent-live.mjs` (ghi 1 file riêng trong `.context/`).

> Một task tại một thời điểm **chỉ trong phạm vi 1 builder** (1 worktree). Song song xảy ra **giữa các builder** của các task độc lập — không phải trong 1 builder.

---

## Pattern

```
┌─────────────────────────────────────┐
│           READ                       │
│  • Task file                         │
│  • .context/error-memory.md          │
│  • Related existing code             │
│  • skills/react-nodejs/patterns.md   │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│           PLAN                       │
│  • List files to create/modify       │
│  • Identify potential issues         │
│  • Check error-memory for pitfalls   │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│           ACT                        │
│  • Write code                        │
│  • Write tests                       │
│  • Install dependencies if needed    │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│          OBSERVE                     │
│  • Run tests                         │
│  • Run linter                        │
│  • Check build                       │
└──────────────┬──────────────────────┘
               ▼
          PASS?─────── NO ──┐
            │                │
           YES               ▼
            │         ┌──────────────┐
            ▼         │ Error        │
     ┌──────────┐    │ Analyzer     │
     │ Commit   │    │ → fix        │
     │ → Review │    │ → retry ACT  │
     └──────────┘    └──────────────┘
```

---

## Execution Steps

### 0. Check Dependencies
TRƯỚC KHI làm bất cứ gì:
```
1. Đọc task file → lấy danh sách Dependencies
2. Đọc .context/progress.json → kiểm tra task/phase đã done chưa
3. Nếu dependency CHƯA done:
   → STOP
   → Báo: "⚠️ Task {NN} blocked: waiting for {task-XX} to complete first"
   → Chờ hoặc chuyển sang task khác không có dependency
4. Nếu ĐÃ DONE → proceed bình thường
```

### 1. Read Context
```
Read:
- Task file hiện tại — initial build: `tasks/<slug>/layer-{N}-task-{NN}.md`; change hậu-build: `tasks/<feature|bug>-<slug>/phase-<N>-task-<NN>.md`
- .context/error-memory.md (avoid past mistakes)
- skills/react-nodejs/conventions.md (style guide)
- skills/react-nodejs/patterns.md (implementation patterns)
- Related source files (if modifying existing code)
- .context/design-spec.md (nếu task liên quan UI/screen)
- skills/react-nodejs/design-tokens.md (nếu task liên quan UI/screen)

⚙️ Mọi task code (implement/bugfix/refactor):
- Đọc `skills/superpowers/SKILL.md` — Iron Law debug + TDD gate
- Trước khi fix bug → đọc `skills/superpowers/systematic-debugging.md` (4 phases)
- Trước khi thêm tính năng → đọc `skills/superpowers/test-driven-development.md` (test-first)
- Đọc `skills/ponytail/SKILL.md` — lazy senior dev ladder, chống over-engineering
- **Nếu task EDIT code có sẵn (nâng cấp/refactor/sửa) → Đọc `skills/karpathy-guidelines/references/surgical-changes.md`** — chỉ chạm đúng phần cần, không dọn dẹp code người khác, match style. (Think Before Coding: nêu giả định rõ, không tự chọn thầm cách hiểu mơ hồ — xem `skills/karpathy-guidelines/references/think-before-coding.md` nếu task mơ hồ)

🔒 Nếu task liên quan đến input handling, auth, database, API endpoint, hoặc secret:
- skills/security/semgrep-scan.md (scan lỗi bảo mật)
- skills/security/api-owasp.md (OWASP Top 10 API)
- skills/security/jwt-security.md (nếu dùng JWT/auth)
- skills/security/bola-idor.md (nếu có object-by-id endpoint)
- skills/security/sharp-edges.md (config/secret/secure-defaults)
→ PHẢI đọc ít nhất 1 security skill trước khi code bất kỳ file xử lý input/auth/DB

🔒 Mọi task thêm/cập nhật dependency:
- skills/security/supply-chain-audit.md (npm audit + dependency risk)

📊 Nếu task liên quan đến API endpoint, performance, logging, hoặc observability:
- skills/monitoring/otel-instrumentation.md (traces/metrics/logs backend)
- skills/monitoring/otel-browser.md (RUM Web Vitals, JS errors)
- skills/monitoring/otel-semantic-conventions.md (naming span/attribute)
→ PHẢI đọc ít nhất 1 monitoring skill trước khi code file API/performance/logging

Nếu task liên quan đến UI/component:
- .context/design-spec.md (layout spec cho screen này)
- skills/react-nodejs/design-tokens.md (colors, typography, spacing)
→ PHẢI đọc design tokens trước khi viết bất kỳ UI component nào
```

### 2. Plan
- Xác định files cần tạo/sửa
- Xác định dependencies cần install
- Check error-memory xem task tương tự đã gặp lỗi gì chưa
- Viết plan ngắn gọn (không cần lưu file, chỉ reasoning)

### 3. Act

**⚙️ MANDATORY TDD (theo `skills/superpowers/test-driven-development.md`):**
```
Write the test first. Watch it fail. Write minimal code to pass.
```
- **Critical paths (auth, payment, data mutations): viết test TRƯỚC khi viết code** (RED → GREEN)
- Các task khác: viết code và test cùng lượt
- Không viết code implement trước khi có failing test (trừ exception đã hỏi human)
- Nghĩ "skip test lần này" → DỪNG, đó là rationalization
- **Ponytail ladder (theo `skills/ponytail/SKILL.md`):** 1) cần tồn tại không (YAGNI) → 2) đã có trong codebase? → 3) stdlib? → 4) native? → 5) dependency đã cài? → 6) 1 dòng được? → 7) mới code tối thiểu

```
Task type checklist:
[ ] API endpoint     → integration test + contract test
[ ] Auth endpoint    → contract test (MANDATORY, test-first)
[ ] Business logic   → unit test: happy path + edge cases + errors
[ ] UI Component     → render test + user interaction
[ ] DB query         → unit test với mock/in-memory DB
```

- Viết code theo conventions
- Viết tests theo checklist trên
- Chạy `<install_command from project-config>` nếu cần package mới; nếu chưa cấu hình/chưa có app code → `skip, no app configured`
- Follow patterns theo stack trong `.context/project-config.md`; không áp dụng React/Node/Prisma nếu profile không khớp

### 4. Observe
```bash
# Run tests
<test_command from project-config>

# Lint
<lint_command from project-config>

# Type check (if TypeScript)
<typecheck_command from project-config>

# Build check
<build_command from project-config>
```

Nếu command chưa cấu hình hoặc repo chưa có app code/API/web/test, ghi `skip, no app configured` thay vì tự đoán `npm`/`pnpm`.

### 5. Evaluate
- **ALL PASS** → Commit (trong worktree của builder) → gọi subagent `reviewer` (`.claude/agents/reviewer.md`) review độc lập
- **FAIL** → gọi `error-analyzer` (`.agent/error-analyzer.md`) → fix → Retry from ACT
- **3 retries fail** → Mark task as BLOCKED → báo về dispatcher → Notify human

> ⚡ **Builder (chạy song song):** commit trong worktree của mình, review riêng task của mình, rồi **báo PASS/BLOCKED về** — **KHÔNG** tự ghi `.context/progress.json`, **KHÔNG** tự merge về nhánh chính. Dispatcher lo gom.

### 6. Context Hygiene
Sau mỗi task PASS:
```
- Giữ context gọn: chỉ pin task đang làm + .context/error-memory.md + file đang sửa
- Task đã commit → tin git, không giữ nguyên văn trong context
- Error patterns đã ghi vào .context/error-memory.md → không cần nhớ máy móc
```

### 7. Context Compact Check (`.agent/context-manager.md`) — dispatcher chạy
Sau mỗi task PASS (đọc `completedTasks` từ `.context/progress.json`, do dispatcher cập nhật ở bước merge):
```
Nếu số task đã done % 3 == 0:
  → INVOKE .agent/context-manager.md (compact)
  → Đọc .context/compressed-summary.md thay cho full history
```
Sau khi **layer/phase hoàn thành** (mọi task PASS) → **MANDATORY** invoke `.agent/context-manager.md`, compact cả layer/phase vừa xong rồi mới sang layer/phase tiếp.

### 8. Spec Publish — hết layer cuối (initial build) (`.agent/spec-publish.md`)
Sau khi **layer CUỐI hoàn thành — initial build xong** (mọi task của mọi layer PASS):
```
- INVOKE `.agent/spec-publish.md` (spec-publisher):
  - Cập nhật `spec/test-scope/current.json` theo phạm vi THẬT đã build:
    `trigger: initial-build`, `scopeVersion` +1 (spec-init đã tạo bản nháp lúc khởi đầu),
    `risk` hạ theo kết quả verify thật, `specRefs` = req đã implement.
  - Thêm dòng `spec/CHANGELOG.md` nếu spec đổi trong lúc build.
- Bàn giao cho template TEST trước commit close-out (commit chung với code).
```

> 📋 **State (`.agent/blackboard.md`)**: `.context/progress.json` là source of truth — đọc trước khi làm (resume), atomic update sau mỗi bước đổi trạng thái (`inProgressTask`/`completedTasks`/`currentLayer`).

---

## Commit Convention

After task passes tests:
```bash
git add {relevant files only}
git commit -m "feat(<feature|bug>-<slug>): phase-<N>-task-<NN> {short description}"
```

---

## Progress Update

**CHỈ DISPATCHER ghi** `.context/progress.json` — 1 lần sau khi gom cả layer (chống race condition giữa các builder song song). Builder con **không tự ghi**, chỉ báo kết quả PASS/BLOCKED.

Ghi bằng helper (atomic, dedupe, đúng schema — không tự viết JSON tay):
```bash
node tools/progress-write.mjs complete --task layer-1/task-02 \
     --review "STRICT PASS" --round 1 --report .context/review-reports/<...>.md
node tools/progress-write.mjs block --task layer-1/task-03 --reason "..."
node tools/progress-write.mjs set-layer --current 2 --total 5
```
```json
// .context/progress.json — schema: features[] / bugs[], activeWorkItem
{
  "activeWorkItem": null,
  "features": [ ... ],
  "bugs": [ ... ],
  "lastUpdated": "ISO timestamp"
}
```

---

## Test Strategy

### Test Pyramid (per task)

| Layer | What | When |
|-------|------|------|
| Unit | Pure functions, helpers, validators, services | Mọi task có logic |
| Integration | API endpoints với real DB (in-memory/test DB) | Mọi endpoint |
| Contract | Response shape khớp với `src/shared/types/api.ts` | Mọi endpoint trả data |

### Mandatory Tests by Task Type

| Task Type | Required Tests |
|-----------|----------------|
| API endpoint | Integration: status code + response body shape via shared types |
| Auth (login/register/refresh) | Contract test (test-first): `body.data.token`, `body.data.user` shape |
| Business logic | Unit: happy path + at least 2 edge cases + error path |
| UI Component | Render test + at least 1 user interaction |
| DB query/service | Unit với mock hoặc in-memory DB |

### Test-First Rule
Với **auth endpoints** và **payment**: viết test TRƯỚC khi viết code.
Test phải assert theo shared TypeScript types trong `src/shared/types/api.ts`, không hardcode shape.

```typescript
// ✅ Correct — assert against shared contract
import type { ApiResponse, AuthData } from '@/shared/types/api';
expect(res.body).toMatchObject<ApiResponse<AuthData>>({
  success: true,
  data: { token: expect.any(String), user: { id: expect.any(String) } }
});

// ❌ Wrong — locked to current implementation detail
expect(res.body.token).toBeDefined();
```

### Done Checklist (API task)
Trước khi mark task DONE:
- [ ] Response đi qua `ok()`/`fail()` helper, không viết tay `res.json()`
- [ ] Test assert client-consumed shape (không phải raw backend format)
- [ ] Contract test tồn tại cho mọi data endpoint
- [ ] `src/shared/types/api.ts` được update nếu response shape thay đổi

---

## Rules

1. **Song song theo worktree** — trong 1 wave, các task độc lập chạy SONG SONG, mỗi task 1 worktree riêng. Một builder chỉ làm 1 task tại 1 thời điểm. Task trùng file → khác wave (xem Parallel Execution Model).
2. **Không skip tests** — mỗi task phải có test theo đúng loại (xem Test Strategy)
3. **Đọc error-memory TRƯỚC khi code** — tránh lặp lỗi cũ
4. **Max 3 retries** — sau đó đánh BLOCKED
5. **Commit ngay khi PASS** — tạo rollback point
6. **Không sửa code ngoài scope** — chỉ touch files trong task definition (worktree cô lập đã chặn vật lý, nhưng vẫn phải tự giới hạn đúng scope để merge sạch)
10. **Builder không ghi state/không merge** — chỉ dispatcher ghi `progress.json` (qua `progress-write.mjs`) + gom branch. Conflict lúc merge → ghi `error-memory.md`, cho task đó chạy lại tuần tự.
7. **Dùng response helper chung** — MỌI API response phải đi qua `ok()`/`fail()`. Không bao giờ viết tay `res.json({token, user})` hay format tùy ý.
8. **Test theo contract của client** — import types từ `src/shared/types/api.ts`, không hardcode shape.
9. **Auth endpoints: test-first** — viết contract test trước khi implement.
