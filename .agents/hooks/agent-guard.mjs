#!/usr/bin/env node
/**
 * agent-guard.mjs — PreToolUse hook for Antigravity (agy) & Claude Code.
 *
 * Runs on every tool execution (session & subagents).
 * Antigravity passes stdin in JSON format (protojson camelCase) with `toolCall: { name, args }`.
 * Outputs `{ decision: "allow" | "deny" | "ask", reason?: string }` on stdout.
 *
 * Safety rules enforced:
 *  - Global: block force push, push to forbidden branches (main, master, forbidden_branch),
 *    git reset --hard, git clean -f, git checkout -- / git restore working tree,
 *    and destructive DB commands (db push, db reset, db:seed, migrate reset).
 *  - builder-strong: returns `decision: "ask"` to require human confirmation.
 *  - reviewer / spec-validator: readonly profile — only allowed verifyCommands (from agent-policy.json)
 *    and readonly git/tool commands; can only write under .context/review-reports/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE_BY_AGENT = {
  builder: 'builder',
  'builder-strong': 'builder-strong',
  reviewer: 'readonly',
  'spec-validator': 'readonly',
};

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function projectDir(payload) {
  if (payload?.workspacePaths && payload.workspacePaths.length > 0) {
    return path.resolve(payload.workspacePaths[0]);
  }
  if (process.env.ANTIGRAVITY_PROJECT_DIR) {
    return path.resolve(process.env.ANTIGRAVITY_PROJECT_DIR);
  }
  if (process.env.CLAUDE_PROJECT_DIR) {
    return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  }
  // If cwd is inside .agents or .claude
  const cwd = process.cwd();
  if (cwd.endsWith('.agents') || cwd.endsWith('.claude')) {
    return path.resolve(cwd, '..');
  }
  return path.resolve(cwd);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function forbiddenBranches(root) {
  const set = new Set(['main', 'master']);
  try {
    const txt = fs.readFileSync(path.join(root, '.context', 'project-config.md'), 'utf8');
    const m = txt.match(/^\s*forbidden_branch\s*:\s*["']?([^"'\s#]+)/m);
    if (m && !/^<.*>$/.test(m[1])) set.add(m[1]);
  } catch {
    /* config not yet initialized */
  }
  return set;
}

function stripQuotes(cmd) {
  return cmd.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'[^']*'/g, "''");
}

function innerShellCommands(cmd) {
  const out = [];
  const re = /\b(?:sh|bash|zsh|dash|cmd(?:\.exe)?|pwsh|powershell(?:\.exe)?)\s+(?:-\w+\s+)*(?:-c|\/c|-Command)\s+("(?:\\.|[^"\\])*"|'[^']*')/gi;
  let m;
  while ((m = re.exec(cmd))) out.push(m[1].slice(1, -1));
  const ev = /\beval\s+("(?:\\.|[^"\\])*"|'[^']*')/g;
  while ((m = ev.exec(cmd))) out.push(m[1].slice(1, -1));
  return out;
}

function segments(cmd) {
  return stripQuotes(cmd)
    .split(/\|\||&&|[;|&\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokens(seg) {
  return seg.split(/\s+/).filter(Boolean);
}

function parseGit(tok) {
  let i = 0;
  while (i < tok.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok[i])) i++;
  const bin = (tok[i] || '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
  if (bin !== 'git') return null;
  i++;
  while (i < tok.length) {
    const t = tok[i];
    if (t === '-C' || t === '-c' || t === '--git-dir' || t === '--work-tree' || t === '--namespace') {
      i += 2;
      continue;
    }
    if (t.startsWith('-')) {
      i++;
      continue;
    }
    break;
  }
  if (i >= tok.length) return null;
  return { sub: tok[i], args: tok.slice(i + 1) };
}

const hasShortFlag = (args, letter) =>
  args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter));

const DB_DESTRUCTIVE = [
  /\bprisma\s+db\s+push\b/i,
  /\bdrizzle-kit\s+push\b/i,
  /\bprisma\s+migrate\s+reset\b/i,
  /\bprisma\s+db\s+seed\b/i,
  /\bsupabase\s+db\s+reset\b/i,
  /\bdb:(push|reset|seed)\b/i,
];

function checkGitGlobal(git, forbidden) {
  const { sub, args } = git;
  if (sub === 'push') {
    if (args.some((a) => /^--(force|force-with-lease|force-if-includes)\b/.test(a)) || hasShortFlag(args, 'f'))
      return 'cấm force push';
    if (args.some((a) => a === '--mirror' || a === '--all' || a === '--delete') || hasShortFlag(args, 'd'))
      return 'cấm push --all/--mirror/--delete';
    const pos = args.filter((a) => !a.startsWith('-'));
    if (pos.length < 2)
      return 'cấm push trần — dùng `git push origin <target_branch>` (target_branch trong .context/project-config.md)';
    for (const spec of pos.slice(1)) {
      if (spec.startsWith('+')) return 'cấm refspec có dấu + (force)';
      if (spec.startsWith(':')) return 'cấm xoá nhánh remote';
      const dst = (spec.includes(':') ? spec.split(':').pop() : spec).replace(/^refs\/heads\//, '');
      if (forbidden.has(dst)) return `cấm push thẳng nhánh "${dst}" (forbidden_branch)`;
    }
  }
  if (sub === 'reset' && args.includes('--hard')) return 'cấm git reset --hard';
  if (sub === 'checkout' && (args.includes('--') || args.includes('.') || hasShortFlag(args, 'f') || args.includes('--force')))
    return 'cấm git checkout -- / checkout . / checkout -f (huỷ thay đổi chưa commit)';
  if (sub === 'restore' && !(args.includes('--staged') && !args.includes('--worktree') && !hasShortFlag(args, 'W')))
    return 'cấm git restore working tree (huỷ thay đổi) — chỉ cho `git restore --staged`';
  if (sub === 'clean' && (hasShortFlag(args, 'f') || args.includes('--force')))
    return 'cấm git clean -f';
  return null;
}

const EXTRA_GIT_DENY = {
  builder: new Set(['push', 'merge', 'worktree']),
  'builder-strong': new Set(['push', 'commit']),
};

function checkCommand(cmd, profile, root, depth = 0) {
  const forbidden = forbiddenBranches(root);
  const stripped = stripQuotes(cmd);
  for (const re of DB_DESTRUCTIVE) {
    if (re.test(stripped)) return `cấm lệnh DB phá hoại (${re.source}) — dùng migration versioned`;
  }
  for (const seg of segments(cmd)) {
    const git = parseGit(tokens(seg));
    if (!git) continue;
    const r = checkGitGlobal(git, forbidden);
    if (r) return r;
    const extra = EXTRA_GIT_DENY[profile];
    if (extra && extra.has(git.sub)) return `${profile} không được chạy git ${git.sub} (dispatcher/session chính lo việc này)`;
  }
  if (depth < 3) {
    for (const inner of innerShellCommands(cmd)) {
      const r = checkCommand(inner, profile, root, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

const READONLY_GIT = new Set(['status', 'diff', 'log', 'show', 'branch', 'rev-parse', 'ls-files', 'blame', 'merge-base']);
const READONLY_PREFIXES = [
  'aislop', 'npx aislop', 'oxlint', 'npx oxlint', 'ocr', 'npx blitzstrike',
  'npx tsc', 'tsc', 'vitest', 'npx vitest', 'jest', 'npx jest', 'pytest', 'ruff check', 'ruff format --check',
  'go test', 'go vet', 'cargo test', 'cargo clippy', 'semgrep', 'npx semgrep', 'npm audit', 'pnpm audit', 'yarn audit',
];
const PM_SCRIPT = /^(pnpm|npm|yarn|bun)(\s+(run|exec))?\s+[\w:.@/-]*(test|lint|typecheck|type-check|vitest|check)[\w:.@/-]*(\s|$)/;
const MUTATING_FLAGS = /(^|\s)(--fix|--write|-w|--update|-u|--updateSnapshot|--update-snapshots)(\s|=|$)/;
const CD_PREFIX = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s"';&|]+))\s*(?:&&|;)\s*([\s\S]+)$/;

function isInside(child, parent) {
  const norm = (s) => (process.platform === 'win32' ? s.toLowerCase().replace(/\//g, '\\') : s);
  return norm(child).startsWith(norm(parent + path.sep));
}

function checkReadonlyCommand(cmd, root) {
  let innerCmd = cmd;
  const cd = cmd.match(CD_PREFIX);
  if (cd) {
    const dir = path.resolve(root, cd[1] || cd[2] || cd[3]);
    if (!isInside(dir, path.join(root, '.worktrees')))
      return 'reviewer/spec-validator: chỉ được `cd "<worktree>" && <lệnh>` với thư mục trong .worktrees/';
    innerCmd = cd[4];
  }
  const stripped = stripQuotes(innerCmd);
  if (/[;&|`<>\n]|\$\(/.test(stripped))
    return 'reviewer/spec-validator: không được nối lệnh, pipe hay chuyển hướng (; && | > <). Chạy từng lệnh riêng (được phép duy nhất tiền tố `cd "<worktree>" && `).';
  const norm = innerCmd.trim().replace(/\s+/g, ' ');

  // Read policy from .agents or .claude
  let policy = readJson(path.join(root, '.agents', 'agent-policy.json')) || readJson(path.join(root, '.claude', 'agent-policy.json')) || {};
  const verify = Array.isArray(policy.verifyCommands) ? policy.verifyCommands : [];
  if (verify.some((v) => typeof v === 'string' && v.trim().replace(/\s+/g, ' ') === norm)) return null;

  const git = parseGit(tokens(norm));
  if (!git && MUTATING_FLAGS.test(stripQuotes(norm)))
    return 'reviewer/spec-validator: không được chạy lệnh có cờ sửa file (--fix/--write/-u...)';
  if (git) {
    if (!READONLY_GIT.has(git.sub)) return `reviewer/spec-validator chỉ được chạy git read-only (${[...READONLY_GIT].join(', ')})`;
    if (git.sub === 'branch' && git.args.some((a) => /^-/.test(a) && !/^(-a|-r|-v|-vv|--list|--all|--remotes|--show-current|--contains|--merged|--no-merged)$/.test(a)))
      return 'reviewer/spec-validator: git branch chỉ được liệt kê';
    return null;
  }
  if (READONLY_PREFIXES.some((p) => norm === p || norm.startsWith(p + ' '))) return null;
  if (PM_SCRIPT.test(norm)) return null;
  return `reviewer/spec-validator: lệnh "${norm.slice(0, 80)}" không nằm trong allowlist. Thêm lệnh verify vào .context/project-config.md rồi chạy \`node scripts/apply-verify-permissions.mjs --write\`.`;
}

function checkReadonlyWrite(filePath, root) {
  if (!filePath) return 'thiếu file_path';
  const allowed = path.join(root, '.context', 'review-reports') + path.sep;
  let abs = path.resolve(root, filePath);
  const norm = (s) => (process.platform === 'win32' ? s.toLowerCase().replace(/\//g, '\\') : s);
  if (!norm(abs).startsWith(norm(allowed)))
    return `reviewer/spec-validator chỉ được ghi report vào .context/review-reports/ (không được sửa ${filePath})`;
  return null;
}

const DEFAULT_AGY_MODELS = {
  builder: 'flash',
  'builder-strong': 'pro',
  reviewer: 'pro',
  'spec-validator': 'flash',
  'spec-publisher': 'inherit',
  design: 'inherit',
  graph: 'inherit',
  'spec-init': 'inherit',
};

function agyModels(root) {
  const map = { ...DEFAULT_AGY_MODELS };
  try {
    const txt = fs.readFileSync(path.join(root, '.context', 'project-config.md'), 'utf8');
    const block = txt.match(/agy_models\s*:\s*[^\r\n]*\r?\n((?:[ \t]+[a-zA-Z0-9_-]+\s*:\s*[^\r\n]+\r?\n?)+)/);
    if (block) {
      for (const line of block[1].split(/\r?\n/)) {
        const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*([a-z_]+)/);
        if (m) map[m[1]] = m[2];
      }
    }
  } catch {
    /* fallback to defaults */
  }
  return map;
}

function main() {
  const p = readStdin();
  if (!p) {
    // If no payload or parse error, allow default execution
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const root = projectDir(p);
  const toolCall = p.toolCall || {};
  const tool = toolCall.name || p.tool_name || '';
  const args = toolCall.args || p.tool_input || {};

  // Detect caller agent profile
  let callerAgent = p.agent_type || args.agent_type || args.TypeName || args.subagent_type || '';
  const profile = PROFILE_BY_AGENT[callerAgent] || 'global';

  // Enforce fixed Model per role on invoke_subagent + builder-strong approval gate
  if (tool === 'invoke_subagent' || tool === 'Agent' || tool === 'Task') {
    const subType = String(args.TypeName || args.subagent_type || '');
    const modelMap = agyModels(root);
    const targetModel = modelMap[subType];
    const overwrite = targetModel && args.Model !== targetModel ? { overwrite: { Model: targetModel } } : {};

    if (subType === 'builder-strong' || String(args.Role || '').includes('builder-strong')) {
      process.stdout.write(
        JSON.stringify({
          decision: 'ask',
          reason: 'builder-strong (model mạnh, tốn hơn) chỉ dùng khi user yêu cầu rõ — cần user duyệt.',
          ...overwrite,
        })
      );
      return;
    }

    if (targetModel && args.Model !== targetModel) {
      process.stdout.write(
        JSON.stringify({
          decision: 'allow',
          ...overwrite,
        })
      );
      return;
    }
  }

  let violation = null;

  // Run command checks
  if (tool === 'run_command' || tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(args.CommandLine || args.command || '');
    if (profile === 'readonly') {
      violation = checkReadonlyCommand(cmd, root) || checkCommand(cmd, profile, root);
    } else {
      violation = checkCommand(cmd, profile, root);
    }
  } else if (WRITE_TOOLS.has(tool)) {
    const targetFile = String(args.Path || args.file_path || args.notebook_path || '');
    if (profile === 'readonly') {
      violation = checkReadonlyWrite(targetFile, root);
    }
  }

  if (violation) {
    process.stderr.write(`[agent-guard] ${violation}\n`);
    process.stdout.write(
      JSON.stringify({
        decision: 'deny',
        reason: `[agent-guard] ${violation}`,
      })
    );
    return;
  }

  process.stdout.write(JSON.stringify({ decision: 'allow' }));
}

try {
  main();
} catch (e) {
  process.stderr.write(`[agent-guard] internal error: ${e && e.message}\n`);
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
}
process.exit(0);
