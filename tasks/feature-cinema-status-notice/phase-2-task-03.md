# Feature cinema-status-notice · phase-2-task-03 — Shared + API: hẹn lịch trạng thái, trang rạp công khai trả 200 cho rạp không hoạt động

- Classification / Risk: MODIFY (API + shared DTO). Reviewer **STRICT** (đường đổi trạng thái rạp + quyền Admin + public endpoint đổi hành vi). Phụ thuộc task-01 (RPC `schedule_cinema_status`, cột `scheduled_*`, `database.types.ts` đã sinh lại) và task-02 (kind mail).
- Hợp đồng: `spec/changes/2026-11-18-cinema-status-notice.md`. Spec: R-33, R-136, R-137, AC-26..28.

## Thiết kế
1. `packages/shared/src/schemas/catalog.ts`: `CinemaDto` (và `AdminCinemaDto` nếu tách) thêm `scheduledStatus: CinemaDbStatus | null`, `scheduledEffectiveAt: string | null`. `packages/shared/src/schemas/cancellation.ts`: thêm `SetCinemaStatusResultDto` `{ success, cinemaId, status, scheduledStatus, scheduledEffectiveAt, emailsEnqueuedCount }`. Giữ `setCinemaStatusSchema` (chỉ `status`). Bảo đảm export qua đường import hiện dùng của web.
2. `apps/api/src/modules/catalog/cinemas.service.ts`:
   - `CINEMA_COLUMNS` + `CinemaRow` + `cinemaToDto` (+ admin DTO) có `scheduled_status`, `scheduled_effective_at`.
   - `detailPublic(code, date)`: tra rạp theo `code` **mọi trạng thái** (dùng client có quyền đọc mọi rạp — `this.supabase.admin()` chỉ cho truy vấn cinemas-by-code này, chỉ chọn cột công khai `CINEMA_COLUMNS`); không có → 404 như cũ. `status !== 'OPEN'` → trả `{ cinema, rooms: [], showtimes: [] }` (không truy vấn phòng/suất). `listPublic` giữ `.eq("status","OPEN")`.
   - `update()`: nếu `input.status` có mặt: đọc trạng thái hiện tại; khác hiện tại → `VALIDATION_ERROR` ("Đổi trạng thái rạp qua /admin/cinemas/:id/status — hiệu lực sau 7 ngày"); bằng hiện tại → bỏ trường khỏi `changes`. Xoá `assertNoFutureShowtimes` + `CLOSING_STATUSES` (chết). `create()` giữ `status` khởi tạo.
3. `apps/api/src/modules/cancellation/cancellation.service.ts` `setCinemaStatus`: gọi RPC `schedule_cinema_status`; map lỗi: `22023`/`STATUS_UNCHANGED` → `VALIDATION_ERROR`; kết quả huỷ lịch (`schedule_cancelled`) → `scheduledStatus: null`, `scheduledEffectiveAt: null`, thêm cờ `scheduleCancelled: boolean` vào `SetCinemaStatusResultDto`; `P0002` → `NOT_FOUND`; `42501` → `FORBIDDEN`; còn lại `INTERNAL_ERROR`. Trả `SetCinemaStatusResultDto`. **Xoá** nhánh 409 `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES`. Controller (`cancellation.controller.ts`) cập nhật JSDoc/kiểu trả; 4 route hiện có (`/admin/cinemas/:id/status`, `/cinemas/:id/status` × PATCH/POST) giữ nguyên + guard Admin như cũ.
4. Cập nhật mọi test API/integration tham chiếu `set_cinema_status`, 409 sold showtimes, `detailPublic` 404 cho rạp đóng, `update` đổi status. Thêm test: detailPublic rạp CLOSED → 200 + rooms/showtimes rỗng + `status:"CLOSED"`; mã sai 404; `update` đổi status bị từ chối / cùng status bỏ qua; setCinemaStatus map lỗi + kết quả; DTO có `scheduled*`.
5. `docs/API_SPEC.md` (as-built): endpoint status (lịch 7 ngày, response mới, bỏ 409), `GET /cinemas/:code` (200 cho rạp không hoạt động), `PATCH /cinemas/:id` ràng buộc status, `CinemaDto` trường mới.

## KHÔNG làm
Không đụng `supabase/**` (nếu RPC/type thiếu → báo lại), `apps/web/**`, `apps/api/src/modules/mail/**`. Không `git add/commit/checkout/reset/stash/clean`. Không đụng file dirty của user (`.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `apps/api/package.json`, `supabase/config.toml`, `package.json`).

## Files to Modify
`packages/shared/src/schemas/{catalog,cancellation}.ts`, `apps/api/src/modules/catalog/cinemas.service.ts`, `apps/api/src/modules/cancellation/*`, test API/int liên quan, `docs/API_SPEC.md`.

## Verify
`pnpm --filter ./packages/shared typecheck` (nếu có), `pnpm --filter ./apps/api test`, `pnpm --filter ./apps/api lint`, `pnpm --filter ./apps/api typecheck`, `pnpm --filter ./apps/api test:int` (cần stack local + migration task-01 đã áp). Verify thật: dùng service_role/Admin gọi `schedule_cinema_status` qua API thật hoặc PostgREST trên rạp demo rồi **khôi phục** trạng thái (xoá lịch bằng SQL) — không để lịch/outbox rác trên DB demo; ghi lại.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: `GET /cinemas/:code` rạp đóng → 404; status đổi tức thì; 409 sold showtimes.
- Expected: 200 + thông báo trạng thái; hẹn lịch 7 ngày; không đổi tức thì.
- Actual after: `GET /cinemas/:code` rạp CLOSED/TEMP_CLOSED/COMING_SOON -> 200 + `rooms:[]`, `showtimes:[]`, `cinema.status` đúng (e2e mock + int DB thật); mã lạ -> 404; `PATCH|POST /admin/cinemas/:id/status` (+ alias `/cinemas/:id/status`) gọi RPC `schedule_cinema_status`: rạp giữ nguyên trạng thái, lịch +7 ngày, `scheduleCancelled` khi huỷ lịch, STATUS_UNCHANGED -> 400, không còn 409; `PATCH /cinemas/:id` đổi status -> 400, cùng status bị bỏ qua; DTO có `scheduledStatus`/`scheduledEffectiveAt`.
- Evidence: `pnpm test` api 651/651 + shared 31/31 (web 2 test account flake khi chạy song song, pass 21/21 khi chạy riêng); `pnpm lint` sạch; `pnpm typecheck` api+shared PASS, web FAIL do 4 fixture test thiếu 2 trường mới (thuộc task-04); `pnpm test:int` 94/94 (9 file). Sau int: email_outbox CINEMA_STATUS_NOTICE = 0, rạp có lịch = 0, trạng thái demo DN01/HCM01/HN01/HN03 OPEN, HN02 CLOSED.
- Status: PASS
