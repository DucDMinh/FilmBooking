import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalDbUrl, sanitizedPsqlEnv } from './seed-demo-guard.mjs';

const rejected = {
  'host remote': ['postgresql://postgres:pw@db.xxx.supabase.co:5432/postgres', /host/],
  'localhost.evil.com': ['postgresql://postgres:pw@localhost.evil.com:5432/postgres', /host/],
  'user@host': ['postgresql://127.0.0.1@evil.com:5432/postgres', /host/],
  '?host=remote': ['postgresql://postgres:pw@127.0.0.1:5432/postgres?host=db.xxx.supabase.co', /query string/],
  '?hostaddr=': ['postgresql://postgres:pw@127.0.0.1:5432/postgres?hostaddr=10.0.0.5', /query string/],
  '?service=': ['postgresql://postgres:pw@127.0.0.1:5432/postgres?service=staging', /query string/],
  '#?host=': ['postgresql://postgres:pw@127.0.0.1:54322/postgres#?host=db.x.supabase.co', /fragment/],
  '#?hostaddr=': ['postgresql://postgres:pw@127.0.0.1:54322/postgres#?hostaddr=1.2.3.4', /fragment/],
  '# đơn độc': ['postgresql://postgres:pw@127.0.0.1:54322/postgres#', /fragment/],
  'URL rỗng': ['', /không hợp lệ/],
  'giao thức lạ': ['http://127.0.0.1:5432/postgres', /giao thức/],
};

for (const [name, [url, reason]] of Object.entries(rejected)) {
  test(`từ chối: ${name}`, () => {
    assert.throws(() => assertLocalDbUrl(url), reason);
  });
}

test('URL trả về không mang fragment/query (chỉ protocol+userinfo+host+port+path)', () => {
  assert.equal(
    assertLocalDbUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  );
});

for (const url of [
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  'postgresql://postgres:postgres@localhost:54322/postgres',
  'postgresql://postgres:postgres@[::1]:54322/postgres',
]) {
  test(`chấp nhận: ${url}`, () => {
    assert.ok(assertLocalDbUrl(url));
  });
}

test('sanitizedPsqlEnv bỏ mọi biến PG* và giữ biến khác', () => {
  const env = sanitizedPsqlEnv({ PGHOST: 'x', PGHOSTADDR: 'y', PGSERVICE: 'z', pgservicefile: 'f', PATH: '/bin' });
  assert.deepEqual(env, { PATH: '/bin' });
});
