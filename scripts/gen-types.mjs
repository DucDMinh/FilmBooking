// Sinh packages/shared/src/database.types.ts từ DB local; không ghi đè file cũ nếu CLI lỗi hoặc output rỗng.
import { spawnSync } from 'node:child_process';
import { renameSync, rmSync, statSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';

const sharedSrc = resolve(import.meta.dirname, '..', 'packages', 'shared', 'src');
const finalFile = resolve(sharedSrc, 'database.types.ts');
const tmpFile = `${finalFile}.tmp`;

const out = openSync(tmpFile, 'w');
const result = spawnSync('supabase', ['gen', 'types', 'typescript', '--local'], {
  stdio: ['inherit', out, 'inherit'],
  shell: process.platform === 'win32', // supabase là .cmd shim trên Windows
});
closeSync(out);

if (result.error || result.status !== 0 || statSync(tmpFile).size === 0) {
  rmSync(tmpFile, { force: true });
  console.error('gen types thất bại hoặc output rỗng; giữ nguyên database.types.ts.');
  process.exit(1);
}
renameSync(tmpFile, finalFile);
