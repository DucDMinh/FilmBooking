# Review: build-filmbooking layer-7 task-03, round 2

Agent: reviewer
Task: Web admin lịch chiếu. Round 2 sau fix attempt 2. Scope đã được dispatcher mở rộng thêm: API `GET /cinemas/:cinemaId/showtimes/:showtimeId`, migration `20261114000000_cancel_showtimes_skip_cancelled.sql`, pgTAP `061_cancel_showtimes_skip_cancelled.test.sql` và một mục mới trong `docs/API_SPEC.md`.
Worktree: `E:/FilmBooking/.worktrees/layer-7__task-03` (chưa commit)

## Review level
**STRICT**

## Reason
Task có API mới đọc dữ liệu theo phạm vi rạp (RBAC + CinemaScope), đổi hành vi RPC phá huỷ `cancel_showtimes` (SECURITY DEFINER, đụng orders, affected_order_cases, email_outbox), có migration và màn huỷ suất hàng loạt.

## Blast radius
- API cinema-ops: thêm 1 route GET và `ShowtimesService.getOne`, dùng lại `requireShowtime` (client `forUser`, có RLS, lọc `eq id` + `eq cinema_id`). Không trùng route với `GET .../showtimes/:showtimeId/locks`.
- DB: `cancel_showtimes(uuid[], text, uuid)` được tạo lại bằng `create or replace`, giữ nguyên chữ ký. Mọi caller của RPC chịu ảnh hưởng: API `CancellationService` (huỷ suất, đóng rạp với `allFuture`). Thay đổi là suất đã `CANCELLED` sẽ bị bỏ qua.
- Web: 3 route `/admin/lich-chieu*` và các component admin mới (giống round 1).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, web, api) |
| `pnpm lint` | PASS |
| `pnpm test` (toàn workspace) | PASS: shared 14, api 470 (24 file, gồm cinema-ops e2e), web 283 (20 file), scripts 16 |
| `pnpm build` | PASS (có `/admin/lich-chieu`, `/[id]`, `/tao`) |
| `pnpm db:test` | **SKIP**: `DbConnectError ECONNREFUSED 127.0.0.1:54322`, Docker/Supabase local không chạy. Không chạy lại. |
| oxlint | skip, oxlint chưa cấu hình |
| aislop / ocr | skip, không có trong allowlist / ocr chưa cài |
| AI-friendly web gate | N/A (màn admin nội bộ) |

## Kiểm từng finding của round 1

| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| F1 (MAJOR): trang chi tiết lấy dữ liệu từ seatmap công khai | **ĐÃ SỬA đúng root cause** | `[id]/page.tsx:68-86` lấy thông tin suất từ endpoint admin mới. Seatmap chỉ gọi khi suất chưa `CANCELLED`, có try/catch nên lỗi seatmap (rạp đóng, phim lưu trữ) không làm hỏng trang. `:305` khi tải lại lỗi chỉ hiện `ErrorState`, không render dữ liệu cũ kèm nút còn bật. Sau khi huỷ, `reload()` lấy đúng `status=CANCELLED`, nên badge hiện "Đã huỷ" và nút "Huỷ suất" bị disable (AC-24 đạt ở trang chi tiết). Phòng thủ ở DB: migration mới bỏ qua suất đã huỷ, không ghi đè `cancel_reason`/`cancelled_by`/`affected_order_cases.reason`. |
| F1: false-confidence test | **ĐÃ SỬA** | `showtime-detail.test.tsx:32-61` mock seatmap reject với suất CANCELLED, endpoint admin trả mọi trạng thái; có assert seatmap không được gọi khi suất đã huỷ. Khớp `seatmap.service.ts` thật. |
| F2 (MAJOR): xoá suất báo thành công cả khi lỗi | **ĐÃ SỬA** | `run` trả boolean (`:114-128`); `:147` chỉ `setDeleted(true)` khi DELETE thành công và không reload. Có test 409 `SHOWTIME_HAS_SALES` và test thành công (đếm chỉ 1 lần GET chi tiết). |
| F3: huỷ được suất đã qua giờ | **ĐÃ SỬA** | `:92,233` `disabled={cancelled \|\| started}`; có test. |
| F5: bulk bỏ qua xung đột mà không báo | **ĐÃ SỬA** | `showtime-bulk-form.tsx:136` truyền `skipped.length`; `tao/page.tsx:24-27` hiện "bỏ qua N suất do trùng lịch". Giới hạn 62 ngày vẫn cắt im lặng, nhưng ô đếm `count` (`:95`) tính trên dải ngày đã cắt nên người dùng thấy đúng số suất sẽ tạo. Chấp nhận. |
| F6: mở khoá từng phần, dropdown phòng | **ĐÃ SỬA** | `seat-lock-panel.tsx:60-63` vẫn gọi `onChanged()` khi lỗi; `[id]/page.tsx:193-194` chỉ liệt kê phòng ACTIVE hỗ trợ đúng định dạng (vẫn giữ phòng hiện tại); có test. |
| F6: SeatMap không realtime (B19) | **Gap, chấp nhận** | Xem đánh giá gap bên dưới. |
| F4: lệch design-spec B20 | **Gap, chấp nhận** | Xem đánh giá gap bên dưới. |

## API mới: `GET /cinemas/:cinemaId/showtimes/:showtimeId`
- RBAC: `@CinemaScope()` + `@Roles("STAFF")`, cùng mức quyền với `GET /cinemas/:cinemaId/showtimes` (list) và `.../locks`. Nhất quán với yêu cầu STAFF/MANAGER/ADMIN.
- Phạm vi rạp: dùng client `forUser(jwt)` nên RLS áp dụng. `requireShowtime` lọc theo cả `id` lẫn `cinema_id`, nên suất của rạp khác trả 404 chứ không rò dữ liệu kể cả với ADMIN. Có e2e cho: Staff đọc được; CANCELLED + rạp TEMP_CLOSED vẫn 200; Manager HN01 gọi path HN02 bị 403; Admin gọi path HN02 với suất của HN01 bị 404.
- `uuidParam` validate cả 2 param. Response là `ShowtimeDto` (không có PII). `docs/API_SPEC.md` đã ghi đúng.
- Fake DB trong e2e lọc `eq("cinema_id")` thật (test 404 chứng minh điều này), không bịa hành vi.

## Migration `20261114000000_cancel_showtimes_skip_cancelled.sql`
- Versioned, file mới, timestamp sau migration cuối (`20261113180000` trên staging). Không sửa migration cũ. Không có migration nào sau đó định nghĩa lại `cancel_showtimes` (chỉ có comment trong `20261113160000`).
- Không destructive: `create or replace` với cùng chữ ký `(uuid[], text, uuid)`, không DROP, không đổi type, không backfill. **Không cần `HIGH_RISK_MIGRATION`.**
- Giữ `security definer`, `set search_path = ''`, `revoke all ... from public, anon` và `grant execute ... to authenticated, service_role`, khớp phiên bản `20261112150000`.
- So từng dòng với `20261112150000_cancel_showtimes_hardening.sql:147-366`: kiểm lý do, chặn giả mạo actor (42501), kiểm scope MANAGER trên **toàn bộ** `p_showtime_ids` (chạy trước bước lọc, nên không lách được bằng cách gửi id rạp khác đã huỷ) đều giữ nguyên. Thay đổi duy nhất: lock `FOR UPDATE` + lọc `status <> 'CANCELLED'` vào `v_ids`, return sớm khi rỗng, và mọi bước sau dùng `v_ids` thay `p_showtime_ids` (kể cả `execute ... using v_ids` cho tickets). Thứ tự khoá showtimes → orders → seat_states giữ nguyên.
- Concurrency: hai lời gọi huỷ cùng một suất thì T2 chờ lock. Ở READ COMMITTED, khi T1 commit, PostgreSQL đánh giá lại `status <> 'CANCELLED'` và loại dòng đó, nên T2 trả count 0 và không ghi đè. Hành vi này tốt hơn trước.
- Tương thích pgTAP cũ: `057_cancel_showtimes_idempotent` lần gọi 2 chỉ assert `success=true`, `emails_enqueued_count=0`, outbox và `email_sent` không đổi. Hàm mới vẫn thoả hết (return sớm với `success=true`, count 0).

## Đánh giá gap F4 và SeatMap realtime
Task file chỉ có AC-14, AC-24, R-54 và `?cancelAll=1`. Danh sách suất ở bước 1, mẫu email, toast + điều hướng `?showtime=` (B20) và realtime (B19) là chi tiết của design-spec, không nằm trong AC của task. Luồng nghiệp vụ không bị hỏng: preview đếm, lý do bắt buộc, gõ xác nhận, sau khi huỷ có link tới đơn bị ảnh hưởng, sau mỗi thao tác sơ đồ ghế được tải lại. Vì vậy **chấp nhận để gap**, kèm điều kiện: worktree hiện chưa ghi 2 gap này vào gap register (`docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` không có trong diff), nên **dispatcher phải thêm 2 mục GAP lúc close-out**.

## Findings mới (round 2)

### N1: MINOR, khi không có sơ đồ ghế thì UI không biết suất đã bán
`[id]/page.tsx:93-96`: nếu `seatsAvailable=false` (phim đã ARCHIVED hoặc rạp không OPEN, seatmap trả 404) thì `seats=[]`. Kéo theo `sold=false`, form sửa và nút "Xoá suất" vẫn bật, và header hiện "0/0 vé đã bán" dễ gây hiểu nhầm.
- Server vẫn chặn bằng `assertNoSales` (409), và sau khi sửa F2 thì lỗi được hiện đúng, nên không mất dữ liệu.
- Rạp không phải OPEN thì theo trigger R-33 phải huỷ hết suất tương lai trước, nên ca thực tế chủ yếu là phim đã lưu trữ.
- Gợi ý: khi `!seatsAvailable`, coi trạng thái bán là "không rõ" và khoá sửa/xoá, hoặc ẩn số vé đã bán. Không chặn PASS.

### N2: MINOR, mock RPC trong `cancellation.e2e-spec.ts:222` chưa mô phỏng việc bỏ qua suất đã huỷ
Mock trả `cancelled_showtimes_count: showtimeIds.length`. API chỉ chuyển tiếp con số này nên không gây false-confidence cho code thay đổi ở task. Hành vi thật đã được phủ bằng pgTAP 061, nhưng 061 chưa chạy (xem phần Residual risk).

### N3: ghi chú quy trình
- Các file API, migration và docs nằm ngoài "Files to Create/Modify" ban đầu, nhưng dispatcher đã mở rộng scope rõ ràng. Hợp lệ.
- `ShowtimeDetail` khoảng 190 dòng, vẫn tính 1 AI-chaos indicator (dưới ngưỡng 3). Tên rõ, comment nói lý do.
- STAFF gõ thẳng URL sẽ thấy nút ghi còn bật, nhưng API trả 403 (giữ nguyên ghi chú round 1, không chặn).

## Residual risk
- **pgTAP 061 (và hồi quy 043/048/051/054/056/057) chưa chạy** vì Docker không bật. Tôi đã đọc từng dòng migration và đối chiếu với bản cũ: đây là thay thế cơ học, các assert trong 057 vẫn tương thích. **Điều kiện: dispatcher hoặc CI phải chạy `pnpm db:test` PASS trước khi promote migration lên staging/prod.** Nếu fail thì mở lại task.
- Hành vi mới: suất đã `CANCELLED` không còn được "quét lại" đơn. Theo hardening hiện có (hold/confirm khoá suất FOR SHARE và kiểm trạng thái), không được còn đơn sống trên suất đã huỷ, nên rủi ro thấp.

## Verdict
**STRICT PASS**: F1, F2 (MAJOR) và F3, F5, F6 đã được sửa đúng root cause và có test mock đúng contract thật. API mới đúng RBAC và phạm vi rạp. Migration an toàn, không destructive, giữ ACL và `search_path`.
Điều kiện close-out: (1) chạy `pnpm db:test` PASS khi có Docker, trước khi promote; (2) ghi gap F4/B20 và SeatMap realtime/B19 vào gap register.
