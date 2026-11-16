-- ============================================================================
-- pgTAP Test: 062_showtimes_cinema_fk.test.sql
-- layer-8 task-08: Kiểm tra FK showtimes(cinema_id) -> cinemas(id) (showtimes_cinema_id_fkey)
-- ============================================================================
begin;
select plan(3);

-- 1. Kiểm tra FK showtimes_cinema_id_fkey tồn tại và trỏ tới public.cinemas
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.showtimes'::regclass
      and contype = 'f'
      and conname = 'showtimes_cinema_id_fkey'
      and confrelid = 'public.cinemas'::regclass
      -- FK 1 cột (khác FK ghép room_id, cinema_id -> rooms) để PostgREST có quan hệ showtimes -> cinemas
      and array_length(conkey, 1) = 1),
  1,
  '1. FK showtimes_cinema_id_fkey tồn tại trên public.showtimes trỏ tới public.cinemas'
);

-- Chuẩn bị dữ liệu mẫu hợp lệ
insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0620000000a1', 'T62', 'Tỉnh Test 62');
insert into public.cinemas (id, code, name, province_id, address, status) values
  ('00000000-0000-0000-0000-0620000000c1', 'HN62', 'Rạp Test HN62', '00000000-0000-0000-0000-0620000000a1', '62 Phố Test', 'OPEN');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-0620000000e1', 'phim-test-62', 'Phim Test 62', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-0620000000f1', '00000000-0000-0000-0000-0620000000c1', 'Phòng 62', '{2D}', 3, 3);

-- 2. Chèn suất với cinema_id không tồn tại bị từ chối với mã lỗi 23503 (foreign_key_violation).
--    Lưu ý: FK ghép qua rooms cũng báo 23503 nên test 2 là kiểm tra hành vi; test 1 mới là kiểm tra
--    FK mới tồn tại (dữ liệu hợp lệ không thể vi phạm FK mới mà vẫn qua FK ghép).
select throws_ok(
  $$
  insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
    ('00000000-0000-0000-0000-062000000011',
     '00000000-0000-0000-0000-062000000000',
     '00000000-0000-0000-0000-0620000000f1',
     '00000000-0000-0000-0000-0620000000e1',
     now() + interval '2 hours',
     '2D',
     'ON_SALE')
  $$,
  '23503',
  null,
  '2. Chèn suất chiếu với cinema_id không tồn tại bị từ chối với lỗi FK violation (23503)'
);

-- 3. Chèn suất chiếu với cinema_id hợp lệ thành công
select lives_ok(
  $$
  insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
    ('00000000-0000-0000-0000-062000000012',
     '00000000-0000-0000-0000-0620000000c1',
     '00000000-0000-0000-0000-0620000000f1',
     '00000000-0000-0000-0000-0620000000e1',
     now() + interval '2 hours',
     '2D',
     'ON_SALE')
  $$,
  '3. Chèn suất chiếu với cinema_id hợp lệ thành công'
);

select * from finish();
rollback;
