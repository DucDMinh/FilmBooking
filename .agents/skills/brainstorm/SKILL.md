---
name: brainstorm
description: "Brainstorm — đọc spec/code rồi (1) clear/làm rõ yêu cầu qua đối thoại + design doc (skill brainstorming) và (2) hỏi user nhập config dự án (git, package, verify commands, DB, models, deploy, monitoring) ghi .context/project-config.md. Chạy sau /spec-init hoặc chạy lại để update."
argument-hint: "[nhóm] [--dry-run]"
---

Chạy **Brainstorm** cho repo hiện tại: đọc spec/code đã có → **clear/làm rõ yêu cầu (design doc)** + hỏi user
**từng câu** để chốt thông tin dự án + cấu hình vận hành → ghi `.context/project-config.md` cho mọi agent đọc.

> 🔁 **Lệnh MANUAL.** Trong `/start` (khởi tạo dự án) brainstorm được **gọi tự động** sau khi đọc spec.
> Chạy tay `/brainstorm` khi cần chạy lại/update (vd đổi branch, thêm command, đổi model).

`$ARGUMENTS` (tùy chọn: `<nhóm>` để chỉ sửa 1 nhóm — vd `git`, `models`; `--dry-run` chỉ in nháp, không ghi)

## Báo danh dashboard (prompt-level)
`/brainstorm` chạy trong session chính → **tự gọi** `enter`/`leave` (hook `Agent` không bắt được):
```bash
node tools/agent-live.mjs enter --agent brainstorm --role brainstorm   # → Theo, phase planning
# ... xong ...
node tools/agent-live.mjs leave --agent brainstorm
```
Lỗi/thiếu file này KHÔNG chặn flow.

## Flow
Thực thi đầy đủ `.agent/brainstorm.md`:
1. **Phase 0 — Scan** (không hỏi): đọc `SPECIFICATIONS.md`, `docs/**`, `spec/**`; chạy `node scripts/detect-profile.mjs`.
2. **Phase 0.5 — Project config**: hỏi theo **7 nhóm** (Git & branch / Stack & source / Verify commands / Database & migration / Models per role / Deploy & CI-CD / Monitoring & UI). Auto-detect được → chỉ confirm.
3. **Phase 1–3 — Clear yêu cầu + thiết kế**: ĐỌC `skills/brainstorming/SKILL.md` và làm theo → clarify từng câu một → propose 2-3 approaches → present design → viết design doc `docs/specs/YYYY-MM-DD-<topic>-design.md` → tự review → user review gate. Chỉ khi dựng spec/feature mới; skip câu đã có trong spec/docs. **HARD-GATE: không code trước khi design được approve.**
4. **Ghi**: `.context/project-config.md` (config, KHÔNG secret) + `.env.local` (secret, git-ignored) + `.context/brainstorm-log.md` + design doc (nếu có).
5. **Sync quyền verify command** (`node scripts/apply-verify-permissions.mjs`, dry-run trước) + nhắc **khởi động lại Claude Code nếu thay đổi chưa có hiệu lực**.

## Chạy lại / update
`/brainstorm` đọc `.context/project-config.md` hiện tại → hiển thị giá trị đang có → chỉ hỏi lại nhóm user chọn → merge (giữ field không đổi). `/brainstorm <nhóm>` chỉ sửa nhóm đó.

## Không làm
- KHÔNG code/scaffold trước khi user approve design (HARD-GATE — `skills/brainstorming/SKILL.md`).
- KHÔNG hỏi nhiều câu một lúc; KHÔNG hỏi lại thứ đã có trong spec/code/config.
- KHÔNG ghi secret vào `.context/project-config.md`; KHÔNG commit/push trong bước brainstorm.
- Field không chắc để `null`/`<...>`, không bịa.
