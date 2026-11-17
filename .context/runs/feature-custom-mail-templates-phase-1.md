# Run Journal — feature/custom-mail-templates · phase-1 (task-01 + task-02 song song)

```yaml
workItem: feature/custom-mail-templates
phaseTask: phase-1-task-01 + phase-1-task-02
step: done
agent: null
status: done
attempt: 0
interrupted: false
updatedAt: 2026-11-17T17:20:00+07:00
filesTouched:
  # USER dirty, KHÔNG thuộc task, KHÔNG stage: .claude/settings.json, .gitignore, CLAUDE.md, apps/api/package.json (hunk start), supabase/config.toml (Gmail cá nhân)
  - docs/dev-setup.md
  - apps/api/src/modules/mail/templates.ts
  - apps/api/test/outbox-job.e2e-spec.ts
  - supabase/config.toml   # CHỈ hunk [auth.email.template.*]; hunk smtp là của USER
  - spec/changes/BACKLOG.md
filesNew:
  - supabase/templates/*.html (6 file)
  - apps/api/test/mail-templates.spec.ts
  - apps/api/test/auth-email-templates.spec.ts
  - spec/changes/2026-11-17-custom-mail-templates.md
  - tasks/feature-custom-mail-templates/phase-1-task-01.md
  - tasks/feature-custom-mail-templates/phase-1-task-02.md
evidence:
  reportPath: .context/review-reports/feature-custom-mail-templates-phase-1-round-1-review.md
  round: 1
  verdict: PASS   # NORMAL PASS, 0 CRITICAL/HIGH/MEDIUM, 4 LOW + 3 INFO
next: "done — commit staging (không push). USER: gửi thử mail Auth thật (đăng ký/quên mật khẩu) để xem trên Gmail; staging/prod dán template Auth vào Supabase Dashboard."
loopSignal: none
approvals:
  - gate: phase_plan
    at: 2026-11-17T17:00:00+07:00
    ok: true   # user chọn phạm vi "Cả hai" + hướng "Giao diện + tiếng Việt"; plan tự duyệt theo memory autonomy
batchQueue: []
```

## Notes
- Classify MODIFY, requirement không đổi -> không bump spec_version; scope trigger feature-update.
- Hai task chạm file rời nhau (templates.ts+test vs supabase/templates+docs) nên chạy 2 builder song song TRONG CÙNG cây làm việc, không dùng worktree (tránh lỗi merge script, memory parallel-dispatch-merge-branch). Primary tự sửa config.toml.
- config.toml có Gmail cá nhân của user (chưa commit): chỉ stage hunk template bằng `git apply --cached`.
- Mail Auth ở local trước đó rơi vào Mailpit; user đã đổi sang Gmail SMTP (session trước).

## History
- 2026-11-17T17:00:00+07:00 journal created; ▶ START [agent: builder] x2 phase-1-task-01/02 (cancel sẽ redo bước này)
- 2026-11-17T17:20:00+07:00 ✅ DONE [agent: builder] x2: task-01 (templates.ts, api 565 test PASS) + task-02 (6 template Auth, auth-email-templates 31/31); primary đối chiếu git status khớp báo cáo, đã thêm 6 khối [auth.email.template.*] vào config.toml. ▶ START [agent: reviewer] round 1 (cancel sẽ redo bước này)
- 2026-11-17T17:40:00+07:00 ✅ DONE [agent: reviewer] round 1 NORMAL PASS (LOW: màu lệch Nest/Auth, thiếu test config.toml, test vé text, Outlook max-width; INFO: DEFAULT_WEB_ORIGIN filmbooking.vn, payload.url chưa kiểm scheme, PASSWORD_SET còn nút). Primary verify thật rồi close-out.
- 2026-11-17T18:05:00+07:00 ✅ DONE [agent: spec-publisher] scope v22 (không bump spec_version). Primary: thêm test config.toml (api 572 PASS, lint/tsc sạch), verify GoTrue nạp đủ 6 template (log reloaded 08:54:40Z), progress.json cập nhật, change archive, commit.
