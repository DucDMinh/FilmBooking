# 🚀 AI-Powered Project Template (Web) — Claude Code edition

> A multi-agent template for **Claude Code**, for **working on repos that already have code** (bug/feature/update).
> Ported from [ocanhdt12-gif/opencode-project-template](https://github.com/ocanhdt12-gif/opencode-project-template) (opencode). See **[Claude Code port notes](#claude-code-port-notes)** for what changed.

> 📌 **Workflow:** `/spec-init` (read code → build spec, run once) → **loop** executes tasks → **`/change`** for all subsequent changes (the `change-request` process, run by the main session).
> Initial setup: `/brainstorm`.
>
> ⭐ **Once a spec exists, EVERY change (new feature + bug fix) goes through ONE process: `.agent/change-request.md`.**
> Entry points: **`/change`** (reads all `spec/changes/*.md`) · `/bug` · `/feature`.

> ⚠️ The upstream repo ships no LICENSE file (its README only shows an MIT badge). Confirm the license with the author before commercial use.

---

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [🔒 Security Integration](#-security-integration)
- [📊 Monitoring Integration](#-monitoring-integration)
- [⚙️ Workflow Skills Integration](#️-workflow-skills-integration)
- [Workflow Router (maintenance)](#workflow-router-maintenance)
- [How It Works](#how-it-works)
- [Agent Roles](#agent-roles)
- [docs/ Folder](#docs-folder)
- [Smoke Test Without App Code](#smoke-test-without-app-code)
- [Agent Models](#agent-models)
- [Git & CI/CD](#git--cicd)
- [Change Requests](#change-requests)
- [License](#license)

---

## Getting Started

### New project

Requirements: **Claude Code**, **Node.js 22+**, **git**. On Windows, Git Bash (Claude Code already uses it for Bash).

```bash
# 1. Copy the template into your project folder (no template git history)
cp -r claude-project-template my-app && cd my-app && git init
#    existing repo: copy AGENTS.md, CLAUDE.md, .agent/, .claude/, .context/, spec/, tasks/, scripts/, skills/, tools/
#    (merge docs/, README.md, .gitignore by hand — do not overwrite yours)

# 2. Open Claude Code
claude

# 3. Configure the project (branch, package manager, verify commands, per-role models)
/brainstorm

# 4. Start the project
/start          # new project
# or /spec-init # existing code without a spec, then /change for every change
```

`tools/vibe-studio/` (~95 MB, pixel-art dashboard for `/dashboard`) is optional — delete it if you don't need it.

`/start` runs the whole init chain and stops only at checkpoints:

```
read spec → brainstorm → design → graph → loop (build)
```

Type `/start` **once** — the chain advances on its own. Reply **"ok"** at each checkpoint to continue.
Once the build is done, use **`/change`** for every change (new feature or bug fix).

> ℹ️ Claude Code reloads `.claude/agents/` and `.claude/commands/` automatically. If an edit to `.claude/settings.json` doesn't take effect, start a new Claude Code session.

### Commands

| Command | When to use |
|---|---|
| `/start` 🚀 | Start a project (once) — runs read spec → brainstorm → design → graph → loop |
| `/change` ⭐ | Change something after the build (feature + bug) |
| `/bug-check <area>` | Sweep an area read-only and list defects |
| `/resume <type>/<slug>` | Continue an unfinished session |

> Smoke test for the empty template → `docs/smoke-tests/MAINTENANCE_TEMPLATE_SMOKE.md`.

### Resuming a session

```
Read AGENTS.md and resume the project
# or:  /resume feature/<slug>   /resume bug/<slug>
```

The agent reads `.context/progress.json` + the Run Journal `.context/runs/<type>-<slug>-<phaseTask>.md` and continues from the last checkpoint.

### Syncing template updates into an existing project

A project is a copy of this template. When the template changes (new rules, agents, commands, skills), sync the **template-owned files** into your project with one command — **without touching your code, spec, docs, or config**:

```bash
# from inside the project; the source is required (a local folder or a git URL of YOUR copy of this port)
node scripts/template-sync.mjs --template E:/claude-project-template
node scripts/template-sync.mjs --template git@github.com:<you>/<your-template>.git
# ─ or ─ save it once in .template-sync.json:  { "templateRepo": "E:/claude-project-template" }
```

- Overwrites only: `AGENTS.md` · `CLAUDE.md` · `.agent/` · `.claude/agents/` · `.claude/commands/` · `.claude/hooks/` · `scripts/` · `skills/` · `tools/agent-live.mjs` · `tools/progress-write.mjs`
- **Never touches**: your code, `SPECIFICATIONS.md`, `BRIEF.md`, `docs/`, `spec/`, `tasks/`, `.context/`, `.devops/`, `.env*`, `README.md`, `.claude/settings.json` + `.claude/agent-policy.json` (only reported if drifted)
- Safe: it **stops** if a managed path has uncommitted changes in your project; every change lands in git (`git diff` / `git restore <path>` to undo — run it yourself, the agent guard blocks it)
- Refuses the opencode upstream as source (it would overwrite this port). Pure Node — no rsync needed, works on Windows.
- Preview first: `--dry-run` · Remove files dropped upstream: `--prune` · Source branch: `--branch <name>`

## Overview

This template provides a **multi-agent workflow** for **repos that already have code** (bug / feature / update). Start with `/spec-init` (read code → spec) → loop executes independent tasks **in parallel** (worktree-per-task, then the dispatcher merges) → `/change` for all subsequent changes (the `change-request` agent). `AGENTS.md` routes every request; specialized subagents handle build, independent review, spec validation, and close-out.

**Key features:**
- 🧭 **Intent router** — `AGENTS.md` classifies every request (bug / sweep / feature / review / research) before any code is touched
- 🔒 **Bug discipline** — root cause before fix (Iron Law), repro verification, no fix-by-symptom
- 🧩 **Change Request workflow** — classify ADDITIVE/MODIFY/REMOVE → spec delta → phase/task → build/review/validate
- 🤖 **Claude Code native** — roles are real subagents in `.claude/agents/`, entry points are slash commands in `.claude/commands/`
- 🔍 **Independent review** — reviewer / spec-validator run as separate read-only subagents (no Edit tool; `agent-guard.mjs` limits Write/Bash) on a different model tier to reduce bias
- 💾 **Session handoff** — Run Journal in `.context/runs/` + `/resume`, so a new session continues from the last safe step
- 🧠 **Error memory** — agents learn from mistakes, avoid repeating them
- 🚀 **CI/CD & deploy** — templates in `.devops/` (git setup, pipeline, staging → production)
- 📚 **Doc-aware input** — drop existing BRD/Design/API Spec/ERD into `docs/`; agents classify and only ask about gaps

---

## Architecture

| Part | File | Role |
|------|------|------|
| **Router** | `AGENTS.md` | Classify intent → `/spec-init` · `/change` · `/bug-check` · `/bug` · `/feature` · review · research |
| **Workflow** | `.agent/FEATURE_WORKFLOW.md` | Bug fix-loop, Change Request flow, Phase model 1–5, gates, commit-first |
| **Loop engine** | `.agent/loop.md` | Execute tasks in **parallel** (ReAct per task) — independent tasks in a layer/phase each run in their own **git worktree**, then the **dispatcher** integrates them (`merge` + `cleanup`, no subagent) |
| **Parallel dispatch** | `scripts/parallel-dispatch.mjs` | `plan` (split into parallel waves by file independence) / `setup` (worktree+branch per task) / `merge` (integrate into layer/phase branch) / `cleanup` / `status` |
| **Change agent** | `.agent/change-request.md` | The ONLY agent for all changes (feature + bug) once a spec exists |
| **State** | `.context/progress.json` + `.context/runs/` | Work-item status + Run Journal for cross-session resume |

---

## Project Structure

```
project-template/
├── AGENTS.md                     ← ✅ Entry point (router) — always loaded
├── SPECIFICATIONS.md             ← Canonical spec (built by /spec-init from code)
├── CLAUDE.md                     ← Imports AGENTS.md + Claude Code adapter notes
├── .env.local                    ← Git/deploy secrets (gitignored)
├── .env.local.example            ← Template for .env.local
│
├── .claude/
│   ├── settings.json             ← Deny rules + hooks (guard, session context, dashboard)
│   ├── agent-policy.json         ← Extra verify commands reviewer/spec-validator may run
│   ├── hooks/
│   │   ├── agent-guard.mjs       ← PreToolUse gate: no force/main push, no reset --hard, read-only reviewers, builder-strong = ask
│   │   ├── session-context.mjs   ← SessionStart: re-read Run Journal after compact / resume
│   │   └── live-studio.mjs       ← Dashboard presence (optional)
│   ├── agents/
│   │   ├── builder.md            ← Default code+test (main coding model)
│   │   ├── builder-strong.md     ← Hard task (opt-in only; gated)
│   │   ├── design.md             ← Design Agent: design tokens + screen specs
│   │   ├── graph.md              ← Split spec/design into layers + tasks
│   │   ├── spec-init.md          ← reverse-engineer spec for an EXISTING project
│   │   ├── spec-publisher.md     ← auto-publish spec + test-scope for the test template
│   │   ├── reviewer.md           ← Independent review (read-only + report)
│   │   └── spec-validator.md     ← Spec/phase cross-check (read-only + report)
│   └── commands/
│   │   ├── start.md              ← /start → continuous init chain (spec → brainstorm → design → graph → loop)
│   │   ├── brainstorm.md         ← /brainstorm → clarify requirements + project config
│   │   ├── design.md             ← /design → design tokens + screen specs
│   │   ├── graph.md              ← /graph → split into layers/tasks + layer-plan diagram
│   │   ├── change.md             ← /change → post-build change request (reads spec/changes/ → change-request process)
│   │   ├── bug-check.md          ← /bug-check → read-only sweep, list defects
│   │   ├── bug.md                ← /bug  → fix ONE known bug (→ change-request process)
│   │   ├── feature.md            ← /feature → Change Request workflow (→ change-request process)
│   │   ├── spec-init.md          ← /spec-init → reverse-engineer spec for an EXISTING project (no spec yet)
│   │   ├── spec-publish.md       ← /spec-publish → publish spec for the test template (usually automatic)
│       └── resume.md             ← /resume → continue from Run Journal (cross-session)
│
├── docs/                         ← Drop your project docs here (optional)
│   ├── INDEX.md                  ← Canonical vs historical classification
│   ├── BRD.md                    ← Business requirements (template)
│   ├── DESIGN.md                 ← Design spec / Figma notes (template)
│   ├── API_SPEC.md               ← API overview + pointer (no hand-embedded code)
│   ├── ERD.md                    ← Schema overview + pointer
│   ├── PERMISSION.md             ← Roles + guard order (synced from code)
│   ├── diagrams/                 ← archify diagrams (illustrative, verify vs code)
│   ├── smoke-tests/              ← MAINTENANCE_TEMPLATE_SMOKE.md (template, no app code)
│   └── generated/                ← AUTO-GENERATED inventory (do not edit)
│       └── inventory.md
│
├── scripts/
│   ├── generate-inventory.mjs         ← Deterministic inventory generator
│   ├── detect-profile.mjs             ← Detect stack → suggest project-config (used by /brainstorm)
│   ├── apply-verify-permissions.mjs   ← Sync verify commands into .claude/agent-policy.json (reviewer allowlist)
│   └── template-sync.mjs              ← One-command sync of template-owned files into a project (see Getting Started → Syncing)
│
├── .agent/
│   ├── FEATURE_WORKFLOW.md       ← ✅ Workflow entry (bug/feature/update) — minimal; details in workflows/
│   ├── workflows/                ← Detailed per-workflow files (loaded on demand, not every turn)
│   │   ├── bug.md                ← §2 Bug workflow + §2b bug discovery sweep
│   │   ├── change.md             ← §3 Change Request workflow (feature / update)
│   │   └── state-commit.md       ← §2.8 commit-first + §5 state/paths + §7 model mapping
│   ├── brainstorm.md             ← ✅ Read spec/code → clarify requirements + set config → .context/project-config.md
│   ├── design.md                 ← Design Agent: design tokens + screen specs (before layer split)
│   ├── graph.md                  ← Split spec/design → layers + tasks (dependency order)
│   ├── loop.md                   ← Execute tasks in parallel (ReAct, worktree-per-task, dispatcher merges)
│   ├── devops.md                 ← Git init, CI/CD, deploy (layer 0 + after each layer + final)
│   ├── rollback.md               ← Git checkpoint + revert strategy
│   ├── blackboard.md             ← Shared state (.context/progress.json is the source of truth)
│   ├── context-manager.md        ← Compress context when it grows too large
│   ├── references/               ← taste-skill-v2.md (anti-slop design reference)
│   ├── spec-validator.md         ← Validate spec vs code/docs
│   ├── spec-init.md              ← /spec-init: reverse-engineer spec for an EXISTING project
│   ├── spec-publish.md           ← /spec-publish: publish spec + test-scope for the test template
│   ├── reviewer.md               ← Independent code review
│   ├── error-analyzer.md         ← Root cause analysis + error memory
│   └── change-request.md        ← ⭐ the ONLY agent for all changes (feature + bug) — reads spec/changes/
│
├── skills/
│   ├── react-nodejs/
│   │   ├── conventions.md        ← Coding style, folder structure
│   │   ├── stack.md              ← Libraries, tools, versions
│   │   ├── patterns.md           ← API, auth, DB, testing patterns
│   │   ├── common-errors.md     ← Known issues + fixes
│   │   └── design-tokens.md     ← Design tokens (generated by Design Agent)
│   ├── security/                 ← 🔒 Security skills (mandatory)
│   │   ├── semgrep-scan.md          ← Static analysis security scan
│   │   ├── api-owasp.md             ← OWASP API Top 10 checklist
│   │   ├── jwt-security.md          ← JWT algorithm/signature hardening
│   │   ├── bola-idor.md             ← Broken Object Level Authorization
│   │   ├── sharp-edges.md           ← Secure defaults & footgun config
│   │   ├── supply-chain-audit.md    ← dependency audit + dependency risk
│   │   └── codex-security.md        ← OpenAI Codex Security CLI scan/fix (AI-driven, curated)
│   ├── monitoring/               ← 📊 Monitoring skills (mandatory)
│       ├── otel-instrumentation.md  ← OTel traces/metrics/logs (backend)
│       ├── otel-browser.md          ← Browser RUM (Web Vitals, JS errors)
│       ├── otel-collector.md        ← Collector config (receivers/exporters)
│       ├── otel-semantic-conventions.md ← OTel naming compliance
│       └── production-monitoring.md ← Health check, uptime, structured logging
│   ├── responsive-web/          ← 📱 Responsive design checklist (375/768/1280)
│   ├── archify/                 ← 🗺️ Architecture/workflow/sequence/dataflow diagrams → self-contained HTML (tt-a1i/archify, curated)
│   ├── frontend-checklist/       ← ✅ Frontend quality gate: HTML/a11y/SEO/perf/images/security/privacy (curated from thedaviddias/Front-End-Checklist)
│   ├── superpowers/             ← 🧠 Debug Iron Law + TDD (obra/superpowers)
│   ├── brainstorming/           ← 💬 Clarify requirements → propose approaches → design doc before coding (the "clarify" half of /brainstorm)
│   ├── ponytail/                ← 🪶 Lazy senior dev ladder (DietrichGebert)
│   ├── impeccable/              ← 🎨 UI craft-floor + polish (pbakaus)
│   ├── ui-ux-pro-max/           ← 🧩 Design intelligence (nextlevelbuilder)
│   ├── scalability-architecture/ ← 📦 OPTIONAL scalability tiers — only when user enables the option
│   ├── karpathy-guidelines/      ← ✂️ Surgical changes + think before coding (andrej-karpathy-skills)
│   ├── aislop/                   ← 🧹 AI-slop detection gate (scanaislop/aislop, curated) — reviewer runs aislop scan, score ≥ 80
│   ├── anti-slop/                ← 🧬 Oxlint rules against low-evidence TS/JS (dmmulroy/anti-slop, curated)
│   ├── open-code-review/         ← 🔍 Alibaba OCR gate (alibaba/open-code-review, curated) — CRITICAL → FAIL
│   ├── ai-readable-codebase/     ← 🧠 Code for 2 readers (human + AI) — clear names, low indirection, README+ARCHITECTURE required
│   ├── ai-friendly-web/          ← 🌐 AI-ready web: llms.txt, robots for AI crawlers, sitemap, JSON-LD, OpenAPI
│   ├── m3e-canvas/               ← 🖼️ Sketch M3 UI in browser → vibe prompt (lnkiai/m3e-canvas, curated)
│   └── blitzstrike/              ← ⚡ MCP pentest toolbelt (shinthink/blitzstrike, curated) — optional security
│
├── tasks/                        ← Maintenance task board
│   ├── README.md                 ← Task file format + rules
│   ├── feature-<slug>/phase-<N>-task-<NN>.md
│   └── bug-<slug>/               ← scan.md (/bug-check) + phase-<N>-task-<NN>.md
│
├── .context/
│   ├── progress.json             ← Current work-item status (features[] / bugs[])
│   ├── runs/                     ← Run Journal per task (cross-session resume)
│   │   └── _TEMPLATE.md
│   ├── project-config.md         ← ✅ Project config (branch, pm, checks, DB, models) — written by /brainstorm
│   ├── decisions.md              ← Architecture decisions log
│   ├── spec-notes.md             ← Spec build notes (/spec-init)
│   ├── error-memory.md           ← Errors encountered + fixes
│   └── review-reports/           ← Reviewer / spec-validator reports
│
└── .devops/
    ├── templates/
    │   ├── vercel.md
    │   ├── railway.md
    │   ├── docker-vps.md
    │   └── generic.md
    ├── environments.md
    └── deploy-log.md
```

---

## 🔒 Security Integration

The template ships with built-in security rules (read and applied mandatorily by multiple agents) to ensure the generated code meets security standards.

### Skills (`skills/security/`)

| Skill | Purpose |
|-------|---------|
| `semgrep-scan.md` | Static analysis security scan before commit |
| `api-owasp.md` | OWASP API Top 10 checklist for every endpoint |
| `jwt-security.md` | JWT hardening (alg pinning, no `none`, strong secret) |
| `bola-idor.md` | Object-level authorization (every `/:id` verifies ownership) |
| `sharp-edges.md` | Secure defaults & footgun config/secret |
| `supply-chain-audit.md` | Configured package-manager audit + dependency takeover risk |
| `codex-security.md` | OpenAI Codex Security CLI — AI-driven scan/fix (curated, optional) |

### 3 Mandatory Checkpoints

1. **When coding** (`loop.md`) → read the security skill before writing any file that handles input/auth/DB
2. **When reviewing** (`reviewer.md`) → run semgrep + configured dependency audit + OWASP checklist before PASS
3. **When pushing** (`devops.md` / CI) → configured dependency audit + semgrep scan in CI

> 🔴 ERROR-severity security finding or high/critical CVE → **DO NOT PASS / do not merge**.

---

## 📊 Monitoring Integration

The template ships with built-in production monitoring (uptime + runtime observability) based on **OpenTelemetry** — vendor-neutral, works for both web and mobile.

### Skills (`skills/monitoring/`)

| Skill | Purpose |
|-------|---------|
| `otel-instrumentation.md` | OTel traces/metrics/logs for Node.js/Next.js backend |
| `otel-browser.md` | Browser RUM (Web Vitals, JS errors, route tracing) |
| `otel-collector.md` | Collector config (receivers/processors/exporters) |
| `otel-semantic-conventions.md` | OTel naming compliance (span/attribute) |
| `production-monitoring.md` | Health check, uptime, structured logging, dashboard |

### Keys setup (Phase 0.5)

Monitor keys/tokens (OTLP endpoint, service name, uptime) are stored in `.env.local` during `/brainstorm` (along with git setup).

### 3 Mandatory Checkpoints

1. **When coding** (`loop.md`) → read the monitoring skill before writing API/performance/logging files
2. **When reviewing** (`reviewer.md`) → check health endpoint, structured logging, OTel naming before PASS
3. **When pushing** (`devops.md` / CI) → verify the health endpoint exists in CI

---

## ⚙️ Workflow Skills Integration

The template ships with curated workflow skills (curated from well-known open-source repos — picking the essence, not copying verbatim) to raise code + UI quality throughout the pipeline.

### Skills (`skills/`)

| Skill | Source | When used / Purpose |
|-------|-------|---------------------|
| `superpowers/` | obra/superpowers (270k⭐) | Every coding task — **Iron Law debug** (no fix without root cause) + **TDD test-first** |
| `brainstorming/` | curated (in-house) | **Before coding** a feature/big change — clarify requirements one question at a time, propose 2-3 approaches + trade-offs, present the design, write `docs/specs/*-design.md`, get user approval before implementing (HARD-GATE). The "clarify" half of `/brainstorm` |
| `archify/` | tt-a1i/archify (curated, MIT) | **Diagrams** — architecture/workflow/sequence/dataflow/lifecycle → self-contained HTML (dark/light, export PNG/SVG). Hooked into brainstorm (architecture gap), design (diagrams in design-spec), graph (layer-plan diagram at human checkpoint), reviewer (verify diagrams match real code) |
| `frontend-checklist/` | thedaviddias/Front-End-Checklist (curated) | Reviewer reviews **UI/public-facing** tasks — HTML semantics, accessibility/WCAG, SEO (title/canonical/OG/structured data/sitemap), Core Web Vitals (LCP/CLS/INP), images, frontend security (CSP/SRI/cookies), privacy. Curated: only critical + high priority rules
| `impeccable/` | pbakaus/impeccable (58k⭐) | Reviewer reviews **UI** tasks — craft-floor (contrast, depth, type, states, browser surfaces) + refuse-list AI slop |
| `ui-ux-pro-max/` | nextlevelbuilder/ui-ux-pro-max (115k⭐) | Design Agent — design intelligence by product type (10 priority categories: a11y, touch, performance, style, layout…) |
| `ponytail/` | DietrichGebert/ponytail (100k⭐) | Loop while implementing — **lazy senior dev ladder**, stop at the simplest solution, avoid over-engineering |
| `scalability-architecture/` | curated (in-house) | **OPTIONAL** — scalability tiers (Standard/High-Traffic/Enterprise). Only when the user enables the Scalability Option at `/brainstorm`. Avoids over-engineering: do not apply microservices/sharding/K8s when not needed |
| `karpathy-guidelines/` | andrej-karpathy-skills (curated) | Loop when editing old code — **surgical changes** (touch only what's needed, no drive-by refactor) + Reviewer when reviewing diffs — **assumption check** (state assumptions, don't silently choose). Complements ponytail (simplicity) + superpowers (goal-driven) |
| `aislop/` | scanaislop/aislop (curated, MIT) | Reviewer reviews **code changes** — deterministic AI-slop scan (narrative comments, swallowed errors, hidden fallbacks, `as any`, duplication, dead code, todo stubs), score 0-100 ≥80 gate, `fix --safe` mechanical, offline no API key |
| `anti-slop/` | dmmulroy/anti-slop (curated, MIT) | Builder/Reviewer with TS/JS — **Oxlint rules** block low-evidence patterns (no-reduce-accumulator-copy, no-object-parameters, no-unsafe-dictionary-type, type assertion needs a safety comment). Blocks at the lint layer; complements aislop (content smell) + OCR (real bugs) |
| `open-code-review/` | alibaba/open-code-review (curated, Apache-2.0) | Reviewer reviews **code changes** — hybrid deterministic + LLM, precise line-level comments, built-in ruleset (NPE/thread-safety/XSS/SQLi). Delegation mode needs no API key. CRITICAL → FAIL |
| `ai-readable-codebase/` | curated (in-house) | Builder/Reviewer — code for 2 readers (human + AI): self-descriptive names, low indirection, 1 file 1 responsibility, README + ARCHITECTURE required. Reviewer checks AI-chaos indicators (≥3 → FAIL) |
| `ai-friendly-web/` | curated (in-house) | Reviewer/DevOps for public web tasks — AI-ready web: `llms.txt`, `robots.txt` for AI crawlers, `sitemap.xml`, JSON-LD, OpenAPI. Missing → MAJOR → FAIL |
| `m3e-canvas/` | lnkiai/m3e-canvas (curated, MIT) | Design Phase 3 (optional) — sketch M3 UI in the browser → vibe prompt, save to `.context/design-spec.md`. Complements ui-ux-pro-max |
| `blitzstrike/` | shinthink/blitzstrike (curated, MIT) | Reviewer for sensitive STRICT tasks (optional) — MCP pentest (BLITZ → EAGLE-EYE → STRIKE). Only STRIKE-validated findings block; not installed → skip |
| `security/codex-security.md` | openai/codex-security (curated, npm `@openai/codex-security`) | Reviewer for sensitive tasks (optional) — AI-driven scan/fix; **CRITICAL verified** → FAIL, ≥3 MAJOR → FAIL; not logged in / no network → mark `N/A`, do not block PASS |

### Mandatory Checkpoints

1. **When debugging** (`error-analyzer.md`) → Iron Law: **NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST**. Read `superpowers/systematic-debugging.md` before proposing a fix. ≥3 failed fixes = suspect the architecture, don't try fix #4
2. **When implementing** (`loop.md`) → TDD test-first (`superpowers/test-driven-development.md`) + ponytail ladder; test fails → write minimal code to pass
3. **When reviewing UI** (`reviewer.md`) → run craft-floor (`impeccable/SKILL.md`): contrast ≥4.5:1, refuse identical card grids / hero-metric / eyebrow / gradient text / emoji icons + **Frontend Checklist Gate** (`frontend-checklist/SKILL.md`): HTML semantics, a11y, SEO, Core Web Vitals, images, frontend security, privacy — CRITICAL items FAIL → task FAIL
4. **When designing** (`design.md`) → generate a design system by product type (`ui-ux-pro-max/SKILL.md`), cross-check against taste-skill v2 anti-slop (prefer taste-skill on conflict); for public pages also declare SEO metadata + image strategy (`frontend-checklist/SKILL.md`)
5. **When reviewing UI** (`reviewer.md`) → run responsive checklist gate (`responsive-web/SKILL.md`) at 375/768/1280px
6. **When coding TS/JS** (`loop.md` / `builder`) → `anti-slop/SKILL.md`: Oxlint rules block low-evidence patterns; reviewer runs `npx oxlint` alongside `aislop scan`
7. **When reviewing code** (`reviewer.md`) → `open-code-review/SKILL.md` (optional): `ocr` CRITICAL finding → FAIL; `ai-readable-codebase/SKILL.md`: AI-chaos indicators ≥3 → FAIL
8. **When reviewing public web** (`reviewer.md` / DevOps) → `ai-friendly-web/SKILL.md`: missing `llms.txt`/`robots.txt`/`sitemap.xml` → MAJOR → FAIL
9. **When designing a screen** (Phase 3, optional) → `m3e-canvas/SKILL.md` sketch → prompt into `.context/design-spec.md`
10. **When reviewing a sensitive STRICT task** (optional) → `blitzstrike/SKILL.md`: only STRIKE-validated findings block; not installed → skip

---

## How It Works

> 📌 **Start a project:** type **once** `/start` — the chain **runs continuously, auto-advances between steps**: read spec (`/spec-init` if missing) → brainstorm (clarify requirements + design doc + config) → design (design spec + tokens) → graph (split into layers/tasks) → **loop**. It only **STOPS at checkpoints** for approval; **you never re-type a command for each step**.
> Once the build is done → `/change` for all changes. `/brainstorm`, `/design`, `/graph` are **manual overrides** (run them by hand when you want to re-run one step).

### Pipeline

```
🚀 /start  (type once — the chain runs continuously, auto-advances, stops only at ⏸ checkpoints)
├─ 1. Read spec    → use it if it exists; otherwise /spec-init; then spec-validator      ⏸ (validator must PASS)
├─ 2. Brainstorm   → design doc docs/specs/ + config .context/project-config.md          ⏸ approve design
├─ 3. Design       → design tokens + screen specs .context/design-spec.md                ⏸ confirm tokens
└─ 4. Graph        → tasks/<slug>/layer-N-task-NN.md + layer-plan diagram                ⏸ approve plan
    │
    ▼  (auto-continues after you reply "ok")
Loop Agent — execute tasks in PARALLEL (ReAct per task, worktree-per-task)
├─ Dispatcher  plan --layer N → split into parallel waves (by file independence)
├─ per task (SPAWNED IN PARALLEL, each in its own git worktree):
│    ├─ 5a Builder   code + test (TDD)
│    ├─ 5b Observe   test / lint / typecheck / build
│    ├─ 5c Error Analyzer → fix → retry (max 3)
│    ├─ 5d Reviewer  independent review (different model)
│    └─ commit inside worktree
└─ 5e Merge     dispatcher merges all task branches → verify whole layer → write progress.json once → cleanup
    │
    ▼
⏸ Human Checkpoint → next layer (Layer N+1 only unlocks when Layer N PASSes + you approve)
   (DevOps agent: git init/CI-CD at layer 0, CI checks after each layer, deploy at the final layer)

────────── Afterwards: all changes ──────────
spec/changes/<file>.md → /change → agent change-request
├─ classify: BUG / ADDITIVE / MODIFY / REMOVE
├─ spec delta + ★ Spec Publisher (spec/updates/ + spec/test-scope/current.json)
├─ loop(builder/reviewer) → spec-validator
└─ progress + commit-first → change file archive
```

### Step-by-step — which agent handles which step

> Subagent = `.claude/agents/*.md` (invoked via the Agent tool, `subagent_type: "<name>"`). Prompt-level = `.agent/*.md` (read and executed in the main session).

| Step | What | Subagent | Prompt-level | Skill | Output | Gate |
|---|---|---|---|---|---|---|
| **0** | Session start / resume | — | `AGENTS.md`, `.agent/blackboard.md` | — | reads `progress.json` (`activeWorkItem`); if in-progress → `/resume` | — |
| **1a** | Build spec from code (if none) | **`spec-init`** | `.agent/spec-init.md` | — | `SPECIFICATIONS.md` + `spec/` + `spec/test-scope/current.json` | read-only, once |
| **1b** | Validate spec vs code/docs | **`spec-validator`** | `.agent/spec-validator.md` | — | report `.context/review-reports/spec-validation.md` | PASS → step 2 · FAIL → clarify, re-validate (max 2 rounds) |
| **2** | Clarify requirements + set config | — | `.agent/brainstorm.md` | `brainstorming` | design doc `docs/specs/*.md` + `.context/project-config.md` (+ secrets → `.env.local`) | ⏸ **approve design** — HARD-GATE: no code before approval |
| **3** | Design tokens + screen specs (if UI) | **`design`** | `.agent/design.md` | `impeccable`, `taste-skill-v2`, `ui-ux-pro-max` | `skills/react-nodejs/design-tokens.md` + `.context/design-spec.md` (+ archify diagram) | ⏸ **confirm tokens** |
| **4** | Split into layers + tasks (dependency order) | **`graph`** | `.agent/graph.md` | `archify` | `tasks/<slug>/layer-{N}-task-{NN}.md` + `docs/diagrams/layer-plan.html` + `progress.json` | ⏸ **approve plan** |
| **5a** | Implement independent tasks (+ tests, TDD) **IN PARALLEL** — each task in its own **git worktree**, each `builder` runs the full loop | **`builder`** ×N (hard: `builder-strong`, opt-in) | `.agent/loop.md` (Parallel Execution Model) + `scripts/parallel-dispatch.mjs` | `superpowers`, `ponytail`, `karpathy-guidelines`, `security`, `monitoring` | code + tests (committed in worktree) | — |
| **5b** | Observe: test / lint / typecheck / build | — | `.agent/loop.md` | — | verify results (commands from `project-config`) | FAIL → 5c |
| **5c** | Root cause + fix | (`error-analyzer`) | `.agent/error-analyzer.md` | `superpowers/systematic-debugging` | `.context/error-memory.md` | retry max 3 → `BLOCKED` |
| **5d** | Independent review | **`reviewer`** | `.agent/reviewer.md` | `aislop`, `anti-slop`, `open-code-review`, `impeccable`, `frontend-checklist` | `.context/review-reports/<feature\|bug>-<slug>-phase-<N>-task-<NN>-round-<R>-review.md` | PASS → 5e · FAIL → back to 5a (max 2 rounds) |
| **5e** | Close-out task | — | `.agent/loop.md`, `.agent/FEATURE_WORKFLOW.md` §6 + `.agent/workflows/state-commit.md` §2.8/§5 | — | Doc Impact/Reconcile → `progress.json` → **commit** (1 task = 1 commit) | — |
| **5f** | Compact context | — | `.agent/context-manager.md` | — | `.context/compressed-summary.md` | every 3 tasks + end of layer |
| **5g** | End of layer → phase review | **`spec-validator`** | `.agent/spec-validator.md` | — | phase report | ⏸ **checkpoint after each layer** — Layer N+1 unlocks only when Layer N PASSes + you approve |
| **6** | Git init / CI-CD / deploy | — | `.agent/devops.md` (+ `.devops/templates/*`) | `ai-friendly-web` | git repo, `.github/workflows/*` (generated **before** push), deploy staging→prod | ⏸ **approve production deploy** |
| **7** | Rollback on failure | — | `.agent/rollback.md` | — | tag `layer-N-done`, revert to checkpoint | notify human |

**Runtime hand-off:** every subagent call writes the Run Journal **write-ahead** (`.context/runs/<type>-<slug>-<phaseTask>.md`), printing `▶ START` before / `✅ DONE` after (§ Session Handoff).

### After the build — every change goes through one agent

| Entry | Agent | Steps |
|---|---|---|
| `/change` · `/bug` · `/feature` | **`change-request`** (+ `.agent/change-request.md`) | classify BUG / ADDITIVE / MODIFY / REMOVE → spec delta → **`spec-publisher`** (bump `spec_version` + `spec/updates/` + `spec/test-scope/current.json`) → `spec-validator` → phase/task → `loop`(builder→reviewer) → `spec-validator` (phase close) → doc reconcile → progress → commit → archive change file |
| `/bug-check` | — (read-only) | sweep the area, list defects into `tasks/bug-<slug>/scan.md`, **STOP for you to choose** — does NOT call builder |
| `/spec-publish` | **`spec-publisher`** | publish spec + test-scope (usually automatic inside change-request; use manually when needed) |

> 💡 **The test loop:** every change leaves behind `spec/test-scope/current.json` → the test template runs `/autotest` (creates test cases from the new spec; user approves → headless run → browser run) and `/retest` (re-runs already-tested cases).

---

## Agent Roles

**Maintenance (default)** — real subagents live in `.claude/agents/` (clean context; reviewers are read-only):

| Agent | File | Description |
|-------|------|-------------|
| **Builder** | `.claude/agents/builder.md` | Implement one task + tests in its own git worktree; no scope creep; commits in-worktree only; never pushes/merges |
| **Builder (strong)** | `.claude/agents/builder-strong.md` | Same, for hard tasks — **opt-in only**, gated by hook `agent-guard.mjs` (`permissionDecision: "ask"`) |
| **Reviewer** | `.claude/agents/reviewer.md` | Independent review, risk level FAST/NORMAL/STRICT (read-only) |
| **Spec Validator** | `.claude/agents/spec-validator.md` | Cross-check spec/phase vs requirements (read-only) |
| **Change Request** ⭐ | `.claude/agents/change-request.md` | **The ONLY agent for all post-build changes** (new feature + bug fix) — reads `spec/changes/`, spec-publish + test-scope. Entry: `/change`, `/bug`, `/feature` |
| **Design** | `.claude/agents/design.md` | Produce design tokens + screen specs (`.context/design-spec.md`); automatic within `/start` |
| **Graph** | `.claude/agents/graph.md` | Split spec/design → layers + tasks (dependency order) + layer-plan diagram |
| **Spec Init** | `.claude/agents/spec-init.md` | Reverse-engineer spec for an EXISTING project (no spec yet) |
| **Spec Publisher** | `.claude/agents/spec-publisher.md` | Auto-bump spec + produce `spec/test-scope/current.json` for the test template |

**Prompt-level agents in `.agent/`:**

| Agent | File | Description |
|-------|------|-------------|
| **Spec Validator** | `.agent/spec-validator.md` | Cross-validates spec against code/docs; detects conflicts |
| **Spec Init** | `.agent/spec-init.md` | Reverse-engineer spec for an EXISTING project (no spec yet) |
| **Spec Publisher** | `.agent/spec-publish.md` | Publish spec + test-scope for the test template |
| **Loop Builder** | `.agent/loop.md` | Implements tasks using ReAct (read → plan → code → test → fix) |
| **Reviewer** | `.agent/reviewer.md` | Independent code review with a different model |
| **Error Analyzer** | `.agent/error-analyzer.md` | Root cause analysis; builds error memory to prevent recurrence |
| **Change Request** ⭐ | `.agent/change-request.md` | **The ONLY agent for all post-build changes** (feature + bug); wrapper subagent at `.claude/agents/change-request.md` |
| **Design** | `.agent/design.md` | Design tokens + screen specs before the layer split (anti-slop: taste-skill + ui-ux-pro-max) |
| **Graph** | `.agent/graph.md` | Split spec → layers/tasks by dependency; Layer N+1 only unlocks when Layer N PASSes + user approves |
| **DevOps** | `.agent/devops.md` | Git init, CI/CD files, deploy (staging → prod), health check |
| **Rollback** | `.agent/rollback.md` | Git checkpoint (tag `layer-N-done`) + revert strategy |
| **Blackboard** | `.agent/blackboard.md` | Shared state — `.context/progress.json` is the source of truth |
| **Context Manager** | `.agent/context-manager.md` | Compress context when it grows too large (pin + trim) |

---

## docs/ Folder

The `docs/` folder is where you drop any existing project documentation. The agent automatically classifies each file by content — no need to follow a naming convention.

### Supported Doc Types

| Type | Detected by | Template file |
|------|-------------|---------------|
| Business Requirements (BRD/PRD) | "user story", "acceptance criteria", "business rule" | `docs/BRD.md` |
| Design Spec | screen names, colors, layout, component names | `docs/DESIGN.md` |
| API Spec | endpoints, request/response schemas, HTTP methods | `docs/API_SPEC.md` |
| Database Schema (ERD) | table definitions, relationships, indexes | `docs/ERD.md` |

### docs/INDEX.md (classification)

`docs/INDEX.md` splits docs into **canonical** (source of truth, used to validate) vs **historical**
(reference only, never blocks). Example entries:

```markdown
## Canonical
| File | Type | Note |
|------|------|------|
| BRD.md | business_requirements | Business requirements |
| API_SPEC.md | api_spec | Overview + pointer → code |
| ERD.md | database_schema | Overview + pointer → migration |
| PERMISSION.md | business_rules | Roles + guard order (synced from code) |
| generated/ | generated | Auto-gen, do not edit by hand |

## Historical
| File | Note |
|------|------|
| diagrams/ | Illustrative diagrams (archify) — verify against code |
```

> Do not hand-embed code/schema into canonical docs — use a pointer + `docs/generated/`.

### What Happens

1. `/spec-init` scans code + `docs/` (if any)
2. Classifies each docs file into a doc type
3. Cross-checks against the current code
4. Spec Validator cross-checks SPEC vs code + docs
5. Every subsequent change → `/change` (the `change-request` agent) → spec delta → phase/task

---

## Agent Models

To avoid bias, each independent role uses a **different model**. Models are set in the
frontmatter of each `.claude/agents/*.md` (`model:` = `inherit` · `opus` · `sonnet` · `haiku` · `fable` · full model ID):

| Role | Agent file | Suggested model |
|------|-----------|-----------------|
| Builder (default) | `.claude/agents/builder.md` | strongest coding model |
| Builder (strong) | `.claude/agents/builder-strong.md` | stronger model, **opt-in only** |
| Reviewer | `.claude/agents/reviewer.md` | different provider than builder |
| Spec Validator | `.claude/agents/spec-validator.md` | third provider |

**Set up via `/brainstorm`.** `/brainstorm` asks for each model, writes `.context/project-config.md` (`models:`), and fills the frontmatter of the agent files. Note the separate `models.change_request` for the post-build agent.
`.env.local` stays git-ignored for git/deploy/monitor secrets.

> 🛑 After model setup you **must khởi động lại Claude Code nếu thay đổi chưa có hiệu lực** — agent/config is not hot-reloaded. Until then
> agent files keep `model:` commented out and the subagents **inherit the primary model**
> (builder == reviewer), so setup + restart is required to get the different-model guarantee.

---

## Git & CI/CD

### Branch Strategy

```
Default maintenance: staging-direct
target_branch ← current branch for commit-first close-out and auto-push

Optional by user request only:
feature/* or bug/* ← push current branch; open PR only when explicitly requested
```

### CI/CD Templates

| Platform | Generated Config |
|----------|-----------------|
| **Vercel** | `vercel.json` + GitHub Actions |
| **Railway** | `railway.toml` + GitHub Actions |
| **VPS/Docker** | `Dockerfile` + `docker-compose.yml` + Nginx config |

### Git Token Setup

| Platform | Token URL | Scope |
|----------|-----------|-------|
| **GitHub** | https://github.com/settings/tokens | `repo` |
| **GitLab** | https://gitlab.com/-/user_settings/personal_access_tokens | `api` |
| **Bitbucket** | https://bitbucket.org/account/settings/app-passwords | `Repositories Read+Write` |

#### GitHub — Steps
1. Go to https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Note: any name (e.g. `my-project`)
4. Expiration: 90 days or No expiration
5. Tick scope: ☑️ **repo** (full control of private repositories)
6. Click **Generate token** → Copy immediately (shown only once)

#### GitLab — Steps
1. Go to https://gitlab.com/-/user_settings/personal_access_tokens
2. Token name: any name
3. Tick scope: ☑️ **api**
4. Click **Create personal access token** → Copy immediately

#### Bitbucket — Steps
1. Go to https://bitbucket.org/account/settings/app-passwords
2. Click **Create app password**
3. Tick permissions: ☑️ **Repositories: Read + Write**
4. Click **Create** → Copy immediately

### CI/CD Secrets

Once the CI/CD files are generated, add the secrets to your platform:

#### GitHub Actions → Repo Settings → Secrets and variables → Actions

| Secret | When needed | Value |
|--------|-------------|-------|
| `VPS_HOST` | Deploy VPS | Server IP or domain |
| `VPS_USER` | Deploy VPS | SSH username (e.g. `ubuntu`, `root`) |
| `VPS_PORT` | Deploy VPS | SSH port (default `22`) |
| `VPS_SSH_KEY` | Deploy VPS | Contents of `~/.ssh/id_rsa` (private key) |
| `VPS_DEPLOY_DIR` | Deploy VPS | Project path on the VPS (e.g. `/opt/myapp`) |
| `DOMAIN` | Deploy VPS | App domain (e.g. `myapp.com`) |
| `VERCEL_TOKEN` | Deploy Vercel | Token from https://vercel.com/account/tokens |
| `RAILWAY_TOKEN` | Deploy Railway | Token from https://railway.app/account/tokens |

#### GitHub Actions — Add secrets step-by-step
1. Open your repo on GitHub → **Settings** tab
2. Sidebar: **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter Name (e.g. `VPS_HOST`) + Value → **Add secret**
5. Repeat for each secret in the table above

#### GitLab CI — Add variables step-by-step
1. Open your repo on GitLab → **Settings** → **CI/CD**
2. Expand section **Variables**
3. Click **Add variable**
4. Key = secret name (e.g. `VPS_HOST`), Value = secret value
5. ⚠️ For SSH keys: tick **Type = File** and **Mask variable**
6. Click **Add variable** → Repeat

#### How to create & retrieve a VPS SSH Key
```bash
# 1. Create a new SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "deploy@myproject"
# → Enter file: ~/.ssh/deploy_key
# → Passphrase: leave empty (for CI/CD)

# 2. Copy the PUBLIC key to the VPS
ssh-copy-id -i ~/.ssh/deploy_key.pub user@your-vps-ip

# 3. Retrieve the PRIVATE key to paste into GitHub/GitLab secret
cat ~/.ssh/deploy_key
# ⚠️ Copy the ENTIRE output (including the -----BEGIN... and -----END... lines)
```

#### How to get a Vercel Token
1. Go to https://vercel.com/account/tokens
2. Click **Create Token**
3. Name: `ci-deploy`, Scope: select team/project
4. Click **Create** → Copy immediately

#### How to get a Railway Token
1. Go to https://railway.app/account/tokens
2. Click **Create Token**
3. Name: `ci-deploy`
4. Click **Create** → Copy immediately

> 💡 **Tips:**
> - Create a dedicated SSH key for CI/CD (do not use your personal key)
> - Secrets only need to be added once; CI/CD will use them automatically on every deploy
> - If you change server/key → update the secret in Settings

---

## Change Requests

Use `/feature` for any addition/modification/removal after the project exists. The workflow:

1. **Classify** — `ADDITIVE` / `MODIFY` / `REMOVE`
2. **Spec delta** — what changes vs `SPECIFICATIONS.md` (API/DB/UI affected)
3. **Spec Validator** — cross-check delta vs spec + docs (report `.context/review-reports/feature-<slug>-spec-validation.md`)
4. **Phase/task** — `tasks/feature-<slug>/phase-<N>-task-<NN>.md`, human approves the plan
5. **Build/review/validate** — builder → reviewer per task; spec-validator cross-check at phase close
6. **Close-out** — doc reconcile → progress → commit (1 task = 1 commit)

| Type | Example |
|------|---------|
| **ADDITIVE** | "Add Excel export feature" |
| **MODIFY** | "Change order status flow" |
| **REMOVE** | "Remove Stripe payment" |

Full Change Request workflow: `.agent/workflows/change.md` (§3: classify → spec delta → validator → phase/task → build → phase review). Intent docs (`BRD.md`, business rules) change only via Change Request + user approval — never edited to match code.

### Auto-intake backlog (after the initial build)

Once all layers are built (`mode: maintenance`), **requirements and bugs that you type in chat are captured automatically** — no need to create change files by hand:

1. The agent writes a line into `spec/changes/BACKLOG.md` (`pending`) and creates the change doc `spec/changes/YYYY-MM-DD-<slug>.md` from what you said (asks once if info is missing, never invents requirements).
2. It replies **"✅ logged to backlog — type `/change` to process"** and does **not** code yet.
3. You type `/change` (or `/change <slug>`) → the `change-request` agent processes it as before → sets the change `done` + archives it → updates the backlog row to `done` with the date.

`/change --list` shows what is done vs pending (`pending` → `in_progress` → `done` | `blocked`). Every row in `BACKLOG.md` maps 1-to-1 to a change doc under `spec/changes/`; rows that are `done` are kept for history.

---

## Workflow Router (maintenance)

Once the project exists, `AGENTS.md` (always loaded) routes every request before any code
is written. The maintenance workflow lives in `.agent/FEATURE_WORKFLOW.md` (entry point; per-workflow details in `.agent/workflows/`), and project
values in `.context/project-config.md`.

| Intent | Route |
|--------|-------|
| "sweep a screen", "feels like many bugs" | **Bug discovery / sweep** → `/bug-check` (READ-ONLY) |
| "fix bug", "broken", regression | **Change Request (BUG)** — root cause first, then task → builder → reviewer (`/change` · `/bug`) |
| "add/modify/remove a feature" | **Change Request** → agent `change-request` — classify → spec delta → phase plan → builder → reviewer → spec-validator (`/change` · `/feature`) |
| a change already written in `spec/changes/` | **`/change`** — read all pending files → agent `change-request` |
| "old project with no spec", "build spec from code", inherited codebase | **Spec Init (reverse-engineer)** → `/spec-init` — read code → build spec + scope (read-only, once) |
| "implement feature" (task already exists) | `builder` subagent |
| "review / check" | `reviewer` subagent (read-only) |
| question / investigation | Research-only — no edits |

**Roles are real subagents** in `.claude/agents/` (clean context, different models,
read-only review roles). `builder-strong` is gated by the `agent-guard.mjs` hook
(`permissionDecision: "ask"`) — used **only when you ask for it explicitly**.

The Reviewer picks a risk level `FAST` / `NORMAL` / `STRICT`; `STRICT` is mandatory for auth/RBAC,
tenant/org isolation, DB/schema/migration, destructive/bulk update, shared/API contract, security,
cron/webhook, payment/subscription, unclear root cause, or important logic lacking tests.

Triggers: `/change` (main entry for post-build changes — reads `spec/changes/`), `/bug-check <area>`, `/bug <description>`, `/feature <description>`, `/spec-init` (old project with no spec), `/spec-publish` (publish spec for the test template).

> ⚠️ Agent/command/config changes are **not hot-reloaded** — khởi động lại Claude Code nếu thay đổi chưa có hiệu lực after editing them.
> In auto-approve mode the `ask` gate is auto-accepted; keep manual mode to preserve it.

---

## Claude Code port notes

What changed versus the opencode original:

| opencode | Claude Code |
|---|---|
| `.opencode/agent/*.md` (`mode`, `temperature`, `steps`, `permission`) | `.claude/agents/*.md` (`tools` / `disallowedTools`, `model`, `maxTurns`) |
| `.opencode/command/*.md` | `.claude/commands/*.md` (same `$ARGUMENTS`, plus `argument-hint`) |
| `opencode.jsonc` glob `permission.bash` | `.claude/settings.json` + `.claude/hooks/agent-guard.mjs` (splits `&&`, `;`, pipes; ignores quoted text, inspects `sh -c`, understands `git -C . push`) |
| reviewer `edit: deny` + bash allowlist | reviewer has no Edit tool; guard limits Write to `.context/review-reports/**` and Bash to an allowlist (+ `.claude/agent-policy.json`) |
| `permission.task."builder-strong": "ask"` | hook `agent-guard.mjs` (`permissionDecision: "ask"`) |
| plugin `loop-guard.ts` (`usage()` tool, compaction note) | `SessionStart` hook `session-context.mjs` (re-read journal after compact). No usage tool: the main session asks at layer/phase checkpoints |
| subagent `change-request` | removed: `/change` `/bug` `/feature` run `.agent/change-request.md` in the **main session** (only it can ask the user at checkpoints) |
| reviewer from a different **provider** | Claude-only: use a different **tier** (builder `opus` ↔ reviewer `sonnet`) |
| `template-sync.mjs` via rsync from the opencode repo | pure Node copy (works on Windows); **requires** `--template <url>` or `templateRepo` in `.template-sync.json` (pointing at the opencode repo would overwrite this port) |

## License

MIT
