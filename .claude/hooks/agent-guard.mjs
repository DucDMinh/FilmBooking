#!/usr/bin/env node
/**
 * agent-guard.mjs — PreToolUse hook: thay cho `permission` của opencode.
 *
 * Được gọi từ .claude/settings.json cho MỌI tool call (session chính + subagent).
 * Claude Code gửi payload JSON qua stdin; khi tool call nằm trong subagent, payload có
 * `agent_type` (tên file trong .claude/agents/) → guard chọn profile tương ứng:
 *
 *   (session chính / agent khác) → global
 *   builder                      → global + cấm git push/merge/worktree
 *   builder-strong               → global + cấm git commit/push
 *
 *   Agent(builder-strong)        → permissionDecision "ask" (user phải duyệt)
 *   reviewer, spec-validator     → chỉ được chạy lệnh verify/read-only trong allowlist,
 *                                  chỉ được ghi file trong .context/review-reports/
 *
 * Chặn = exit 2 + lý do ra stderr (Claude nhận lý do và đổi hướng).
 * Cho qua = exit 0, không output → đi tiếp luồng permission bình thường của Claude Code.
 *
 * Khác opencode: không so glob trên cả chuỗi lệnh mà tách lệnh theo ; && || | & xuống dòng,
 * bỏ nội dung trong quote (để `git commit -m "fix push bug"` không bị chặn nhầm), soi cả
 * lệnh con trong `sh -c "..."`, và hiểu option toàn cục của git (`git -C . push -f`).
 *
 * Danh sách lệnh verify thêm cho reviewer: .claude/agent-policy.json → verifyCommands
 * (sinh bởi scripts/apply-verify-permissions.mjs từ .context/project-config.md).
 */

import fs from 'node:fs'
import path from 'node:path'

// ── profile theo agent_type ─────────────────────────────────────────────────
const PROFILE_BY_AGENT = {
  builder: 'builder',
  'builder-strong': 'builder-strong',
  reviewer: 'readonly',
  'spec-validator': 'readonly',
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// ── tiện ích ────────────────────────────────────────────────────────────────
function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return null
  }
}

function block(reason) {
  process.stderr.write(`[agent-guard] ${reason}\n`)
  process.exit(2)
}

function projectDir(p) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || p.cwd || process.cwd())
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

/** Nhánh cấm push: main, master + `forbidden_branch` trong .context/project-config.md. */
function forbiddenBranches(root) {
  const set = new Set(['main', 'master'])
  try {
    const txt = fs.readFileSync(path.join(root, '.context', 'project-config.md'), 'utf8')
    const m = txt.match(/^\s*forbidden_branch\s*:\s*["']?([^"'\s#]+)/m)
    if (m && !/^<.*>$/.test(m[1])) set.add(m[1])
  } catch { /* chưa có config */ }
  return set
}

// Bỏ nội dung trong quote, giữ lại cặp quote rỗng.
function stripQuotes(cmd) {
  return cmd.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'[^']*'/g, "''")
}

// Lệnh con chạy qua shell khác: sh -c "...", bash -c '...', cmd /c "...", powershell -Command "..."
function innerShellCommands(cmd) {
  const out = []
  const re = /\b(?:sh|bash|zsh|dash|cmd(?:\.exe)?|pwsh|powershell(?:\.exe)?)\s+(?:-\w+\s+)*(?:-c|\/c|-Command)\s+("(?:\\.|[^"\\])*"|'[^']*')/gi
  let m
  while ((m = re.exec(cmd))) out.push(m[1].slice(1, -1))
  const ev = /\beval\s+("(?:\\.|[^"\\])*"|'[^']*')/g
  while ((m = ev.exec(cmd))) out.push(m[1].slice(1, -1))
  return out
}

function segments(cmd) {
  return stripQuotes(cmd)
    .split(/\|\||&&|[;|&\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function tokens(seg) {
  return seg.split(/\s+/).filter(Boolean)
}

/** Tách `git [global opts] <sub> <args>` → { sub, args } hoặc null. */
function parseGit(tok) {
  // bỏ tiền tố gán biến môi trường: FOO=1 git push
  let i = 0
  while (i < tok.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok[i])) i++
  const bin = (tok[i] || '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '')
  if (bin !== 'git') return null
  i++
  while (i < tok.length) {
    const t = tok[i]
    if (t === '-C' || t === '-c' || t === '--git-dir' || t === '--work-tree' || t === '--namespace') { i += 2; continue }
    if (t.startsWith('-')) { i++; continue }
    break
  }
  if (i >= tok.length) return null
  return { sub: tok[i], args: tok.slice(i + 1) }
}

const hasShortFlag = (args, letter) =>
  args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter))

// ── luật chung (mọi agent) ──────────────────────────────────────────────────
const DB_DESTRUCTIVE = [
  /\bprisma\s+db\s+push\b/i,
  /\bdrizzle-kit\s+push\b/i,
  /\bprisma\s+migrate\s+reset\b/i,
  /\bprisma\s+db\s+seed\b/i,
  /\bsupabase\s+db\s+reset\b/i,
  /\bdb:(push|reset|seed)\b/i,
]

function checkGitGlobal(git, forbidden) {
  const { sub, args } = git
  if (sub === 'push') {
    if (args.some((a) => /^--(force|force-with-lease|force-if-includes)\b/.test(a)) || hasShortFlag(args, 'f'))
      return 'cấm force push'
    if (args.some((a) => a === '--mirror' || a === '--all' || a === '--delete') || hasShortFlag(args, 'd'))
      return 'cấm push --all/--mirror/--delete'
    const pos = args.filter((a) => !a.startsWith('-'))
    if (pos.length < 2)
      return 'cấm push trần — dùng `git push origin <target_branch>` (target_branch trong .context/project-config.md)'
    for (const spec of pos.slice(1)) {
      if (spec.startsWith('+')) return 'cấm refspec có dấu + (force)'
      if (spec.startsWith(':')) return 'cấm xoá nhánh remote'
      const dst = (spec.includes(':') ? spec.split(':').pop() : spec).replace(/^refs\/heads\//, '')
      if (forbidden.has(dst)) return `cấm push thẳng nhánh "${dst}" (forbidden_branch)`
    }
  }
  if (sub === 'reset' && args.includes('--hard')) return 'cấm git reset --hard'
  if (sub === 'checkout' && (args.includes('--') || args.includes('.') || hasShortFlag(args, 'f') || args.includes('--force')))
    return 'cấm git checkout -- / checkout . / checkout -f (huỷ thay đổi chưa commit)'
  if (sub === 'restore' && !(args.includes('--staged') && !args.includes('--worktree') && !hasShortFlag(args, 'W')))
    return 'cấm git restore working tree (huỷ thay đổi) — chỉ cho `git restore --staged`'
  if (sub === 'clean' && (hasShortFlag(args, 'f') || args.includes('--force')))
    return 'cấm git clean -f'
  return null
}

const EXTRA_GIT_DENY = {
  builder: new Set(['push', 'merge', 'worktree']),
  'builder-strong': new Set(['push', 'commit']),
}

function checkBash(cmd, profile, root, depth = 0) {
  const forbidden = forbiddenBranches(root)
  const stripped = stripQuotes(cmd)
  for (const re of DB_DESTRUCTIVE) {
    if (re.test(stripped)) return `cấm lệnh DB phá hoại (${re.source}) — dùng migration versioned`
  }
  for (const seg of segments(cmd)) {
    const git = parseGit(tokens(seg))
    if (!git) continue
    const r = checkGitGlobal(git, forbidden)
    if (r) return r
    const extra = EXTRA_GIT_DENY[profile]
    if (extra && extra.has(git.sub)) return `${profile} không được chạy git ${git.sub} (dispatcher/session chính lo việc này)`
  }
  if (depth < 3) {
    for (const inner of innerShellCommands(cmd)) {
      const r = checkBash(inner, profile, root, depth + 1)
      if (r) return r
    }
  }
  return null
}

// ── profile readonly (reviewer, spec-validator) ────────────────────────────
const READONLY_GIT = new Set(['status', 'diff', 'log', 'show', 'branch', 'rev-parse', 'ls-files', 'blame', 'merge-base'])
const READONLY_PREFIXES = [
  'aislop', 'npx aislop', 'oxlint', 'npx oxlint', 'ocr', 'npx blitzstrike',
  'npx tsc', 'tsc', 'vitest', 'npx vitest', 'jest', 'npx jest', 'pytest', 'ruff check', 'ruff format --check',
  'go test', 'go vet', 'cargo test', 'cargo clippy', 'semgrep', 'npx semgrep', 'npm audit', 'pnpm audit', 'yarn audit',
]
const PM_SCRIPT = /^(pnpm|npm|yarn|bun)(\s+(run|exec))?\s+[\w:.@/-]*(test|lint|typecheck|type-check|vitest|check)[\w:.@/-]*(\s|$)/
const MUTATING_FLAGS = /(^|\s)(--fix|--write|-w|--update|-u|--updateSnapshot|--update-snapshots)(\s|=|$)/

// Cho phép đúng MỘT tiền tố `cd "<worktree>" && ` để reviewer verify trong worktree của builder.
// Thư mục phải nằm trong <project>/.worktrees/. Phần sau && vẫn qua allowlist như thường.
const CD_PREFIX = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s"';&|]+))\s*&&\s*([\s\S]+)$/

function isInside(child, parent) {
  const norm = (s) => (process.platform === 'win32' ? s.toLowerCase().replace(/\//g, '\\') : s)
  return norm(child).startsWith(norm(parent + path.sep))
}

function checkReadonlyBash(cmd, root) {
  const cd = cmd.match(CD_PREFIX)
  if (cd) {
    const dir = path.resolve(root, cd[1] || cd[2] || cd[3])
    if (!isInside(dir, path.join(root, '.worktrees')))
      return 'reviewer/spec-validator: chỉ được `cd "<worktree>" && <lệnh>` với thư mục trong .worktrees/'
    cmd = cd[4]
  }
  const stripped = stripQuotes(cmd)
  if (/[;&|`<>\n]|\$\(/.test(stripped))
    return 'reviewer/spec-validator: không được nối lệnh, pipe hay chuyển hướng (; && | > <). Chạy từng lệnh riêng (được phép duy nhất tiền tố `cd "<worktree>" && `).'
  const norm = cmd.trim().replace(/\s+/g, ' ')

  const policy = readJson(path.join(root, '.claude', 'agent-policy.json')) || {}
  const verify = Array.isArray(policy.verifyCommands) ? policy.verifyCommands : []
  if (verify.some((v) => typeof v === 'string' && v.trim().replace(/\s+/g, ' ') === norm)) return null

  const git = parseGit(tokens(norm))
  if (!git && MUTATING_FLAGS.test(stripQuotes(norm)))
    return 'reviewer/spec-validator: không được chạy lệnh có cờ sửa file (--fix/--write/-u...)'
  if (git) {
    if (!READONLY_GIT.has(git.sub)) return `reviewer/spec-validator chỉ được chạy git read-only (${[...READONLY_GIT].join(', ')})`
    if (git.sub === 'branch' && git.args.some((a) => /^-/.test(a) && !/^(-a|-r|-v|-vv|--list|--all|--remotes|--show-current|--contains|--merged|--no-merged)$/.test(a)))
      return 'reviewer/spec-validator: git branch chỉ được liệt kê'
    return null
  }
  if (READONLY_PREFIXES.some((p) => norm === p || norm.startsWith(p + ' '))) return null
  if (PM_SCRIPT.test(norm)) return null
  return `reviewer/spec-validator: lệnh "${norm.slice(0, 80)}" không nằm trong allowlist. Thêm lệnh verify vào .context/project-config.md rồi chạy \`node scripts/apply-verify-permissions.mjs --write\`.`
}

function checkReadonlyWrite(filePath, root) {
  if (!filePath) return 'thiếu file_path'
  const allowed = path.join(root, '.context', 'review-reports') + path.sep
  let abs = path.resolve(root, filePath)
  const norm = (s) => (process.platform === 'win32' ? s.toLowerCase().replace(/\//g, '\\') : s)
  if (!norm(abs).startsWith(norm(allowed)))
    return `reviewer/spec-validator chỉ được ghi report vào .context/review-reports/ (không được sửa ${filePath})`
  return null
}

// ── main ────────────────────────────────────────────────────────────────────
function main() {
  const p = readStdin()
  if (!p) return // payload hỏng → không chặn (đi luồng permission bình thường)
  const root = projectDir(p)
  const arg = process.argv[2] || 'auto'
  const profile = arg === 'auto' ? (PROFILE_BY_AGENT[p.agent_type] || 'global') : arg
  const tool = p.tool_name || ''
  const input = p.tool_input || {}

  // builder-strong: luôn bắt user duyệt (thay cho permission.task "ask" của opencode).
  if ((tool === 'Agent' || tool === 'Task') && String(input.subagent_type || '') === 'builder-strong') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'builder-strong (model mạnh, tốn hơn) chỉ dùng khi user yêu cầu rõ — cần user duyệt.',
      },
    }))
    return
  }

  let reason = null
  if (profile === 'readonly') {
    if (tool === 'Bash' || tool === 'PowerShell') {
      reason = checkReadonlyBash(String(input.command || ''), root) || checkBash(String(input.command || ''), profile, root)
    } else if (WRITE_TOOLS.has(tool)) {
      reason = checkReadonlyWrite(input.file_path || input.notebook_path, root)
    }
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    reason = checkBash(String(input.command || ''), profile, root)
  }
  if (reason) block(reason)
}

try {
  main()
} catch (e) {
  // lỗi nội bộ của guard không được làm hỏng session
  process.stderr.write(`[agent-guard] internal error: ${e && e.message}\n`)
}
process.exit(0)
