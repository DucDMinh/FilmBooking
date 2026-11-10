#!/usr/bin/env node
// Deterministic project inventory generator.
// Reads source roots from .context/project-config.md and writes docs/generated/inventory.md.
// No dependencies. Safe to run repeatedly; output depends only on the repo tree + git HEAD.
//
// Usage: node scripts/generate-inventory.mjs
//        <package_manager> docs:inventory   (khi package.json đã có script này)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative, extname, sep } from "node:path";

const ROOT = process.cwd();
const PROFILE = join(ROOT, ".context", "project-config.md");
const OUT_DIR = join(ROOT, "docs", "generated");
const OUT_FILE = join(OUT_DIR, "inventory.md");

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage",
  ".next", ".turbo", ".cache", "vendor", "target",
]);

function readProfile() {
  if (!existsSync(PROFILE)) return { sourceRoots: ["src"], packageManager: "npm" };
  const text = readFileSync(PROFILE, "utf8");

  const rootsMatch = text.match(/source_roots:\s*\[([^\]]*)\]/);
  const sourceRoots = rootsMatch
    ? rootsMatch[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
    : ["src"];

  const pmMatch = text.match(/package_manager:\s*([a-z]+)/);
  const packageManager = pmMatch ? pmMatch[1] : "npm";

  return { sourceRoots, packageManager };
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
}

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "no-git";
  }
}

function main() {
  const { sourceRoots, packageManager } = readProfile();
  const files = [];
  for (const root of sourceRoots) walk(join(ROOT, root), files);
  files.sort();

  const byExt = new Map();
  for (const f of files) {
    const ext = extname(f) || "(no-ext)";
    byExt.set(ext, (byExt.get(ext) || 0) + 1);
  }

  const byDir = new Map();
  for (const f of files) {
    const dir = relative(ROOT, f).split(sep).slice(0, -1).join("/") || ".";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(relative(ROOT, f));
  }

  const lines = [];
  lines.push("# Generated Inventory");
  lines.push("");
  lines.push("> ⚠️ AUTO-GENERATED — **không sửa tay**. Chạy lại:");
  lines.push(`> \`${packageManager} docs:inventory\` hoặc \`node scripts/generate-inventory.mjs\`.`);
  lines.push("");
  lines.push(`- Git: \`${gitSha()}\``);
  lines.push(`- Source roots: ${sourceRoots.map((r) => `\`${r}\``).join(", ")}`);
  lines.push(`- Total files: ${files.length}`);
  lines.push("");

  lines.push("## By extension");
  lines.push("");
  lines.push("| Ext | Count |");
  lines.push("|-----|-------|");
  for (const [ext, count] of [...byExt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| \`${ext}\` | ${count} |`);
  }
  lines.push("");

  lines.push("## Files");
  lines.push("");
  if (files.length === 0) {
    lines.push("_Chưa có source files. Chạy lại sau khi code._");
  } else {
    for (const [dir, list] of [...byDir.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`### ${dir}`);
      lines.push("");
      for (const f of list) lines.push(`- \`${f}\``);
      lines.push("");
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
  console.log(`Wrote ${relative(ROOT, OUT_FILE)} (${files.length} files)`);
}

main();
