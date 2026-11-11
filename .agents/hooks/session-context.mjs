#!/usr/bin/env node
/**
 * session-context.mjs — SessionStart hook for Antigravity (agy).
 *
 * Injects session context and run journal reminders at startup / resume.
 * If .context/progress.json has activeWorkItem → reminds agent to execute
 * the Session Start Protocol (read Run Journal, reconcile with git).
 */

import fs from 'node:fs';
import path from 'node:path';

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function projectDir(payload) {
  if (payload?.workspacePaths && payload.workspacePaths.length > 0) {
    return path.resolve(payload.workspacePaths[0]);
  }
  if (process.env.ANTIGRAVITY_PROJECT_DIR) {
    return path.resolve(process.env.ANTIGRAVITY_PROJECT_DIR);
  }
  const cwd = process.cwd();
  if (cwd.endsWith('.agents') || cwd.endsWith('.claude')) {
    return path.resolve(cwd, '..');
  }
  return path.resolve(cwd);
}

function main() {
  const p = readStdin();
  const root = projectDir(p);

  let progress = null;
  try {
    progress = JSON.parse(fs.readFileSync(path.join(root, '.context', 'progress.json'), 'utf8'));
  } catch {
    /* not yet initialized */
  }

  const active = progress && progress.activeWorkItem;
  const lines = [];

  if (active) {
    const id = typeof active === 'string' ? active : JSON.stringify(active);
    const runsDir = path.join(root, '.context', 'runs');
    let journals = [];
    try {
      journals = fs.readdirSync(runsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
    } catch {
      /* none */
    }

    lines.push(`Đang có work item dở: ${id} — chạy Session Start Protocol (AGENTS.md § Session Handoff) hoặc /resume trước khi nhận việc mới.`);
    if (journals.length) {
      lines.push(`Journal hiện có: ${journals.slice(-5).map((j) => '`.context/runs/' + j + '`').join(', ')}`);
    }
  }

  if (lines.length) {
    const out = {
      injectSteps: [
        {
          systemMessage: {
            systemMessage: lines.join('\n'),
          },
        },
      ],
    };
    process.stdout.write(JSON.stringify(out));
  } else {
    process.stdout.write(JSON.stringify({}));
  }
}

try {
  main();
} catch {
  process.stdout.write(JSON.stringify({}));
}
process.exit(0);
