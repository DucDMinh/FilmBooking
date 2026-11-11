Agent: reviewer

# Review: build-filmbooking layer-2 task-01, round 1 (migration catalog)

- Worktree: `E:\FilmBooking\.worktrees\layer-2__task-01` (chưa commit)
- Files: `supabase/migrations/20261111020000_catalog.sql`, `supabase/tests/020_catalog.test.sql`
- Review level: **STRICT**
- Reason: schema/migration, RLS theo rạp (cách ly tenant), Storage policy (upload/truy cập file), dữ liệu dùng chung cho nhiều màn/client (catalog, lịch chiếu, sơ đồ ghế).
- Blast radius: các bảng `movies`, `rooms`, `seats`, `showtimes`, `showtime_seat_locks`; 4 bucket storage + policy trên `storage.objects`; mọi layer sau dựa vào các bảng này (đặt vé/giữ ghế, POS, báo cáo, trang SEO phim/rạp, admin).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS. Chạy không có `-w` vì agent-guard coi `-w` là cờ ghi file; script gốc vẫn là `pnpm -r --if-present lint`, nên tương đương |
| `pnpm typecheck` | PASS (cùng ghi chú về `-w`) |
| `pnpm test` | PASS: shared 14, api 20, web 10 |
| `pnpm db:start` / `db:test` / `db:stop` | **skip**: agent-guard chặn bước lấy khoá `.worktrees/.dblock` (lệnh nối). Dựa trên báo cáo builder: db:test PASS, 133 test. Tôi đã tự đếm `plan(45)` và khớp 45 assertion trong file test |
| `pnpm build` | không chạy (diff chỉ có SQL) |

## Skill gates
- aislop: skip, diff chỉ có SQL migration/test, không có TS/JS.
- oxlint (anti-slop): skip, diff không đụng TS/JS.
- ocr (open-code-review): skip, ocr chưa cài.
- AI-readable: OK. Tên rõ ràng, comment giải thích WHY (lý do dùng CASE khi ép uuid, lý do tách policy đọc). Không có hàm quá dài. File migration 415 dòng: SQL migration, chấp nhận được.
- ai-friendly-web: N/A (migration, không phải trang public).
- blitzstrike: skip, chưa cài và không có môi trường được phép.
- Responsive Checklist Gate: N/A (không đụng UI).

## Điểm làm tốt (đã kiểm)
- Cả 5 bảng bật RLS. `revoke all` rồi mới grant thu hẹp; `ends_at` và `locked_by` không nằm trong grant cho client; `cinema_id` của suất không update được.
- FK ghép `(room_id, cinema_id)` chặn gắn phòng của rạp khác vào bảng `seats`/`showtimes`. Trigger khoá ghế tự điền `room_id`/`cinema_id` từ suất. WITH CHECK của RLS đánh giá sau BEFORE trigger, nên Manager HN02 không khoá được ghế HN01 (có test).
- Exclusion `[)` + `where status <> 'CANCELLED'`: suất liền kề 21:15 được phép, suất CLOSED vẫn giữ phòng. Có btree_gist (migration extensions).
- `col_span` là cột generated stored (client không ghi được). Exclusion theo `int4range` chặn ghế chồng ô Sweetbox. Trigger kiểm ghế nằm trong lưới, tính cả ô thứ 2 của Sweetbox.
- Trigger tính `ends_at` chạy lại khi UPDATE `starts_at`/`movie_id`/`room_id`/`format`. Thứ tự lấy thời gian dọn phòng: rạp → app_settings → 15.
- Mọi hàm trigger SECURITY DEFINER đều có `search_path = ''` và `revoke all` cho anon/authenticated. Không có RPC mở cho client.
- Audit trigger đủ trên cả 5 bảng, có `cinema_id` (có test).
- Storage cinema-images ép uuid trong CASE (fail-closed). Avatars so khớp chính xác `foldername[1] = auth.uid()::text`.
- Migration chỉ thêm đối tượng mới (additive). Không có DROP/ALTER/backfill, nên không phải HIGH_RISK_MIGRATION.

## Findings

### [MAJOR] M1: Lộ phim DRAFT/ARCHIVED qua showtimes
- `supabase/migrations/20261111020000_catalog.sql:184-217` (`showtimes_derive_end` đọc `movies` bằng quyền definer, không kiểm `status`) và `:322` (`showtimes_select ... using (true)` cho anon).
- Manager hoặc Admin tạo được suất cho phim DRAFT/ARCHIVED. Khi đó anon và khách thấy `movie_id` và lịch của phim nháp, thậm chí suất đang `ON_SALE` (về sau đặt vé được cho phim chưa công bố). Join `showtimes → movies` trả movie null, tạo dữ liệu mồ côi trên trang SEO/lịch chiếu. Đây đúng là trọng tâm review "phim DRAFT lộ qua join". Nó cũng mâu thuẫn chính sách "DRAFT chỉ Admin+Manager thấy" của chính migration này.
- Fix: trong trigger, khi INSERT hoặc khi đổi `movie_id`, raise `23514` nếu phim không ở trạng thái PUBLISHED. Ngoài ra (hoặc thay thế), lọc `showtimes_select` cho anon/khách bằng `exists (select 1 from public.movies m where m.id = movie_id and m.status = 'PUBLISHED')`, và tách policy staff đọc đầy đủ. Thêm pgTAP: tạo suất cho phim DRAFT bị chặn; anon không thấy suất của phim DRAFT.

### [MAJOR] M2: Anon liệt kê được toàn bộ bucket avatars (lộ UUID user)
- `supabase/migrations/20261111020000_catalog.sql:357-358`: `catalog_images_select` cho anon/authenticated SELECT trên `avatars`.
- Bucket public đã phục vụ file qua public URL mà không cần policy SELECT. Policy này chỉ thêm khả năng gọi list API, qua đó anon liệt kê được mọi thư mục `<auth uid>/` (lộ toàn bộ user id) và scrape hàng loạt ảnh đại diện. Không có nhu cầu chức năng nào cần việc này.
- Fix: bỏ `avatars` khỏi `catalog_images_select`. Thêm policy `avatars_own_select ... to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)`, cần cho upsert. Hiển thị ảnh vẫn qua public URL. Thêm test: anon/khách khác đếm object avatars của người khác = 0.

### [MAJOR] M3: Test chưa phủ phần "không sửa được" của AC-16 (cách ly rạp khi UPDATE/DELETE)
- `supabase/tests/020_catalog.test.sql:153-197, 202-223, 239-270`: chỉ test INSERT chéo rạp.
- Khi RLS chặn UPDATE/DELETE, câu lệnh không báo lỗi mà trả 0 dòng. Hiện chưa có assertion nào chứng minh Manager HN01 không sửa hoặc xoá được dữ liệu HN02. Task STRICT có logic phân quyền quan trọng thiếu test, và caller yêu cầu rõ "test đủ AC-16".
- Fix: thêm test cho Manager HN01 với dữ liệu HN02. Mỗi case gồm `update`/`delete` rồi `tap_owner()` và assert dòng HN02 không đổi hoặc vẫn còn:
  - showtimes, rooms, seats, showtime_seat_locks: UPDATE/DELETE trên dòng HN02;
  - seats: INSERT vào phòng HN02 phải ra `42501`;
  - storage cinema-images: UPDATE/DELETE object thuộc thư mục HN02;
  - avatars: UPDATE/DELETE avatar của người khác.

### [MINOR]
1. `:220`: `ends_at` không được tính lại khi `movies.duration_minutes` hoặc `cinemas.cleaning_minutes` đổi sau khi đã có suất. Exclusion khi đó so trên khoảng giờ cũ, sai (ảnh hưởng toàn vẹn R-50). Đề xuất task follow-up: trigger AFTER UPDATE trên movies/cinemas để tính lại các suất tương lai chưa huỷ (gặp chồng giờ thì báo lỗi), hoặc ghi rõ thành gap.
2. `:66-80, 157-180`: thu nhỏ `grid_rows`/`grid_cols` của phòng không kiểm các ghế đang có, nên để lại ghế nằm ngoài lưới. Đề xuất trigger trên rooms chặn thu nhỏ khi còn ghế ngoài lưới.
3. `:201`: kiểm phòng MAINTENANCE chỉ chạy khi INSERT. UPDATE `room_id` sang phòng đang bảo trì vẫn được. Nên kiểm cả khi `room_id` thay đổi.
4. Test không phủ việc `ends_at` được tính lại khi UPDATE `starts_at`/`movie_id`, cũng không phủ UPDATE dẫn tới chồng giờ.
5. `:320`: grant `status` cho phép đưa suất CANCELLED về ON_SALE (phải qua exclusion, nhưng vẫn "hồi sinh" được). Quy tắc huỷ (R-108) để layer sau xử lý; ghi chú lại.
6. `:333-334`: grant theo cột trên locks làm `select *` từ client (PostgREST `select=*`) lỗi 42501. Layer API/web phải liệt kê cột tường minh; nên ghi vào docs/API_SPEC khi reconcile.
7. Thời gian dọn phòng có 2 nguồn override: cột `cinemas.cleaning_minutes` (trigger đang dùng, đúng comment của layer 1) và `cinema_settings` key `default_cleaning_minutes`, mà trigger bỏ qua. Nên chốt 1 nguồn (R-56) và ghi gap hoặc ERD; đây là vấn đề thiết kế từ layer 1, ngoài scope.
8. Ép kiểu `(s.value #>> '{}')::integer` (`:210`): nếu Admin đặt giá trị không phải số thì mọi lần tạo suất đều lỗi. Nên validate ở app_settings hoặc dùng fallback an toàn.

## Spec tension (ghi cho spec-validator, không tính FAIL)
AC-16 (SPECIFICATIONS.md:379) ghi Manager HN01 "truy vấn suất ... của HN02 → không nhận dữ liệu". Task file (layer-2-task-01.md:14) và R-44/R-46 yêu cầu lịch chiếu đọc công khai. Migration cho đọc công khai, đúng với task. Cần làm rõ nghĩa "suất" trong AC-16 (có thể là dữ liệu vận hành của suất như đơn/doanh thu).

## Residual risk
- db:test không được tôi chạy lại độc lập (bị guard chặn lấy khoá DB), chỉ dựa trên báo cáo builder.
- Tên object storage có đoạn `..` (vd `<c1>/../<c2>/x.jpg`): policy dùng thư mục đầu tiên `<c1>`, nên không ghi được vào prefix của rạp khác ở tầng DB. Hành vi normalize key và URL của Storage API thì chưa xác minh.
- Manager quản lý 2 rạp có thể chuyển `rooms.cinema_id`. FK NO ACTION từ seats/showtimes chặn khi phòng đã có dữ liệu con; phòng rỗng thì chuyển được (chấp nhận được).

## Verdict
**FAIL**: còn 3 MAJOR (M1 lộ phim DRAFT qua showtimes, M2 liệt kê được avatars, M3 thiếu test UPDATE/DELETE chéo rạp cho AC-16). Trả builder sửa rồi review round 2.
