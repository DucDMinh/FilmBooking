#!/usr/bin/env node
// Deterministic project profile detector.
// Reads the repo tree (no mutation) and prints suggested values for .context/project-config.md.
// The /brainstorm command consumes this JSON and asks the user to confirm.
//
// Usage: node scripts/detect-profile.mjs
//        node scripts/detect-profile.mjs --md   (human-readable)

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const AS_MD = process.argv.includes("--md");

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["package-lock.json", "npm"],
];

const SOURCE_CANDIDATES = ["src", "app", "apps", "packages", "lib", "server", "client", "web", "api"];
const MONOREPO_DIRS = ["apps", "packages"];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function existsDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listSubdirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function detectPackageManager(pkg) {
  const lockfiles = [];
  let manager = null;
  for (const [file, name] of LOCKFILES) {
    if (existsSync(join(ROOT, file))) {
      lockfiles.push(file);
      if (!manager) manager = name;
    }
  }
  if (!manager && pkg && typeof pkg.packageManager === "string") {
    manager = pkg.packageManager.split("@")[0] || null;
  }
  return { package_manager: manager, lockfiles };
}

function detectSourceRoots() {
  const candidates = SOURCE_CANDIDATES.filter((d) => existsDir(join(ROOT, d)));
  const roots = [];
  for (const dir of candidates) {
    if (MONOREPO_DIRS.includes(dir)) {
      const children = listSubdirs(join(ROOT, dir)).map((c) => `${dir}/${c}`);
      // Monorepo: dùng các package con thay vì scan cả parent (tránh trùng lặp).
      if (children.length) {
        for (const child of children) roots.push(child);
        continue;
      }
    }
    roots.push(dir);
  }
  return roots;
}

function runCommand(pm, script) {
  if (!pm) return null;
  switch (pm) {
    case "pnpm":
      return `pnpm ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "bun":
      return `bun run ${script}`;
    case "npm":
    default:
      return `npm run ${script}`;
  }
}

function detectCommands(pm, pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  const pick = (...names) => names.find((n) => typeof scripts[n] === "string");
  const test = pick("test");
  const lint = pick("lint");
  const typecheck = pick("typecheck", "type-check", "tsc");
  const build = pick("build");
  const install = pm ? `${pm} install` : null;
  return {
    install,
    test: test ? runCommand(pm, test) : null,
    lint: lint ? runCommand(pm, lint) : null,
    typecheck: typecheck ? runCommand(pm, typecheck) : null,
    build: build ? runCommand(pm, build) : null,
  };
}

function detectDb() {
  if (existsSync(join(ROOT, "prisma", "schema.prisma"))) {
    return { db_tool: "prisma", migration_required: true };
  }
  for (const f of ["drizzle.config.ts", "drizzle.config.js", "drizzle.config.mjs"]) {
    if (existsSync(join(ROOT, f))) return { db_tool: "drizzle", migration_required: true };
  }
  return { db_tool: "none", migration_required: false };
}

function main() {
  const pkg = readJson(join(ROOT, "package.json"));
  const { package_manager, lockfiles } = detectPackageManager(pkg);
  const source_roots = detectSourceRoots();
  const scripts = (pkg && pkg.scripts) || {};
  const commands = detectCommands(package_manager, pkg);
  const { db_tool, migration_required } = detectDb();

  const warnings = [];
  if (!pkg) warnings.push("Không tìm thấy package.json — có thể repo không phải Node, hoặc package nằm trong subdir.");
  if (!package_manager) warnings.push("Không detect được package manager (thiếu lockfile + packageManager field).");
  if (Object.keys(scripts).length === 0) warnings.push("package.json không có scripts — verify commands phải khai tay.");

  const result = {
    has_app: Boolean(pkg) || source_roots.length > 0,
    package_manager,
    lockfiles,
    source_roots,
    package_scripts: scripts,
    commands,
    db_tool,
    migration_required,
    warnings,
  };

  if (AS_MD) {
    const line = (k, v) =>
      `- ${k}: ${v === null || v === undefined || v === "" ? "_(không detect được)_" : `\`${v}\``}`;
    const out = [
      "# Detected project profile",
      "",
      line("has_app", result.has_app),
      line("package_manager", package_manager),
      line("lockfiles", lockfiles.join(", ")),
      line("source_roots", source_roots.join(", ")),
      line("test_command", commands.test),
      line("lint_command", commands.lint),
      line("typecheck_command", commands.typecheck),
      line("build_command", commands.build),
      line("install_command", commands.install),
      line("db_tool", db_tool),
      line("migration_required", migration_required),
    ];
    if (warnings.length) {
      out.push("", "## Warnings", ...warnings.map((w) => `- ${w}`));
    }
    console.log(out.join("\n"));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
