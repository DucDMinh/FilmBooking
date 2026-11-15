# Review: build-filmbooking layer-8 task-07 (round 1)

Agent: reviewer
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-07` (branch `wt/layer-8__task-07`, chưa commit)
Task: `tasks/build-filmbooking/layer-8-task-07.md`, tài liệu as-built (API_SPEC, ERD, DESIGN current-state, README)

## Review level

**NORMAL**

## Reason

Task chỉ sửa tài liệu và thêm một script chỉ đọc file (`scripts/check-api-routes.mjs`). Không đụng runtime code, schema hay migration. Tuy vậy, tài liệu as-built ghi sai vẫn là defect thật, nên tôi đối chiếu từng nhận định với code/migration chứ không chỉ đọc lướt.

## Blast radius

- Ai đọc tài liệu sẽ bị ảnh hưởng: dev hoặc AI agent sau này dựa vào `docs/API_SPEC.md`, `docs/DESIGN.md`, `docs/ERD.md` để viết client hoặc sửa luồng. Doc ghi sai mã lỗi hay cơ chế thì sẽ sinh bug về sau.
- Không ảnh hưởng runtime.
- Phạm vi file (`git diff --name-only` cộng file untracked): `README.md`, `docs/API_SPEC.md`, `docs/DESIGN.md`, `docs/ERD.md`, `tasks/build-filmbooking/layer-8-task-07.md`, `scripts/check-api-routes.mjs` (mới). **Không** đụng intent docs (`SPECIFICATIONS.md`, `docs/BRD.md`, `docs/PRD.md`, `docs/USER_FLOW.md`, `spec/**`, `docs/specs/**`) và không đụng gap register. Đạt.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `git status --short`, `git diff --stat`, `git diff <file>` | Chạy được. Phạm vi đúng như trên |
| `node scripts/check-api-routes.mjs` | **BLOCKED**: hook `agent-guard` từ chối vì lệnh chưa có trong allowlist verify (`.context/project-config.md`). Tôi không lách. Thay vào đó tôi đối chiếu tĩnh: grep mọi decorator `@Controller/@Get/@Post/@Put/@Patch/@Delete` trong `apps/api/src/**/*.controller.ts` (23 file), đếm tay (đã khai triển mảng alias) được **145 route duy nhất**, khớp số "145 route" ở `docs/API_SPEC.md:36`. Mỗi route trong kết quả grep đều có dòng `` `METHOD /path` `` tương ứng trong bảng. Script **chưa được thực thi** |
| lint / typecheck / build / test | **skip**: worktree chưa có `node_modules`, task chỉ có tài liệu. Dispatcher sẽ chạy sau khi merge |
| aislop / oxlint / ocr | skip: diff gồm markdown và một script Node nhỏ chỉ đọc file, không có TS/JS app code |
| AI-friendly web gate | N/A (tài liệu nội bộ) |

Đề nghị dispatcher: thêm `node scripts/check-api-routes.mjs` vào allowlist verify trong `.context/project-config.md` (`node scripts/apply-verify-permissions.mjs --write`) và tự chạy lệnh này sau khi merge.

## Đối chiếu đã làm (mẫu ≥15 route, trải đều các module)

Các route sau khớp code (method/path/guard/mã lỗi):

- **Health**: `GET /health` (Public).
- **Auth**: `POST /auth/register|login|resend-confirmation|forgot-password|reset-password`, `@Public` đặt ở class (`auth-ext.controller.ts:29-30`).
- **Me/identity**: `GET /me`; `DELETE /me` (profile `@Delete()` dưới `@Controller("me")`); `POST /auth/oauth/missing-email` (Public); `POST /auth/oauth/callback-check` (JWT).
- **Booking**: `GET /showtimes/:id/seatmap` (Public), `POST /bookings/holds` (JWT).
- **Payment/webhook**: `POST /payos/webhook`. Sai chữ ký hoặc envelope thì trả HTTP 200 `{success:false}`; lỗi khi xử lý thì ném 500 (`webhook.controller.ts:36-60`).
- **Jobs**: `POST /jobs/send-emails|reconcile` (`@Public` + `@UseGuards(JobSecretGuard)`, `jobs.controller.ts:271-296`). Ngưỡng reconcile khớp: PENDING ≤50, EXPIRED ≤1h ≤20 (`reconcile.service.ts:32-35`).
- **Cinema-ops**: `POST /showtimes/bulk` là `Roles(MANAGER)`, không có `@CinemaScope`, service kiểm từng rạp (`showtimes.controller.ts:29-41`). Nhận định "scope kiểm ở service" là đúng.
- **Pricing**: `POST /price-rules` dùng `Unprocessable422Pipe` (`pricing.controller.ts:113`). Scope CHAIN chỉ Admin; CINEMA/SHOWTIME phải là Manager của đúng rạp (`pricing.service.ts:152-185`).
- **Orders**: `GET /orders` khai `Roles("STAFF","MANAGER")`. Theo `satisfies()` (`access.service.ts:17-19`) thì tương đương `Roles(STAFF)`, khớp.
- **Cancellation**:
  - Preview/cancel mỗi loại có 3 alias (`Roles(MANAGER)+CinemaScope`).
  - Đóng/mở rạp: `PATCH|POST` × 2 path với `Roles("ADMIN")` (`cancellation.controller.ts:131-147`). DB chặn Manager bằng `42501 FORBIDDEN_ADMIN_REQUIRED` (`20261112160000_rbac_cinema_reports_hardening.sql:53`). Nhận định "đóng/mở rạp chỉ Admin" là đúng.
  - Refund dùng `Unprocessable422Pipe` nên trả 422.
- **Reports / Admin**:
  - Reports: cả 8 route là `Roles(MANAGER)`.
  - Admin users: `Roles(ADMIN)`.
  - Staff: `PATCH` chỉ ADMIN; GET/POST/DELETE là `ADMIN,MANAGER`+Scope.
- **Checkin**: `POST /checkin/scan` là `Roles(STAFF)+CinemaScope`.
- **Mã lỗi và guard**: bảng mã lỗi `docs/API_SPEC.md:21-32` khớp `ERROR_HTTP_STATUS` trong `packages/shared/src/errors.ts:56-96`. Thứ tự guard global khớp `app.module.ts:58-61`.

**ERD**:

- Mọi bảng trong bảng entity đều có `create table` trong `supabase/migrations`, kể cả `identity_link_intents` (20261112170000).
- 3 bảng `pos_*` chỉ được ghi là đã DROP (`20261112130000_remove_pos.sql:598-600`), không bị liệt kê như còn tồn tại.
- Enum ở `docs/ERD.md:85` khớp `create type` (`20261111030100_booking_tables.sql:19-33`, `20261111020000_catalog.sql:27`, `20261111010000_core_identity_chain.sql:24`).
- Các migration muộn được nhắc tới đều tồn tại, và các chi tiết khớp:
  - `link_cancelled_at` ở `20261113160000:8`.
  - `orders_one_active_hold_per_user_key` ở `20261112100000:49`.
  - `resolve_manual_review` giữ nguyên status (`20261113170000:82-84`).
  - `has_cinema_manager_scope` ở `20261112160000:104`.

**README**:

- Các lệnh `pnpm db:start|db:stop|db:migrate|db:test|db:types|db:seed:demo|test:int|e2e|format|format:check|lint|typecheck|build|test` đều có trong `package.json:9-24`. `pnpm --filter ./apps/web dev` có thật (`apps/web/package.json:6`). Đường dẫn `apps/api/dist/apps/api/src/main.js` khớp script `start` (`apps/api/package.json:11`).
- Bảng env khớp `envSchema` (`apps/api/src/config/env.ts:24-46`) và `.env.example`.
- Mật khẩu `LocalDev@123!` là mật khẩu seed local, đã công khai trong `supabase/seed/README.md:14`, không phải secret.
- CLI Supabase đi qua `pnpm db:*` / `pnpm exec supabase`. Hướng dẫn có 8 bước, đạt yêu cầu ≤10.

## Findings

### MAJOR-1: DESIGN mô tả sai cơ chế hết hạn giữ ghế; danh sách cron ở DESIGN và ERD thiếu `expire-overdue-holds`

- **Doc ghi gì**:
  - `docs/DESIGN.md:34`: "`expire_overdue_holds` (gọi khi truy cập/hold)".
  - `docs/DESIGN.md:62`, `docs/ERD.md:67` và `docs/ERD.md:113` liệt kê các cron nhưng không có `expire-overdue-holds`.
- **Code thực tế**:
  - `expire_overdue_holds()` là **job pg_cron chạy mỗi phút**: `cron.schedule('expire-overdue-holds', '* * * * *', ...)` tại `supabase/migrations/20261111040000_rpc_hold.sql:764-773`. Không migration nào sau đó unschedule job này (grep `expire-overdue-holds` chỉ ra đúng khối 767-770).
  - Hàm chỉ grant cho `service_role` (`20261112100000_order_lifecycle_pending_payment.sql:640-641`). API Nest không gọi hàm này ở đâu cả (grep `apps/api/src`: 0 kết quả).
  - Khi truy cập, seatmap chỉ hiển thị ghế HELD đã quá hạn thành FREE (`apps/api/src/modules/booking/seatmap.service.ts:13`). `hold_seats` tự xử lý đơn quá hạn của chính khách đó, nhưng không gọi `expire_overdue_holds`.
- **Vì sao là MAJOR**: luồng giữ ghế là luồng trọng tâm, và doc mô tả sai cơ chế của nó. Người vận hành đọc doc sẽ không biết phải có cron này, ví dụ khi dựng môi trường mới hay khi kiểm `cron.job`.
- **Cách sửa**: ghi đúng là "pg_cron `expire-overdue-holds` chạy mỗi phút, gọi `expire_overdue_holds()`", và thêm cron này vào DESIGN §6 và ERD (dòng 67, 113).

### MAJOR-2: DESIGN ghi `hold_seats` chạy bằng service_role, nhưng code gọi bằng JWT của user

- **Doc ghi gì**: `docs/DESIGN.md:31`: "Nest gọi RPC `hold_seats` (service_role, trong một transaction)".
- **Code thực tế**: `apps/api/src/modules/booking/booking.service.ts:44` gọi `this.supabase.forUser(user.jwt).rpc("hold_seats", ...)`, tức chạy dưới JWT `authenticated` của khách chứ không phải `admin()`.
- **Vì sao là MAJOR**: doc ghi sai mô hình quyền của luồng quan trọng nhất. Người sửa sau có thể đổi sang `admin()` vì tưởng code "vốn đã như vậy".
- **Cách sửa**: ghi "gọi bằng client user (`forUser(jwt)`)". Phần kiểm quyền bên trong thân RPC tôi chưa đối chiếu sâu.

### MAJOR-3: API_SPEC ghi `GET /bookings/:id` trả 410 `HOLD_EXPIRED`, nhưng code không trả mã này

- **Doc ghi gì**: `docs/API_SPEC.md:144`: "`GET /bookings/:id` | JWT chủ đơn | Tóm tắt đơn; 410 `HOLD_EXPIRED` khi hết hạn giữ".
- **Code thực tế**:
  - Handler gọi thẳng service, không qua helper kiểm điều kiện (`booking.controller.ts:58-61`).
  - `getBooking` (`booking.service.ts:96-134`) không ném `HOLD_EXPIRED`. Đơn đã hết hạn vẫn trả 200, kèm `status` hiện tại và `expiresInSeconds: 0` (`booking.helper.ts:110-119`).
  - `HOLD_EXPIRED` chỉ được ném ở các thao tác ghi: `verifyOrderActionEligibility` (`booking.helper.ts:233-234`), map lỗi RPC (`booking.helper.ts:69-71`, `booking.service.ts:277-278`).
- **Guard cũng chưa đủ**: cột Guard ghi "JWT chủ đơn", nhưng Admin và nhân sự được gán rạp của đơn cũng đọc được (`booking.service.ts:112-117`).
- **Vì sao là MAJOR**: đây là contract mã lỗi sai trên một route web đang dùng. Client làm theo doc sẽ chờ 410 mà không bao giờ nhận được.
- **Cách sửa**: bỏ "410 HOLD_EXPIRED" khỏi dòng `GET /bookings/:id` (chuyển sang các route ghi: `age-confirm` / `consent` / `voucher` / `payment`). Sửa guard thành "JWT chủ đơn hoặc Admin/nhân sự rạp".

### MINOR-1: DESIGN gán `PAYMENT_AMOUNT_MISMATCH` cho `confirm_paid`

- **Doc ghi gì**: `docs/DESIGN.md:39`: "kiểm số tiền (`PAYMENT_AMOUNT_MISMATCH` -> đơn `needs_manual_review`)".
- **Code thực tế**:
  - `confirm_paid` không raise lỗi. Khi lệch tiền, hàm trả jsonb `status: 'AMOUNT_MISMATCH'`, nhả ghế HELD, chuyển đơn sang `needs_manual_review`, ghi `payment_events` và đưa email `AMOUNT_MISMATCH_MANUAL_REVIEW` vào outbox (`20261113160000_confirm_paid_order_code_lookup.sql:112-192`).
  - Service coi kết quả này là success (`payment.service.ts:507-517`). Mã `PAYMENT_AMOUNT_MISMATCH` trong `errors.ts` hiện không được dùng ở đâu trong `apps/api/src`.
- **Phần còn lại của mô tả `confirm_paid` là đúng**: `sell_order_seats` (`:259-261`), đơn `paid` (`:273`), sinh tickets (`:302`), xếp email (`:308-310`).
- **Nên bổ sung** nhánh "ghế đã bị chiếm / tiền về muộn → `needs_manual_review`, không sinh vé" (`:336-367`).

### MINOR-2: `SHOWTIME_OVERLAP` không phải mã lỗi

`docs/API_SPEC.md:113` ghi "409 `SHOWTIME_OVERLAP`". Thực tế đây là `details.reason` (`showtimes.service.ts:523`; test `cinema-ops.e2e-spec.ts:372` assert `error.details.reason`). Nên ghi "409 (`details.reason = SHOWTIME_OVERLAP`)".

### MINOR-3: `POST /showtimes/bulk` ghi "cinemaId trong body", nhưng body thật là `targets[]`

`docs/API_SPEC.md:110`. Body thật có `targets` là mảng nhiều rạp, tối đa 50 (`packages/shared/src/schemas/cinema-ops.ts:141`). Nhận định "scope kiểm ở service" vẫn đúng.

### MINOR-4: `check-api-routes.mjs` chứng minh route có mặt trong doc, nhưng không kiểm guard

**Script làm đúng những gì**:

- Ghép prefix controller với path của method, xử lý `@Get()` rỗng và mảng alias viết trên nhiều dòng.
- Giữ nguyên `:param` khi so chuỗi.
- So hai chiều (route có trong code mà thiếu trong doc / route có trong doc mà thừa so với code). Script không tự so doc với chính nó.

Đối chiếu tĩnh cho ra 145 = 145, nên AC "mọi controller có trong API_SPEC" được chứng minh ở mức route.

**Giới hạn**:

- (a) Không so cột Guard; tuỳ chọn `--list` chỉ in ra để người đọc tự đối chiếu.
- (b) `docRoutes` gom **mọi** code span `` `METHOD /path` `` trong cả file, kể cả trong ghi chú (vd `docs/API_SPEC.md:175` "Alias `GET /orders`"). Vì vậy một route chỉ được nhắc trong ghi chú cũng được tính là đã có.
- (c) Không nhận `@All/@Head/@Options`. Hiện code không dùng các decorator này.

Không chặn PASS. Nên ghi rõ giới hạn (a) trong header của doc.

## Luật cứng

- Intent docs không bị sửa, gap register không bị sửa. Đạt.
- Spec 2.0.0 (gỡ POS) và 3.0.0 (không còn đổi suất; `exchanged`/`EXCHANGED`/`POS` là tàn dư) được ghi đúng tại `docs/API_SPEC.md:17,212`, `docs/DESIGN.md:26,49`, `docs/ERD.md:55,85`. Đạt.
- Các dòng `<!-- TODO(dispatcher) -->` về Sentry/e2e/Lighthouse là cố ý, không tính là finding.

## Verdict

**FAIL**

Có 3 MAJOR, đều là thông tin as-built sai so với code: (1) cơ chế hết hạn giữ ghế và danh sách cron, (2) quyền gọi `hold_seats`, (3) mã lỗi 410 và guard của `GET /bookings/:id`. Phần sửa là sửa tài liệu ở các chỗ: `docs/DESIGN.md:31,34,62`, `docs/ERD.md:67,113`, `docs/API_SPEC.md:144`. Nên sửa luôn MINOR-1..3 trong cùng round.

Phần còn lại đều đạt: inventory route 145/145 (đếm tĩnh), guard theo mẫu, bảng mã lỗi, ERD (tên bảng / enum / POS), README (lệnh / env / số bước).
