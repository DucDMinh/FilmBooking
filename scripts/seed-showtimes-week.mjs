// Seed suất chiếu cho N ngày tới (mặc định 7) vào DB LOCAL, để trang khách luôn có lịch chiếu.
// Khác seed.sql §8.2 (3 phim cố định, mốc ngày của lần seed đầu): script này tính từ HÔM NAY (giờ VN), xoay vòng
// mọi phim PUBLISHED đã phát hành, 4 khung giờ/ngày, chạy lại bao nhiêu lần cũng được (id suất cố định theo phòng + giờ,
// bỏ qua suất trùng/chồng giờ trong phòng).
//
//   node scripts/seed-showtimes-week.mjs                # 7 ngày tới, từ hôm nay
//   node scripts/seed-showtimes-week.mjs --days 14      # số ngày khác (1..30)
//   node scripts/seed-showtimes-week.mjs --dry-run      # chỉ đếm số suất sẽ thêm, không ghi
//
// Chỉ chạy với DB loopback (cùng guard với seed demo). Không có psql thì dùng `docker exec` vào container DB local.
import { spawnSync } from 'node:child_process';
import { assertLocalDbUrl, sanitizedPsqlEnv } from './seed-demo-guard.mjs';

function parseArgs(argv) {
  const options = { days: 7, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--days') options.days = Number(argv[++i]);
    else throw new Error(`Tham số không hợp lệ: ${arg}`);
  }
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 30) {
    throw new Error('--days phải là số nguyên từ 1 đến 30.');
  }
  return options;
}

function makeSqlRunner(dbUrl) {
  const hasPsql = spawnSync('psql', ['--version'], { stdio: 'ignore' }).status === 0;
  const container = process.env.SEED_DB_CONTAINER ?? 'supabase_db_filmbooking';
  const common = ['-X', '-v', 'ON_ERROR_STOP=1', '-At'];
  const [cmd, args] = hasPsql
    ? ['psql', [dbUrl, ...common]]
    : ['docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', ...common]];
  return (sql) => {
    const result = spawnSync(cmd, args, { input: sql, encoding: 'utf8', env: sanitizedPsqlEnv(process.env) });
    if (result.error) throw new Error(`Không chạy được ${cmd}: ${result.error.message}`);
    if (result.status !== 0) throw new Error(result.stderr || `psql thoát với mã ${result.status}`);
    return result.stdout.trim();
  };
}

/** Các ứng viên suất (phòng x ngày x khung giờ) chưa chồng giờ với suất đang bán trong cùng phòng. */
function candidatesSql(days) {
  return `
with today as (select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d),
rooms_t as (
  select r.id as room_id, r.cinema_id, r.supported_formats,
         row_number() over (order by r.id) as rn
  from public.rooms r
  join public.cinemas c on c.id = r.cinema_id
  where r.id::text like '30000000-0000-0000-0000-%'   -- chỉ phòng seed, không đụng phòng dev tạo qua UI
    and r.status = 'ACTIVE' and c.status = 'OPEN'
),
slots as (
  select 1 as slot, time '09:30' as t union all
  select 2, time '13:30' union all
  select 3, time '17:30' union all
  select 4, time '21:00'
),
cand as (
  select rt.room_id, rt.cinema_id, rt.supported_formats, rt.rn, gs.day_offset, s.slot,
         (((select d from today) + gs.day_offset) + s.t) at time zone 'Asia/Ho_Chi_Minh' as starts_at,
         ((select d from today) + gs.day_offset) as show_date
  from rooms_t rt
  cross join generate_series(0, ${days - 1}) as gs(day_offset)
  cross join slots s
),
picked as (
  select c.*, m.id as movie_id, m.duration_minutes, m.original_language, m.age_rating,
         coalesce(array_length(m.dubbed_languages, 1), 0) > 0 as has_dub
  from cand c
  cross join lateral (
    -- Sáng/trưa ưu tiên phim P, K, T13; chiều tối dùng mọi phim đã phát hành. Xoay vòng theo phòng, ngày, khung giờ.
    select p.* from (
      select mv.id, mv.duration_minutes, mv.original_language, mv.age_rating, mv.dubbed_languages,
             row_number() over (order by mv.slug) as k, count(*) over () as n
      from public.movies mv
      where mv.status = 'PUBLISHED' and mv.release_date <= c.show_date
        and (c.slot >= 3 or mv.age_rating in ('P', 'K', 'T13'))
    ) p
    where p.k = 1 + ((c.rn * 3 + c.day_offset * 5 + c.slot * 7) % p.n)
  ) m
  where c.starts_at > now() + interval '30 minutes'
),
final as (
  select extensions.uuid_generate_v5(
           '00000000-0000-0000-0000-000000000000'::uuid,
           p.room_id::text || ':' || to_char(p.starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SS')
         ) as id,
         p.cinema_id, p.room_id, p.movie_id, p.starts_at,
         p.starts_at + make_interval(mins => p.duration_minutes + 15) as ends_at,
         case when '3D' = any (p.supported_formats) and ((p.rn + p.day_offset + p.slot) % 3) = 0
              then '3D'::public.screen_format else '2D'::public.screen_format end as format,
         case when p.original_language = 'vi' then 'ORIGINAL'::public.language_mode
              when p.has_dub then 'DUBBED'::public.language_mode
              else 'SUBTITLED'::public.language_mode end as language_mode
  from picked p
  where not exists (
    select 1 from public.showtimes x
    where x.room_id = p.room_id and x.status <> 'CANCELLED'
      and tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(p.starts_at, p.starts_at + make_interval(mins => p.duration_minutes + 15), '[)')
  )
)`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbUrl = assertLocalDbUrl(process.env.SEED_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  const sql = makeSqlRunner(dbUrl);
  const cte = candidatesSql(options.days);

  const toAdd = Number(sql(`${cte} select count(*) from final;`));
  console.log(`Suất sẽ thêm cho ${options.days} ngày tới: ${toAdd}`);
  if (options.dryRun) return;

  const inserted = sql(`${cte}
    , ins as (
      insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, ends_at, format, language_mode, status)
      select id, cinema_id, room_id, movie_id, starts_at, ends_at, format, language_mode, 'ON_SALE' from final
      on conflict (id) do nothing
      returning 1
    ) select count(*) from ins;`);
  console.log(`Đã thêm: ${inserted} suất.`);
  console.log(
    sql(`select d || ' | ' || n || ' suất | ' || movies || ' phim' from (
           select (starts_at at time zone 'Asia/Ho_Chi_Minh')::date as d, count(*) as n, count(distinct movie_id) as movies
           from public.showtimes
           where status = 'ON_SALE' and starts_at > now() and starts_at < now() + interval '${options.days + 1} days'
           group by 1
         ) t order by d;`),
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
