# Run Journal — bug/layer34-review · phase-1-task-04

```yaml
workItem: bug/layer34-review
phaseTask: phase-1-task-04
step: done
agent: reviewer
status: done
attempt: 1
interrupted: false
updatedAt: 2026-11-12T04:15:36.501Z
filesTouched: []
filesNew: [supabase/migrations/20261112090000_drop_client_identity_link.sql, supabase/tests/049_drop_client_identity_link.test.sql]
evidence: {reportPath: .context/review-reports/bug-layer34-review-phase-1-task-04-round-2-review.md, round: 2, verdict: PASS}
next: "checkpoint hết P0 — chờ user: P1, F-2, push, env"
loopSignal: none
approvals: [{gate: k2_direction_a, ok: true}, {gate: usage_gate_continue, at: 2026-11-12T04:01:20Z, ok: true}]
batchQueue: [04]
```

## History
- 2026-11-12T04:01:20Z journal created; staging ae5c212
- 2026-11-12T04:05:22.478Z builder xong (xoá endpoint link + drop link_user_identity; e2e đỏ 1/20 -> 20/20; 049 2/4 -> 4/4; pgTAP 668 PASS). Residual: guard_identity_insert có thể chặn linkIdentity hợp lệ của user có mật khẩu (M-05) -> reviewer
- 2026-11-12T04:10:55.406Z reviewer FAIL round1: F-1 test 045 bật cờ allow_identity_link giả lập GoTrue (false confidence). F-2 HIGH: trigger chặn liên kết thủ công hợp lệ trái R-20/AC-04/R-21/NFR-17 -> cần chốt thiết kế trước Layer 5
- 2026-11-12T04:12:58.663Z builder round2 xong (F-1 test a002 OAuth-only không cờ, ghim KNOWN GAP F-2; F-3 doc; F-4; pgTAP 668 PASS) -> reviewer round 2
- 2026-11-12T04:15:36.501Z reviewer round2 STRICT PASS; commit; P0 xong
