// Nạp supabase/seed.sql vào DB LOCAL. Từ chối chạy nếu host không phải loopback,
// vì seed tạo Admin với mật khẩu công khai + khoá POS đã biết.
// seed.sql tự chặn thêm nếu thiếu cờ app.allow_demo_seed (đặt bên dưới) -> chạy psql tay cũng bị chặn.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertLocalDbUrl, sanitizedPsqlEnv } from './seed-demo-guard.mjs';

let dbUrl;
try {
  dbUrl = assertLocalDbUrl(process.env.SEED_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const seedFile = resolve(import.meta.dirname, '..', 'supabase', 'seed.sql');
const result = spawnSync(
  'psql',
  [dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c', 'set app.allow_demo_seed = on', '-f', seedFile],
  { stdio: 'inherit', env: sanitizedPsqlEnv(process.env) },
);
if (result.error) {
  console.error(`Không chạy được psql: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
