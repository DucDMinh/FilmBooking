#!/usr/bin/env node
// Sync the verify commands in .context/project-config.md into .claude/agent-policy.json → verifyCommands.
// .claude/hooks/agent-guard.mjs lets reviewer/spec-validator run exactly these commands (whole-string match).
// Idempotent; only rewrites the verifyCommands array and keeps the other keys.
//
// Safety: only auto-allows commands that do NOT look destructive and contain no shell metacharacters
// (chaining, redirection, wildcard). The guard also rejects chaining for reviewers.
// Anything unsafe is skipped with a warning so the user can decide manually.
//
// Usage: node scripts/apply-verify-permissions.mjs            (dry-run, default)
//        node scripts/apply-verify-permissions.mjs --write    (actually write)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PROFILE = join(ROOT, ".context", "project-config.md");
const POLICY = join(ROOT, ".claude", "agent-policy.json");
const DRY_RUN = !process.argv.includes("--write");

const COMMAND_FIELDS = [
  "web_typecheck_command",
  "web_lint_command",
  "api_typecheck_command",
  "api_lint_command",
  "lint_command",
  "typecheck_command",
  "test_command",
  "build_command",
  "install_command",
];

// Không auto-allow lệnh có thể mutate DB/git — để user tự quyết.
const BLOCKED = [
  /\bdb\s+push\b/i,
  /\bdrizzle-kit\s+push\b/i,
  /\bdrizzle-kit\s+migrate\b/i,
  /\bmigrate\s+reset\b/i,
  /\bprisma\s+db\s+seed\b/i,
  /\bsupabase\s+db\s+reset\b/i,
  /\bdb:(push|reset|seed)\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+checkout\b/i,
  /\brm\b/i,
  /\bdeploy\b/i,
  /(^|\s)--force(\s|$)/i,
  /(^|\s)-f(\s|$)/,
];

// Shell metacharacters cho phép chaining/injection → không bao giờ auto-allow.
const SHELL_META = /[;&|`$(){}<>*]/;

function parseCommands(text) {
  const commands = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([a-z_]+_command)\s*:\s*(.*)$/);
    if (!m || !COMMAND_FIELDS.includes(m[1])) continue;
    let value = m[2].replace(/\s+#.*$/, "").trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1).trim();
    }
    if (!value || value === "null" || value === "~" || /^<.*>$/.test(value) || /^skip\b/i.test(value)) continue;
    commands.push(value.replace(/\s+/g, " "));
  }
  return [...new Set(commands)];
}

function classify(command) {
  if (command === "*" || command.startsWith("*")) return { ok: false, reason: "quá rộng (wildcard toàn bộ)" };
  if (/["\\\r\n]/.test(command)) return { ok: false, reason: "chứa quote/backslash/newline" };
  if (SHELL_META.test(command)) return { ok: false, reason: "chứa shell metacharacter (chaining/redirect/wildcard)" };
  for (const re of BLOCKED) {
    if (re.test(command)) return { ok: false, reason: `khớp pattern phá hoại (${re})` };
  }
  return { ok: true, pattern: command };
}

function main() {
  if (!existsSync(PROFILE)) {
    console.error(`Không tìm thấy ${PROFILE}`);
    process.exitCode = 1;
    return;
  }

  const patterns = [];
  const skipped = [];
  for (const command of parseCommands(readFileSync(PROFILE, "utf8"))) {
    const verdict = classify(command);
    if (verdict.ok) patterns.push(verdict.pattern);
    else skipped.push({ command, reason: verdict.reason });
  }

  let policy = {};
  if (existsSync(POLICY)) {
    try {
      policy = JSON.parse(readFileSync(POLICY, "utf8")) || {};
    } catch (e) {
      console.error(`.claude/agent-policy.json không parse được: ${e.message} — không ghi.`);
      process.exitCode = 1;
      return;
    }
  }
  const changed = JSON.stringify(policy.verifyCommands || []) !== JSON.stringify(patterns);
  policy.verifyCommands = patterns;

  if (!changed) console.log("- .claude/agent-policy.json: unchanged.");
  else if (DRY_RUN) console.log(`- .claude/agent-policy.json: would-update (${patterns.length} lệnh).`);
  else {
    writeFileSync(POLICY, JSON.stringify(policy, null, 2) + "\n", "utf8");
    console.log(`- .claude/agent-policy.json: updated (${patterns.length} lệnh).`);
  }

  if (patterns.length) console.log("\nverifyCommands: " + patterns.map((p) => "`" + p + "`").join(", "));
  else console.log("Không có verify command nào đủ an toàn để auto-allow.");
  if (skipped.length) {
    console.log("\nBỏ qua (cần user tự quyết):");
    for (const s of skipped) console.log("- `" + s.command + "` — " + s.reason);
  }
  if (DRY_RUN) console.log("\n(dry-run mặc định — thêm `--write` để ghi file)");
}

main();
