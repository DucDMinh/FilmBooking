---
name: codex-security
description: "OpenAI Codex Security CLI (openai/codex-security) — scan tìm, xác minh và fix lỗ hổng bảo mật trong code, tạo SECURITY.md policy. Dùng khi review task nhạy cảm (auth, API public, xử lý input, secrets) hoặc muốn quét bảo mật sâu hơn semgrep. Trigger: security review, task chạm credential/endpoint, chuẩn bị release."
---

# Codex Security — OpenAI Security CLI (Curated)

> Curated từ [openai/codex-security](https://github.com/openai/codex-security) (npm `@openai/codex-security`, version hiện tại **0.1.31**) — CLI + TypeScript SDK để định nghĩa security policy và tìm / xác minh / fix lỗ hổng. Bổ trợ lớp AI-driven cho semgrep (static rules) + OWASP checklist (manual): tìm được cả lỗi logic cross-file, kèm cách fix.

## Yêu cầu

- **Node.js ≥ 22.13** và **Python ≥ 3.10**
- Cần đăng nhập 1 lần: `npx @openai/codex-security login` (hoặc set `OPENAI_API_KEY` cho CI)
- Một số cybersecurity request / protected finding có thể yêu cầu approval qua **Trusted Access for Cyber** (chatgpt.com/cyber) — nếu bị chặn, ghi rõ trong report, không tự bypass.

## Chạy

```bash
npm install @openai/codex-security
npx @openai/codex-security login          # đăng nhập 1 lần (hoặc export OPENAI_API_KEY cho CI)
npx @openai/codex-security scan <dir>     # quét codebase → findings + report path
```

Sinh SECURITY.md (policy cho scan sau này — lưu draft ngoài checkout, review trước khi copy vào repo):

```bash
npx @openai/codex-security policy .                       # repo-wide draft
npx @openai/codex-security policy . --path services/api --knowledge-base architecture.md
```

## Hook vào template (reviewer gate — optional)

- **BẮT BUỘC vẫn là semgrep + OWASP checklist** (security skill hiện có) — codex-security là lớp bổ trợ, không thay thế.
- Task nhạy cảm (auth, API công khai, xử lý input, secrets, endpoint mới) và có thể login → chạy `npx @openai/codex-security scan <dir>`:
  - Any **CRITICAL finding thật** (đã xác minh không phải false positive) → FAIL, phải fix trước khi PASS
  - MAJOR ≥3 → FAIL
- **Chưa login / không có network / không cài được** → ghi `N/A` + lý do trong report, KHÔNG chặn PASS (giống gate open-code-review/blitzstrike).
- Không bao giờ echo secret/path báo cáo nhạy cảm ra chat; report findings dạng tóm tắt + file:dòng.

## Lưu ý

- Scan có thể tốn thời gian với repo lớn — dùng cho task nhạy cảm / trước release, không chạy mỗi commit nhỏ.
- Protected findings có thể cần Trusted Access — nếu vướng, dừng và báo, không cố vượt.
- KHÔNG thay thế semgrep/OWASP — bổ trợ lớp tìm kiếm + fix đề xuất.

## Output

Trả về: danh sách findings theo severity, trạng thái xác minh (verified/false-positive), file:dòng, đề xuất fix, ghi chú giới hạn (chưa login, bị chặn approval, repo quá lớn).