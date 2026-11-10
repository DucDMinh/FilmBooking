---
name: anti-slop
description: "Chặn low-evidence TS/JS patterns bằng Oxlint rules (dmmulroy/anti-slop) — no-reduce-accumulator-copy, no-object-parameters, no-unsafe-dictionary-type... Bổ trợ aislop: chặn ở tầng lint khi code, không đợi review. Trigger: setup lint repo mới, khi code TS/JS, khi thấy pattern low-evidence."
---

# anti-slop — Oxlint Rules chống low-evidence code (Curated)

> Curated từ [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) (MIT, ~4.7k⭐) — giữ phần lõi: install + config Oxlint + ruleset chính. Khác **aislop** (đã có trong template): aislop quét nội dung AI-slop deterministic lúc review, còn anti-slop chặn pattern "low-evidence" ngay ở tầng lint khi viết code. Bổ trợ, không trùng.

## Cài đặt (một lần, khi dùng project mới)

```bash
# Cách 1 — agent skill tự cài (khuyến nghị)
npx skills add dmmulroy/anti-slop --skill install-anti-slop
# → agent copy plugin + cài @oxlint/plugins đúng version + merge config + enable rules

# Cách 2 — thủ công (vendor vào repo)
# Copy src/ vào tools/oxlint/anti-slop/, rồi:
npm install -D oxlint @oxlint/plugins   # cùng version chính xác cho cả 2
```

Đăng ký plugin trong `oxlint.config.ts`:

```ts
import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    ".agent/**", ".agents/**", ".claude/**", ".codex/**",
    ".cursor/**", ".opencode/**", ".roo/**", ".windsurf/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    "oxc/no-accumulating-spread": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
});
```

## Lệnh chính

```bash
npx oxlint               # quét cả repo
npx oxlint --fix         # tự sửa mechanical
npx oxlint src/**/*.ts   # quét riêng path
```

## Khi nào dùng (hook template)

- **Setup project mới** (Phase 0/1): cài anti-slop + oxlint.config.ts như trên, thêm `"lint": "oxlint"` vào package.json scripts.
- **Loop khi code TS/JS**: để ý các rule chính — không `array.filter().map()`, không `reduce` copy accumulator, không `object` tham số, không `as any`/type assertion không có safety comment, không dictionary type `Record<string, any>` an toàn giả.
- **Reviewer**: chạy `npx oxlint` như 1 gate nhanh bên cạnh AISlop (`aislop scan`) — nếu aislop bắt "mùi nội dung", oxlint/anti-slop bắt "mùi kiểu dáng code".

## Lưu ý

- **Repo cần vendored, không phải npm dep chính thức** — bản quyền để anh tự maintain, sửa rule theo chuẩn team.
- Nếu project dùng `oxlint` sẵn → cài `@oxlint/plugins` đúng version đó; không thì cài cả 2 cùng version mới nhất, giữ exact.
- Repo dùng Effect → bật thêm opt-in Effect rule group (skill install tự làm).
- Rule là **opinionated** của tác giả — không phải universal standard; cân nhắc trước khi enable hết.

## Output

Trả về: list rule đã enable, kết quả `npx oxlint` (số error/warning), file vi phạm + rule, hành động đã làm (fix --fix / sửa tay / suppress lý do).