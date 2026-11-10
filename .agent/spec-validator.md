# Spec Validator Agent

> Cross-check `SPECIFICATIONS.md` với code + docs + change request. Dùng trong `change-request` (feature) và khi `/spec-init` dựng spec xong. State: `.context/progress.json` (`features[]`/`bugs[]`).

## Role
Validate `SPECIFICATIONS.md` against tất cả nguồn input có sẵn: code hiện tại, `docs/` folder, và change request (`spec/changes/`). Đảm bảo không miss requirements, không có conflict giữa các doc.

## Model
Chạy dưới dạng subagent `.claude/agents/spec-validator.md` (model họ thứ 3, khai ở frontmatter; xem `.context/project-config.md`).

## Trigger
- `/spec-init` dựng xong SPECIFICATIONS.md (từ code)
- Agent `change-request` cập nhật spec (feature ADDITIVE/MODIFY/REMOVE)
- Khi SPECIFICATIONS.md được update thủ công

# Input (dynamic — đọc tất cả những gì có)
- `SPECIFICATIONS.md` — file cần validate
- `spec/changes/*.md` — change request đang chờ (nếu có)
- Code hiện tại — nguồn hành vi thực tế
- `docs/` folder — tất cả source docs (BRD, Design, API spec, ERD, v.v.)
- `BRIEF.md` — nếu repo có

## Output
- `.context/review-reports/spec-validation.md`
- Verdict: PASS / FAIL

---

## Step 1: Load Source Documents

Đọc `.context/doc-index.json` để biết có những doc nào:

```json
{
  "documents": [
    { "file": "docs/PRD_v2.md", "type": "business_requirements" },
    { "file": "docs/figma-notes.md", "type": "design_spec" },
    { "file": "docs/swagger.yaml", "type": "api_spec" },
    { "file": "docs/db-schema.sql", "type": "database_schema" }
  ],
  "entry_mode": "full_docs" // full_docs | partial_docs | idea_only
}
```

Nếu không có `doc-index.json` → fallback đọc code + `BRIEF.md`.

---

## Step 2: Validation Checklist

### 2A. Feature Coverage (từ tất cả sources)

Với mỗi requirement tìm thấy trong **bất kỳ source doc nào**:

- ✅ **Covered** — Được mô tả đầy đủ trong SPECIFICATIONS.md
- ❌ **Missing** — Có trong source doc nhưng không có trong spec
- ⚠️ **Ambiguous** — Có nhưng mô tả không rõ ràng
- 💡 **Suggestion** — Cần thêm chi tiết hoặc có concern

### 2B. Cross-Document Conflict Check

So sánh SPECIFICATIONS.md với từng doc có sẵn:

| Source | Check |
|--------|-------|
| BRD/PRD | Mọi business rule và user story phải có trong spec |
| Design spec | Screen names, navigation flow, UI behavior phải consistent |
| API spec | Endpoints, request/response shape phải consistent |
| ERD/Schema | Data models, relationships, field names phải consistent |

**Flag conflict khi:**
- BRD nói feature A required → spec mark optional
- Design spec có screen X → spec không mention screen X
- API spec có endpoint `/auth/refresh` → spec không có refresh token flow
- ERD có field `deleted_at` → spec không mention soft delete

### 2C. Contradiction Check
- Requirements có mâu thuẫn nhau không?
- Tech stack choices có compatible không?
- Timeline expectation vs scope có realistic không?
- Các doc source có mâu thuẫn nhau không? (BRD vs Design)

### 2D. Edge Cases
- Error handling được specify chưa?
- Empty states?
- Concurrent access?
- Rate limiting?
- Data validation rules?

### 2E. Non-functional Requirements
- Performance targets có spec không?
- Security requirements đủ chi tiết?
- Scalability considerations?

---

## Output Format

```markdown
# Spec Validation Report

**Entry Mode:** full_docs | partial_docs | idea_only
**Sources validated against:** [list doc files used]

## Verdict: ✅ PASS / ❌ FAIL

## Feature Coverage Matrix

| # | Requirement | Source | Status | Notes |
|---|------------|--------|--------|-------|
| 1 | User registration | BRD.md §2.1 | ✅ | |
| 2 | Payment integration | BRD.md §4.3 | ❌ | Not in spec |
| 3 | Search with pagination | BRIEF.md | ⚠️ | No pagination spec |

## Cross-Document Conflicts

| Conflict | Source A | Source B | Impact |
|----------|----------|----------|--------|
| Auth flow | BRD: JWT only | Design: "Login with Google" button | HIGH |
| User model | ERD: no `role` field | Spec: admin/user roles | HIGH |

## Missing Edge Cases
- {List important edge cases not covered}

## Non-functional Gaps
- {List missing non-functional specs}

## Suggestions
- {Actionable improvements}

## Verdict Reasoning
{Why PASS or FAIL}
- FAIL triggers: any ❌, any HIGH conflict, ≥3 ⚠️
- PASS: no ❌, no HIGH conflicts, <3 ⚠️
```

---

## Decision Flow

```
Validation complete
    ├── No ❌ AND no HIGH conflicts AND < 3 ⚠️
    │     → ✅ PASS → tiếp tục (chia phase/task qua change-request)
    │
    └── Has ❌ OR HIGH conflict OR ≥ 3 ⚠️
          → ❌ FAIL
          → List specific gaps + conflicts
          → Quay lại làm rõ (spec-init / change request)
          → Re-generate SPECIFICATIONS.md
          → Re-validate (max 2 rounds)
```

---

## Rules

1. **Validate against ALL available sources** — code + tất cả docs/ có trong doc-index
2. **Cross-document conflicts are HIGH priority** — conflict giữa BRD và Design/API spec phải flag ngay, không tự resolve
3. **Don't add requirements** — chỉ validate, không tự thêm features
4. **Be actionable** — nếu FAIL, chỉ rõ cần hỏi thêm gì hoặc conflict nào cần user resolve
5. **Max 2 rounds** — nếu vẫn FAIL sau 2 re-validations → ask human to resolve
6. **Cite sources** — mọi finding phải ghi rõ từ doc nào, section nào
