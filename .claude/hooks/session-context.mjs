#!/usr/bin/env node
/**
 * session-context.mjs — SessionStart hook (thay cho plugin loop-guard của opencode).
 *
 * Claude Code đưa stdout của SessionStart hook vào context của Claude.
 *  - startup / resume / clear: nếu .context/progress.json có activeWorkItem → nhắc chạy Session Start
 *    Protocol (đọc Run Journal, reconcile với git) trước khi làm tiếp.
 *  - compact: sau auto-compact, bản tóm tắt có thể mất chi tiết → bắt buộc re-read journal từ đĩa.
 *
 * In ngắn gọn để không tốn token. Mọi lỗi đều nuốt (exit 0).
 */

import fs from 'node:fs'
import path from 'node:path'

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { return {} }
}

function main() {
  const p = readStdin()
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || p.cwd || process.cwd())
  const source = p.source || ''

  let progress = null
  try { progress = JSON.parse(fs.readFileSync(path.join(root, '.context', 'progress.json'), 'utf8')) } catch { /* chưa có */ }
  const active = progress && progress.activeWorkItem

  const lines = []
  if (source === 'compact') {
    lines.push('## Session handoff (bắt buộc sau compact)')
    lines.push('Bản tóm tắt có thể mất chi tiết. Re-read Run Journal `.context/runs/<type>-<slug>-<phaseTask>.md` từ đĩa trước khi làm tiếp — đĩa là sự thật, `progress.json` chỉ là hint (AGENTS.md § Session Handoff).')
  }
  if (active) {
    const id = typeof active === 'string' ? active : JSON.stringify(active)
    const runsDir = path.join(root, '.context', 'runs')
    let journals = []
    try { journals = fs.readdirSync(runsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_')) } catch { /* none */ }
    lines.push(`Đang có work item dở: ${id}${source === 'compact' ? '' : ' — chạy Session Start Protocol (AGENTS.md § Session Handoff) hoặc `/resume` trước khi nhận việc mới.'}`)
    if (journals.length) lines.push(`Journal hiện có: ${journals.slice(-5).map((j) => '`.context/runs/' + j + '`').join(', ')}`)
  }
  if (lines.length) process.stdout.write(lines.join('\n') + '\n')
}

try { main() } catch { /* defensive */ }
process.exit(0)
