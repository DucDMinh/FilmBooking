---
name: open-code-review
description: "Chạy `ocr review` (Alibaba Open Code Review) bắt bug code — XSS/SQLi/NPE/thread-safety, comment đúng dòng, deterministic + LLM hybrid. Hook Phase 5 reviewer gate: findings CRITICAL → FAIL. Delegation mode không cần API key riêng. Trigger: review task code change."
---

# Open Code Review — Alibaba OCR Gate (Curated)

> Curated từ [alibaba/open-code-review](https://github.com/alibaba/open-code-review) (Apache-2.0, ~35.6k⭐) — giữ phần lõi: cài đặt + config provider, `ocr review`/`ocr scan`, delegation mode, rules, JSON output. Bỏ phần plugin OpenCode native, MCP, telemetry, session viewer (không cần trong template).

## Cài đặt (một lần, khi cần dùng)

```bash
npm install -g @alibaba-group/open-code-review
# Verify
ocr version
```

Yêu cầu: **Git ≥ 2.41** (OCR dùng git để diff + search).

## Config LLM — chỉ khi dùng OCR-managed mode

```bash
ocr config provider   # chọn provider có sẵn hoặc thêm custom (dùng REVIEWER_MODEL trong .env.local)
ocr config model      # chọn model cho provider active
ocr llm test          # test kết nối
```

## Lệnh chính

- `ocr review` — workspace mode: review mọi staged/unstaged/untracked changes
- `ocr review --from main --to feature-branch` — branch range (merge-base)
- `ocr review --commit abc123` — single commit
- `ocr review --format json --output result.json` — JSON output (khuyến nghị cho agent host)
- `ocr scan` — full-file scan cả repo (không cần git history)
- `ocr scan --path internal/agent` — scan thư mục/file cụ thể
- `ocr session list` / `--resume <session-id>` — resume review bị gián đoạn

## Review gate (Phase 5) — Delegation mode mặc định

Delegation mode: OCR lo **file selection + rule resolution**, agent (model của mình) tự review → **KHÔNG cần config LLM/key riêng** (đạt tinh thần tiêu chí offline / không phụ thuộc API key).

```bash
ocr delegate preview                   # xem file/rule sẽ review trước (không tốn LLM)
ocr delegate rule src/main.go src/handler.go   # review đúng các file thay đổi
```

Khi cần JSON report (OCR-managed, đã config provider):
```bash
ocr review --format json --output .context/review-reports/ocr-{task}.json
```

Gate rules:
- **CRITICAL finding** (XSS/SQLi/NPE/thread-safety/security) → FAIL, trả loop sửa
- ≥3 MAJOR → FAIL; 1-2 MAJOR → ghi report, cân nhắc sửa
- Không có finding → ghi "OCR clean" vào report
- Ghi findings đầy đủ vào `.context/review-reports/`, KHÔNG tự bịa số
- Chưa cài/config OCR → báo blocker rõ, không giả vờ review

## Review rules (tùy chọn)

- Ruleset built-in: NPE, thread-safety, XSS, SQL injection — multi-language
- Custom rules theo path: docs `open-codereview.ai/docs/review-rules`
- Rule matching theo đặc điểm từng file → model tập trung, giảm noise

## Lưu ý

- **OCR-managed mode cần LLM endpoint + key** (dùng REVIEWER_MODEL từ `.env.local`, không cần key mới). Chưa config → dùng delegation mode.
- **Precision cao, Recall thấp hơn agent generic** (trade-off chủ đích — ít false alarm). Không thay thế hoàn toàn review tay.
- So với agent generic: **~1/9 tokens**, nhanh hơn, comment đúng dòng (hết position drift) — phù hợp CI/review gate.
- Deterministic engineering: chọn file chính xác, gom file liên quan (smart bundling), rule matching ổn định — hết "cut corners" trên changeset lớn.
- KHÔNG dùng telemetry/MCP/session viewer trong template.
- **Có plugin native cho OpenCode** (`plugins/open-code-review/opencode/` — tool `ocr_review` + `/ocr-review`) — tùy chọn, không bắt buộc; skill + reviewer gate đủ và giữ model-agnostic.

## Output

Trả về: findings theo mức (CRITICAL/MAJOR/MINOR), file + dòng chính xác, ruleset đã áp dụng, quyết định gate (pass/fail + lý do), path file JSON report nếu có.