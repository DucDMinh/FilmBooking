// Seed DEV/LOCAL: nhiều đơn `paid` + vé, rải đều ~30 ngày gần đây, để báo cáo doanh thu có số liệu.
//
// Luồng mỗi đơn đi qua RPC thật (giữ đủ bất biến: khoá ghế, sell_order_seats, vé, QR, email_outbox, audit):
//   hold_seats (JWT khách) -> [apply_voucher (JWT khách)] -> confirm_paid (service_role, như webhook PayOS).
// Sau khi chốt, MỚI lùi mốc thời gian (created_at/paid_at...) bằng UPDATE chạy với session_replication_role=replica
// (bỏ qua trigger set_updated_at/guard/audit). Chỉ dùng cho DB local — script từ chối mọi host không phải loopback.
//
// Đánh dấu: payments.transaction_ref bắt đầu bằng "DEMOSEED-" (orders không có cột ghi chú; booking_code bị khoá regex).
// Idempotent: --count N là TỔNG số đơn demo mong muốn; chạy lại chỉ tạo phần còn thiếu.
//
// Dùng:  pnpm db:seed:orders [--count 300] [--days 30] [--users 20] [--seed N]
//        pnpm db:seed:orders --reset-orders-demo      # xoá đúng các đơn do script này tạo
import { spawnSync } from 'node:child_process';
import { assertLocalDbUrl, assertLocalHttpUrl, sanitizedPsqlEnv } from './seed-demo-guard.mjs';
import {
  createFailureTracker,
  mulberry32,
  pickableSeatCount,
  pickShowtimeAndSeats,
  randomSeatCount,
} from './seed-orders-demo-lib.mjs';

const MARKER_PREFIX = 'DEMOSEED-';
const DEMO_PASSWORD = 'LocalDev@123!';
const CUSTOMER_EMAIL = 'customer@filmbooking.local';
const VN_OFFSET_MS = 7 * 3600 * 1000;
const MAX_FILL_RATIO = 0.4; // trần lấp đầy mỗi suất, để còn ghế trống cho test tay
const BACKDATE_BATCH = 25;
const MAX_CONSECUTIVE_FAILURES = 15; // lỗi thoáng qua (NO_SEATS lẻ, SEAT_TAKEN) bỏ qua; chuỗi liên tiếp dài = hỏng thật
const DEMO_NAMES = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Dũng', 'Hoàng Thu Hà',
  'Vũ Đức Huy', 'Đặng Khánh Linh', 'Bùi Quang Minh', 'Đỗ Ngọc Nga', 'Ngô Thanh Phong',
  'Dương Mai Quyên', 'Lý Gia Bảo', 'Phan Thảo Vy', 'Võ Tuấn Kiệt', 'Trịnh Hải Yến',
  'Đinh Công Sơn', 'Mai Phương Thảo', 'Tô Anh Tuấn', 'Lâm Bích Ngọc', 'Hồ Đình Khoa',
];

function parseArgs(argv) {
  const options = { count: 300, days: 30, users: 20, seed: null, reset: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const numeric = (name) => {
      const value = Number(argv[(i += 1)]);
      if (!Number.isInteger(value) || value < 0) throw new Error(`${name} cần một số nguyên không âm.`);
      return value;
    };
    if (flag === '--count') options.count = numeric('--count');
    else if (flag === '--days') options.days = Math.max(1, numeric('--days'));
    else if (flag === '--users') options.users = Math.min(numeric('--users'), DEMO_NAMES.length);
    else if (flag === '--seed') options.seed = numeric('--seed');
    else if (flag === '--reset-orders-demo') options.reset = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else throw new Error(`Tham số không hợp lệ: ${flag}`);
  }
  return options;
}

// ---------------------------------------------------------------- cấu hình local

function readLocalKeys() {
  const fromEnv = {
    API_URL: process.env.SEED_API_URL,
    ANON_KEY: process.env.SEED_ANON_KEY,
    SERVICE_ROLE_KEY: process.env.SEED_SERVICE_ROLE_KEY,
  };
  if (fromEnv.API_URL && fromEnv.ANON_KEY && fromEnv.SERVICE_ROLE_KEY) return fromEnv;
  // Khoá local không nằm trong repo: lấy từ CLI (chỉ DB local đang chạy mới trả về).
  const result = spawnSync('pnpm exec supabase status -o env', { shell: true, encoding: 'utf8' });
  const keys = {};
  for (const line of (result.stdout ?? '').split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) keys[match[1]] = match[2];
  }
  if (!keys.API_URL || !keys.ANON_KEY || !keys.SERVICE_ROLE_KEY) {
    throw new Error('Không đọc được khoá local từ `pnpm exec supabase status -o env` (đã `pnpm db:start` chưa?).');
  }
  return { API_URL: fromEnv.API_URL ?? keys.API_URL, ANON_KEY: keys.ANON_KEY, SERVICE_ROLE_KEY: keys.SERVICE_ROLE_KEY };
}

/** Chạy SQL qua psql nếu có trên PATH, không thì `docker exec` vào container DB local của Supabase. */
function makeSqlRunner(dbUrl) {
  const hasPsql = spawnSync('psql', ['--version'], { stdio: 'ignore' }).status === 0;
  const container = process.env.SEED_DB_CONTAINER ?? 'supabase_db_filmbooking';
  const common = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'];
  const [command, args] = hasPsql
    ? ['psql', [dbUrl, ...common]]
    : ['docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', ...common]];
  return (sql) => {
    const result = spawnSync(command, args, {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: sanitizedPsqlEnv(process.env),
    });
    if (result.error) throw new Error(`Không chạy được ${command}: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`SQL lỗi:\n${result.stderr}\n--- SQL ---\n${sql.slice(0, 1500)}`);
    return result.stdout.trim();
  };
}

// ---------------------------------------------------------------- HTTP (GoTrue + PostgREST)

function makeHttp(keys) {
  const call = async (path, { method = 'GET', bearer, apikey = keys.ANON_KEY, body } = {}) => {
    const response = await fetch(`${keys.API_URL}${path}`, {
      method,
      headers: {
        apikey,
        Authorization: `Bearer ${bearer ?? apikey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: response.ok, status: response.status, data };
  };
  const service = { bearer: keys.SERVICE_ROLE_KEY, apikey: keys.SERVICE_ROLE_KEY };
  return {
    adminListUsers: () => call('/auth/v1/admin/users?page=1&per_page=1000', service),
    adminCreateUser: (email, fullName) =>
      call('/auth/v1/admin/users', {
        ...service,
        method: 'POST',
        body: { email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } },
      }),
    signIn: (email) =>
      call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: DEMO_PASSWORD } }),
    rpcAsUser: (name, args, jwt) => call(`/rest/v1/rpc/${name}`, { method: 'POST', bearer: jwt, body: args }),
    rpcAsService: (name, args) => call(`/rest/v1/rpc/${name}`, { ...service, method: 'POST', body: args }),
    getOrderTotals: (orderId) =>
      call(`/rest/v1/orders?id=eq.${orderId}&select=subtotal_amount,discount_amount,total_amount`, service),
  };
}

// ---------------------------------------------------------------- reset

function resetDemoOrders(sql) {
  const output = sql(`
begin;
create temp table _demo_ids on commit drop as
  select distinct p.order_id as id from public.payments p where p.transaction_ref like '${MARKER_PREFIX}%';
select count(*) from _demo_ids;
delete from public.email_outbox where payload->>'order_id' in (select id::text from _demo_ids);
delete from public.payment_events where transaction_ref like '${MARKER_PREFIX}%';
delete from public.payments where order_id in (select id from _demo_ids);
delete from public.orders where id in (select id from _demo_ids);
commit;`);
  console.log(`Đã xoá ${output.split('\n')[0] || 0} đơn demo (kèm vé, ghế, thanh toán, lượt voucher, email outbox). Khách demo giữ nguyên.`);
}

// ---------------------------------------------------------------- người dùng demo

async function ensureDemoUsers(http, sql, userCount) {
  const listed = await http.adminListUsers();
  if (!listed.ok) throw new Error(`GoTrue admin list lỗi ${listed.status}: ${JSON.stringify(listed.data)}`);
  const idByEmail = new Map(listed.data.users.map((user) => [user.email, user.id]));

  const wanted = [{ email: CUSTOMER_EMAIL, fullName: 'Khách Hàng Mẫu', weight: 2, allowVoucher: false }];
  for (let n = 1; n <= userCount; n += 1) {
    wanted.push({
      email: `khach${String(n).padStart(2, '0')}@filmbooking.local`,
      fullName: DEMO_NAMES[n - 1],
      weight: 1,
      allowVoucher: true,
    });
  }
  for (const user of wanted) {
    if (!idByEmail.has(user.email)) {
      const created = await http.adminCreateUser(user.email, user.fullName);
      if (!created.ok) throw new Error(`Tạo ${user.email} lỗi ${created.status}: ${JSON.stringify(created.data)}`);
      idByEmail.set(user.email, created.data.id);
      console.log(`  + tài khoản ${user.email}`);
    }
    user.id = idByEmail.get(user.email);
  }

  // Phim T13+ yêu cầu ngày sinh trong profile: đặt ngày sinh người lớn cho khách demo (không đụng customer@).
  const values = wanted
    .filter((user) => user.email !== CUSTOMER_EMAIL)
    .map((user) => `('${user.id}','${user.email}','${user.fullName.replace(/'/g, "''")}')`)
    .join(',');
  if (values) {
    sql(`insert into public.profiles (id, email, full_name, date_of_birth)
select v.id::uuid, v.email, v.full_name, date '1995-06-15' from (values ${values}) v(id, email, full_name)
on conflict (id) do update set
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth);`);
  }
  return wanted;
}

async function attachUserTokens(http, users) {
  let signedIn = 0;
  for (const user of users) {
    const response = await http.signIn(user.email);
    user.jwt = response.ok ? response.data.access_token : null;
    if (user.jwt) signedIn += 1;
  }
  if (signedIn < users.length) {
    console.log(`  ! ${users.length - signedIn} tài khoản không đăng nhập được -> dùng service_role + p_user_id cho khách đó`);
  }
}

// ---------------------------------------------------------------- dữ liệu suất/ghế

function loadPool(sql) {
  const json = sql(`
select json_build_object(
  'showtimes', coalesce((
    select json_agg(json_build_object('id', s.id, 'roomId', s.room_id, 'startsAt', s.starts_at))
      from public.showtimes s
      join public.cinemas c on c.id = s.cinema_id and c.status = 'OPEN'
      join public.movies m on m.id = s.movie_id and m.status = 'PUBLISHED'
     where s.status = 'ON_SALE' and s.starts_at > now() + interval '30 minutes'), '[]'::json),
  'seats', coalesce((
    select json_agg(json_build_object('id', id, 'roomId', room_id, 'row', row_label, 'col', col_number, 'span', col_span, 'type', seat_type::text))
      from public.seats), '[]'::json),
  'taken', coalesce((
    select json_agg(json_build_object('showtimeId', showtime_id, 'seatId', seat_id))
      from public.showtime_seat_states where state = 'SOLD' or expires_at > now()), '[]'::json),
  'locks', coalesce((
    select json_agg(json_build_object('showtimeId', showtime_id, 'seatId', seat_id))
      from public.showtime_seat_locks), '[]'::json)
);`);
  const raw = JSON.parse(json);
  const seatsByRoom = new Map();
  for (const seat of raw.seats) {
    if (!seatsByRoom.has(seat.roomId)) seatsByRoom.set(seat.roomId, []);
    seatsByRoom.get(seat.roomId).push(seat);
  }
  const groupIds = (rows) => {
    const map = new Map();
    for (const { showtimeId, seatId } of rows) {
      if (!map.has(showtimeId)) map.set(showtimeId, new Set());
      map.get(showtimeId).add(seatId);
    }
    return map;
  };
  const occupied = groupIds(raw.taken);
  const locked = groupIds(raw.locks);
  const showtimes = raw.showtimes
    .filter((showtime) => seatsByRoom.has(showtime.roomId))
    .map((showtime) => ({
      ...showtime,
      roomSeats: seatsByRoom.get(showtime.roomId),
      capacity: pickableSeatCount(seatsByRoom.get(showtime.roomId)),
      occupied: occupied.get(showtime.id) ?? new Set(),
      locked: locked.get(showtime.id) ?? new Set(),
    }));
  return showtimes;
}

// ---------------------------------------------------------------- ngày giờ lùi quá khứ

/** Mốc created_at ngẫu nhiên trong ngày VN cách hôm nay `dayOffset` ngày, 08:00-23:00 giờ VN, không vượt "bây giờ". */
function randomCreatedAt(dayOffset, random, nowMs) {
  const vnNow = new Date(nowMs + VN_OFFSET_MS);
  const vnMidnightUtcMs = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate() - dayOffset) - VN_OFFSET_MS;
  const startMs = vnMidnightUtcMs + 8 * 3600 * 1000;
  const endMs = Math.min(vnMidnightUtcMs + 23 * 3600 * 1000, nowMs - 10 * 60 * 1000);
  if (endMs <= startMs) return null;
  return new Date(startMs + Math.floor(random() * (endMs - startMs)));
}

function vnDayOffsetOf(dateText, nowMs) {
  const vnNow = new Date(nowMs + VN_OFFSET_MS);
  const todayUtc = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate());
  const [year, month, day] = dateText.split('-').map(Number);
  return Math.round((todayUtc - Date.UTC(year, month - 1, day)) / 86400000);
}

// ---------------------------------------------------------------- tạo đơn

function weightedUser(users, random) {
  const total = users.reduce((sum, user) => sum + user.weight, 0);
  let ticket = random() * total;
  for (const user of users) {
    ticket -= user.weight;
    if (ticket < 0) return user;
  }
  return users[users.length - 1];
}

function chooseVoucherCode(subtotal, random) {
  const options = ['WELCOME10'];
  if (subtotal >= 150000) options.push('CINEMA30K');
  if (subtotal >= 200000) options.push('VIP50K');
  return options[Math.floor(random() * options.length)];
}

async function placeOneOrder({ http, users, showtimes, random, sequence, runTag }) {
  const user = weightedUser(users, random);
  const seatCount = randomSeatCount(random);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const picked = pickShowtimeAndSeats(showtimes, seatCount, random, MAX_FILL_RATIO);
    if (picked.reason) return { error: `NO_SEATS:${picked.reason}:count=${seatCount}` };
    const { showtime, seatIds } = picked;
    const holdArgs = { p_showtime_id: showtime.id, p_seat_ids: seatIds, p_channel: 'WEB', p_user_id: user.id };
    const held = user.jwt
      ? await http.rpcAsUser('hold_seats', holdArgs, user.jwt)
      : await http.rpcAsService('hold_seats', holdArgs);
    if (!held.ok) {
      const message = String(held.data?.message ?? '');
      // Ghế bị người khác chiếm / dính luật ghế lẻ ngoài dự đoán: đánh dấu đã chiếm trong bộ nhớ rồi chọn lại.
      if (/SEAT_TAKEN|ORPHAN_SEAT/.test(message)) {
        seatIds.forEach((id) => showtime.occupied.add(id));
        continue;
      }
      return { error: `HOLD ${held.status} ${message}` };
    }
    const hold = Array.isArray(held.data) ? held.data[0] : held.data;
    const orderId = hold.order_id;

    if (user.allowVoucher && random() < 0.14) {
      const args = { p_order_id: orderId, p_code: chooseVoucherCode(hold.subtotal_amount, random) };
      // Voucher hỏng (hết lượt/không đủ điều kiện) không chặn đơn: bỏ qua, đơn vẫn chốt không voucher.
      if (user.jwt) await http.rpcAsUser('apply_voucher', args, user.jwt);
      else await http.rpcAsService('apply_voucher', args);
    }

    const totals = await http.getOrderTotals(orderId);
    const amount = totals.data?.[0]?.total_amount;
    const confirmed = await http.rpcAsService('confirm_paid', {
      p_order_id: orderId,
      p_amount: amount,
      p_transaction_ref: `${MARKER_PREFIX}${runTag}-${sequence}`,
    });
    if (!confirmed.ok || confirmed.data?.success !== true) {
      return { error: `CONFIRM ${confirmed.status} ${JSON.stringify(confirmed.data)}`, orderId };
    }
    seatIds.forEach((id) => showtime.occupied.add(id));
    return { orderId, seatCount: seatIds.length, amount };
  }
  return { error: 'RETRY_EXHAUSTED' };
}

function backdateOrders(sql, rows) {
  if (rows.length === 0) return;
  const values = rows
    .map((row) => `('${row.orderId}'::uuid, '${row.createdAt.toISOString()}'::timestamptz, '${row.paidAt.toISOString()}'::timestamptz)`)
    .join(',');
  sql(`
begin;
-- Chỉ DB local: bỏ qua trigger (set_updated_at/guard/audit) để ghi đè mốc thời gian lịch sử.
set local session_replication_role = replica;
create temp table _bd (order_id uuid, c timestamptz, p timestamptz) on commit drop;
insert into _bd values ${values};
update public.orders o set created_at = b.c, updated_at = b.p, hold_expires_at = b.c + interval '10 minutes',
  consent_at = coalesce(o.consent_at, b.c + interval '30 seconds'), age_confirmed = true
  from _bd b where o.id = b.order_id;
update public.order_seats os set created_at = b.c from _bd b where os.order_id = b.order_id;
update public.showtime_seat_states s set created_at = b.c, updated_at = b.p from _bd b where s.order_id = b.order_id;
update public.tickets t set created_at = b.p from _bd b where t.order_id = b.order_id;
update public.payments y set created_at = b.c + interval '20 seconds', paid_at = b.p, updated_at = b.p,
  payment_link_id = coalesce(y.payment_link_id, 'demo-payos-' || y.order_code)
  from _bd b where y.order_id = b.order_id;
update public.voucher_redemptions v set created_at = b.c + interval '10 seconds', updated_at = b.p
  from _bd b where v.order_id = b.order_id;
update public.email_outbox e set created_at = b.p
  from _bd b where e.payload->>'order_id' = b.order_id::text and e.kind = 'TICKET_ISSUED';
commit;`);
}

const RECENT_WINDOW_SQL = "interval '15 minutes'";

/** Đếm đơn demo theo ngày VN (offset so với hôm nay). `onlyOlderThanRecent`: bỏ các đơn mới tạo (chưa lùi ngày). */
function existingDayCounts(sql, nowMs, { onlyOlderThanRecent = false } = {}) {
  const recentFilter = onlyOlderThanRecent ? `and o.created_at <= now() - ${RECENT_WINDOW_SQL}` : '';
  const output = sql(`
select d || ' ' || n
  from (
    select (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date::text as d, count(*) as n
      from public.orders o
     where exists (select 1 from public.payments p where p.order_id = o.id and p.transaction_ref like '${MARKER_PREFIX}%')
       ${recentFilter}
     group by 1
  ) t;`);
  const counts = new Map();
  for (const line of output.split('\n').filter(Boolean)) {
    const [dateText, count] = line.split(' ');
    counts.set(vnDayOffsetOf(dateText, nowMs), Number(count));
  }
  return counts;
}

/** Chọn ngày đang ít đơn nhất (hoà thì ngẫu nhiên) -> phân bố đều. Ném lỗi nếu hết ngày hợp lệ. */
function chooseDayAndTime(dayCounts, days, random, nowMs) {
  for (let guard = 0; guard <= days; guard += 1) {
    const eligible = [...dayCounts].filter(([day]) => day < days);
    const least = Math.min(...eligible.map(([, count]) => count));
    if (least === Number.MAX_SAFE_INTEGER) break;
    const candidates = eligible.filter(([, count]) => count === least).map(([day]) => day);
    const dayOffset = candidates[Math.floor(random() * candidates.length)];
    const createdAt = randomCreatedAt(dayOffset, random, nowMs);
    if (createdAt) return { dayOffset, createdAt };
    dayCounts.set(dayOffset, Number.MAX_SAFE_INTEGER); // hôm nay còn quá sớm (trước ~08:10 giờ VN)
  }
  throw new Error('Không còn ngày nào hợp lệ để rải đơn (tăng --days).');
}

function paidAtAfter(createdAt, random) {
  return new Date(createdAt.getTime() + (60 + Math.floor(random() * 300)) * 1000);
}

/**
 * Tự sửa: đơn demo mang created_at trong ~15 phút gần đây (= chưa lùi ngày, do lần chạy trước bị ngắt) được lùi
 * theo cùng logic phân bố ngày. Chạy trước khi tạo thêm để đếm ngày không bị lệch.
 */
function healUnbackdatedOrders(sql, options, random, nowMs) {
  const ids = sql(`
select o.id from public.orders o
 where o.created_at > now() - ${RECENT_WINDOW_SQL}
   and exists (select 1 from public.payments p where p.order_id = o.id and p.transaction_ref like '${MARKER_PREFIX}%');`)
    .split('\n')
    .filter(Boolean);
  if (ids.length === 0) return;
  const dayCounts = existingDayCounts(sql, nowMs, { onlyOlderThanRecent: true });
  for (let day = 0; day < options.days; day += 1) if (!dayCounts.has(day)) dayCounts.set(day, 0);
  const rows = ids.map((orderId) => {
    const { dayOffset, createdAt } = chooseDayAndTime(dayCounts, options.days, random, nowMs);
    dayCounts.set(dayOffset, dayCounts.get(dayOffset) + 1);
    return { orderId, createdAt, paidAt: paidAtAfter(createdAt, random) };
  });
  backdateOrders(sql, rows);
  console.log(`Đã lùi ngày ${rows.length} đơn demo còn mang mốc hôm nay (lần chạy trước bị ngắt).`);
}

function printSummary(sql) {
  const row = sql(`
select json_build_object(
  'orders', count(*), 'tickets', coalesce(sum(t.n), 0), 'revenue', coalesce(sum(o.total_amount), 0),
  'customers', count(distinct o.user_id),
  'first', min(o.created_at at time zone 'Asia/Ho_Chi_Minh')::date, 'last', max(o.created_at at time zone 'Asia/Ho_Chi_Minh')::date)
  from public.orders o
  left join lateral (select count(*) n from public.tickets t where t.order_id = o.id) t on true
 where o.status = 'paid'
   and exists (select 1 from public.payments p where p.order_id = o.id and p.transaction_ref like '${MARKER_PREFIX}%');`);
  console.log(`Tổng đơn demo hiện có: ${row}`);
}

function printTally(tracker) {
  const lines = [...tracker.tally].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, n]) => `    ${n} x ${reason}`);
  if (lines.length > 0) console.log(`  Thống kê lỗi (${tracker.total}):\n${lines.join('\n')}`);
}

function countBy(items, keyOf) {
  const map = new Map();
  for (const item of items) map.set(keyOf(item), (map.get(keyOf(item)) ?? 0) + 1);
  return map;
}

/** --dry-run: mô phỏng toàn bộ vòng chọn suất/ghế trong bộ nhớ trên pool đọc từ DB. Chỉ SELECT, không gọi RPC, không ghi. */
function dryRun(sql, options) {
  const existing = Number(sql(`select count(distinct order_id) from public.payments where transaction_ref like '${MARKER_PREFIX}%';`));
  const need = Math.max(options.count - existing, 0);
  const showtimes = loadPool(sql);
  const rooms = new Set(showtimes.map((showtime) => showtime.roomId));
  const capacities = countBy(showtimes, (showtime) => showtime.capacity);
  const atCapAlready = showtimes.filter((showtime) => showtime.occupied.size >= showtime.capacity * MAX_FILL_RATIO).length;
  console.log(`[dry-run] suất đủ điều kiện: ${showtimes.length}; phòng: ${rooms.size}; capacity NORMAL/VIP -> số suất: ${JSON.stringify([...capacities])}`);
  console.log(`[dry-run] đã có ${existing} đơn demo; suất đã chạm trần lấp đầy ${MAX_FILL_RATIO * 100}% sẵn: ${atCapAlready}; cần mô phỏng thêm: ${need}`);

  const random = mulberry32(options.seed ?? 20261116 + existing);
  const tracker = createFailureTracker(Number.MAX_SAFE_INTEGER);
  const placedByCount = new Map();
  const placedByShowtime = new Map();
  let placed = 0;
  for (let n = 0; n < need; n += 1) {
    const seatCount = randomSeatCount(random);
    const picked = pickShowtimeAndSeats(showtimes, seatCount, random, MAX_FILL_RATIO);
    if (picked.reason) {
      tracker.failure(`${picked.reason}:count=${seatCount}`);
      continue;
    }
    picked.seatIds.forEach((id) => picked.showtime.occupied.add(id));
    placed += 1;
    placedByCount.set(seatCount, (placedByCount.get(seatCount) ?? 0) + 1);
    placedByShowtime.set(picked.showtime.id, (placedByShowtime.get(picked.showtime.id) ?? 0) + 1);
  }
  const usedShowtimes = showtimes.filter((showtime) => placedByShowtime.has(showtime.id));
  const perRoom = countBy(usedShowtimes, (showtime) => showtime.roomId);
  const fills = showtimes.map((showtime) => Math.round((showtime.occupied.size / showtime.capacity) * 100));
  console.log(`[dry-run] xếp được ${placed}/${need} đơn; số suất được dùng: ${usedShowtimes.length}; số phòng được dùng: ${perRoom.size}`);
  console.log(`[dry-run] phân bố số ghế/đơn: ${JSON.stringify([...placedByCount].sort())}`);
  console.log(`[dry-run] lấp đầy sau mô phỏng (%): max ${Math.max(...fills)}, trung bình ${Math.round(fills.reduce((a, b) => a + b, 0) / fills.length)}`);
  printTally(tracker);
}

// ---------------------------------------------------------------- main

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbUrl = assertLocalDbUrl(process.env.SEED_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  const sql = makeSqlRunner(dbUrl);

  if (options.reset) {
    resetDemoOrders(sql);
    return;
  }
  if (options.dryRun) {
    dryRun(sql, options);
    return;
  }

  const keys = readLocalKeys();
  keys.API_URL = assertLocalHttpUrl(keys.API_URL);
  const http = makeHttp(keys);

  const nowMs = Date.now();
  healUnbackdatedOrders(sql, options, mulberry32((options.seed ?? 20261116) + 7), nowMs);

  const existing = Number(sql(`select count(distinct order_id) from public.payments where transaction_ref like '${MARKER_PREFIX}%';`));
  const missing = options.count - existing;
  console.log(`Đơn demo hiện có: ${existing}; mục tiêu: ${options.count}; cần tạo thêm: ${Math.max(missing, 0)}`);
  if (missing <= 0) {
    printSummary(sql);
    return;
  }

  console.log('Chuẩn bị khách demo...');
  const users = await ensureDemoUsers(http, sql, options.users);
  await attachUserTokens(http, users);
  const showtimes = loadPool(sql);
  console.log(`Suất chiếu đủ điều kiện: ${showtimes.length}`);

  const random = mulberry32(options.seed ?? 20261116 + existing);
  const runTag = nowMs.toString(36);
  const dayCounts = existingDayCounts(sql, nowMs);
  for (let day = 0; day < options.days; day += 1) if (!dayCounts.has(day)) dayCounts.set(day, 0);

  let interrupted = false;
  process.on('SIGINT', () => {
    interrupted = true; // vòng lặp dừng ở ranh giới đơn kế tiếp; finally lùi ngày các đơn đã tạo
    console.log('\nNhận Ctrl+C: hoàn tất đơn hiện tại rồi lùi ngày các đơn đã tạo...');
  });

  const tracker = createFailureTracker(MAX_CONSECUTIVE_FAILURES);
  let pendingBackdate = [];
  let created = 0;
  try {
    for (let sequence = 0; sequence < missing && !interrupted; sequence += 1) {
      const { dayOffset, createdAt } = chooseDayAndTime(dayCounts, options.days, random, nowMs);
      const result = await placeOneOrder({ http, users, showtimes, random, sequence: existing + sequence, runTag });
      if (result.error) {
        if (tracker.failure(result.error.slice(0, 120))) {
          throw new Error(`Dừng: ${tracker.streak} lỗi liên tiếp. Gần nhất: ${result.error}`);
        }
        continue;
      }
      tracker.success();
      dayCounts.set(dayOffset, dayCounts.get(dayOffset) + 1);
      pendingBackdate.push({ orderId: result.orderId, createdAt, paidAt: paidAtAfter(createdAt, random) });
      created += 1;
      if (pendingBackdate.length >= BACKDATE_BATCH) {
        backdateOrders(sql, pendingBackdate);
        pendingBackdate = [];
        console.log(`  ... ${created}/${missing}`);
      }
    }
  } finally {
    // Luôn lùi ngày các đơn đã tạo, kể cả khi dừng vì lỗi/Ctrl+C (không để đơn mang mốc hôm nay).
    backdateOrders(sql, pendingBackdate);
    console.log(`Đã tạo ${created} đơn demo trong lần chạy này.`);
    printTally(tracker);
    printSummary(sql);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
