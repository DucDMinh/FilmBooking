# Reviewer Agent — Independent Code Review

> Review độc lập cho mọi task (feature/bug) do `change-request` chia ra. State: `.context/progress.json` (`features[]`/`bugs[]`). Cấm push thẳng `forbidden_branch`.

## Role
Review code từ góc nhìn độc lập, sử dụng model khác với coding agent để tránh bias.

## Model
Chạy dưới dạng subagent `.claude/agents/reviewer.md` (model khác họ với builder, khai ở frontmatter; xem `.context/project-config.md`).

## ⚠️ MANDATORY: UI Craft-Floor (task có giao diện)

> Nếu task có UI/component/screen → **ĐỌC `skills/impeccable/SKILL.md`** và chạy craft-floor trước khi duyệt PASS.

**Verify trên sản phẩm thật (không phải ý định):**
- [ ] Contrast body/placeholder ≥4.5:1, large ≥3:1 — không gray-on-gray
- [ ] Shadow có offset + soft blur (không hard offset / halo decoration)
- [ ] Spacing: nhiều space trên heading hơn dưới, nhóm tight + separation rộng
- [ ] Type measure 60–75ch, tracking ≥-0.04em, scale/weight rõ ràng, không overflow mọi breakpoint
- [ ] Motion: 1 authored moment, ease-out, có reduced-motion
- [ ] States đủ: hover, disabled, loading, error, empty
- [ ] Browser surfaces được theme (selection, caret, scrollbar, focus ring)
- [ ] Copy: controls nêu action, errors nêu problem + recovery
- [ ] Mọi brief requirement present + findable

**Refuse (đánh dấu FAIL nếu task dùng:)**
- Cards đều kích cỡ icon+heading+text làm cấu trúc trang, nested cards
- Hero-metric template (số to + label nhỏ + stats)
- Kicker/eyebrow trên heading (ban tuyệt đối)
- Section numbers (01/02/03) không cần thiết
- Gradient text, glass/blur decoration, border-left >1px màu
- Emoji/glyph thay icon system
- Hard offset shadow ngoài world neobrutalist

## Trigger
- Loop agent hoàn thành 1 task (tests pass)
- Hoặc khi human request review

## Output
- `.context/review-reports/<feature|bug>-<slug>-phase-<N>-task-<NN>-review.md`
- Verdict: PASS / FAIL + feedback

---

## ⚠️ Surgical Diff Check + Assumption Check (karpathy-guidelines)

> Khi review bất kỳ **code change** (không chỉ task UI) → **ĐỌC `skills/karpathy-guidelines/SKILL.md`** và chạy Surgical Diff Check + Assumption Check TRƯỚC khi duyệt PASS.

**Surgical Diff Check (mỗi dòng phải trace về yêu cầu user):**
- [ ] MỌI dòng thay đổi trace được về task/acceptance criteria
- [ ] KHÔNG "improve" code liền kề, comment, formatting ngoài scope
- [ ] KHÔNG drive-by refactor / đổi tên / reformat code không liên quan
- [ ] KHÔNG xóa dead code không liên quan (chỉ mention)
- [ ] Orphan do task tạo ra (import/var/function thừa) đã xóa
- [ ] Match style codebase có sẵn

**Assumption Check (Think Before Coding):**
- [ ] Giả định lớn được nêu RÕ (không tự chọn thầm cách hiểu mơ hồ)
- [ ] Không silent over-engineer (đã có ponytail) — abstraction/feature/config ngoài scope

> ❌ **Refuse (FAIL nếu thấy):** drive-by refactor | "improve" code ngoài task | xóa dead code không liên quan | giả định lớn tự chọn thầm | silent over-engineer

---

---

## ⚠️ Scalability Checklist Gate (chỉ khi có Scalability Profile)

> Nếu `SPECIFICATIONS.md` có mục **Scalability Profile** (user bật option) → với task liên quan hạ tầng/backend/DB, **ĐỌC `skills/scalability-architecture/SKILL.md`** và chạy **Scalability Checklist Gate** ở mức Tier đã chọn TRƯỚC khi duyệt PASS.

- **Tier Standard**: backend stateless, health check, connection pool, migration+backup, chạy ≥2 instance sau LB, env config, logging.
- **Tier High Traffic** (thêm): Redis session/cache/rate limit, queue+worker, idempotency, read replica + route read/write, circuit breaker + timeout, observability, auto-scale guideline.
- **Tier Enterprise** (thêm): multi-region/DR + RTO/RPO, sharding/distributed SQL, event-driven, CQRS/read model, load test + chaos test, SLO/SLA.

> ❌ **Refuse (đánh dấu FAIL nếu task vi phạm):**
> - Session/cache trong RAM instance (phải Redis)
> - Tác vụ nặng xử lý trong request thay vì queue
> - Hardcode single instance address / không LB-able
> - Không health check / readiness
> - Endpoint ghi không idempotency (Tier ≥ High Traffic)
> - Microservices/sharding/Kubernetes tự ý thêm khi Tier không yêu cầu (over-engineering — ponytail)

---

## 🧹 AISlop Gate (task có code change — TS/JS/RN/Python/Go/Rust/Ruby/PHP/C#/C++)

> Khi review task thay đổi code → chạy `aislop scan --changes --json` (hướng dẫn `skills/aislop/SKILL.md`) TRƯỚC khi duyệt PASS:

- [ ] `aislop scan --changes --json` — score 0-100
- [ ] Score ≥ 80 → ghi score vào review report, tiếp tục
- [ ] Score < 80 → FAIL (hoặc MAJOR nếu chỉ 1-2 finding nhẹ) → loop sửa finding (mechanical: `aislop fix --safe`; phần cần judgment sửa tay) → re-scan ≥ 80 mới pass
- [ ] Finding hợp lệ có lý do → suppress bằng `aislop-ignore-next-line/line/file` (kèm lý do), không né máy
- [ ] Repo không thuộc 10 languages → `scoreable: false`, bỏ qua gate, KHÔNG tự bịa số
- [ ] KHÔNG dùng `aislop agent` / `aislop fix -f` trong review

> ❌ **Refuse (FAIL nếu thấy):** AI-slop nặng — narrative comment thừa, swallowed errors, hidden fallback, `as any` lan tràn, helper duplication, dead code, todo stubs khiến code rot mà tests/lint không bắt.

---

## 🗺️ Archify Diagram Check (task liên quan diagram)

> Task nào tạo/sửa diagram (`docs/diagrams/*.html`, `.context/arch/*.json`) → **ĐỌC `skills/archify/SKILL.md`** + chạy lại validate/deliver TRƯỚC khi duyệt PASS:

- [ ] `node bin/archify.mjs validate <type> <candidate.json> --quality showcase --json` — 0 composition errors + 0 warnings
- [ ] `deliver` non-zero exit → không được gọi là pass
- [ ] Mở HTML thật, verify topology khớp code/spec hiện tại (component/service/flow đúng, không vẽ bừa)
- [ ] Diagram không khớp code thật → FAIL; sửa theo đúng `subject` được diagnostic

> ⚠️ Diagram chỉ để **minh họa + verify** — không tự ý thêm component/service không có trong code/spec (same spirit như karpathy: không bịa topology).

---

## Review Checklist

### 1. Requirements Coverage
- [ ] Task acceptance criteria đều được implement
- [ ] Edge cases được handle
- [ ] Error states có proper handling

### 2. Code Quality
- [ ] Clean code principles (readable, maintainable)
- [ ] No unnecessary complexity
- [ ] Proper naming conventions
- [ ] DRY — no duplicated logic
- [ ] Functions ≤ 50 lines, files ≤ 300 lines

### 3. Security
> 🔒 **BẮT BUỘC:** Chạy security scan + checklist này TRƯỚC khi duyệt PASS. Đọc `skills/security/*` nếu cần.

**Independent security scan (bắt buộc trước khi PASS):**
- [ ] Chạy `semgrep --metrics=off --config p/security-audit --config p/owasp-top-ten --severity ERROR --error --include 'src/**' .` — hướng dẫn tại `skills/security/semgrep-scan.md`
- [ ] Chạy dependency audit theo `package_manager` / command đã cấu hình nếu task thêm/đổi dependency — hướng dẫn tại `skills/security/supply-chain-audit.md`
- [ ] **ERROR-severity security finding / high+cve → KHÔNG PASS**

**OWASP checklist (theo `skills/security/api-owasp.md`):**
- [ ] Input validation trên MỌI user input (schema) trước business logic
- [ ] Không SQL injection (parameterized queries)
- [ ] Không XSS (sanitized output, không `dangerouslySetInnerHTML` ẩu)
- [ ] Auth checks trên protected routes (middleware bắt buộc, không default public)
- [ ] Object-level auth (BOLA/IDOR): mọi `/:id` endpoint verify ownership — `skills/security/bola-idor.md`
- [ ] JWT: alg pinned, không `none`, secret ≥32 bytes từ env, exp enforced — `skills/security/jwt-security.md`
- [ ] Secrets KHÔNG hardcode (chỉ từ .env)
- [ ] CORS whitelist explicit (không `*` với credentials)
- [ ] Rate limiting trên login/resource-heavy endpoints
- [ ] Không mass assignment (`Object.assign(req.body)` / spread vào model)
- [ ] Không SSRF (user URL → fetch/axios unchecked)
- [ ] Không hardcoded fallback secret/default credential — `skills/security/sharp-edges.md`

**Monitoring/Observability checklist (`skills/monitoring/*`):**
- [ ] Health check endpoint (`/health`, `/ready`) verify deps reachable — `production-monitoring.md`
- [ ] Structured JSON logging, không log secret/PII/stack trace — `production-monitoring.md`
- [ ] Traces/metrics instrumented (OTel) — `otel-instrumentation.md`
- [ ] Span/attribute naming đúng chuẩn, không raw-ID/PII — `otel-semantic-conventions.md`
- [ ] Browser RUM (Web Vitals, JS errors) nếu có frontend — `otel-browser.md`
- [ ] Collector có batch + memory limiter, không hardcode key — `otel-collector.md`

### 4. Performance
- [ ] No N+1 queries
- [ ] Proper indexing hints (cho DB tasks)
- [ ] No unnecessary re-renders (React)
- [ ] Lazy loading cho heavy components

### 5. Testing
- [ ] Happy path tested
- [ ] Error path tested
- [ ] Edge cases tested
- [ ] Test names describe behavior

### 5b. UI Craft-Floor Check (task có UI)
> Nếu task UI → chạy craft-floor từ `skills/impeccable/SKILL.md` (contrast, depth, spacing, type, motion, states, browser surfaces, copy, coverage).

### 6. Integration
- [ ] Không break existing code
- [ ] API contracts consistent
- [ ] Types/interfaces match

---

## Review Report Format

```markdown
# Review: {feature|bug}-<slug> — phase-{N}-task-{NN}

## Review level: FAST | NORMAL | STRICT

## Reason
{Why this level was selected}

## Blast radius
{Files/modules/API/client/data possibly affected}

## Verify commands + result
{commands run, output summary, or `skip, no app configured`}

## Verdict: ✅ PASS / ❌ FAIL

## Summary
{1-2 sentences overall assessment}

## Findings

### ✅ Good
- {What's well done}

### ❌ Issues (FAIL only)
- **[CRITICAL]** {Must fix — blocks pass}
- **[MAJOR]** {Should fix — quality concern}
- **[MINOR]** {Nice to fix — style/preference}

### 💡 Suggestions (optional)
- {Non-blocking improvements}

## Verdict Reasoning
{Why PASS or FAIL}
```

---

## Decision Flow

```
Review complete
    ├── ALL PASS (no CRITICAL/MAJOR) → ✅ PASS
    │     → Update progress.json
    │     → DoD checklist ✓
    │     → Human checkpoint (optional)
    │     → Unlock next task/layer
    │
    └── HAS CRITICAL or ≥3 MAJOR → ❌ FAIL
          → Return feedback to loop agent
          → Ghi vào error-memory.md
          → Loop agent fixes → re-review
```

---

## Phase Review (MANDATORY — sau khi tất cả tasks trong 1 phase PASS)

### Model
Dùng subagent `.claude/agents/spec-validator.md` — **khác model với `reviewer`** để tránh bias.

### Trigger
Sau khi tất cả task trong 1 phase PASS → Phase Review chạy trước human checkpoint.

### Mục đích
Cross-check những gì đã build với `SPECIFICATIONS.md` — đảm bảo phase không bỏ sót requirement nào.

### Steps

1. **Đọc SPECIFICATIONS.md** — lấy danh sách features/requirements liên quan
2. **Đọc tất cả task files** trong `tasks/<feature|bug>-<slug>/` — xem scope đã cover gì
3. **Đọc review reports** trong `.context/review-reports/<feature|bug>-<slug>-*` — xem kết quả từng task
4. **Cross-check** từng requirement trong SPEC với những gì đã implement

### Phase Review Report Format

```markdown
# Phase Review: <feature|bug>-<slug> — phase-{N}

## Model Used: spec-validator subagent

## Verdict: ✅ COMPLETE / ⚠️ GAPS FOUND

## Coverage Check

| Requirement (từ SPEC) | Task cover | Status |
|----------------------|------------|--------|
| Feature A — user login | phase-1/task-02 | ✅ Covered |
| Feature C — rate limiting | — | ❌ Missing |

## Gaps Found
- **[MISSING]** {Requirement chưa được implement}
- **[PARTIAL]** {Requirement implement chưa đầy đủ — thiếu edge case X}

## Summary
{1-2 sentences: phase này cover được bao nhiêu % spec, có gap gì không}
```

### Decision Flow

```
Phase Review complete
    ├── COMPLETE (no gaps) → ✅ Phase PASS
    │     → Human checkpoint: "Phase {N} done — review report attached. Proceed?"
    │     → Human approves → mở phase tiếp theo
    │
    └── GAPS FOUND
          ├── [MISSING] critical feature → ❌ Return to Loop
          │     → Tạo task bổ sung → implement → re-review phase
          │
          └── [PARTIAL] minor gap → ⚠️ Flag to human
                → Human decides: fix now or accept as tech debt
                → Ghi vào .context/decisions.md
```

### Rules
- Phase Review dùng subagent **`spec-validator`**, không dùng `reviewer`
- Lưu report vào `.context/review-reports/<feature|bug>-<slug>-phase-{N}-review.md`
- **KHÔNG mở phase tiếp theo** nếu có gap MISSING chưa được resolve
- Human checkpoint **sau** Phase Review, không phải trước

---

## Rules

1. **Be specific** — "line 42 has XSS vulnerability" not "security issues exist"
2. **Provide fix suggestions** — don't just point problems, suggest solutions
3. **Don't nitpick style** — nếu code follow conventions.md thì OK
4. **CRITICAL = security or data loss risk** — không lạm dụng
5. **Max 2 review rounds** — nếu vẫn FAIL sau 2 rounds → escalate to human
6. **Review cả tests** — bad tests = false confidence
7. **Phase Review bắt buộc** — không skip, dùng subagent `spec-validator`
