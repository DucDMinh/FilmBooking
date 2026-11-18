# Review — feature cinema-status-notice · phase-2-task-03 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đường đổi trạng thái rạp (gửi email toàn bộ khách) chỉ Admin; endpoint công khai `GET /cinemas/:code` đổi hành vi (404 → 200) và đổi client sang service_role; DTO `CinemaDto`/`AdminCinemaDto` dùng chung web (≈20 chỗ import); xoá nhánh 409 cũ.
- **Blast radius:** `CancellationController` 4 route status; `CinemasService.detailPublic/update/listPublic/listAdmin/getAdmin/create`; mọi consumer web của `CinemaDto` (danh sách rạp, yêu thích, sitemap, JSON-LD, admin shell, price-matrix, report-dashboard…); `cinema-status-dialog.tsx` (web, còn nhánh 409 — task-04).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (exit 0) |
| `pnpm typecheck` | shared PASS, api PASS; web FAIL đúng dự kiến: 4 fixture test thiếu `scheduledStatus/scheduledEffectiveAt` (`catalog-admin.test.tsx:53`, `shell.test.tsx:497`, `cinemas.test.tsx:53`, `home.test.tsx:99`) — thuộc task-04 |
| `pnpm test` | shared 31/31, api 651/651, web 595/595 (47 file) — PASS |
| `pnpm test:int` | PASS 94/94 (9 file, không skip) — **reviewer đã chạy trên DB local thật lúc ~10:45 18/11/2026**; primary cần đối chiếu: `email_outbox` kind `CINEMA_STATUS_NOTICE` = 0, rạp có `scheduled_*` = 0, trạng thái rạp demo không đổi |
| aislop / oxlint / ocr / graphify | skip — không nằm trong allowlist reviewer (agent-guard chặn `graphify query`); không thử biến thể |
| `docker exec` (đối chiếu outbox/lịch trên DB demo) | Blocked (ngoài allowlist) — primary cần tự đối chiếu |

## Cross-boundary audit (code ↔ migration thật)

- RPC `schedule_cinema_status(p_cinema_id uuid, p_status cinema_status)` (`20261118110000_…fixes.sql:34`): tham số khớp `cancellation.service.ts` (`p_cinema_id`, `p_status`). Mã lỗi: 42501 (không Admin, kiểm TRƯỚC), 22023 (`INVALID_ARGUMENTS` / `STATUS_UNCHANGED`), P0002 (`CINEMA_NOT_FOUND`). Map trong `mapScheduleCinemaStatusError` đúng: 22023→400 VALIDATION_ERROR, P0002→404, 42501→403, khác → `AppException(INTERNAL_ERROR, message)` → `AllExceptionsFilter` (`all-exceptions.filter.ts:86-104`) thay message bằng `INTERNAL_MESSAGE` cho mọi lỗi ≥500 → không lộ message DB (có test `not.toContain("boom")`).
- Kết quả RPC: keys `status` (hiện tại), `scheduled_status`, `scheduled_effective_at`, `schedule_cancelled`, `emails_enqueued_count` — khớp mapping; nhánh huỷ lịch ép `scheduled*` = null (RPC cũng trả null). Nhánh 409 `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES` đã xoá hẳn khỏi `apps/api/src`.
- Validate status đầu vào: `setCinemaStatusSchema = z.object({status: cinemaStatusSchema})` (enum) + `cinemaIdParam = z.guid()`; RPC dùng tham số typed (enum Postgres) qua PostgREST → không injection; test "BROKEN" → 400 và không gọi RPC.
- Guard: `@Roles("ADMIN")` trên cả PATCH và POST (`cancellation.controller.ts:134,143`); `RolesGuard` chỉ cho qua `access.isAdmin` vì `satisfies(held, "ADMIN")` không bao giờ đúng với `StaffRole` (`access.service.ts:17`) → Manager/Staff/customer 403, không token 401 (AuthGuard global).
- `CINEMA_COLUMNS` (`cinemas.service.ts:19`) = cột công khai + `scheduled_status`, `scheduled_effective_at`; KHÔNG có `cleaning_minutes`, `online_cutoff_minutes`, `created_at`, `updated_at`, `province_id`. `hotline`/`email` là liên hệ công khai của rạp (đã công khai trước đây). Lộ `scheduled_*` công khai là chủ đích của R-136/R-137 (banner) và DB đã `grant select (scheduled_*) to anon` — chấp nhận được.
- Quyền đọc anon: `grant select on public.cinemas to anon` (`20261111010000_core_identity_chain.sql:407`) + policy `cinemas_select … using (true)` (`:409`) + `grant select (scheduled_*) to anon` (`20261118100000:43`); không có migration nào revoke/sửa policy → anon đọc được MỌI rạp, mọi cột trong `CINEMA_COLUMNS` (chứng cứ: `listPublic` chạy chính `CINEMA_COLUMNS` bằng anon).
- `update()`: `status` khác hiện tại → 400 trước khi ghi; bằng hiện tại → bỏ khỏi `changes` (không đụng quyền cột `status` đã bị thu ở DB). Manager gửi `status` vẫn 403 trước (`CINEMA_ADMIN_ONLY_FIELDS`), web form edit không gửi `status` (`cinema-form.tsx:159-171`). `create()` vẫn chèn `status` — nằm trong grant INSERT theo cột của task-01 (`20261118110000:26-29`), không chèn `scheduled_*`.
- Không còn đường đổi `cinemas.status` tức thì trong `apps/api/src`/`scripts`/seed: chỉ 2 chỗ `.from("cinemas").update(` — `cinemas.service.ts:250` (đã loại `status`) và `showtimes.service.ts:275-280` (chỉ `cleaning_minutes`/`online_cutoff_minutes`). Không còn tham chiếu `set_cinema_status` trong code (trừ stub "đã gỡ" trong fake e2e).

## Mutation analysis (test có đỏ không)

| Mutation | Test bắt |
|---|---|
| Bỏ `@Roles("ADMIN")` ở PATCH | e2e "Manager / Staff … -> 403" (fake RPC trả 200) + int `setStatus(…, manager)` → đỏ |
| Bỏ `@Roles("ADMIN")` chỉ ở POST | **không test nào đỏ** (it.each 4 route chỉ dùng adminToken) — xem F3 |
| Quay lại `.eq("status","OPEN")` ở `detailPublic` | e2e 404 assert "không eq status" + int CLOSED/TEMP_CLOSED/COMING_SOON → 200 → đỏ |
| Cho `update()` đổi status | e2e 400 + int `viaPatch` 400 → đỏ |
| Bỏ nhánh `status !== "OPEN"` (vẫn truy vấn phòng/suất) | e2e assert không query rooms/showtimes + int `showtimes: []` (rạp đóng có suất ON_SALE) → đỏ |

Mock fidelity: fake RPC trả mã lỗi/cấu trúc khớp RPC thật (22023/P0002/payload keys). Nhánh 42501 của fake không thể xảy ra qua API thật (RPC gọi bằng service_role luôn qua check Admin) — chỉ là test mapping, không false-confidence về quyền (quyền thật do RolesGuard, đã có test Manager).

## Findings

| # | Mức | Vị trí | Mô tả | Đề xuất |
|---|---|---|---|---|
| F1 | MINOR | `apps/api/src/modules/catalog/cinemas.service.ts:147-148`; `apps/api/test/catalog.e2e-spec.ts` (assert `query?.jwt toBe("admin")`); `docs/API_SPEC.md:85` | Endpoint công khai không xác thực dùng `this.supabase.admin()` (service_role) để tra rạp. Không lộ dữ liệu hôm nay (cột liệt kê tường minh, `code` qua regex `^[A-Z0-9]{2,10}$`), nhưng không cần: anon đã đọc được mọi rạp (grant + policy `using (true)`). Lý do "không phụ thuộc RLS" ngược hướng: nếu sau này siết policy anon, route công khai này sẽ âm thầm bỏ qua. | **Khuyến nghị đổi sang `this.publicClient()`** (đặc quyền tối thiểu, đồng nhất với `listPublic`), đổi assert e2e sang `ANON_KEY`, sửa câu "Tra rạp bằng client admin" trong API_SPEC; int `catalog-public` sẽ chứng minh anon đọc được rạp CLOSED. Không chặn PASS. |
| F2 | MINOR | `docs/DESIGN.md:50` (mục 4.4) | Ghi "Manager bị chặn ở DB" — không đúng as-built cho đường API: API gọi RPC bằng service_role nên check 42501 trong RPC luôn qua; rào chắn thật là `RolesGuard` (`@Roles("ADMIN")`). DB chỉ chặn khi Manager gọi RPC trực tiếp bằng JWT của mình. | Sửa thành "chặn ở API (`@Roles("ADMIN")`); RPC tự chặn non-Admin khi gọi trực tiếp bằng JWT". (Tuỳ chọn phòng thủ nhiều lớp: gọi RPC bằng `forUser(jwt)` để 42501 có nghĩa thật.) |
| F3 | MINOR | `apps/api/test/cancellation.e2e-spec.ts` (describe AC-26/AC-27) | Chỉ test Manager trên `PATCH /admin/cinemas/:id/status`. Không test Staff, customer thường, không token, và không test non-Admin trên 3 alias còn lại (đặc biệt POST). Vì RPC chạy service_role (không có lớp DB), bỏ `@Roles` ở POST sẽ cho mọi user đăng nhập hẹn đóng rạp + gửi mail toàn hệ thống mà không test nào đỏ. Hiện guard đang đúng → không phải bug. | Thêm `it.each` (4 route × {manager, staff, customer} → 403, không token → 401, `scheduleCalls` rỗng). |
| F4 | MINOR | `docs/API_SPEC.md:192-195` | POST alias trả 201 (Nest mặc định, có test `method === "post" ? 201 : 200`) nhưng API_SPEC chỉ mô tả "200 {…}". | Ghi rõ POST alias trả 201. |
| F5 | INFO (residual) | `apps/api/test/integration/cancel-showtime.int-spec.ts:357-432` | Int test xếp `CINEMA_STATUS_NOTICE` cho MỌI tài khoản đã xác nhận trên DB local và chỉ xoá trong `finally`. Nếu worker pg_cron `/jobs/send-emails` local đang bật (commit 7bb7d64) với SMTP thật, mail có thể gửi đi trước khi xoá. Dọn rạp/lịch: rạp do factory tạo (scope cleanup), lịch được huỷ trong test, outbox xoá theo `cinema_id`. | Follow-up: tắt worker khi chạy int hoặc dùng SMTP giả; primary đối chiếu outbox sau lần chạy int của reviewer. |
| F6 | INFO (task-04) | `apps/web/src/components/admin/cinema-status-dialog.tsx:83,155`; 4 fixture test web | Web còn nhánh `CONFLICT`/`showtimeIds` (409 đã bỏ) và nút submit bị disable khi `status === cinema.status` → chưa huỷ lịch được từ UI; trang `/rap/[code]` chưa hiển thị thông báo trạng thái (API đã trả 200). | Nghĩa vụ task-04. Lưu ý commit: commit task-03 riêng để `pnpm typecheck` (web) đỏ ở SHA đó — nên commit gộp 03+04 hoặc ghi chú rõ. |
| F7 | INFO | `apps/api/src/modules/cancellation/cancellation.service.ts` (765 dòng) | File > 300 dòng là nợ có sẵn; diff này làm file ngắn đi. Không tính lỗi mới. | — |

### Ý kiến DTO (mục 4 của brief)
Giữ `scheduledStatus`/`scheduledEffectiveAt` **bắt buộc, nullable** như hiện tại. `cinemaToDto` luôn phát cả 2 trường cho mọi endpoint (list/detail/admin/create/update), nên bắt buộc là đúng hợp đồng; để optional sẽ che lệch API↔web (web có thể quên xử lý trường hợp có lịch mà typecheck vẫn xanh). Cái giá là 4 fixture web phải sửa ở task-04 — chấp nhận.

### Docs còn nhắc quy tắc cũ (liệt kê, không sửa)
- `GEMINI.md:55` — nhắc `set_cinema_status`.
- `docs/specs/2026-11-10-filmbooking-mvp-design.md:94` — "Đóng rạp bị chặn nếu còn suất tương lai đã bán chưa huỷ" (intent/design cũ).
- `docs/BRD.md` (BR-CHN-02, AC-26, §7.3, BR-ADM-13) — intent, đã ghi nhận ở `SPECIFICATIONS.md:553` chờ CR riêng.
- `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md:27` GAP-021 ("Cảnh báo đóng rạp thiếu chi tiết suất") — nay lỗi thời vì đã bỏ chặn đóng rạp theo suất; primary đóng ở close-out.
- `docs/ERD.md` đã cập nhật (task-01). `docs/API_SPEC.md` + `docs/DESIGN.md` as-built khớp hành vi mới, trừ F1/F2/F4.

## Kiểm tra theo brief

1. Hợp đồng API 4 route: đúng (Admin-only bằng guard thật, map lỗi đúng, 500 không lộ message, `scheduleCancelled` + `scheduled*` null, bỏ 409, status validate enum). ✔
2. `GET /cinemas/:code`: 200 mọi trạng thái, rooms/showtimes rỗng khi không OPEN, mã sai 404, không lộ cột nhạy cảm, `GET /cinemas` vẫn chỉ OPEN (int kiểm). Service_role không cần → F1. ✔ (kèm khuyến nghị)
3. `update()`: đúng; không còn đường đổi status tức thì; create vẫn chạy với grant INSERT theo cột. ✔
4. DTO: đúng kiểu; giữ bắt buộc nullable. ✔
5. Test: bắt được các mutation chính; gap F3. Int dọn outbox theo `cinema_id` (F5 residual). ✔
6. Docs: xem trên. ✔ (F2, F4 nhỏ)
7. Hồi quy: api 651/651, web 595/595 test xanh; typecheck web đỏ dự kiến. ✔

## Verdict

**STRICT PASS** — không có finding CRITICAL/MAJOR. 4 MINOR (F1–F4) nên sửa trong round kế tiếp hoặc gộp vào task-04/close-out; F5–F7 là residual/nghĩa vụ task sau.
