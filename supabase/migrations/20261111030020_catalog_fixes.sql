-- Layer 3 / task 01 (follow-up review layer 2, G1 + G2): sửa danh mục & lịch chiếu.
-- Chỉ thêm trigger/hàm và thay 1 policy đọc (siết lại) -> không DROP bảng/cột, không đổi kiểu,
-- không backfill -> KHÔNG phải HIGH_RISK_MIGRATION. (DROP POLICY ở mục 3 là thay policy bằng bản chặt hơn.)
--
-- QUYẾT ĐỊNH (G1): nguồn override thời gian dọn phòng DUY NHẤT là `cinemas.cleaning_minutes`
-- (NULL = mặc định chuỗi app_settings.default_cleaning_minutes, rồi 15). Lý do: Manager (R-56) đã ghi được
-- cột này qua cinemas_guard_manager_columns, còn cinema_settings chỉ Admin ghi và showtimes_derive_end
-- chưa từng đọc nó. cinema_settings KHÔNG được chứa key default_cleaning_minutes (trigger bên dưới chặn)
-- để không có hai nguồn mâu thuẫn. showtimes_derive_end giữ nguyên, đã dùng đúng nguồn này.

-- ============================================================================
-- 1. G1: chặn nguồn override thứ hai
-- ============================================================================
create function public.cinema_settings_reject_cleaning_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'default_cleaning_minutes' then
    raise exception 'Thời gian dọn phòng của rạp đặt ở cinemas.cleaning_minutes, không đặt trong cinema_settings'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.cinema_settings_reject_cleaning_key() from public, anon, authenticated;
create trigger cinema_settings_reject_cleaning_key after insert or update of key on public.cinema_settings
  for each row execute function public.cinema_settings_reject_cleaning_key();

-- ============================================================================
-- 2. G1: tính lại ends_at của suất TƯƠNG LAI khi đổi thời lượng phim / dọn phòng
-- Chạm cột starts_at (giữ nguyên giá trị) để showtimes_derive_end tính lại ends_at; exclusion
-- constraint chặn chồng giờ -> bắt lại và báo lỗi rõ (không bỏ qua im lặng; cả lệnh đổi bị rollback).
-- Chỉ suất chưa chiếu (starts_at > now()) và chưa huỷ. Suất đã bán vé (R-54): bảng đơn chưa có
-- ở layer này; điều kiện "chưa bán vé" bổ sung khi có bảng vé (trigger R-54 layer 3 task orders).
-- ============================================================================
create function public.recompute_future_showtime_ends(p_movie_id uuid, p_cinema_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.showtimes st set starts_at = st.starts_at
   where st.starts_at > now()
     and st.status <> 'CANCELLED'
     and (p_movie_id is null or st.movie_id = p_movie_id)
     and (p_cinema_id is null or st.cinema_id = p_cinema_id);
exception when exclusion_violation then
  raise exception 'Đổi thời lượng/dọn phòng làm các suất tương lai bị chồng giờ; hãy dời hoặc huỷ suất trước (%)', sqlerrm
    using errcode = '23P01';
end;
$$;
revoke all on function public.recompute_future_showtime_ends(uuid, uuid) from public, anon, authenticated;

create function public.movies_recompute_showtimes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recompute_future_showtime_ends(new.id, null);
  return null;
end;
$$;
revoke all on function public.movies_recompute_showtimes() from public, anon, authenticated;
create trigger movies_recompute_showtimes after update of duration_minutes on public.movies
  for each row when (old.duration_minutes is distinct from new.duration_minutes)
  execute function public.movies_recompute_showtimes();

create function public.cinemas_recompute_showtimes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recompute_future_showtime_ends(null, new.id);
  return null;
end;
$$;
revoke all on function public.cinemas_recompute_showtimes() from public, anon, authenticated;
create trigger cinemas_recompute_showtimes after update of cleaning_minutes on public.cinemas
  for each row when (old.cleaning_minutes is distinct from new.cleaning_minutes)
  execute function public.cinemas_recompute_showtimes();

-- Mặc định chuỗi đổi -> mọi rạp dùng mặc định (cleaning_minutes NULL) phải tính lại.
create function public.app_settings_recompute_showtimes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cinema uuid;
begin
  for v_cinema in select c.id from public.cinemas c where c.cleaning_minutes is null loop
    perform public.recompute_future_showtime_ends(null, v_cinema);
  end loop;
  return null;
end;
$$;
revoke all on function public.app_settings_recompute_showtimes() from public, anon, authenticated;
create trigger app_settings_recompute_showtimes after update of value on public.app_settings
  for each row when (new.key = 'default_cleaning_minutes' and old.value is distinct from new.value)
  execute function public.app_settings_recompute_showtimes();

-- ============================================================================
-- 3. G2 (R-33): khách chỉ thấy suất của rạp OPEN
-- Tách 2 policy để anon không đánh giá is_admin() (đã revoke execute với anon):
--   showtimes_select_public : anon + authenticated, rạp OPEN và phim hiển thị được (RLS movies).
--   showtimes_select_staff  : Admin, hoặc nhân sự của chính rạp đó, thấy mọi trạng thái rạp.
-- Policy là OR giữa các policy cùng lệnh.
-- ============================================================================
drop policy showtimes_select on public.showtimes;

create policy showtimes_select_public on public.showtimes for select to anon, authenticated
  using (
    exists (select 1 from public.cinemas c where c.id = showtimes.cinema_id and c.status = 'OPEN')
    and exists (select 1 from public.movies m where m.id = showtimes.movie_id)
  );
create policy showtimes_select_staff on public.showtimes for select to authenticated
  using (
    exists (select 1 from public.movies m where m.id = showtimes.movie_id)
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.staff_assignments sa
        where sa.user_id = (select auth.uid()) and sa.cinema_id = showtimes.cinema_id
      )
    )
  );
