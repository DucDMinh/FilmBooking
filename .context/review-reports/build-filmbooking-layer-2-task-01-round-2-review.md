Agent: reviewer

# Review: build-filmbooking layer-2 task-01, round 2 (migration catalog)

- Worktree: `E:\FilmBooking\.worktrees\layer-2__task-01` (chưa commit)
- Files: `supabase/migrations/20261111020000_catalog.sql`, `supabase/tests/020_catalog.test.sql`
- Review level: **STRICT**. Lý do: RLS theo rạp, schema/migration, Storage policy.
- Blast radius: không đổi so với round 1. Gồm movies, rooms, seats, showtimes, showtime_seat_locks và storage.objects (4 bucket). Thêm: policy đọc showtimes/locks giờ phụ thuộc RLS của movies.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Không chạy lại: round 2 chỉ đổi 2 file SQL, không đụng TS/JS, và Tool Loop Guard cấm chạy lặp cùng lệnh. Kết quả round 1 vẫn áp dụng: cả ba PASS, gồm shared 14, api 20, web 10 |
| `db:start` / `db:test` / `db:stop` | **skip**: agent-guard đã chặn bước lấy khoá `.dblock` ở round 1 nên tôi không thử lại. Theo builder: 163 test PASS, riêng 020_catalog là 75. Dispatcher sẽ chạy lại DB trên bản merge |

## Skill gates
- aislop / oxlint: skip, diff chỉ có SQL.
- ocr: skip, chưa cài.
- AI-readable: OK.
- ai-friendly-web: N/A.
- blitzstrike: skip.
- Responsive: N/A, không đụng UI.

## Đối chiếu finding round 1
| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| M1: phim DRAFT lộ qua showtimes | **Đã đóng** | Trigger chặn phim không PUBLISHED khi INSERT hoặc đổi `movie_id`, raise 23514 (`migration:206-208`). `showtimes_select` dùng `exists(movies)` nên đi theo RLS của movies (`:329-330`). `showtime_seat_locks_select` gắn theo suất nhìn thấy được (`:345-346`). Test: anon không thấy suất của phim DRAFT, Manager thấy, không tạo/đổi được suất sang phim DRAFT (`test:300-315`) |
| M2: anon liệt kê được avatars | **Đã đóng** | `catalog_images_select` bỏ avatars (`:367-368`). `avatars_own_select` chỉ cho thư mục `<uid>/` (`:369-370`). Test: anon đếm được 0; user khác 0; chính chủ 1 (`test:376-382`) |
| M3: thiếu test UPDATE/DELETE chéo rạp (AC-16) | **Đã đóng** | Có test 0 dòng cho UPDATE/DELETE showtimes, rooms, seats và DELETE locks; INSERT ghế vào phòng HN02 ra 42501; UPDATE storage của cinema-images HN02 và avatar người khác ra 0 dòng. Sau đó kiểm bằng owner rằng dữ liệu HN02 vẫn nguyên (`test:349-395`). Các row bị UPDATE đều SELECT được, nên kết quả 0 dòng thật sự do policy USING chặn, không phải do không nhìn thấy dòng |
| MINOR 3: đổi phòng sang phòng bảo trì | Đã đóng | `:203-205`, test `:319-321` |
| MINOR 4: thiếu test ends_at khi UPDATE và chồng giờ khi UPDATE | Đã đóng | test `:322-332` |

## Findings mới / còn lại

Không có CRITICAL hoặc MAJOR.

### [MINOR]
1. **Suất của phim bị ARCHIVED/DRAFT sẽ ẩn với khách.** Layer 3 (đơn/vé, lịch sử đặt vé) cần đọc suất đã mua qua RPC definer hoặc snapshot dữ liệu suất vào đơn. Nếu không, khách mất thông tin suất trong vé khi Admin archive phim. Ghi chú cho layer 3.
2. **`movies_select_staff` nay mở cho mọi nhân sự (kể cả STAFF) đọc phim DRAFT.** Đây là dữ liệu nội bộ, chấp nhận được, nhưng rộng hơn mô tả "Admin+Manager" ban đầu. Nên ghi vào ERD/DESIGN khi reconcile.
3. **Policy DELETE trên storage chưa có pgTAP**, do trigger `storage.protect_delete` chặn DELETE trực tiếp. Biểu thức của policy DELETE giống hệt UPDATE (đã có test). Cần e2e qua Storage API ở layer sau.
4. Các MINOR còn mở từ round 1, không chặn:
   - `ends_at` không được tính lại khi đổi thời lượng phim hoặc thời gian dọn phòng của rạp;
   - thu nhỏ lưới phòng bỏ sót ghế ngoài lưới;
   - đưa suất CANCELLED về lại ON_SALE (R-108);
   - `select *` trên bảng locks lỗi do grant theo cột;
   - 2 nguồn override thời gian dọn phòng;
   - ép kiểu integer từ app_settings.

   Đề xuất đưa vào follow-ups.
5. Hiệu năng: `showtimes_select` dùng `exists` theo từng dòng, kèm RLS của movies. Có PK index nên chấp nhận được; theo dõi p95 của lịch chiếu (NFR-01).

## Residual risk
- db:test không được reviewer chạy độc lập. Dispatcher phải chạy lại trên bản merge trước khi đóng layer.
- Chưa xác minh cách Storage API normalize key có `..` (mang sang từ round 1).

## Verdict
**PASS**, với điều kiện dispatcher chạy `db:test` PASS trên bản merge.
