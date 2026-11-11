-- Layer 3 / task 01: bảng giá 2 cấp + ngày lễ + price_quote (R-52, R-53, R-57, R-72; AC-15).
-- Chỉ tạo đối tượng mới -> additive, KHÔNG phải HIGH_RISK_MIGRATION.
--
-- Quy tắc giá (SPECIFICATIONS quyết định #19):
--   * Ưu tiên: ghi đè SUẤT › ghi đè RẠP › mặc định CHUỖI.
--   * Loại ngày (theo NGÀY chiếu giờ VN): ngày lễ › cuối tuần (T7 + CN) › thường.
--   * Khung giờ theo GIỜ BẮT ĐẦU suất giờ VN: 17:00 trở đi = AFTER_17, 16:59 = BEFORE_17.
--   * Sweetbox: 1 dòng giá CẶP (1 bản ghi seat = 1 cặp), tính 2 ghế vào giới hạn 8.
--   * Tiền VND số nguyên.
-- Ghi đè SUẤT chỉ theo (suất, loại ghế): format/day_type/time_band của suất đã cố định nên để NULL.

-- ============================================================================
-- 1. Kiểu dữ liệu
-- ============================================================================
create type public.price_scope     as enum ('CHAIN', 'CINEMA', 'SHOWTIME');
create type public.price_day_type  as enum ('NORMAL', 'WEEKEND', 'HOLIDAY');
create type public.price_time_band as enum ('BEFORE_17', 'AFTER_17');

-- ============================================================================
-- 2. Bảng
-- ============================================================================
-- 2.1 holidays (R-53): ngày lễ chung toàn chuỗi
create table public.holidays (
  holiday_date date primary key,
  name         text not null check (length(btrim(name)) > 0),
  created_at   timestamptz not null default now()
);

-- 2.2 price_rules (R-52). cinema_id của rule SHOWTIME do trigger điền từ suất (client không đặt được).
create table public.price_rules (
  id          uuid primary key default gen_random_uuid(),
  scope       public.price_scope not null,
  cinema_id   uuid references public.cinemas (id) on delete cascade,
  showtime_id uuid references public.showtimes (id) on delete cascade,
  seat_type   public.seat_type not null check (seat_type in ('NORMAL', 'VIP', 'SWEETBOX')),
  format      public.screen_format,
  day_type    public.price_day_type,
  time_band   public.price_time_band,
  amount      integer not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (
    (scope = 'CHAIN'    and cinema_id is null     and showtime_id is null
                        and format is not null and day_type is not null and time_band is not null)
    or (scope = 'CINEMA'   and cinema_id is not null and showtime_id is null
                        and format is not null and day_type is not null and time_band is not null)
    or (scope = 'SHOWTIME' and showtime_id is not null
                        and format is null and day_type is null and time_band is null)
  )
);
create unique index price_rules_chain_key on public.price_rules (seat_type, format, day_type, time_band)
  where scope = 'CHAIN';
create unique index price_rules_cinema_key on public.price_rules (cinema_id, seat_type, format, day_type, time_band)
  where scope = 'CINEMA';
create unique index price_rules_showtime_key on public.price_rules (showtime_id, seat_type)
  where scope = 'SHOWTIME';
create index price_rules_cinema_id_idx on public.price_rules (cinema_id);
create trigger price_rules_set_updated_at before update on public.price_rules
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. Trigger: điền cinema_id cho rule SHOWTIME
-- ============================================================================
create function public.price_rules_fill_cinema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scope = 'SHOWTIME' then
    select st.cinema_id into new.cinema_id from public.showtimes st where st.id = new.showtime_id;
    if new.cinema_id is null then
      raise exception 'Suất chiếu không tồn tại' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.price_rules_fill_cinema() from public, anon, authenticated;
create trigger price_rules_fill_cinema before insert on public.price_rules
  for each row execute function public.price_rules_fill_cinema();

create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function public.audit_row_change();
create trigger price_rules_audit after insert or update or delete on public.price_rules
  for each row execute function public.audit_row_change('cinema_id');

-- ============================================================================
-- 4. price_quote(showtime_id, seat_ids[]) — STABLE, SECURITY INVOKER
-- INVOKER (không DEFINER): chỉ đọc dữ liệu giá công khai; RLS vẫn áp -> suất khách không thấy
-- (rạp đóng, phim nháp) thì báo "không tồn tại". RPC đặt vé (DEFINER) gọi lại ở task sau.
-- Mỗi ghế 1 dòng; Sweetbox = 1 dòng giá cặp, seat_count = 2. Thiếu rule giá -> lỗi rõ (không bán giá 0).
-- ============================================================================
create function public.price_quote(p_showtime_id uuid, p_seat_ids uuid[])
returns table (seat_id uuid, seat_type public.seat_type, seat_count smallint, amount integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_st    record;
  v_local timestamp;
  v_day   public.price_day_type;
  v_band  public.price_time_band;
  v_seat  record;
  v_found integer := 0;
  v_price integer;
begin
  if p_seat_ids is null or cardinality(p_seat_ids) = 0 then
    raise exception 'Chưa chọn ghế' using errcode = '22023';
  end if;
  if cardinality(p_seat_ids) <> (select count(distinct x) from unnest(p_seat_ids) x) then
    raise exception 'Danh sách ghế bị trùng' using errcode = '22023';
  end if;

  select st.id, st.cinema_id, st.room_id, st.format, st.starts_at into v_st
    from public.showtimes st where st.id = p_showtime_id;
  if v_st.id is null then
    raise exception 'Suất chiếu không tồn tại' using errcode = '23503';
  end if;

  v_local := v_st.starts_at at time zone 'Asia/Ho_Chi_Minh';
  v_day := case
    when exists (select 1 from public.holidays h where h.holiday_date = v_local::date) then 'HOLIDAY'
    when extract(isodow from v_local) in (6, 7) then 'WEEKEND'
    else 'NORMAL' end;
  v_band := case when v_local::time >= time '17:00' then 'AFTER_17' else 'BEFORE_17' end;

  for v_seat in
    select s.id, s.seat_type
      from unnest(p_seat_ids) with ordinality as q(id, ord)
      join public.seats s on s.id = q.id and s.room_id = v_st.room_id
                         and s.seat_type in ('NORMAL', 'VIP', 'SWEETBOX')
     order by q.ord
  loop
    v_found := v_found + 1;
    v_price := coalesce(
      (select r.amount from public.price_rules r
        where r.scope = 'SHOWTIME' and r.showtime_id = v_st.id and r.seat_type = v_seat.seat_type),
      (select r.amount from public.price_rules r
        where r.scope = 'CINEMA' and r.cinema_id = v_st.cinema_id and r.seat_type = v_seat.seat_type
          and r.format = v_st.format and r.day_type = v_day and r.time_band = v_band),
      (select r.amount from public.price_rules r
        where r.scope = 'CHAIN' and r.seat_type = v_seat.seat_type
          and r.format = v_st.format and r.day_type = v_day and r.time_band = v_band));
    if v_price is null then
      raise exception 'Chưa cấu hình giá cho ghế % / % / % / %', v_seat.seat_type, v_st.format, v_day, v_band
        using errcode = 'P0002';
    end if;
    seat_id := v_seat.id;
    seat_type := v_seat.seat_type;
    seat_count := case when v_seat.seat_type = 'SWEETBOX' then 2 else 1 end;
    amount := v_price;
    return next;
  end loop;

  if v_found <> cardinality(p_seat_ids) then
    raise exception 'Có ghế không thuộc phòng chiếu hoặc không bán được' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.price_quote(uuid, uuid[]) from public;
grant execute on function public.price_quote(uuid, uuid[]) to anon, authenticated, service_role;

-- ============================================================================
-- 5. RLS + GRANT
-- Đọc công khai (giá hiển thị cho khách). Ghi:
--   holidays              : chỉ Admin.
--   price_rules CHAIN     : chỉ Admin.
--   price_rules CINEMA/
--   SHOWTIME              : Admin hoặc Manager của rạp đó.
-- Rule không đổi khoá sau khi tạo: UPDATE chỉ cột amount.
-- ============================================================================
alter table public.holidays    enable row level security;
alter table public.price_rules enable row level security;
revoke all on public.holidays, public.price_rules from anon, authenticated;

grant select on public.holidays, public.price_rules to anon, authenticated;
grant insert, update, delete on public.holidays to authenticated;
grant insert (scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount)
  on public.price_rules to authenticated;
grant update (amount) on public.price_rules to authenticated;
grant delete on public.price_rules to authenticated;

create policy holidays_select on public.holidays for select to anon, authenticated using (true);
create policy holidays_admin_insert on public.holidays for insert to authenticated with check ((select public.is_admin()));
create policy holidays_admin_update on public.holidays for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy holidays_admin_delete on public.holidays for delete to authenticated using ((select public.is_admin()));

create policy price_rules_select on public.price_rules for select to anon, authenticated using (true);
create policy price_rules_insert on public.price_rules for insert to authenticated
  with check (
    (select public.is_admin())
    or (scope <> 'CHAIN' and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  );
create policy price_rules_update on public.price_rules for update to authenticated
  using (
    (select public.is_admin())
    or (scope <> 'CHAIN' and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  )
  with check (
    (select public.is_admin())
    or (scope <> 'CHAIN' and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  );
create policy price_rules_delete on public.price_rules for delete to authenticated
  using (
    (select public.is_admin())
    or (scope <> 'CHAIN' and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  );
