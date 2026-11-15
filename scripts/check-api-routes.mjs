#!/usr/bin/env node
// Đối chiếu route trong code (decorator Nest) với docs/API_SPEC.md.
//   node scripts/check-api-routes.mjs          -> kiểm tra, exit 1 nếu lệch
//   node scripts/check-api-routes.mjs --list   -> in route từ code: METHOD /path | guard
// Doc ghi mỗi route dạng `METHOD /path` (code span). Route chỉ tính khi nằm trong code span.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = join(root, "apps/api/src");
const METHOD = "(Get|Post|Put|Patch|Delete)";

function controllerFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith(".controller.ts") ? [path] : [];
  });
}

const strings = (src) => [...src.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
const normalize = (...parts) => "/" + parts.join("/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");

function guardOf(window) {
  const roles = window.match(/@Roles\(([^)]*)\)/)?.[1].replace(/"/g, "").replace(/\s/g, "");
  const flags = [/@Public\(\)/.test(window) && "Public", /JobSecretGuard/.test(window) && "JobSecret"].filter(Boolean);
  return [roles && `Roles(${roles})`, ...flags, /@CinemaScope\(\)/.test(window) && "CinemaScope"]
    .filter(Boolean)
    .join("+");
}

export function extractRoutes() {
  const routes = [];
  for (const file of controllerFiles(modulesDir)) {
    const text = readFileSync(file, "utf8");
    const classStarts = [...text.matchAll(/@Controller\(([^)]*)\)/g)];
    classStarts.forEach((cls, i) => {
      const end = classStarts[i + 1]?.index ?? text.length;
      const classHead = text.slice(0, cls.index).split(/\n\s*\n/).pop();
      const classGuard = guardOf(classHead + text.slice(cls.index).split("export class")[0]);
      const prefix = strings(cls[1])[0] ?? "";
      const body = text.slice(cls.index, end);
      for (const m of body.matchAll(new RegExp(String.raw`@${METHOD}\(([^)]*)\)`, "g"))) {
        const before = body.slice(0, m.index);
        const start = Math.max(before.search(/\n\s*\n(?![\s\S]*\n\s*\n)/), before.indexOf("export class"));
        const after = body.slice(m.index).search(/\n {2}(async\s+)?\w+\(/);
        const window = body.slice(start < 0 ? 0 : start, m.index + (after < 0 ? 0 : after));
        const paths = strings(m[2]);
        for (const p of paths.length ? paths : [""]) {
          const g = [classGuard, guardOf(window)].filter(Boolean).join("+");
          routes.push({ method: m[1].toUpperCase(), path: normalize(prefix, p), guard: g, file: file.replace(root + "/", "").replace(root + "\\", "") });
        }
      }
    });
  }
  return routes;
}

const routes = extractRoutes();
if (process.argv.includes("--list")) {
  for (const r of routes) console.log(`${r.method} ${r.path} | ${r.guard} | ${r.file}`);
  process.exit(0);
}

const doc = readFileSync(join(root, "docs/API_SPEC.md"), "utf8");
const docRoutes = new Set(
  [...doc.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^`\s]*)`/g)].map((m) => `${m[1]} ${m[2]}`),
);
const codeRoutes = new Set(routes.map((r) => `${r.method} ${r.path}`));
const missingInDoc = [...codeRoutes].filter((r) => !docRoutes.has(r));
const extraInDoc = [...docRoutes].filter((r) => !codeRoutes.has(r));
console.log(`route trong code: ${codeRoutes.size} · route trong API_SPEC: ${docRoutes.size}`);
console.log(`code thiếu trong doc: ${missingInDoc.length}`, missingInDoc);
console.log(`doc thừa so với code: ${extraInDoc.length}`, extraInDoc);
process.exit(missingInDoc.length || extraInDoc.length ? 1 : 0);
