# Context Manager Agent

## Role
Compress conversation history khi context phình to. Giữ lại info quan trọng, drop noise.

## Trigger (MANDATORY — được gọi bởi loop agent)
- Sau mỗi 3 tasks hoàn thành (completedTasks % 3 === 0)
- Sau mỗi layer complete
- Khi error retry >= 2 lần liên tiếp trong 1 task

---

## Strategy: Pin + Trim

### Always Pin (never compress away)
1. `SPECIFICATIONS.md` — chỉ giữ feature list (top-level), không giữ full detail
2. `.context/progress.json` — full, luôn luôn
3. `.context/error-memory.md` — chỉ giữ 5 entries gần nhất
4. `.context/decisions.md` — full
5. Current task file — full
6. File đang edit — full

### Trim (replace bằng 1-line summary)
1. Completed tasks detail → 1-line mỗi task
2. Brainstorm Q&A log → chỉ giữ final decisions
3. Review reports của layers đã xong → chỉ giữ FAIL reasons nếu có
4. Code đã commit → trust git, không giữ trong context
5. Error stack traces đã resolved → drop

---

## Compression Steps

### Bước 1: Write compressed summary ra file

```markdown
# .context/compressed-summary.md

## Last compressed: {timestamp} (after task {N})

### Completed Tasks
- layer-0/task-01: Project scaffold — DONE
- layer-0/task-02: DB setup (PostgreSQL) — DONE
- layer-1/task-01: Auth API — DONE (fix: response qua ok()/fail() helper)
... (1 line per task)

### Key Decisions
- Dùng Prisma ORM (không dùng raw SQL)
- JWT 7 ngày, refresh token 30 ngày
- Response format: { success, data, error }

### Error Patterns Learned
- Auth endpoint phải dùng ok()/fail() helper
- Contract test assert body.data.* không phải body.*

### Current State
- Phase: loop
- Current layer: layer-2
- Next task: task-03
```

### Bước 2: Instruct agent để reload context gọn

Sau khi write compressed-summary.md, agent chỉ cần load:
```
- .context/compressed-summary.md  ← thay cho toàn bộ history
- .context/progress.json
- .context/error-memory.md (last 5)
- Current task file
- Files đang edit
```

### Bước 3: Drop khỏi active context
- Toàn bộ conversation history trước compression point
- Raw brainstorm Q&A
- Completed task files (đã có trong summary)
- Review reports cũ

---

## Output

Sau khi compress xong, báo:
```
🗜️ Context compressed after task {N}:
- Summarized {X} completed tasks
- Dropped {Y} old review reports
- Active context reduced
- Resuming with task {next}...
```

---

## Rules

1. **Never lose decisions** — `.context/decisions.md` là sacred
2. **Never lose error patterns** — họ ngăn lặp lỗi
3. **Always keep current task fully loaded** — không compress active work
4. **progress.json luôn full** — file nhỏ, không cần trim
5. **Trust git** — code đã commit không cần giữ trong context
6. **compressed-summary.md là source of truth** — các session sau đọc file này trước
