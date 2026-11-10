#!/usr/bin/env node
/**
 * template-sync.mjs — Kéo cập nhật mới nhất từ template (bản Claude Code) vào một project.
 *
 * Chỉ ghi đè các path thuộc quyền TEMPLATE (managedPaths):
 *   AGENTS.md · CLAUDE.md · .agent/ · .claude/agents/ · .claude/commands/ · .claude/hooks/ · scripts/ · skills/
 *   · tools/agent-live.mjs · tools/progress-write.mjs
 * KHÔNG BAO GIỜ đụng: code, SPECIFICATIONS.md, BRIEF.md, docs/, spec/, tasks/, .context/, .devops/,
 * .env*, package.json, .gitignore, README.md. `.claude/settings.json` + `.claude/agent-policy.json`
 * chỉ được BÁO nếu khác template (project thường tuỳ biến).
 *
 * Nguồn template BẮT BUỘC chỉ rõ (không có mặc định — trỏ nhầm về repo opencode gốc sẽ ghi đè mất bản port):
 *   --template <git-url | đường-dẫn-thư-mục>    hoặc    "templateRepo" trong <project>/.template-sync.json
 *
 * CÁCH DÙNG:
 *   node scripts/template-sync.mjs --template E:/claude-project-template          # nguồn là thư mục local
 *   node scripts/template-sync.mjs --template git@github.com:<you>/<repo>.git     # nguồn là git repo
 *   node scripts/template-sync.mjs --project /path/proj --template ...           # chỉ định project đích
 *   node scripts/template-sync.mjs --dry-run ...                                  # chỉ xem, KHÔNG ghi
 *   node scripts/template-sync.mjs --prune ...                                    # xoá file template đã bỏ
 *   node scripts/template-sync.mjs --branch <tên> ...                             # nhánh của repo nguồn (mặc định main)
 *   node scripts/template-sync.mjs --no-config ...                                # bỏ qua .template-sync.json
 *
 * Config tuỳ chọn: <project>/.template-sync.json
 *   { "templateRepo": "...", "branch": "main", "managedPaths": [...], "reportOnlyPaths": [...] }
 *
 * An toàn: managedPaths có thay đổi CHƯA COMMIT → DỪNG. Mọi thay đổi nằm trong git của project
 * → xem `git diff`, hoàn tác `git restore <path>` (chạy tay — agent bị guard chặn lệnh này).
 * Node thuần, không cần rsync/diff → chạy được trên Windows.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULTS = {
  managedPaths: [
    'AGENTS.md', 'CLAUDE.md', '.agent', '.claude/agents', '.claude/commands', '.claude/hooks',
    'scripts', 'skills', 'tools/agent-live.mjs', 'tools/progress-write.mjs',
  ],
  reportOnlyPaths: ['.claude/settings.json', '.claude/agent-policy.json'],
}

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }

if (has('-h') || has('--help')) { usage(); process.exit(0) }

const dryRun = has('--dry-run')
const prune = has('--prune')
const noConfig = has('--no-config')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = opt('--project') ? path.resolve(opt('--project')) : path.resolve(scriptDir, '..')

function usage() {
  console.log(`template-sync — đồng bộ project với template mới nhất (bản Claude Code)

  node scripts/template-sync.mjs --template <git-url|dir> [--project DIR] [--branch NAME] [--dry-run] [--prune] [--no-config]

  --template SRC  nguồn template: git URL hoặc thư mục local (bắt buộc nếu .template-sync.json không có templateRepo)
  --project DIR   project đích (mặc định: thư mục cha của scripts/)
  --branch NAME   nhánh của repo nguồn (mặc định: main)
  --dry-run       chỉ liệt kê thay đổi, KHÔNG ghi
  --prune         xoá file template đã bỏ khỏi các managedPaths
  --no-config     bỏ qua <project>/.template-sync.json`)
}

function die(msg) { console.error('\n❌ ' + msg); process.exit(1) }
function git(args, opts = {}) { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }) }

// ---- 0. sanity ----
if (!fs.existsSync(path.join(ROOT, 'AGENTS.md'))) {
  die(`Không thấy "${path.join(ROOT, 'AGENTS.md')}" — không giống project từ template.\n   Dùng --project <dir> để chỉ đúng project.`)
}

// ---- config ----
let cfg = {}
if (!noConfig) {
  const p = path.join(ROOT, '.template-sync.json')
  if (fs.existsSync(p)) {
    try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { die(`.template-sync.json không hợp lệ: ${e.message}`) }
  }
}
const managed = cfg.managedPaths || DEFAULTS.managedPaths
const reportOnly = cfg.reportOnlyPaths || DEFAULTS.reportOnlyPaths
const source = opt('--template') || cfg.templateRepo
const branch = opt('--branch') || cfg.branch || 'main'
if (!source) die('Chưa chỉ nguồn template. Dùng --template <git-url|thư-mục> hoặc thêm "templateRepo" vào .template-sync.json.')
if (/opencode-project-template(\.git)?\/?$/i.test(source) && !has('--allow-opencode-source'))
  die('Nguồn trỏ về repo opencode gốc — sync sẽ ghi đè bản Claude Code bằng file opencode. Dùng repo/thư mục bản port của bạn.')

// ---- 1. lấy template ----
let SRC
const localDir = fs.existsSync(source) && fs.statSync(source).isDirectory()
if (localDir) {
  SRC = path.resolve(source)
  if (SRC === ROOT) die('Nguồn template trùng với project đích.')
  console.log(`📁 Template local: ${SRC}`)
} else {
  const name = path.basename(source.replace(/\.git$/, '').replace(/\/$/, '')) || 'template'
  SRC = path.join(os.homedir(), '.cache', 'claude-template-sync', name)
  fs.mkdirSync(path.dirname(SRC), { recursive: true })
  try {
    if (!fs.existsSync(path.join(SRC, '.git'))) {
      console.log(`⬇️  Clone template (lần đầu) → ${SRC}`)
      git(['clone', '--quiet', '--branch', branch, source, SRC])
    } else {
      console.log('🔄 Fetch template…')
      git(['-C', SRC, 'remote', 'set-url', 'origin', source])
      git(['-C', SRC, 'fetch', '--quiet', 'origin', branch])
      git(['-C', SRC, 'checkout', '--quiet', '--detach', `origin/${branch}`])
    }
  } catch (e) {
    die(`Không lấy được template (${source}). Kiểm tra URL/SSH/network.\n   ${String(e.stderr || e.message).trim()}`)
  }
  const sha = git(['-C', SRC, 'rev-parse', '--short', 'HEAD']).trim()
  console.log(`📌 Template @ ${sha} (${branch}) · nguồn: ${source}`)
}

// ---- 2. guard: managedPaths không được dirty ----
const isGit = fs.existsSync(path.join(ROOT, '.git'))
if (isGit) {
  const dirty = managed.filter((p) => {
    try { return git(['-C', ROOT, 'status', '--porcelain', '--', p]).trim().length > 0 } catch { return false }
  })
  if (dirty.length) {
    console.error('\n❌ Các path template-managed đang có thay đổi CHƯA COMMIT:')
    dirty.forEach((d) => console.error('   - ' + d))
    die('Commit hoặc stash trước rồi chạy lại (dùng --dry-run để xem trước).')
  }
}

// ---- 3. copy managedPaths ----
const SKIP_DIRS = new Set(['.git', 'node_modules'])
function listFiles(dir, base = dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...listFiles(full, base))
    else if (ent.isFile()) out.push(path.relative(base, full))
  }
  return out
}
const sameFile = (a, b) => fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b))

let nAdd = 0, nUpd = 0, nDel = 0
for (const p of managed) {
  const srcPath = path.join(SRC, p)
  const dstPath = path.join(ROOT, p)
  if (!fs.existsSync(srcPath)) { console.log(`⚠️  Template không có "${p}" — bỏ qua.`); continue }
  const isDir = fs.statSync(srcPath).isDirectory()
  const pairs = isDir
    ? listFiles(srcPath).map((rel) => [path.join(srcPath, rel), path.join(dstPath, rel), path.join(p, rel)])
    : [[srcPath, dstPath, p]]
  const changes = []
  for (const [s, d, rel] of pairs) {
    if (sameFile(s, d)) continue
    const isNew = !fs.existsSync(d)
    changes.push((isNew ? '   ➕ ' : '   ✏️  ') + rel.replace(/\\/g, '/'))
    isNew ? nAdd++ : nUpd++
    if (!dryRun) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d) }
  }
  if (isDir && prune) {
    const srcSet = new Set(listFiles(srcPath))
    for (const rel of listFiles(dstPath)) {
      if (srcSet.has(rel)) continue
      changes.push('   🗑  ' + path.join(p, rel).replace(/\\/g, '/'))
      nDel++
      if (!dryRun) fs.rmSync(path.join(dstPath, rel))
    }
  }
  if (changes.length) console.log(`\n📦 ${p}${isDir ? '/' : ''}\n${changes.join('\n')}`)
}

// ---- 4. report-only drift ----
for (const p of reportOnly) {
  const s = path.join(SRC, p), d = path.join(ROOT, p)
  if (fs.existsSync(s) && fs.existsSync(d) && !sameFile(s, d))
    console.log(`\n⚠️  "${p}" khác template — KHÔNG tự đổi. Review tay nếu cần (vd gate bảo mật mới).`)
}

// ---- 5. summary ----
console.log(`\n${dryRun ? '🧪 DRY-RUN —' : '✅'} ${nAdd} thêm · ${nUpd} sửa · ${nDel} xoá`)
if (!dryRun && (nAdd || nUpd || nDel)) {
  if (isGit) console.log('\nXem: git status --short && git diff   ·   Xong: commit như bình thường.')
  else console.log('\n⚠️  Project KHÔNG phải git repo — hãy backup thủ công để hoàn tác được.')
}
