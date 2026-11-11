// Biên dịch apps/api/src + packages/shared/src bằng SWC sang CommonJS.
// Vì sao không dùng `nest build` (tsc): packages/shared xuất .ts thô, Node không load được .ts của
// workspace package. SWC `jsc.paths` ghi lại import `@filmbooking/shared` thành đường dẫn tương đối
// tới bản đã biên dịch, nên `node dist/...` chạy được mà không cần bundler/dependency thêm.
import { transform } from "@swc/core";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(apiRoot, "../..");
const outRoot = join(apiRoot, "dist");
const sourceRoots = [join(apiRoot, "src"), join(repoRoot, "packages/shared/src")];

const isBuildable = (file) =>
  file.endsWith(".ts") &&
  !file.endsWith(".d.ts") &&
  !/\.(spec|test|e2e-spec)\.ts$/.test(file) &&
  !file.includes("__tests__");

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    ),
  );
  return nested.flat();
}

async function compile(file) {
  const source = await readFile(file, "utf8");
  const { code, map } = await transform(source, {
    filename: file,
    sourceMaps: true,
    module: { type: "commonjs" },
    jsc: {
      target: "es2022",
      keepClassNames: true,
      parser: { syntax: "typescript", decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
      baseUrl: repoRoot,
      paths: {
        "@filmbooking/shared": ["packages/shared/src/index.ts"],
        "@filmbooking/shared/*": ["packages/shared/src/*.ts"],
      },
    },
  });
  const target = join(outRoot, relative(repoRoot, file)).replace(/\.ts$/, ".js");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, code);
  if (map) await writeFile(`${target}.map`, map);
}

await rm(outRoot, { recursive: true, force: true });
const files = (await Promise.all(sourceRoots.map(listFiles))).flat().filter(isBuildable);
await Promise.all(files.map(compile));
console.log(`Built ${files.length} files -> ${relative(repoRoot, outRoot)}`);
