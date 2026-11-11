-- Layer 1 / task 03: lõi định danh & chuỗi rạp.
-- provinces, profiles (+trigger từ auth.users), user_roles, cinemas, staff_assignments,
-- app_settings, cinema_settings, consents, favorite_cinemas, audit_logs
-- + hàm RLS (is_admin, has_cinema_role) + trigger audit chung.
--
-- Chỉ thêm đối tượng mới (CREATE) -> additive, KHÔNG phải HIGH_RISK_MIGRATION:
-- không DROP, không đổi kiểu cột, không backfill dữ liệu cũ. Duy nhất 1 lần INSERT
-- cấu hình mặc định chuỗi vào app_settings (idempotent: ON CONFLICT DO NOTHING).
--
-- Mô hình phân quyền (SPECIFICATIONS §5.3, quyết định brainstorm #6):
--   Admin   = có dòng user_roles(role='ADMIN')        -> toàn chuỗi
--   Manager = staff_assignments(role='MANAGER')       -> chỉ rạp được gán
--   Staff   = staff_assignments(role='STAFF')         -> chỉ rạp được gán
--   Khách   = chỉ dữ liệu của chính mình (auth.uid())
-- Mọi bảng bật RLS; quyền truy cập bảng (GRANT) thu hẹp thêm làm lớp phòng thủ thứ hai.
-- Service role (Nest webhook/job) bypass RLS theo thiết kế Supabase.

-- ============================================================================
-- 1. Kiểu dữ liệu
-- ============================================================================
create type public.app_role      as enum ('ADMIN');
create type public.staff_role    as enum ('STAFF', 'MANAGER');
-- R-32: Đang hoạt động / Sắp khai trương / Tạm đóng / Ngừng hoạt động
create type public.cinema_status as enum ('COMING_SOON', 'OPEN', 'TEMP_CLOSED', 'CLOSED');
create type public.gender        as enum ('MALE', 'FEMALE', 'OTHER');
-- R-03: điều khoản + chính sách bảo mật lúc đăng ký; NO_REFUND_BOOKING: consent lúc thanh toán (R-132)
create type public.consent_type  as enum ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'NO_REFUND_BOOKING');

-- ============================================================================
-- 2. Hàm tiện ích chung (trigger)
-- ============================================================================
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 3. Bảng
-- ============================================================================

-- 3.1 provinces (R-35)
create table public.provinces (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name        text not null unique check (length(btrim(name)) > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 3.2 profiles (R-26, R-30, R-35): 1-1 với auth.users, tự sinh bằng trigger.
-- email nullable: tài khoản Facebook có thể chưa có email (quyết định #18).
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            extensions.citext unique,
  full_name        text,
  phone            text,
  date_of_birth    date,
  gender           public.gender,
  avatar_url       text,
  marketing_opt_in boolean not null default false,
  province_id      uuid references public.provinces (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_province_id_idx on public.profiles (province_id);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 3.3 user_roles: vai trò toàn cục (chỉ ADMIN). Staff/Manager nằm ở staff_assignments.
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- 3.4 cinemas (R-32, R-38, R-56): thêm rạp mới = INSERT một dòng, không đụng code.
-- cleaning_minutes / online_cutoff_minutes NULL = dùng mặc định chuỗi (app_settings).
create table public.cinemas (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^[A-Z0-9]{2,10}$'),
  name                  text not null check (length(btrim(name)) > 0),
  province_id           uuid not null references public.provinces (id),
  district              text,
  address               text not null check (length(btrim(address)) > 0),
  latitude              numeric(9, 6) check (latitude between -90 and 90),
  longitude             numeric(9, 6) check (longitude between -180 and 180),
  hotline               text,
  email                 extensions.citext,
  opening_hours         text,
  image_url             text,
  amenities             text[] not null default '{}',
  status                public.cinema_status not null default 'OPEN',
  cleaning_minutes      integer check (cleaning_minutes between 0 and 240),
  online_cutoff_minutes integer check (online_cutoff_minutes between 0 and 1440),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index cinemas_province_id_idx on public.cinemas (province_id);
create trigger cinemas_set_updated_at before update on public.cinemas
  for each row execute function public.set_updated_at();

-- 3.5 staff_assignments (R-39): user <-> rạp <-> vai trò. Nền của mọi RLS theo rạp.
create table public.staff_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  cinema_id   uuid not null references public.cinemas (id) on delete cascade,
  role        public.staff_role not null,
  -- Mặc định = người thực hiện; client không được tự đặt (xem column grant ở mục 9).
  assigned_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, cinema_id)
);
create index staff_assignments_cinema_id_idx on public.staff_assignments (cinema_id);

-- 3.6 app_settings (R-106): cấu hình toàn chuỗi dạng key/value. KHÔNG lưu secret ở đây (đọc công khai).
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- 3.7 cinema_settings (R-56): override một key của app_settings cho riêng 1 rạp.
create table public.cinema_settings (
  cinema_id  uuid not null references public.cinemas (id) on delete cascade,
  key        text not null references public.app_settings (key) on update cascade on delete cascade,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (cinema_id, key)
);
create trigger cinema_settings_set_updated_at before update on public.cinema_settings
  for each row execute function public.set_updated_at();

-- 3.8 consents (R-03): bằng chứng đồng ý, bất biến (chỉ INSERT).
create table public.consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  consent_type public.consent_type not null,
  version      text not null check (length(btrim(version)) > 0),
  accepted_at  timestamptz not null default now(),
  metadata     jsonb not null default '{}'::jsonb
);
create index consents_user_id_idx on public.consents (user_id, consent_type, accepted_at desc);

-- 3.9 favorite_cinemas (R-31)
create table public.favorite_cinemas (
  user_id    uuid not null references auth.users (id) on delete cascade,
  cinema_id  uuid not null references public.cinemas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, cinema_id)
);
create index favorite_cinemas_cinema_id_idx on public.favorite_cinemas (cinema_id);

-- 3.10 audit_logs (R-107): append-only. Không FK để log sống lâu hơn dữ liệu bị xoá.
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  cinema_id   uuid,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before_data jsonb,
  after_data  jsonb
);
create index audit_logs_cinema_time_idx on public.audit_logs (cinema_id, occurred_at desc);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);

-- ============================================================================
-- 4. Hàm RLS helper
-- SECURITY DEFINER + search_path rỗng: đọc user_roles/staff_assignments bằng quyền owner
-- (bypass RLS) để policy trên chính các bảng đó không bị đệ quy. Chỉ tin auth.uid().
-- ============================================================================
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'ADMIN'
  );
$$;

-- Thuần theo staff_assignments: KHÔNG tự trả true cho Admin. Policy cần "Admin hoặc Manager rạp"
-- viết tường minh: is_admin() or has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[]).
create function public.has_cinema_role(p_cinema_id uuid, p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_assignments sa
    where sa.user_id = (select auth.uid())
      and sa.cinema_id = p_cinema_id
      and sa.role = any (p_roles)
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.has_cinema_role(uuid, public.staff_role[]) from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.has_cinema_role(uuid, public.staff_role[]) to authenticated, service_role;

-- ============================================================================
-- 5. Trigger tạo profile từ auth.users
-- ============================================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Giữ email profile đồng bộ khi auth đổi/xác nhận email (identity linking, R-18..R-25).
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ============================================================================
-- 6. Audit trigger chung (R-107): ai, rạp nào, khi nào, đối tượng, trước/sau.
-- Tham số TG_ARGV[0] = tên cột chứa cinema_id ('id' cho cinemas, 'cinema_id' cho bảng con);
-- bỏ trống nếu bảng không thuộc rạp nào (cinema_id = NULL).
-- Dùng AFTER ... FOR EACH ROW: 1 thao tác ghi 1 dòng đúng 1 dòng audit.
-- ============================================================================
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after    jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row      jsonb := coalesce(v_after, v_before);
  v_cinema   uuid;
  v_record   text;
begin
  if tg_nargs > 0 then
    v_cinema := nullif(v_row ->> tg_argv[0], '')::uuid;
  end if;
  -- Khoá chính: cột 'id' nếu có, ngược lại ghép user_id/cinema_id/key (bảng khoá kép).
  v_record := coalesce(
    v_row ->> 'id',
    concat_ws(':', v_row ->> 'user_id', v_row ->> 'role', v_row ->> 'cinema_id', v_row ->> 'key')
  );

  insert into public.audit_logs (actor_id, cinema_id, table_name, record_id, action, before_data, after_data)
  values ((select auth.uid()), v_cinema, tg_table_name, v_record, tg_op, v_before, v_after);

  return null;
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

create trigger provinces_audit after insert or update or delete on public.provinces
  for each row execute function public.audit_row_change();
create trigger cinemas_audit after insert or update or delete on public.cinemas
  for each row execute function public.audit_row_change('id');
create trigger cinema_settings_audit after insert or update or delete on public.cinema_settings
  for each row execute function public.audit_row_change('cinema_id');
create trigger staff_assignments_audit after insert or update or delete on public.staff_assignments
  for each row execute function public.audit_row_change('cinema_id');
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

-- ============================================================================
-- 7. Guard: Manager chỉ sửa "thông tin rạp" (§5.3) -> không đổi mã rạp / trạng thái mở-đóng.
-- RLS không giới hạn được theo cột nên dùng trigger. Caller tin cậy nhận diện theo ROLE thực thi
-- (service_role / owner / job bỏ qua), KHÔNG theo auth.uid() null: hàm này SECURITY INVOKER nên
-- current_user vẫn là anon/authenticated khi đi qua PostgREST và không thể bị lách bằng cách xoá claims.
-- ============================================================================
create function public.cinemas_guard_manager_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and not public.is_admin()
     and (new.code is distinct from old.code or new.status is distinct from old.status) then
    raise exception 'Chỉ Admin được đổi mã rạp hoặc trạng thái rạp'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.cinemas_guard_manager_columns() from public, anon, authenticated;

create trigger cinemas_guard_manager_columns before update on public.cinemas
  for each row execute function public.cinemas_guard_manager_columns();

-- ============================================================================
-- 8. Cấu hình mặc định chuỗi (R-106, quyết định #12). Idempotent, không ghi đè giá trị Admin đã sửa.
-- ============================================================================
insert into public.app_settings (key, value, description) values
  ('seat_hold_minutes_web',        '10'::jsonb, 'Thời gian giữ ghế kênh web (phút) - mặc định 10, Admin cấu hình (R-106, #12)'),
  ('default_cleaning_minutes',     '15'::jsonb, 'Thời gian dọn phòng mặc định giữa 2 suất (phút) - rạp có thể override (R-49, R-56)'),
  ('default_online_cutoff_minutes','15'::jsonb, 'Đóng bán online trước giờ chiếu (phút) - rạp có thể override (R-67, R-56)'),
  ('no_refund_warning',            to_jsonb('Vé đã thanh toán không thể huỷ, đổi hoặc hoàn tiền. Vui lòng kiểm tra kỹ suất chiếu, ghế và rạp trước khi thanh toán.'::text), 'Nội dung cảnh báo không hoàn tiền (R-106, R-131)'),
  ('terms_version',                to_jsonb('1.0'::text), 'Phiên bản Điều khoản sử dụng / Chính sách bảo mật hiện hành (R-03, R-106)')
on conflict (key) do nothing;

-- ============================================================================
-- 9. RLS + GRANT (mặc định từ chối; thu hẹp quyền bảng trước, policy lọc dòng sau)
-- ============================================================================
alter table public.provinces         enable row level security;
alter table public.profiles          enable row level security;
alter table public.user_roles        enable row level security;
alter table public.cinemas           enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.app_settings      enable row level security;
alter table public.cinema_settings   enable row level security;
alter table public.consents          enable row level security;
alter table public.favorite_cinemas  enable row level security;
alter table public.audit_logs        enable row level security;

revoke all on public.provinces, public.profiles, public.user_roles, public.cinemas,
              public.staff_assignments, public.app_settings, public.cinema_settings,
              public.consents, public.favorite_cinemas, public.audit_logs
  from anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from anon, authenticated;

-- provinces: ai cũng đọc được; Admin ghi.
grant select on public.provinces to anon, authenticated;
grant insert, update, delete on public.provinces to authenticated;
create policy provinces_select on public.provinces for select to anon, authenticated using (true);
create policy provinces_admin_insert on public.provinces for insert to authenticated with check ((select public.is_admin()));
create policy provinces_admin_update on public.provinces for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy provinces_admin_delete on public.provinces for delete to authenticated using ((select public.is_admin()));

-- profiles: khách đọc/sửa hồ sơ của mình (chỉ các cột hồ sơ; không đổi id/email).
-- Admin đọc tất cả (quản lý người dùng R-105); Manager đọc hồ sơ nhân sự thuộc rạp mình.
-- INSERT/DELETE do trigger auth + cascade, không mở cho client.
grant select on public.profiles to authenticated;
grant update (full_name, phone, date_of_birth, gender, avatar_url, marketing_opt_in, province_id)
  on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.staff_assignments sa
      where sa.user_id = profiles.id
        and (select public.has_cinema_role(sa.cinema_id, array['MANAGER']::public.staff_role[]))
    )
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles: xem vai trò của mình; chỉ Admin xem tất cả và gán/bỏ vai trò (R-17, R-105).
grant select, insert, delete on public.user_roles to authenticated;
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy user_roles_admin_insert on public.user_roles for insert to authenticated with check ((select public.is_admin()));
create policy user_roles_admin_delete on public.user_roles for delete to authenticated using ((select public.is_admin()));

-- cinemas: công khai đọc (Guest xem rạp). Admin CRUD; Manager chỉ UPDATE rạp mình (guard cột ở mục 7).
grant select on public.cinemas to anon, authenticated;
grant insert, update, delete on public.cinemas to authenticated;
create policy cinemas_select on public.cinemas for select to anon, authenticated using (true);
create policy cinemas_admin_insert on public.cinemas for insert to authenticated with check ((select public.is_admin()));
create policy cinemas_admin_delete on public.cinemas for delete to authenticated using ((select public.is_admin()));
create policy cinemas_update on public.cinemas for update to authenticated
  using (
    (select public.is_admin())
    or (select public.has_cinema_role(id, array['MANAGER']::public.staff_role[]))
  )
  with check (
    (select public.is_admin())
    or (select public.has_cinema_role(id, array['MANAGER']::public.staff_role[]))
  );

-- staff_assignments: đọc của mình / Manager đọc rạp mình / Admin tất cả.
-- Ghi: Admin mọi thứ; Manager chỉ thêm/bớt STAFF cho rạp mình, không nâng quyền (R-17, R-105).
-- Column grant: client không tự đặt assigned_by / created_at / id (giả mạo người gán).
grant select, delete, update on public.staff_assignments to authenticated;
grant insert (user_id, cinema_id, role) on public.staff_assignments to authenticated;
create policy staff_assignments_select on public.staff_assignments for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[]))
  );
create policy staff_assignments_admin_update on public.staff_assignments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy staff_assignments_insert on public.staff_assignments for insert to authenticated
  with check (
    (select public.is_admin())
    or (role = 'STAFF' and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  );
create policy staff_assignments_delete on public.staff_assignments for delete to authenticated
  using (
    (select public.is_admin())
    or (role = 'STAFF' and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  );

-- app_settings: cấu hình công khai (hiển thị cảnh báo, thời gian giữ ghế); chỉ Admin ghi (§7.1).
grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;
create policy app_settings_select on public.app_settings for select to anon, authenticated using (true);
create policy app_settings_admin_insert on public.app_settings for insert to authenticated with check ((select public.is_admin()));
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy app_settings_admin_delete on public.app_settings for delete to authenticated using ((select public.is_admin()));

-- cinema_settings: override chính sách theo rạp -> Staff/Manager đọc rạp được gán; chỉ Admin ghi
-- (Manager không cấu hình chính sách ngoài 2 tham số R-56 nằm sẵn trên cinemas, §7.1).
grant select, insert, update, delete on public.cinema_settings to authenticated;
create policy cinema_settings_select on public.cinema_settings for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_cinema_role(cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]))
  );
create policy cinema_settings_admin_insert on public.cinema_settings for insert to authenticated with check ((select public.is_admin()));
create policy cinema_settings_admin_update on public.cinema_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy cinema_settings_admin_delete on public.cinema_settings for delete to authenticated using ((select public.is_admin()));

-- consents: khách đọc + thêm bản ghi của mình; không sửa/xoá (bằng chứng bất biến). Admin đọc.
-- Column grant: accepted_at/id do DB đặt (default now()), client không backdate được bằng chứng.
grant select on public.consents to authenticated;
grant insert (user_id, consent_type, version, metadata) on public.consents to authenticated;
create policy consents_select on public.consents for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy consents_insert_own on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- favorite_cinemas: chỉ chủ sở hữu.
grant select, delete on public.favorite_cinemas to authenticated;
grant insert (user_id, cinema_id) on public.favorite_cinemas to authenticated;
create policy favorite_cinemas_select on public.favorite_cinemas for select to authenticated using (user_id = (select auth.uid()));
create policy favorite_cinemas_insert on public.favorite_cinemas for insert to authenticated with check (user_id = (select auth.uid()));
create policy favorite_cinemas_delete on public.favorite_cinemas for delete to authenticated using (user_id = (select auth.uid()));

-- audit_logs: Admin đọc toàn chuỗi, Manager đọc rạp mình; client KHÔNG ghi/sửa/xoá (chỉ trigger).
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (select public.is_admin())
    or (cinema_id is not null and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  );
