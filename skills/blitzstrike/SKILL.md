---
name: blitzstrike
description: "MCP pentest toolbelt (shinthink/blitzstrike) — reconnaissance, source analysis, live validation trước khi report. Bổ sung security checklist: bước pentest structured khi task liên quan endpoint/attack surface. Trigger: security review sâu, task nhạy cảm (auth, API public, xử lý input), pentest optional."
---

# Blitz Strike — Pentest MCP Toolbelt (Curated)

> Curated từ [shinthink/blitzstrike](https://github.com/shinthink/blitzstrike) (MIT, TS/Bun, ~639⭐) — giữ phần lõi: 3-tier methodology (BLITZ → EAGLE-EYE → STRIKE), chạy server-side qua MCP, `run_engagement`. Bổ trợ security skill có sẵn (semgrep/OWASP) thêm lớp pentest có kiểm chứng live.

## Là gì

MCP server pentest với 3 tầng:
1. **BLITZ** — reconnaissance: enumerate attack surface (entry point unauthenticated, dangerous sinks, auth boundaries).
2. **EAGLE-EYE** — static analysis + data-flow tracing: trace source→sink reachability, xác nhận sink *reachable*, *unauthenticated*, *exploitable* — không chỉ "tồn tại".
3. **STRIKE** — live validation (marker reflection + negative control) + scope enforcement → chỉ report khi đã verify thật.

Nguyên tắc: "A scan hit is a hypothesis. A live test is the verdict." — loại false positive + unverified findings.

## Chạy

```bash
npx blitzstrike serve --mcp   # connect agent, rồi yêu cầu "audit ./src" hoặc "audit https://example.com"
```

- MCP client: Claude Code, Cursor, Hermes, **OpenCode**, Claude Desktop, Gemini...
- LLM là "brain" (lập kế hoạch, route, judge); Blitz Strike là deterministic hands + guardrails.
- `run_engagement` — full engagement 1 call (scope enforcement → findings kèm exploit-tool manual).

## Hook vào template (Phase 5 review — optional, cả 2 template)

- **BẮT BUỘC vẫn là semgrep + OWASP checklist** (security skill hiện có).
- Thêm bước **optional**: task nhạy cảm (auth, API công khai, xử lý input người dùng, endpoint mới) → chạy:
  - `npx blitzstrike serve --mcp` rồi yêu cầu audit source thay đổi (hoặc URL nếu có staging)
  - Chỉ report finding đã STRIKE-validate; finding "hypothesis only" → ghi rõ chưa verify, không chặn PASS
- Nếu chưa cài/dùng được (cần MCP client + Bun) → bỏ qua, không chặn review; ghi chú trong report.

## Lưu ý

- Pentest live (STRIKE) chỉ chạy trên môi trường **được phép** (staging/dev/môi trường mình sở hữu) — KHÔNG quét target bên thứ ba chưa được cho phép.
- Cần **Bun 1.4+** cho blitzstrike; nếu project không có Bun → cân nhắc cài hoặc bỏ qua gate optional.
- KHÔNG thay thế semgrep/OWASP checklist — bổ trợ lớp xác nhận live.

## Output

Trả về: findings mức severity, trạng thái verify (live/static-hypothesis), scope đã quét, khuyến nghị fix, ghi chú giới hạn môi trường.