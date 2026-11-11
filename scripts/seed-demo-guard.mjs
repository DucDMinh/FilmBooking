// Guard cho seed demo: chỉ cho phép URL kết nối tới DB loopback.
// Tách khỏi seed-demo.mjs để test được mà không cần psql.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const ALLOWED_PROTOCOLS = new Set(['postgresql:', 'postgres:']);

/** Trả về URL đã chuẩn hoá nếu an toàn; ném Error nếu không. */
export function assertLocalDbUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('SEED_DB_URL không hợp lệ.');
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Từ chối seed demo: giao thức "${url.protocol}" không được hỗ trợ.`);
  }
  // Query string cho phép libpq ghi đè host/hostaddr/service ngay sau khi guard đã kiểm.
  if (url.search !== '') {
    throw new Error('Từ chối seed demo: SEED_DB_URL không được chứa query string.');
  }
  // libpq không coi "#" là fragment: "#?host=remote" vẫn bị parse thành tham số kết nối.
  if (url.hash !== '' || rawUrl.includes('#')) {
    throw new Error('Từ chối seed demo: SEED_DB_URL không được chứa fragment (#).');
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Từ chối seed demo: host "${url.hostname}" không phải DB local (127.0.0.1/localhost).`);
  }
  // Dựng lại từ các thành phần đã kiểm thay vì url.href, để không lọt phần thừa nào tới libpq.
  const userinfo = url.username
    ? `${url.username}${url.password ? `:${url.password}` : ''}@`
    : '';
  return `${url.protocol}//${userinfo}${url.host}${url.pathname}`;
}

/** Bỏ mọi biến PG* (PGHOST, PGHOSTADDR, PGSERVICE...) để kết nối chỉ đến từ URL đã kiểm. */
export function sanitizedPsqlEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
}
