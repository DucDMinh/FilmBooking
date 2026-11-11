-- ============================================================================
-- FilmBooking MVP - Database Seed Data (Local / Development Only)
-- ============================================================================
-- CẢNH BÁO AN TOÀN:
-- Tệp này chứa dữ liệu mẫu, tài khoản mẫu và khoá API POS giả lập phục vụ
-- kiểm thử và phát triển trên môi trường LOCAL DEV.
-- TUYỆT ĐỐI KHÔNG SỬ DỤNG TỆP NÀY TRÊN MÔI TRƯỜNG STAGING HOẶC PRODUCTION.
-- ============================================================================

-- Chặn chạy nhầm lên staging/prod (psql tay, nạp seed qua CLI lên DB linked).
-- scripts/seed-demo.mjs đặt cờ này sau khi kiểm host là loopback.
-- Chạy tay lên DB local: psql ... -c "set app.allow_demo_seed = on" -f supabase/seed.sql
do $$
begin
  if current_setting('app.allow_demo_seed', true) is distinct from 'on' then
    raise exception 'seed.sql bị chặn: dùng script seed demo (chỉ DB local) hoặc set app.allow_demo_seed = on trước.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. TỈNH / THÀNH PHỐ (provinces - R-35)
-- ----------------------------------------------------------------------------
insert into public.provinces (id, code, name, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'HA_NOI',  'Hà Nội',           1),
  ('10000000-0000-0000-0000-000000000002', 'TP_HCM',  'TP. Hồ Chí Minh',  2),
  ('10000000-0000-0000-0000-000000000003', 'DA_NANG', 'Đà Nẵng',          3)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 2. DANH SÁCH 5 RẠP (cinemas - R-32, R-38, R-56, AC-15, NFR-09)
-- ----------------------------------------------------------------------------
insert into public.cinemas (
  id, code, name, province_id, district, address, latitude, longitude,
  hotline, email, opening_hours, image_url, amenities, status,
  cleaning_minutes, online_cutoff_minutes
) values
  (
    '20000000-0000-0000-0000-000000000001',
    'HN01',
    'FilmBooking Cầu Giấy',
    '10000000-0000-0000-0000-000000000001',
    'Cầu Giấy',
    'Tầng 5, TTTM Discovery Complex, 302 Cầu Giấy, Dịch Vọng, Cầu Giấy, Hà Nội',
    21.036237,
    105.795246,
    '1900 1001',
    'hn01@filmbooking.vn',
    '08:00 - 23:30',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba',
    array['Bãi đỗ xe', 'Thang máy', 'Phòng chiếu 3D', 'Ghế Sweetbox', 'Quầy bắp nước'],
    'OPEN',
    15,
    15
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'HN02',
    'FilmBooking Ba Đình',
    '10000000-0000-0000-0000-000000000001',
    'Ba Đình',
    'Tầng 3, TTTM Lotte Center, 54 Liễu Giai, Cống Vị, Ba Đình, Hà Nội',
    21.033333,
    105.813333,
    '1900 1002',
    'hn02@filmbooking.vn',
    '08:00 - 23:30',
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c',
    array['Bãi đỗ xe', 'Thang máy', 'Phòng chiếu 3D', 'Ghế Sweetbox', 'Khu ẩm thực'],
    'OPEN',
    15,
    15
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'HN03',
    'FilmBooking Hà Đông',
    '10000000-0000-0000-0000-000000000001',
    'Hà Đông',
    'Tầng 4, TTTM Aeon Mall Hà Đông, Dương Nội, Hà Đông, Hà Nội',
    20.978333,
    105.748333,
    '1900 1003',
    'hn03@filmbooking.vn',
    '08:30 - 23:30',
    'https://images.unsplash.com/photo-1485846234645-a62644f84728',
    array['Bãi đỗ xe ô tô', 'Khu vui chơi trẻ em', 'Ghế Sweetbox', 'Quầy bắp nước'],
    'OPEN',
    15,
    15
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    'HCM01',
    'FilmBooking Quận 1',
    '10000000-0000-0000-0000-000000000002',
    'Quận 1',
    'Tầng 4, TTTM Vincom Center Đồng Khởi, 72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    10.778000,
    106.702000,
    '1900 1004',
    'hcm01@filmbooking.vn',
    '08:00 - 00:00',
    'https://images.unsplash.com/photo-1574267432553-4b4628081c31',
    array['Bãi đỗ xe', 'Thang máy', 'Phòng chiếu 3D', 'Ghế Sweetbox', 'Phục vụ tận ghế'],
    'OPEN',
    15,
    15
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    'DN01',
    'FilmBooking Hải Châu',
    '10000000-0000-0000-0000-000000000003',
    'Hải Châu',
    'Tầng 3, TTTM Vincom Plaza Ngô Quyền, 910A Ngô Quyền, An Hải Bắc, Sơn Trà, Đà Nẵng',
    16.071667,
    108.232222,
    '1900 1005',
    'dn01@filmbooking.vn',
    '08:30 - 23:30',
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26',
    array['Bãi đỗ xe', 'Thang máy', 'Phòng chiếu 3D', 'Ghế Sweetbox', 'Quầy bắp nước'],
    'OPEN',
    15,
    15
  )
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  province_id = excluded.province_id,
  district = excluded.district,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  hotline = excluded.hotline,
  email = excluded.email,
  opening_hours = excluded.opening_hours,
  image_url = excluded.image_url,
  amenities = excluded.amenities,
  status = excluded.status,
  cleaning_minutes = excluded.cleaning_minutes,
  online_cutoff_minutes = excluded.online_cutoff_minutes;

-- ----------------------------------------------------------------------------
-- 3. PHÒNG CHIẾU (rooms - R-47: 16 phòng thuộc 5 rạp)
-- ----------------------------------------------------------------------------
insert into public.rooms (id, cinema_id, name, supported_formats, status, grid_rows, grid_cols) values
  -- HN01: 4 phòng
  ('30000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000001', 'Phòng Chiếu 1', array['2D', '3D']::public.screen_format[], 'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000001', 'Phòng Chiếu 2', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000001', 'Phòng Chiếu 3', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000104', '20000000-0000-0000-0000-000000000001', 'Phòng Chiếu 4 (Demo Live)', array['2D', '3D']::public.screen_format[], 'ACTIVE', 7, 10),

  -- HN02: 3 phòng
  ('30000000-0000-0000-0000-000000000201', '20000000-0000-0000-0000-000000000002', 'Phòng Chiếu 1', array['2D', '3D']::public.screen_format[], 'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000002', 'Phòng Chiếu 2', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000203', '20000000-0000-0000-0000-000000000002', 'Phòng Chiếu 3', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),

  -- HN03: 3 phòng
  ('30000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000003', 'Phòng Chiếu 1', array['2D', '3D']::public.screen_format[], 'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000302', '20000000-0000-0000-0000-000000000003', 'Phòng Chiếu 2', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000303', '20000000-0000-0000-0000-000000000003', 'Phòng Chiếu 3', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),

  -- HCM01: 3 phòng
  ('30000000-0000-0000-0000-000000000401', '20000000-0000-0000-0000-000000000004', 'Phòng Chiếu 1', array['2D', '3D']::public.screen_format[], 'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000402', '20000000-0000-0000-0000-000000000004', 'Phòng Chiếu 2', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000403', '20000000-0000-0000-0000-000000000004', 'Phòng Chiếu 3 (Demo Live)', array['2D', '3D']::public.screen_format[], 'ACTIVE', 7, 10),

  -- DN01: 3 phòng
  ('30000000-0000-0000-0000-000000000501', '20000000-0000-0000-0000-000000000005', 'Phòng Chiếu 1', array['2D', '3D']::public.screen_format[], 'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000502', '20000000-0000-0000-0000-000000000005', 'Phòng Chiếu 2', array['2D']::public.screen_format[],         'ACTIVE', 7, 10),
  ('30000000-0000-0000-0000-000000000503', '20000000-0000-0000-0000-000000000005', 'Phòng Chiếu 3', array['2D']::public.screen_format[],         'ACTIVE', 7, 10)
on conflict (id) do update set
  cinema_id = excluded.cinema_id,
  name = excluded.name,
  supported_formats = excluded.supported_formats,
  status = excluded.status,
  grid_rows = excluded.grid_rows,
  grid_cols = excluded.grid_cols;

-- ----------------------------------------------------------------------------
-- 4. SƠ ĐỒ GHẾ (seats - R-48: NORMAL, VIP, SWEETBOX, AISLE)
-- Sinh bằng UUIDv5 deterministic để chạy lại hoàn toàn idempotent.
-- Lưới mỗi phòng: 7 hàng (A-G) x 10 cột.
-- - Hàng A, B, C: NORMAL (cột 1..4, 7..10; cột 5,6 là AISLE).
-- - Hàng D, E, F: VIP (cột 1..4, 7..10; cột 5,6 là AISLE).
-- - Hàng G: SWEETBOX (cột 1 span 2 -> G1-G2; cột 3 span 2 -> G3-G4; cột 5,6 AISLE; cột 7 span 2 -> G7-G8; cột 9 span 2 -> G9-G10).
-- ----------------------------------------------------------------------------
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label)
select
  extensions.uuid_generate_v5(
    '00000000-0000-0000-0000-000000000000'::uuid,
    r.id::text || ':' || grid.row_label || ':' || grid.col_number::text
  ) as id,
  r.id as room_id,
  r.cinema_id,
  grid.row_label,
  grid.col_number,
  grid.seat_type,
  grid.label
from public.rooms r
cross join (
  -- Hàng A: NORMAL + AISLE
  select 'A' as row_label, 1 as col_number, 'NORMAL'::public.seat_type as seat_type, 'A1' as label union all
  select 'A', 2, 'NORMAL', 'A2' union all
  select 'A', 3, 'NORMAL', 'A3' union all
  select 'A', 4, 'NORMAL', 'A4' union all
  select 'A', 5, 'AISLE',  null union all
  select 'A', 6, 'AISLE',  null union all
  select 'A', 7, 'NORMAL', 'A7' union all
  select 'A', 8, 'NORMAL', 'A8' union all
  select 'A', 9, 'NORMAL', 'A9' union all
  select 'A', 10, 'NORMAL', 'A10' union all

  -- Hàng B: NORMAL + AISLE
  select 'B', 1, 'NORMAL', 'B1' union all
  select 'B', 2, 'NORMAL', 'B2' union all
  select 'B', 3, 'NORMAL', 'B3' union all
  select 'B', 4, 'NORMAL', 'B4' union all
  select 'B', 5, 'AISLE',  null union all
  select 'B', 6, 'AISLE',  null union all
  select 'B', 7, 'NORMAL', 'B7' union all
  select 'B', 8, 'NORMAL', 'B8' union all
  select 'B', 9, 'NORMAL', 'B9' union all
  select 'B', 10, 'NORMAL', 'B10' union all

  -- Hàng C: NORMAL + AISLE
  select 'C', 1, 'NORMAL', 'C1' union all
  select 'C', 2, 'NORMAL', 'C2' union all
  select 'C', 3, 'NORMAL', 'C3' union all
  select 'C', 4, 'NORMAL', 'C4' union all
  select 'C', 5, 'AISLE',  null union all
  select 'C', 6, 'AISLE',  null union all
  select 'C', 7, 'NORMAL', 'C7' union all
  select 'C', 8, 'NORMAL', 'C8' union all
  select 'C', 9, 'NORMAL', 'C9' union all
  select 'C', 10, 'NORMAL', 'C10' union all

  -- Hàng D: VIP + AISLE
  select 'D', 1, 'VIP', 'D1' union all
  select 'D', 2, 'VIP', 'D2' union all
  select 'D', 3, 'VIP', 'D3' union all
  select 'D', 4, 'VIP', 'D4' union all
  select 'D', 5, 'AISLE', null union all
  select 'D', 6, 'AISLE', null union all
  select 'D', 7, 'VIP', 'D7' union all
  select 'D', 8, 'VIP', 'D8' union all
  select 'D', 9, 'VIP', 'D9' union all
  select 'D', 10, 'VIP', 'D10' union all

  -- Hàng E: VIP + AISLE
  select 'E', 1, 'VIP', 'E1' union all
  select 'E', 2, 'VIP', 'E2' union all
  select 'E', 3, 'VIP', 'E3' union all
  select 'E', 4, 'VIP', 'E4' union all
  select 'E', 5, 'AISLE', null union all
  select 'E', 6, 'AISLE', null union all
  select 'E', 7, 'VIP', 'E7' union all
  select 'E', 8, 'VIP', 'E8' union all
  select 'E', 9, 'VIP', 'E9' union all
  select 'E', 10, 'VIP', 'E10' union all

  -- Hàng F: VIP + AISLE
  select 'F', 1, 'VIP', 'F1' union all
  select 'F', 2, 'VIP', 'F2' union all
  select 'F', 3, 'VIP', 'F3' union all
  select 'F', 4, 'VIP', 'F4' union all
  select 'F', 5, 'AISLE', null union all
  select 'F', 6, 'AISLE', null union all
  select 'F', 7, 'VIP', 'F7' union all
  select 'F', 8, 'VIP', 'F8' union all
  select 'F', 9, 'VIP', 'F9' union all
  select 'F', 10, 'VIP', 'F10' union all

  -- Hàng G: SWEETBOX (chiếm 2 ô) + AISLE
  select 'G', 1, 'SWEETBOX'::public.seat_type, 'G1-G2' union all
  select 'G', 3, 'SWEETBOX'::public.seat_type, 'G3-G4' union all
  select 'G', 5, 'AISLE'::public.seat_type,    null union all
  select 'G', 6, 'AISLE'::public.seat_type,    null union all
  select 'G', 7, 'SWEETBOX'::public.seat_type, 'G7-G8' union all
  select 'G', 9, 'SWEETBOX'::public.seat_type, 'G9-G10'
) grid
where r.id::text like '30000000-0000-0000-0000-%' -- chỉ phòng seed
on conflict (id) do update set
  room_id = excluded.room_id,
  cinema_id = excluded.cinema_id,
  row_label = excluded.row_label,
  col_number = excluded.col_number,
  seat_type = excluded.seat_type,
  label = excluded.label;

-- ----------------------------------------------------------------------------
-- 5. DANH MỤC 12 PHIM (movies - R-41, R-42, R-45: đủ nhãn P, K, T13, T16, T18)
-- ----------------------------------------------------------------------------
insert into public.movies (
  id, slug, title_vi, title_original, poster_url, banner_url, trailer_url,
  description, genres, duration_minutes, director, cast_members,
  country, original_language, subtitle_languages, dubbed_languages,
  release_date, age_rating, status
) values
  (
    '40000000-0000-0000-0000-000000000001',
    'doraemon-nobita-va-ban-giao-huong-dia-cau',
    'Doraemon: Nobita Và Bản Giao Hưởng Địa Cầu',
    'Doraemon the Movie: Nobita''s Earth Symphony',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Nobita và nhóm bạn bắt đầu cuộc hành trình âm nhạc kỳ diệu để giải cứu Trái Đất khỏi thảm hoạ.',
    array['Hoạt hình', 'Phiêu lưu', 'Gia đình'],
    115,
    'Imai Kazuaki',
    array['Mizuta Wasabi', 'Ohara Megumi', 'Kakazu Yumi'],
    'Nhật Bản',
    'ja',
    array['vi'],
    array['vi'],
    '2026-05-24',
    'P',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    'vua-su-tu-mufasa',
    'Mufasa: Vua Sư Tử',
    'Mufasa: The Lion King',
    'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6',
    'https://images.unsplash.com/photo-1516426122078-c23e76319801',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Hành trình từ chú sư tử mồ côi trở thành vị vua vĩ đại của vùng đất Pride Lands.',
    array['Hoạt hình', 'Phiêu lưu', 'Chính kịch'],
    118,
    'Barry Jenkins',
    array['Aaron Pierre', 'Kelvin Harrison Jr.', 'Seth Rogen'],
    'Mỹ',
    'en',
    array['vi'],
    array['vi'],
    '2026-06-15',
    'P',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    'conan-ngoi-sao-5-canh-1-trieu-do',
    'Thám Tử Lừng Danh Conan: Ngôi Sao 5 Cánh 1 Triệu Đô',
    'Detective Conan: The Million-dollar Pentagram',
    'https://images.unsplash.com/photo-1563089145-599997674d42',
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Vụ án thanh kiếm cổ báu vật tại Hakodate với cuộc đối đầu giữa Conan, Heiji và Siêu trộm Kid.',
    array['Hoạt hình', 'Trinh thám', 'Hành động'],
    110,
    'Chika Nagaoka',
    array['Takayama Minami', 'Yamaguchi Kappei', 'Horikawa Ryo'],
    'Nhật Bản',
    'ja',
    array['vi'],
    array['vi'],
    '2026-07-01',
    'K',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    'spider-man-beyond-the-spider-verse',
    'Người Nhện: Vũ Trụ Mới Phía Bên Kia',
    'Spider-Man: Beyond the Spider-Verse',
    'https://images.unsplash.com/photo-1635805737707-575885ab0820',
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Miles Morales đối mặt với thử thách lớn nhất khi vượt qua đa vũ trụ để cứu những người thân yêu.',
    array['Hành động', 'Hoạt hình', 'Khoa học viễn tưởng'],
    140,
    'Joaquim Dos Santos',
    array['Shameik Moore', 'Hailee Steinfeld', 'Oscar Isaac'],
    'Mỹ',
    'en',
    array['vi'],
    array[]::text[],
    '2026-08-10',
    'T13',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    'biet-doi-sieu-anh-hung-tro-lai',
    'Biệt Đội Siêu Anh Hùng: Kỷ Nguyên Mới',
    'Avengers: New Era',
    'https://images.unsplash.com/photo-1560109947-543149eceb16',
    'https://images.unsplash.com/photo-1534809027769-b00d750a6bac',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Các Avengers tập hợp trở lại để chống lại một mối đe dọa vũ trụ đe dọa cấu trúc thực tại.',
    array['Hành động', 'Khoa học viễn tưởng', 'Phiêu lưu'],
    155,
    'Anthony Russo',
    array['Chris Hemsworth', 'Anthony Mackie', 'Benedict Cumberbatch'],
    'Mỹ',
    'en',
    array['vi'],
    array[]::text[],
    '2026-09-02',
    'T13',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    'hanh-tinh-cat-phan-hai',
    'Hành Tinh Cát: Phần Hai',
    'Dune: Part Two',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401',
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Paul Atreides hợp tác cùng Chani và người Fremen trên hành trình trả thù những kẻ hủy diệt gia tộc.',
    array['Khoa học viễn tưởng', 'Phiêu lưu', 'Hành động'],
    166,
    'Denis Villeneuve',
    array['Timothée Chalamet', 'Zendaya', 'Rebecca Ferguson'],
    'Mỹ',
    'en',
    array['vi'],
    array[]::text[],
    '2026-03-01',
    'T16',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000007',
    'oppenheimer',
    'Oppenheimer',
    'Oppenheimer',
    'https://images.unsplash.com/photo-1440404653325-ab127d49abc1',
    'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Câu chuyện về nhà vật lý lý thuyết J. Robert Oppenheimer và dự án Manhattan tạo ra bom nguyên tử.',
    array['Lịch sử', 'Chính kịch', 'Tiểu sử'],
    180,
    'Christopher Nolan',
    array['Cillian Murphy', 'Emily Blunt', 'Robert Downey Jr.'],
    'Mỹ',
    'en',
    array['vi'],
    array[]::text[],
    '2026-04-12',
    'T16',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000008',
    'mai',
    'Mai',
    'Mai',
    'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Mai - một phụ nữ làm nghề massage trị liệu trải qua nhiều tổn thương trong quá khứ gặp gỡ Dương.',
    array['Tâm lý', 'Tình cảm', 'Gia đình'],
    131,
    'Trấn Thành',
    array['Phương Anh Đào', 'Tuấn Trần', 'Trấn Thành', 'Hồng Đào'],
    'Việt Nam',
    'vi',
    array['en'],
    array[]::text[],
    '2026-02-10',
    'T18',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000009',
    'exhuma-quat-mo-trung-ma',
    'Quật Mộ Trùng Ma',
    'Exhuma',
    'https://images.unsplash.com/photo-1509248961158-e54f6934749c',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Một thầy phong thủy, người mai táng và hai pháp sư khai quật ngôi mộ bí ẩn đem lại hậu quả kinh hoàng.',
    array['Kinh dị', 'Bí ẩn', 'Gật gân'],
    134,
    'Jang Jae-hyun',
    array['Choi Min-sik', 'Kim Go-eun', 'Yoo Hae-jin', 'Lee Do-hyun'],
    'Hàn Quốc',
    'ko',
    array['vi'],
    array[]::text[],
    '2026-03-15',
    'T18',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000010',
    'joker-dien-co-doi',
    'Joker: Điên Có Đôi',
    'Joker: Folie à Deux',
    'https://images.unsplash.com/photo-1594909122845-11baa439b7bf',
    'https://images.unsplash.com/photo-1574267432553-4b4628081c31',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Arthur Fleck bị giam giữ tại Arkham và tìm thấy tình yêu cuồng loạn cùng âm nhạc bên cạnh Harleen Quinzel.',
    array['Tội phạm', 'Chính kịch', 'Âm nhạc'],
    138,
    'Todd Phillips',
    array['Joaquin Phoenix', 'Lady Gaga', 'Brendan Gleeson'],
    'Mỹ',
    'en',
    array['vi'],
    array[]::text[],
    '2026-10-04',
    'T18',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000011',
    'avatar-lua-va-tro',
    'Avatar: Lửa Và Tro (Sắp Chiếu)',
    'Avatar: Fire and Ash',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23',
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Jake Sully và Neytiri khám phá bộ tộc Tro Tàn hiếu chiến tại vùng núi lửa của hành tinh Pandora.',
    array['Khoa học viễn tưởng', 'Phiêu lưu', 'Hành động'],
    190,
    'James Cameron',
    array['Sam Worthington', 'Zoe Saldana', 'Sigourney Weaver'],
    'Mỹ',
    'en',
    array['vi'],
    array[]::text[],
    '2026-12-19',
    'T13',
    'PUBLISHED'
  ),
  (
    '40000000-0000-0000-0000-000000000012',
    'dat-rung-phuong-nam-phan-hai',
    'Đất Rừng Phương Nam: Phần 2 (Sắp Chiếu)',
    'Song of the South: Part Two',
    'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0',
    'https://images.unsplash.com/photo-1485846234645-a62644f84728',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Tiếp nối hành trình phiêu lưu tìm cha của bé An giữa phong trào kháng chiến kiên cường ở Nam Bộ.',
    array['Lịch sử', 'Phiêu lưu', 'Gia đình'],
    125,
    'Nguyễn Quang Dũng',
    array['Hạo Khang', 'Tuấn Trần', 'Trấn Thành'],
    'Việt Nam',
    'vi',
    array['en'],
    array[]::text[],
    '2027-04-30',
    'K',
    'PUBLISHED'
  )
on conflict (id) do update set
  slug = excluded.slug,
  title_vi = excluded.title_vi,
  title_original = excluded.title_original,
  poster_url = excluded.poster_url,
  banner_url = excluded.banner_url,
  trailer_url = excluded.trailer_url,
  description = excluded.description,
  genres = excluded.genres,
  duration_minutes = excluded.duration_minutes,
  director = excluded.director,
  cast_members = excluded.cast_members,
  country = excluded.country,
  original_language = excluded.original_language,
  subtitle_languages = excluded.subtitle_languages,
  dubbed_languages = excluded.dubbed_languages,
  release_date = excluded.release_date,
  age_rating = excluded.age_rating,
  status = excluded.status;

-- ----------------------------------------------------------------------------
-- 6. NGÀY LỄ TOÀN CHUỖI (holidays - R-53)
-- ----------------------------------------------------------------------------
insert into public.holidays (holiday_date, name) values
  ('2026-01-01', 'Tết Dương lịch 2026'),
  ('2026-02-16', 'Tết Nguyên Đán (29 Tết)'),
  ('2026-02-17', 'Tết Nguyên Đán (Mùng 1 Tết)'),
  ('2026-02-18', 'Tết Nguyên Đán (Mùng 2 Tết)'),
  ('2026-02-19', 'Tết Nguyên Đán (Mùng 3 Tết)'),
  ('2026-02-20', 'Tết Nguyên Đán (Mùng 4 Tết)'),
  ('2026-04-26', 'Giỗ Tổ Hùng Vương 2026'),
  ('2026-04-30', 'Ngày Giải phóng miền Nam'),
  ('2026-05-01', 'Ngày Quốc tế Lao động'),
  ('2026-09-02', 'Ngày Quốc khánh 2/9'),
  ('2026-09-03', 'Nghỉ bù Quốc khánh'),
  ('2027-01-01', 'Tết Dương lịch 2027')
on conflict (holiday_date) do update set
  name = excluded.name;

-- ----------------------------------------------------------------------------
-- 7. BẢNG GIÁ CHUỖI & OVERRIDE RẠP HN02 (price_rules - R-52, AC-15)
-- ----------------------------------------------------------------------------
-- 7.1 Mặc định toàn chuỗi (scope = 'CHAIN', 36 tổ hợp)
insert into public.price_rules (
  id, scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount
)
select
  extensions.uuid_generate_v5(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'CHAIN:' || p.seat_type || ':' || p.format || ':' || p.day_type || ':' || p.time_band
  ) as id,
  'CHAIN'::public.price_scope as scope,
  null::uuid as cinema_id,
  null::uuid as showtime_id,
  p.seat_type,
  p.format,
  p.day_type,
  p.time_band,
  p.amount
from (
  -- 2D NORMAL
  select 'NORMAL'::public.seat_type as seat_type, '2D'::public.screen_format as format, 'NORMAL'::public.price_day_type as day_type, 'BEFORE_17'::public.price_time_band as time_band, 75000 as amount union all
  select 'NORMAL', '2D', 'NORMAL',  'AFTER_17',  85000 union all
  select 'NORMAL', '2D', 'WEEKEND', 'BEFORE_17', 90000 union all
  select 'NORMAL', '2D', 'WEEKEND', 'AFTER_17',  100000 union all
  select 'NORMAL', '2D', 'HOLIDAY', 'BEFORE_17', 105000 union all
  select 'NORMAL', '2D', 'HOLIDAY', 'AFTER_17',  115000 union all

  -- 2D VIP (AC-15: VIP 2D cuối tuần tối = 120.000đ)
  select 'VIP', '2D', 'NORMAL',  'BEFORE_17', 90000 union all
  select 'VIP', '2D', 'NORMAL',  'AFTER_17',  100000 union all
  select 'VIP', '2D', 'WEEKEND', 'BEFORE_17', 110000 union all
  select 'VIP', '2D', 'WEEKEND', 'AFTER_17',  120000 union all
  select 'VIP', '2D', 'HOLIDAY', 'BEFORE_17', 125000 union all
  select 'VIP', '2D', 'HOLIDAY', 'AFTER_17',  135000 union all

  -- 2D SWEETBOX (Giá bán theo cặp)
  select 'SWEETBOX', '2D', 'NORMAL',  'BEFORE_17', 180000 union all
  select 'SWEETBOX', '2D', 'NORMAL',  'AFTER_17',  200000 union all
  select 'SWEETBOX', '2D', 'WEEKEND', 'BEFORE_17', 220000 union all
  select 'SWEETBOX', '2D', 'WEEKEND', 'AFTER_17',  240000 union all
  select 'SWEETBOX', '2D', 'HOLIDAY', 'BEFORE_17', 250000 union all
  select 'SWEETBOX', '2D', 'HOLIDAY', 'AFTER_17',  270000 union all

  -- 3D NORMAL
  select 'NORMAL', '3D', 'NORMAL',  'BEFORE_17', 100000 union all
  select 'NORMAL', '3D', 'NORMAL',  'AFTER_17',  110000 union all
  select 'NORMAL', '3D', 'WEEKEND', 'BEFORE_17', 115000 union all
  select 'NORMAL', '3D', 'WEEKEND', 'AFTER_17',  125000 union all
  select 'NORMAL', '3D', 'HOLIDAY', 'BEFORE_17', 130000 union all
  select 'NORMAL', '3D', 'HOLIDAY', 'AFTER_17',  140000 union all

  -- 3D VIP
  select 'VIP', '3D', 'NORMAL',  'BEFORE_17', 115000 union all
  select 'VIP', '3D', 'NORMAL',  'AFTER_17',  125000 union all
  select 'VIP', '3D', 'WEEKEND', 'BEFORE_17', 135000 union all
  select 'VIP', '3D', 'WEEKEND', 'AFTER_17',  145000 union all
  select 'VIP', '3D', 'HOLIDAY', 'BEFORE_17', 150000 union all
  select 'VIP', '3D', 'HOLIDAY', 'AFTER_17',  160000 union all

  -- 3D SWEETBOX
  select 'SWEETBOX', '3D', 'NORMAL',  'BEFORE_17', 230000 union all
  select 'SWEETBOX', '3D', 'NORMAL',  'AFTER_17',  250000 union all
  select 'SWEETBOX', '3D', 'WEEKEND', 'BEFORE_17', 270000 union all
  select 'SWEETBOX', '3D', 'WEEKEND', 'AFTER_17',  290000 union all
  select 'SWEETBOX', '3D', 'HOLIDAY', 'BEFORE_17', 300000 union all
  select 'SWEETBOX', '3D', 'HOLIDAY', 'AFTER_17',  320000
) p
on conflict (id) do update set
  amount = excluded.amount;

-- 7.2 Bảng giá ghi đè riêng cho rạp HN02 (AC-15: VIP 2D tối cuối tuần ghi đè 100.000đ)
insert into public.price_rules (
  id, scope, cinema_id, showtime_id, seat_type, format, day_type, time_band, amount
) values
  (
    extensions.uuid_generate_v5(
      '00000000-0000-0000-0000-000000000000'::uuid,
      'CINEMA:20000000-0000-0000-0000-000000000002:VIP:2D:WEEKEND:AFTER_17'
    ),
    'CINEMA',
    '20000000-0000-0000-0000-000000000002',
    null,
    'VIP',
    '2D',
    'WEEKEND',
    'AFTER_17',
    100000
  ),
  (
    extensions.uuid_generate_v5(
      '00000000-0000-0000-0000-000000000000'::uuid,
      'CINEMA:20000000-0000-0000-0000-000000000002:NORMAL:2D:NORMAL:BEFORE_17'
    ),
    'CINEMA',
    '20000000-0000-0000-0000-000000000002',
    null,
    'NORMAL',
    '2D',
    'NORMAL',
    'BEFORE_17',
    70000
  )
on conflict (id) do update set
  amount = excluded.amount;

-- ----------------------------------------------------------------------------
-- 8. SUẤT CHIẾU 7 NGÀY TỚI (showtimes - R-49, R-50, R-67)
-- Cùng room_id không chồng giờ ([starts_at, ends_at) đã bao gồm thời lượng + 15' dọn phòng).
-- Lần seed ĐẦU trên DB mới tạo suất ON_SALE trong vòng 2 giờ tới (demo live). Chạy lại dùng
-- on conflict do nothing nên KHÔNG dời giờ: muốn có suất live mới thì reset DB rồi seed lại.
-- ----------------------------------------------------------------------------

-- 8.1 Suất demo Live trong vòng 2 giờ tới (ở các phòng dành riêng: HN01 P4, HCM01 P3)
insert into public.showtimes (
  id, cinema_id, room_id, movie_id, starts_at, ends_at, format, language_mode, status
) values
  -- HN01 Phòng 4 (Live Demo trong 60 phút tới)
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000104',
    '40000000-0000-0000-0000-000000000004', -- Spider-Man (T13)
    date_trunc('minute', now()) + interval '45 minutes',
    date_trunc('minute', now()) + interval '200 minutes',
    '2D',
    'SUBTITLED',
    'ON_SALE'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000104',
    '40000000-0000-0000-0000-000000000008', -- Mai (T18)
    date_trunc('minute', now()) + interval '240 minutes',
    date_trunc('minute', now()) + interval '386 minutes',
    '2D',
    'ORIGINAL',
    'ON_SALE'
  ),
  -- HCM01 Phòng 3 (Live Demo trong 75 phút tới)
  (
    '50000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000403',
    '40000000-0000-0000-0000-000000000001', -- Doraemon (P)
    date_trunc('minute', now()) + interval '75 minutes',
    date_trunc('minute', now()) + interval '205 minutes',
    '2D',
    'DUBBED',
    'ON_SALE'
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000403',
    '40000000-0000-0000-0000-000000000006', -- Dune 2 (T16)
    date_trunc('minute', now()) + interval '240 minutes',
    date_trunc('minute', now()) + interval '421 minutes',
    '3D',
    'SUBTITLED',
    'ON_SALE'
  )
on conflict (id) do nothing;

-- 8.2 Suất chiếu lịch 7 ngày cố định cho các phòng chiếu tiêu chuẩn
-- Khung giờ: 09:30 (suất sáng), 14:00 (suất chiều), 19:30 (suất tối).
insert into public.showtimes (
  id, cinema_id, room_id, movie_id, starts_at, ends_at, format, language_mode, status
)
select
  extensions.uuid_generate_v5(
    '00000000-0000-0000-0000-000000000000'::uuid,
    sched.room_id::text || ':' || to_char(sched.starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SS')
  ) as id,
  sched.cinema_id,
  sched.room_id,
  sched.movie_id,
  sched.starts_at,
  sched.starts_at + interval '120 minutes' as ends_at, -- Trigger showtimes_derive_end sẽ tính lại chính xác
  sched.format,
  sched.language_mode,
  'ON_SALE'::public.showtime_status as status
from (
  select
    r.cinema_id,
    r.id as room_id,
    case
      when slot.slot_num = 1 then '40000000-0000-0000-0000-000000000001'::uuid -- Doraemon
      when slot.slot_num = 2 then '40000000-0000-0000-0000-000000000004'::uuid -- Spider-Man
      else '40000000-0000-0000-0000-000000000008'::uuid                       -- Mai
    end as movie_id,
    ((now() at time zone 'Asia/Ho_Chi_Minh')::date + (day_offset || ' days')::interval + slot.start_time) at time zone 'Asia/Ho_Chi_Minh' as starts_at,
    case when '3D' = any (r.supported_formats) and slot.slot_num = 2 then '3D'::public.screen_format else '2D'::public.screen_format end as format,
    'SUBTITLED'::public.language_mode as language_mode
  from public.rooms r
  cross join generate_series(0, 6) as day_offset
  cross join (
    select 1 as slot_num, time '09:30' as start_time union all
    select 2 as slot_num, time '14:00' as start_time union all
    select 3 as slot_num, time '19:30' as start_time
  ) slot
  -- Chỉ áp dụng cho các phòng tiêu chuẩn (loại trừ 2 phòng demo live ở mục 8.1)
  where r.id::text like '30000000-0000-0000-0000-%' -- chỉ phòng seed, không đụng phòng dev tạo qua UI
    and r.id not in (
    '30000000-0000-0000-0000-000000000104'::uuid,
    '30000000-0000-0000-0000-000000000403'::uuid
  )
) sched
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 9. VOUCHER MẪU (vouchers - R-90, R-92, R-93)
-- ----------------------------------------------------------------------------
insert into public.vouchers (
  id, code, discount_type, discount_value, max_discount, applies_to,
  valid_from, valid_to, min_order_amount, total_uses_limit, per_user_limit, active
) values
  (
    '60000000-0000-0000-0000-000000000001',
    'WELCOME10',
    'PERCENT',
    10,
    50000,
    'ORDER',
    now() - interval '30 days',
    now() + interval '365 days',
    0,
    1000,
    1,
    true
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    'CINEMA30K',
    'FIXED',
    30000,
    null,
    'ORDER',
    now() - interval '30 days',
    now() + interval '180 days',
    150000,
    500,
    2,
    true
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    'VIP50K',
    'FIXED',
    50000,
    null,
    'ORDER',
    now() - interval '30 days',
    now() + interval '180 days',
    200000,
    200,
    1,
    true
  )
on conflict (code) do update set
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  max_discount = excluded.max_discount,
  applies_to = excluded.applies_to,
  valid_from = excluded.valid_from,
  valid_to = excluded.valid_to,
  min_order_amount = excluded.min_order_amount,
  total_uses_limit = excluded.total_uses_limit,
  per_user_limit = excluded.per_user_limit,
  active = excluded.active;

-- ----------------------------------------------------------------------------
-- 10. TÀI KHOẢN MẪU (auth.users, auth.identities, profiles, user_roles, staff_assignments)
-- Mật khẩu mặc định: LocalDev@123!
-- ----------------------------------------------------------------------------
-- 10.1 auth.users
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  -- 1. Admin hệ thống
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin@filmbooking.local',
    extensions.crypt('LocalDev@123!', extensions.gen_salt('bf', 10)),
    now(),
    '{"provider": "email", "providers": ["email"], "created_via": "nest"}'::jsonb,
    '{"full_name": "Quản Trị Toàn Chuỗi"}'::jsonb,
    now(),
    now()
  ),
  -- 2. Manager HN01
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'manager.hn01@filmbooking.local',
    extensions.crypt('LocalDev@123!', extensions.gen_salt('bf', 10)),
    now(),
    '{"provider": "email", "providers": ["email"], "created_via": "nest"}'::jsonb,
    '{"full_name": "Quản Lý Rạp Cầu Giấy"}'::jsonb,
    now(),
    now()
  ),
  -- 3. Manager HN02
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'manager.hn02@filmbooking.local',
    extensions.crypt('LocalDev@123!', extensions.gen_salt('bf', 10)),
    now(),
    '{"provider": "email", "providers": ["email"], "created_via": "nest"}'::jsonb,
    '{"full_name": "Quản Lý Rạp Ba Đình"}'::jsonb,
    now(),
    now()
  ),
  -- 4. Staff HN01
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'staff.hn01@filmbooking.local',
    extensions.crypt('LocalDev@123!', extensions.gen_salt('bf', 10)),
    now(),
    '{"provider": "email", "providers": ["email"], "created_via": "nest"}'::jsonb,
    '{"full_name": "Nhân Viên Soát Vé Cầu Giấy"}'::jsonb,
    now(),
    now()
  ),
  -- 5. Staff HN02
  (
    '00000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'staff.hn02@filmbooking.local',
    extensions.crypt('LocalDev@123!', extensions.gen_salt('bf', 10)),
    now(),
    '{"provider": "email", "providers": ["email"], "created_via": "nest"}'::jsonb,
    '{"full_name": "Nhân Viên Soát Vé Ba Đình"}'::jsonb,
    now(),
    now()
  ),
  -- 6. Customer mẫu
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-0000-0000-000000000006',
    'authenticated',
    'authenticated',
    'customer@filmbooking.local',
    extensions.crypt('LocalDev@123!', extensions.gen_salt('bf', 10)),
    now(),
    '{"provider": "email", "providers": ["email"], "created_via": "nest"}'::jsonb,
    '{"full_name": "Khách Hàng Mẫu"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data;

-- 10.2 auth.identities (liên kết provider email)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    '71000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'admin@filmbooking.local',
    jsonb_build_object('sub', '70000000-0000-0000-0000-000000000001', 'email', 'admin@filmbooking.local', 'email_verified', true),
    'email', now(), now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    'manager.hn01@filmbooking.local',
    jsonb_build_object('sub', '70000000-0000-0000-0000-000000000002', 'email', 'manager.hn01@filmbooking.local', 'email_verified', true),
    'email', now(), now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000003',
    'manager.hn02@filmbooking.local',
    jsonb_build_object('sub', '70000000-0000-0000-0000-000000000003', 'email', 'manager.hn02@filmbooking.local', 'email_verified', true),
    'email', now(), now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000004',
    'staff.hn01@filmbooking.local',
    jsonb_build_object('sub', '70000000-0000-0000-0000-000000000004', 'email', 'staff.hn01@filmbooking.local', 'email_verified', true),
    'email', now(), now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000005',
    'staff.hn02@filmbooking.local',
    jsonb_build_object('sub', '70000000-0000-0000-0000-000000000005', 'email', 'staff.hn02@filmbooking.local', 'email_verified', true),
    'email', now(), now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000006',
    'customer@filmbooking.local',
    jsonb_build_object('sub', '70000000-0000-0000-0000-000000000006', 'email', 'customer@filmbooking.local', 'email_verified', true),
    'email', now(), now(), now()
  )
on conflict (provider_id, provider) do nothing;

-- 10.3 Cập nhật hồ sơ profiles (đã được tạo tự động qua trigger on_auth_user_created)
update public.profiles set
  full_name = 'Quản Trị Toàn Chuỗi',
  phone = '0901234567',
  date_of_birth = '1985-05-15',
  gender = 'MALE',
  province_id = '10000000-0000-0000-0000-000000000001'
where id = '70000000-0000-0000-0000-000000000001';

update public.profiles set
  full_name = 'Quản Lý Rạp Cầu Giấy',
  phone = '0902345678',
  date_of_birth = '1988-08-20',
  gender = 'MALE',
  province_id = '10000000-0000-0000-0000-000000000001'
where id = '70000000-0000-0000-0000-000000000002';

update public.profiles set
  full_name = 'Quản Lý Rạp Ba Đình',
  phone = '0903456789',
  date_of_birth = '1990-11-12',
  gender = 'FEMALE',
  province_id = '10000000-0000-0000-0000-000000000001'
where id = '70000000-0000-0000-0000-000000000003';

update public.profiles set
  full_name = 'Nhân Viên Soát Vé Cầu Giấy',
  phone = '0904567890',
  date_of_birth = '1998-03-25',
  gender = 'FEMALE',
  province_id = '10000000-0000-0000-0000-000000000001'
where id = '70000000-0000-0000-0000-000000000004';

update public.profiles set
  full_name = 'Nhân Viên Soát Vé Ba Đình',
  phone = '0905678901',
  date_of_birth = '1999-07-14',
  gender = 'MALE',
  province_id = '10000000-0000-0000-0000-000000000001'
where id = '70000000-0000-0000-0000-000000000005';

update public.profiles set
  full_name = 'Khách Hàng Mẫu',
  phone = '0909999999',
  date_of_birth = '1996-01-01', -- Đủ tuổi xem mọi phim T18 (R-68)
  gender = 'OTHER',
  province_id = '10000000-0000-0000-0000-000000000001'
where id = '70000000-0000-0000-0000-000000000006';

-- 10.4 Gán vai trò toàn cục user_roles
insert into public.user_roles (user_id, role) values
  ('70000000-0000-0000-0000-000000000001', 'ADMIN')
on conflict (user_id, role) do nothing;

-- 10.5 Gán vai trò tại rạp staff_assignments
insert into public.staff_assignments (user_id, cinema_id, role) values
  -- Manager HN01
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'MANAGER'),
  -- Manager HN02
  ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'MANAGER'),
  -- Staff HN01
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'STAFF'),
  -- Staff HN02
  ('70000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'STAFF')
on conflict (user_id, cinema_id) do update set
  role = excluded.role;

-- 10.6 Bằng chứng đồng ý điều khoản (consents - R-03)
-- consents không có unique → dùng where not exists để chạy lại không nhân đôi
insert into public.consents (user_id, consent_type, version, metadata)
select v.user_id, v.consent_type::public.consent_type, v.version, v.metadata
from (values
  ('70000000-0000-0000-0000-000000000006'::uuid, 'TERMS_OF_SERVICE', '1.0', '{"channel": "web_signup"}'::jsonb),
  ('70000000-0000-0000-0000-000000000006'::uuid, 'PRIVACY_POLICY',   '1.0', '{"channel": "web_signup"}'::jsonb)
) as v(user_id, consent_type, version, metadata)
where not exists (
  select 1 from public.consents c
  where c.user_id = v.user_id and c.consent_type = v.consent_type::public.consent_type and c.version = v.version
);

-- ----------------------------------------------------------------------------
-- 11. KHOÁ API POS TỪNG RẠP (pos_api_keys - R-111, R-120, R-130)
-- Chỉ lưu key_hash (SHA-256) và prefix; plaintext ghi trong supabase/seed/README.md.
-- ----------------------------------------------------------------------------
insert into public.pos_api_keys (id, cinema_id, prefix, key_hash) values
  (
    '80000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'pos_hn01_',
    encode(extensions.digest('pos_hn01_secret_dev_key_2026', 'sha256'), 'hex')
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'pos_hn02_',
    encode(extensions.digest('pos_hn02_secret_dev_key_2026', 'sha256'), 'hex')
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000003',
    'pos_hn03_',
    encode(extensions.digest('pos_hn03_secret_dev_key_2026', 'sha256'), 'hex')
  ),
  (
    '80000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000004',
    'pos_hcm01_',
    encode(extensions.digest('pos_hcm01_secret_dev_key_2026', 'sha256'), 'hex')
  ),
  (
    '80000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000005',
    'pos_dn01_',
    encode(extensions.digest('pos_dn01_secret_dev_key_2026', 'sha256'), 'hex')
  )
on conflict (id) do update set
  cinema_id = excluded.cinema_id,
  prefix = excluded.prefix,
  key_hash = excluded.key_hash;
