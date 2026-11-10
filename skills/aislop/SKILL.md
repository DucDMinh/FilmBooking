---
name: aislop
description: "Chạy `aislop scan` bắt AI-slop trong code — narrative comment, dead code, swallowed errors, hidden fallback, duplication, as any, todo stubs. Hook Phase 5 review gate như optional check: score dưới ngưỡng → loop sửa trước khi PASS. CLI deterministic, offline, không cần API key (tiêu chí 19/08)."
---

# AISlop — AI-Slop Detection Gate (Curated)

> Curated từ [scanaislop/aislop](https://github.com/scanaislop/aislop) (MIT) — giữ phần lõi: scan + score + fix --safe + ignore directives. Không copy nguyên xi; bỏ `aislop agent` (gọi coding agent ngoài), badge, `aislop-tools` optional (Ruff/golangci-lint).

## Cài đặt (một lần, khi cần dùng)

```bash
# Cách 1 — devDependency (khuyến nghị)
npm install --save-dev aislop
# Cách 2 — global
npm install -g aislop
# Cách 3 — không cài, chạy tạm
npx aislop@latest scan
```

Verify: `aislop version` → chạy `aislop scan` ở project thấy score 0-100.

## Lệnh chính

- `aislop scan` — quét thư mục hiện tại, score 0-100, sub-second
- `aislop scan --changes` — chỉ quét file thay đổi từ HEAD (dùng trong review task)
- `aislop scan --changes --base origin/main` — so với base branch (PR)
- `aislop scan --staged` — file staged
- `aislop scan --json` — JSON output để đọc score programmatically
- `aislop scan --sarif` — SARIF 2.1.0 (GitHub code scanning)
- `aislop scan -d` — chi tiết file/rule
- `aislop scan --exclude "dist,gen"` — skip paths
- `aislop fix --safe` — tự sửa mechanical (import thừa, narrative comment, formatter an toàn) — không đổi behavior, áp dụng được
- `aislop fix --dry-run` — preview không ghi file
- `aislop ci` — CI mode (JSON + gate)

Mặc định exclude: node_modules, .git, dist, build, coverage.

## Review gate (Phase 5)

Khi review task có code change (TypeScript/JS/Expo-RN/Python/Go/Rust/Ruby/PHP/C#/C++), chạy:

```bash
aislop scan --changes --json
```

- **Score ≥ 80** → OK, ghi score vào review report
- **Score < 80** → FAIL (hoặc MAJOR nếu chỉ 1-2 finding nhẹ) → loop sửa findings (dùng `aislop fix --safe` cho mechanical, còn lại sửa tay) → re-scan
- Repo không thuộc 10 language targets → aislop withholds score (`scoreable: false`) → bỏ qua gate, không tự bịa số

## Suppress finding hợp lệ

Khi biết rõ dòng đó cố ý (có lý do):

```ts
// aislop-ignore-next-line ai-slop/hidden-fallback -- options is validated upstream
const opts = { ...defaults, ...(input || {}) };
const legacy = doThing(); // aislop-ignore-line
```

- `aislop-ignore-next-line` — dòng dưới; `aislop-ignore-line` — dòng hiện tại; `aislop-ignore-file` — cả file (đặt đâu trong file cũng được)
- Có thể nêu rule cụ thể để scope; bỏ trống = silence mọi rule trên dòng
- Suppressed findings bị loại trước khi score; report cho biết số lượng silenced

## Config (tùy chọn) — `.aislop/config.yml`

```yaml
exclude:
  - "src/generated"
rules:
  ai-slop/narrative-comment: warning   # error | warning | off
  security/hardcoded-secret: error
ci:
  failBelow: 80
```

Hoặc `.aislopignore` ở root (glob, `#` comment được):

```
src/generated
**/*.snap
legacy
```

## Lưu ý

- Deterministic, **không LLM trong runtime**, không cần API key/network lúc chạy (đạt tiêu chí offline).
- Chỉ phân tích 10 languages: TS, JS, Expo/RN, Python, Go, Rust, Ruby, PHP, C#, C/C++. Repo chủ yếu ngôn ngữ khác → score bị withhold, không in số.
- KHÔNG dùng `aislop agent` (cần coding agent bên ngoài + network) trong template.
- KHÔNG dùng `aislop fix -f` (aggressive: xóa deps/file unused) trong review — chỉ `--safe`.

## Output

Trả về: score, số finding theo mức, danh sách file/rule chính, actions đã làm (fix --safe / sửa tay / re-scan), quyết định gate (pass/fail + lý do).