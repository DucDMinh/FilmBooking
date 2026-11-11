-- Layer 2 / task 01: danh mục phim & lịch chiếu.
-- movies, rooms, seats, showtimes (chống chồng giờ), showtime_seat_locks + bucket storage & policy.
--
-- Chỉ thêm đối tượng mới (CREATE / INSERT bucket) -> additive, KHÔNG phải HIGH_RISK_MIGRATION:
-- không DROP, không đổi kiểu cột, không backfill dữ liệu cũ.
--
-- Phân quyền (SPECIFICATIONS §5.3, R-41, R-47, R-55):
--   movies           : công khai đọc phim PUBLISHED; chỉ Admin ghi (Manager không quản lý phim).
--   rooms/seats/
--   showtimes/locks  : công khai đọc; Admin ghi mọi rạp, Manager chỉ ghi dữ liệu rạp mình
--                      (has_cinema_role). Staff không ghi.
-- Mọi bảng bật RLS + GRANT thu hẹp + audit trigger (R-107). Service role bypass RLS.
-- Các hàm trigger ở đây KHÔNG gọi được từ client (revoke execute) nên không cần tự kiểm quyền;
-- quyền do RLS của bảng quyết định.

-- ============================================================================
-- 1. Kiểu dữ liệu
-- ============================================================================
create type public.movie_status     as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');
-- R-42: tập nhãn cố định
create type public.movie_age_rating as enum ('P', 'K', 'T13', 'T16', 'T18');
create type public.screen_format    as enum ('2D', '3D');
-- R-47: hoạt động / bảo trì
create type public.room_status      as enum ('ACTIVE', 'MAINTENANCE');
-- R-48: Sweetbox chiếm 2 ô; AISLE = lối đi; BROKEN = ghế hỏng/khoá cố định
create type public.seat_type        as enum ('NORMAL', 'VIP', 'SWEETBOX', 'AISLE', 'BROKEN');
create type public.showtime_status  as enum ('ON_SALE', 'CLOSED', 'CANCELLED');
-- R-49: ngôn ngữ suất chiếu (phụ đề / lồng tiếng / bản gốc)
create type public.language_mode    as enum ('SUBTITLED', 'DUBBED', 'ORIGINAL');
-- R-55: lý do khoá (không chứa dữ liệu nhạy cảm, hiển thị công khai trạng thái "Khoá")
create type public.lock_reason      as enum ('GUEST', 'BROKEN_EQUIPMENT', 'OTHER');

-- ============================================================================
-- 2. Bảng
-- ============================================================================

-- 2.1 movies (R-41, R-42, R-45)
create table public.movies (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_vi          text not null check (length(btrim(title_vi)) > 0),
  title_original    text,
  poster_url        text,
  banner_url        text,
  trailer_url       text,
  description       text,
  genres            text[] not null default '{}',
  duration_minutes  integer not null check (duration_minutes between 1 and 600),
  director          text,
  cast_members      text[] not null default '{}',
  country           text,
  original_language text,
  subtitle_languages text[] not null default '{}',
  dubbed_languages  text[] not null default '{}',
  release_date      date not null,
  age_rating        public.movie_age_rating not null,
  status            public.movie_status not null default 'DRAFT',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index movies_status_release_idx on public.movies (status, release_date);
create trigger movies_set_updated_at before update on public.movies
  for each row execute function public.set_updated_at();

-- 2.2 rooms (R-47): thuộc đúng 1 rạp. grid_rows/grid_cols = kích thước lưới sơ đồ ghế.
create table public.rooms (
  id                uuid primary key default gen_random_uuid(),
  cinema_id         uuid not null references public.cinemas (id) on delete cascade,
  name              text not null check (length(btrim(name)) > 0),
  supported_formats public.screen_format[] not null default array['2D']::public.screen_format[]
                    check (cardinality(supported_formats) > 0),
  status            public.room_status not null default 'ACTIVE',
  grid_rows         smallint not null default 10 check (grid_rows between 1 and 26),
  grid_cols         smallint not null default 12 check (grid_cols between 1 and 60),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (cinema_id, name),
  -- đích của FK ghép: bảng con chứng minh phòng thuộc đúng rạp
  unique (id, cinema_id)
);
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- 2.3 seats (R-48): mỗi dòng = 1 ghế/ô đặt tại (row_label, col_number). SWEETBOX chiếm col_number
-- và col_number+1 (col_span = 2). Exclusion theo dải cột chặn mọi ghế chồng ô trong 1 phòng.
create table public.seats (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null,
  cinema_id  uuid not null,
  row_label  text not null check (row_label ~ '^[A-Z]$'),
  col_number smallint not null check (col_number >= 1),
  seat_type  public.seat_type not null default 'NORMAL',
  col_span   smallint generated always as (case when seat_type = 'SWEETBOX' then 2 else 1 end) stored,
  label      text check (label is null or length(btrim(label)) > 0),
  created_at timestamptz not null default now(),
  foreign key (room_id, cinema_id) references public.rooms (id, cinema_id) on delete cascade,
  unique (id, room_id),
  exclude using gist (
    room_id with =,
    row_label with =,
    int4range(col_number, col_number + col_span) with &&
  )
);
create unique index seats_room_label_key on public.seats (room_id, label) where label is not null;
create index seats_cinema_id_idx on public.seats (cinema_id);

-- 2.4 showtimes (R-49, R-50): ends_at = starts_at + thời lượng phim + dọn phòng (trigger tính, client
-- không đặt được). Exclusion chặn chồng giờ cùng phòng; suất CANCELLED nhả phòng.
-- Trigger bảo vệ suất đã bán vé (R-54) làm ở layer 3 vì cần bảng đơn.
create table public.showtimes (
  id            uuid primary key default gen_random_uuid(),
  cinema_id     uuid not null,
  room_id       uuid not null,
  movie_id      uuid not null references public.movies (id),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  format        public.screen_format not null,
  language_mode public.language_mode not null default 'SUBTITLED',
  status        public.showtime_status not null default 'ON_SALE',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (room_id, cinema_id) references public.rooms (id, cinema_id),
  unique (id, room_id),
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'CANCELLED')
);
create index showtimes_cinema_starts_idx on public.showtimes (cinema_id, starts_at);
create index showtimes_movie_starts_idx on public.showtimes (movie_id, starts_at);
create trigger showtimes_set_updated_at before update on public.showtimes
  for each row execute function public.set_updated_at();

-- 2.5 showtime_seat_locks (R-55): Manager khoá ghế cho 1 suất. room_id/cinema_id do trigger điền từ suất.
-- locked_by không mở cho client đọc (xem GRANT): truy vết người khoá qua audit_logs.
create table public.showtime_seat_locks (
  id          uuid primary key default gen_random_uuid(),
  showtime_id uuid not null references public.showtimes (id) on delete cascade,
  seat_id     uuid not null,
  room_id     uuid not null,
  cinema_id   uuid not null references public.cinemas (id) on delete cascade,
  reason      public.lock_reason not null default 'OTHER',
  locked_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (showtime_id, seat_id),
  foreign key (seat_id, room_id) references public.seats (id, room_id) on delete cascade
);
create index showtime_seat_locks_seat_idx on public.showtime_seat_locks (seat_id, room_id);
create index showtime_seat_locks_cinema_idx on public.showtime_seat_locks (cinema_id);

-- ============================================================================
-- 3. Hàm trigger nghiệp vụ
-- ============================================================================

-- 3.1 Ghế phải nằm trong lưới phòng (Sweetbox tính cả ô thứ 2; col_span generated chưa có ở BEFORE trigger).
create function public.seats_check_in_grid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows smallint;
  v_cols smallint;
begin
  select r.grid_rows, r.grid_cols into v_rows, v_cols from public.rooms r where r.id = new.room_id;
  if v_rows is null then
    return new; -- FK ghép sẽ báo lỗi phòng không tồn tại
  end if;
  if ascii(new.row_label) - 64 > v_rows or new.col_number + (case when new.seat_type = 'SWEETBOX' then 2 else 1 end) - 1 > v_cols then
    raise exception 'Ghế % % nằm ngoài lưới phòng (% hàng x % cột)', new.row_label, new.col_number, v_rows, v_cols
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.seats_check_in_grid() from public, anon, authenticated;
create trigger seats_check_in_grid before insert or update of room_id, row_label, col_number, seat_type on public.seats
  for each row execute function public.seats_check_in_grid();

-- 3.2 Tính giờ kết thúc suất (R-49): + thời lượng phim + dọn phòng (rạp override › mặc định chuỗi › 15).
-- Kiểm định dạng suất nằm trong định dạng phòng hỗ trợ; phòng bảo trì không nhận suất mới.
create function public.showtimes_derive_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration integer;
  v_formats  public.screen_format[];
  v_room_st  public.room_status;
  v_movie_st public.movie_status;
  v_cleaning integer;
begin
  select m.duration_minutes, m.status into v_duration, v_movie_st from public.movies m where m.id = new.movie_id;
  select r.supported_formats, r.status into v_formats, v_room_st from public.rooms r where r.id = new.room_id;
  if v_duration is null or v_formats is null then
    raise exception 'Phim hoặc phòng chiếu không tồn tại' using errcode = '23503';
  end if;
  -- Chỉ chặn khi tạo hoặc đổi phim/phòng; sửa giờ suất cũ của phim sau này bị archive vẫn được.
  if (case when tg_op = 'INSERT' then true else new.room_id is distinct from old.room_id end) and v_room_st <> 'ACTIVE' then
    raise exception 'Phòng đang bảo trì, không xếp suất vào phòng này' using errcode = '23514';
  end if;
  if (case when tg_op = 'INSERT' then true else new.movie_id is distinct from old.movie_id end) and v_movie_st <> 'PUBLISHED' then
    raise exception 'Chỉ xếp suất cho phim đã PUBLISHED' using errcode = '23514';
  end if;
  if not (new.format = any (v_formats)) then
    raise exception 'Phòng không hỗ trợ định dạng %', new.format using errcode = '23514';
  end if;

  select coalesce(
           c.cleaning_minutes,
           (select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'default_cleaning_minutes'),
           15)
    into v_cleaning
    from public.cinemas c where c.id = new.cinema_id;

  new.ends_at := new.starts_at + make_interval(mins => v_duration + coalesce(v_cleaning, 15));
  return new;
end;
$$;
revoke all on function public.showtimes_derive_end() from public, anon, authenticated;
create trigger showtimes_derive_end before insert or update of starts_at, movie_id, room_id, cinema_id, format
  on public.showtimes
  for each row execute function public.showtimes_derive_end();

-- 3.3 Điền room_id/cinema_id cho khoá ghế từ suất; chỉ khoá ghế bán được (không phải lối đi/ghế hỏng).
create function public.showtime_seat_locks_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.seat_type;
begin
  select st.room_id, st.cinema_id into new.room_id, new.cinema_id
    from public.showtimes st where st.id = new.showtime_id;
  if new.room_id is null then
    raise exception 'Suất chiếu không tồn tại' using errcode = '23503';
  end if;
  select s.seat_type into v_type from public.seats s where s.id = new.seat_id and s.room_id = new.room_id;
  if v_type in ('AISLE', 'BROKEN') then
    raise exception 'Không thể khoá ô loại %', v_type using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.showtime_seat_locks_fill() from public, anon, authenticated;
create trigger showtime_seat_locks_fill before insert on public.showtime_seat_locks
  for each row execute function public.showtime_seat_locks_fill();

-- ============================================================================
-- 4. Audit (R-107) — dùng audit_row_change() của layer 1
-- ============================================================================
create trigger movies_audit after insert or update or delete on public.movies
  for each row execute function public.audit_row_change();
create trigger rooms_audit after insert or update or delete on public.rooms
  for each row execute function public.audit_row_change('cinema_id');
create trigger seats_audit after insert or update or delete on public.seats
  for each row execute function public.audit_row_change('cinema_id');
create trigger showtimes_audit after insert or update or delete on public.showtimes
  for each row execute function public.audit_row_change('cinema_id');
create trigger showtime_seat_locks_audit after insert or update or delete on public.showtime_seat_locks
  for each row execute function public.audit_row_change('cinema_id');

-- ============================================================================
-- 5. RLS + GRANT (thu hẹp quyền bảng trước, policy lọc dòng sau)
-- ============================================================================
alter table public.movies              enable row level security;
alter table public.rooms               enable row level security;
alter table public.seats               enable row level security;
alter table public.showtimes           enable row level security;
alter table public.showtime_seat_locks enable row level security;

revoke all on public.movies, public.rooms, public.seats, public.showtimes, public.showtime_seat_locks
  from anon, authenticated;

-- movies: khách đọc phim PUBLISHED; Admin và nhân sự rạp (Manager chọn phim khi tạo suất) đọc cả bản nháp; chỉ Admin ghi.
-- Policy đọc tách 2 để anon không đánh giá is_admin() (đã revoke execute với anon).
grant select on public.movies to anon, authenticated;
grant insert, update, delete on public.movies to authenticated;
create policy movies_select_public on public.movies for select to anon, authenticated
  using (status = 'PUBLISHED');
create policy movies_select_staff on public.movies for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.staff_assignments sa
      where sa.user_id = (select auth.uid())
    )
  );
create policy movies_admin_insert on public.movies for insert to authenticated with check ((select public.is_admin()));
create policy movies_admin_update on public.movies for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy movies_admin_delete on public.movies for delete to authenticated using ((select public.is_admin()));

-- rooms / seats / showtimes: công khai đọc; Admin hoặc Manager của rạp ghi.
-- Mẫu điều kiện ghi: is_admin() or has_cinema_role(cinema_id, MANAGER).
grant select on public.rooms, public.seats, public.showtimes to anon, authenticated;
grant insert, update, delete on public.rooms, public.seats to authenticated;
create policy rooms_select on public.rooms for select to anon, authenticated using (true);
create policy rooms_write_insert on public.rooms for insert to authenticated
  with check ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));
create policy rooms_write_update on public.rooms for update to authenticated
  using ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  with check ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));
create policy rooms_write_delete on public.rooms for delete to authenticated
  using ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));

create policy seats_select on public.seats for select to anon, authenticated using (true);
create policy seats_write_insert on public.seats for insert to authenticated
  with check ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));
create policy seats_write_update on public.seats for update to authenticated
  using ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  with check ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));
create policy seats_write_delete on public.seats for delete to authenticated
  using ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));

-- showtimes: client không đặt ends_at (trigger tính) và không đổi cinema_id sau khi tạo.
grant insert (cinema_id, room_id, movie_id, starts_at, format, language_mode, status)
  on public.showtimes to authenticated;
grant update (room_id, movie_id, starts_at, format, language_mode, status) on public.showtimes to authenticated;
grant delete on public.showtimes to authenticated;
-- Suất chỉ hiển thị khi người xem thấy được phim (RLS movies): khách chỉ thấy phim PUBLISHED,
-- nhân sự/Admin thấy mọi suất -> phim DRAFT/ARCHIVED không lộ qua lịch chiếu.
create policy showtimes_select on public.showtimes for select to anon, authenticated
  using (exists (select 1 from public.movies m where m.id = showtimes.movie_id));
create policy showtimes_write_insert on public.showtimes for insert to authenticated
  with check ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));
create policy showtimes_write_update on public.showtimes for update to authenticated
  using ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  with check ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));
create policy showtimes_write_delete on public.showtimes for delete to authenticated
  using ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));

-- showtime_seat_locks: ghế khoá hiển thị công khai (trạng thái "Khoá") -> đọc mọi cột trừ locked_by.
-- Chỉ Admin / Manager rạp khoá và mở khoá; không sửa (xoá rồi tạo lại).
grant select (id, showtime_id, seat_id, room_id, cinema_id, reason, created_at)
  on public.showtime_seat_locks to anon, authenticated;
grant insert (showtime_id, seat_id, reason) on public.showtime_seat_locks to authenticated;
grant delete on public.showtime_seat_locks to authenticated;
create policy showtime_seat_locks_select on public.showtime_seat_locks for select to anon, authenticated
  using (exists (select 1 from public.showtimes st where st.id = showtime_seat_locks.showtime_id));
create policy showtime_seat_locks_insert on public.showtime_seat_locks for insert to authenticated
  with check ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));
create policy showtime_seat_locks_delete on public.showtime_seat_locks for delete to authenticated
  using ((select public.is_admin()) or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])));

-- ============================================================================
-- 6. Storage: bucket + policy (R-41, R-31/R-34 ảnh rạp, avatar hồ sơ)
-- Bucket public (URL ảnh hiển thị trực tiếp); policy SELECT cho phép liệt kê/tải qua API.
--   posters, banners : chỉ Admin ghi.
--   cinema-images    : Admin, hoặc Manager của rạp có id = thư mục đầu tiên của đường dẫn.
--   avatars          : mỗi user chỉ ghi trong thư mục <auth.uid()>/.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('posters',       'posters',       true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners',       'banners',       true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('cinema-images', 'cinema-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars',       'avatars',       true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- avatars KHÔNG liệt kê công khai (lộ danh sách user); ảnh vẫn phục vụ qua public URL của bucket.
create policy catalog_images_select on storage.objects for select to anon, authenticated
  using (bucket_id in ('posters', 'banners', 'cinema-images'));
create policy avatars_own_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy movie_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('posters', 'banners') and (select public.is_admin()));
create policy movie_images_admin_update on storage.objects for update to authenticated
  using (bucket_id in ('posters', 'banners') and (select public.is_admin()))
  with check (bucket_id in ('posters', 'banners') and (select public.is_admin()));
create policy movie_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('posters', 'banners') and (select public.is_admin()));

-- CASE bảo đảm chỉ ép kiểu uuid khi thư mục đầu đúng dạng uuid (SQL không đảm bảo thứ tự AND).
create policy cinema_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cinema-images'
    and (
      (select public.is_admin())
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (select public.has_cinema_role(((storage.foldername(name))[1])::uuid, array['MANAGER']::public.staff_role[]))
           else false end
    )
  );
create policy cinema_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'cinema-images'
    and (
      (select public.is_admin())
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (select public.has_cinema_role(((storage.foldername(name))[1])::uuid, array['MANAGER']::public.staff_role[]))
           else false end
    )
  )
  with check (
    bucket_id = 'cinema-images'
    and (
      (select public.is_admin())
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (select public.has_cinema_role(((storage.foldername(name))[1])::uuid, array['MANAGER']::public.staff_role[]))
           else false end
    )
  );
create policy cinema_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'cinema-images'
    and (
      (select public.is_admin())
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (select public.has_cinema_role(((storage.foldername(name))[1])::uuid, array['MANAGER']::public.staff_role[]))
           else false end
    )
  );

create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
