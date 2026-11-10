#!/usr/bin/env node
/**
 * live-studio.mjs — hook Claude Code báo danh nhân vật lên dashboard vibe-studio.
 *
 * Gọi từ .claude/settings.json. Đọc payload hook qua stdin (JSON), rồi gọi
 * tools/agent-live.mjs enter|leave để nhân vật hiện/ẩn trên dashboard.
 *
 * Map hook → hành động:
 *   UserPromptSubmit         → chat-enter   (chat thường → Eve làm việc)
 *   Stop                     → chat-leave   (Eve về khu nghỉ)
 *   PreToolUse(Agent)        → agent-enter  (subagent → nhân vật theo subagent_type)
 *   PostToolUse(Agent)       → agent-leave  (CHỈ khi subagent chạy sync — xem B1)
 *   PreToolUse(SendMessage)  → agent-enter  (resume subagent nền — xem B2)
 *   SubagentStop             → agent-leave  (subagent nền/async thật sự kết thúc)
 *
 * Khóa nhân vật theo agentId ổn định (role-<agentId>) để enter/leave khớp nhau
 * dù subagent chạy nền và tool_use_id không trùng giữa các lần.
 *
 * Nguyên tắc:
 *  - builder / builder-strong / reviewer KHÔNG báo qua hook (loop đã tự enter/leave),
 *    nên mỗi agent chỉ hiện 1 nhân vật.
 *  - Defensive tuyệt đối: mọi lỗi đều nuốt (exit 0, không output), không phá session.
 *  - Hook này chỉ có cho Claude Code; opencode cần cách khác (plugin / chèn workflow).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Role do loop tự enter/leave — hook KHÔNG đụng vào để tránh double nhân vật.
const LOOP_ROLES = new Set(['builder', 'builder-strong', 'reviewer']);

// Phase gán theo role trong hook (các role khác → building).
const HOOK_PHASE = {
  'change-request': 'orchestrating',
  graph: 'orchestrating',
  'spec-validator': 'review',
};

// Role mà hook có thể đã enter (không thuộc loop) — dùng khi SubagentStop
// không kèm subagent_type, phải thử leave theo id đuôi cho từng role.
const HOOK_LEAVE_ROLES = [
  'general-purpose', 'claude-code-guide',
  'change-request', 'spec-validator', 'spec-publisher', 'design', 'graph',
  'dispatcher',
];

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function agentLivePath() {
  const here = path.dirname(fileURLToPath(import.meta.url)); // <repo>/.claude/hooks
  return path.resolve(here, '..', '..', 'tools', 'agent-live.mjs');
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

function shortId(s, n = 6) {
  const str = String(s || '');
  return str.length > n ? str.slice(-n) : str;
}

// Lấy agentId ổn định từ payload. Ưu tiên tool_response (subagent nền trả về
// agent_id/agentId lúc khởi chạy); fallback về tool_use_id cho subagent sync.
function stableAgentId(p, role) {
  const resp = p.tool_response || p.toolResponse || {};
  const aid =
    resp.agent_id || resp.agentId ||
    (p.tool_input && (p.tool_input.agent_id || p.tool_input.agentId)) ||
    p.tool_use_id || p.toolUseId || '';
  return `${role}-${shortId(aid)}`;
}

function isBackgroundAgent(p) {
  const input = p.tool_input || p.toolInput || {};
  if (input.run_in_background === true || input.runInBackground === true) return true;
  const resp = p.tool_response || p.toolResponse || {};
  // subagent async thường trả về agent_id ngay lúc khởi chạy
  return !!(resp.agent_id || resp.agentId);
}

function main() {
  const p = readStdin();
  const event = p.hook_event_name || p.hookEventName || '';

  if (event === 'UserPromptSubmit') {
    const sid = String(p.session_id || p.sessionId || 'chat').slice(0, 8);
    const prompt = String(p.prompt || p.user_prompt || '').replace(/\s+/g, ' ').trim();
    const title = prompt.slice(0, 40) || 'chat';
    callLive(['enter', '--agent', `chat-${sid}`, '--role', 'merger', '--phase', 'building', '--title', title]);
    return;
  }

  if (event === 'Stop') {
    const sid = String(p.session_id || p.sessionId || 'chat').slice(0, 8);
    callLive(['leave', '--agent', `chat-${sid}`]);
    return;
  }

  // Subagent nền/async kết thúc thật sự → leave theo agent_id (B1/B2).
  if (event === 'SubagentStop') {
    const aid = p.agent_id || p.agentId || '';
    if (!aid) return;
    // role không có trong payload SubagentStop → thử mọi role đã map, leave theo id đuôi.
    // agent-live.leave bỏ qua id không tồn tại nên gọi thừa là vô hại.
    const tail = shortId(aid);
    for (const role of HOOK_LEAVE_ROLES) {
      callLive(['leave', '--agent', `${role}-${tail}`]);
    }
    return;
  }

  if (event === 'PreToolUse' || event === 'PostToolUse') {
    const toolName = p.tool_name || p.toolName || '';

    // B2: resume subagent nền bằng SendMessage → enter lại theo đích (agentId).
    if (toolName === 'SendMessage') {
      if (event !== 'PreToolUse') return;
      const input = p.tool_input || p.toolInput || {};
      const to = String(input.to || input.agent_id || input.agentId || '');
      if (!to) return;
      // role resume mặc định general-purpose; chỉ dùng để chọn nhân vật/khu.
      const role = String(input.subagent_type || input.subagentType || 'general-purpose');
      if (LOOP_ROLES.has(role)) return;
      callLive(['enter', '--agent', `${role}-${shortId(to)}`, '--role', role, '--phase', HOOK_PHASE[role] || 'building']);
      return;
    }

    if (toolName !== 'Agent' && toolName !== 'Task') return;
    const input = p.tool_input || p.toolInput || {};
    const role = String(input.subagent_type || input.subagentType || 'general-purpose');
    if (LOOP_ROLES.has(role)) return; // loop tự lo
    const agentId = stableAgentId(p, role);

    if (event === 'PreToolUse') {
      const phase = HOOK_PHASE[role] || 'building';
      const desc = String(input.description || input.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const args = ['enter', '--agent', agentId, '--role', role, '--phase', phase];
      if (desc) args.push('--title', desc);
      callLive(args);
    } else {
      // B1: subagent nền → KHÔNG leave ở đây; đợi SubagentStop.
      if (isBackgroundAgent(p)) return;
      callLive(['leave', '--agent', agentId]);
    }
    return;
  }
}

try {
  main();
} catch {
  /* defensive */
}
process.exit(0);
