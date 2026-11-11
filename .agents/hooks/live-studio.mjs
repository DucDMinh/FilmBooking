#!/usr/bin/env node
/**
 * live-studio.mjs — Hook Antigravity (agy) báo danh nhân vật lên dashboard vibe-studio.
 *
 * Gọi từ .agents/hooks.json. Đọc payload JSON qua stdin, rồi gọi
 * tools/agent-live.mjs enter|leave để nhân vật hiện/ẩn trên dashboard.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const LOOP_ROLES = new Set(['builder', 'builder-strong', 'reviewer']);

const HOOK_PHASE = {
  'change-request': 'orchestrating',
  graph: 'orchestrating',
  'spec-validator': 'review',
};

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function repoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

function agentLivePath() {
  return path.join(repoRoot(), 'tools', 'agent-live.mjs');
}

function detectMode(p) {
  if (process.argv[2]) return process.argv[2];
  if (p.terminationReason !== undefined || p.fullyIdle !== undefined || !p.toolCall) {
    return 'stop';
  }
  if (p.error) return 'post';

  // Distinguish PreToolUse vs PostToolUse when argv[2] is not passed
  const stateFile = path.join(repoRoot(), '.context', '.hook-pre-seen.json');
  const key = `${p.conversationId || 'default'}:${p.stepIdx ?? -1}:${p.toolCall?.name || ''}`;
  let seen = {};
  try {
    seen = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    seen = {};
  }
  if (seen[key]) {
    delete seen[key];
    try {
      fs.writeFileSync(stateFile, JSON.stringify(seen), 'utf8');
    } catch { /* ignore */ }
    return 'post';
  }
  seen[key] = Date.now();
  try {
    fs.writeFileSync(stateFile, JSON.stringify(seen), 'utf8');
  } catch { /* ignore */ }
  return 'pre';
}

function callLive(args) {
  try {
    execFileSync(process.execPath, [agentLivePath(), ...args], {
      timeout: 5000,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    /* nuốt lỗi — dashboard là phụ, không được phá session */
  }
}

function main() {
  const p = readStdin();
  const mode = detectMode(p);
  const toolCall = p.toolCall || {};
  const tool = toolCall.name || p.tool_name || '';
  const args = toolCall.args || p.tool_input || {};

  const subagentType = args.TypeName || args.subagent_type || args.Role || '';

  if (mode === 'pre' && (tool === 'invoke_subagent' || tool === 'Agent' || tool === 'Task')) {
    if (subagentType && !LOOP_ROLES.has(subagentType)) {
      const phase = HOOK_PHASE[subagentType] || 'building';
      callLive(['enter', '--agent', subagentType, '--role', subagentType, '--phase', phase]);
    }
  } else if (mode === 'post' && (tool === 'invoke_subagent' || tool === 'Agent' || tool === 'Task')) {
    if (subagentType && !LOOP_ROLES.has(subagentType)) {
      callLive(['leave', '--agent', subagentType]);
    }
  }

  if (mode === 'pre') {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  } else if (mode === 'stop') {
    process.stdout.write(JSON.stringify({ decision: 'stop' }));
  } else {
    process.stdout.write(JSON.stringify({}));
  }
}

try {
  main();
} catch {
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
}
process.exit(0);
