# Review — build-filmbooking layer-6 task-07, round 1

Agent: reviewer
Task: Harness integration test API <-> Supabase local (`pnpm test:int`)
Worktree: E:/FilmBooking/.worktrees/layer-6__task-07 (branch wt/layer-6__task-07, chưa commit)

## Review level
STRICT

## Reason
Harness dùng service_role key để ghi và xoá dữ liệu trong DB (auth.users, cinemas, showtimes, movies, provinces). Nó là hạ tầng dùng chung cho Layer 8, và có thêm bước vào CI. Rủi ro chính là mất hoặc rò dữ liệu, chạy nhầm môi trường, và CI xanh giả.

## Blast radius
- Mới: `apps/api/vitest.integration.config.ts`, `apps/api/test/integration/{helpers/supabase-test.ts, helpers/factories.ts, smoke.int-spec.ts}`.
- Sửa: `apps/api/package.json` (script `test:int`), `apps/api/tsconfig.json` (include config), `.github/workflows/ci.yml` (job db-test thêm `pnpm test:int`), `docs/dev-setup.md`.
- Bốn file sửa nằm ngoài "Files to Create/Modify". Đây là thay đổi tối thiểu, cần thiết để AC `pnpm test:int` chạy được và tôi chấp nhận, nhưng dispatcher cần biết.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm test:int` (Supabase local đang chạy) | PASS: 1 file, 5/5 test **chạy thật** (không skip), 12.3s |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/api && pnpm test` | PASS: 23 file, 428 test. Không có `*.int-spec.ts` (include của `vitest.config.ts` không khớp `.int-spec.ts`), nên test:int không lọt vào `pnpm test` |
| Đếm dữ liệu `it_` còn sót bằng `docker exec ... psql` (chỉ SELECT) | **Blocked**: agent-guard chặn `docker` (không nằm trong allowlist). Không xác minh được cleanup trên DB thật. Xem residual risk |
| aislop / oxlint / ocr | skip: oxlint chưa cấu hình, ocr chưa cài, aislop không có trong allowlist |

## Các điểm đã kiểm và đạt
- Điều kiện xoá đủ hẹp. `cinemas.code LIKE 'IT<6hex>%'`: mỗi run có base 8 ký tự và code tối đa 10 ký tự. `movies.slug LIKE 'it-<6hex>-%'` (dấu `-` không phải wildcard). `provinces.code = 'IT_<6HEX>'` so bằng `eq`. User được lọc bằng JS `startsWith('it_<6hex>_')`, không phải LIKE, nên `_` không thành wildcard. Seed và migration không có code/slug nào bắt đầu bằng IT/it- (đã grep).
- Thứ tự xoá khớp FK trong migration. `showtimes.room_id` không cascade, nên xoá suất trước. `cinemas` cascade xuống rooms, seats, staff_assignments và các bảng khác. `cinemas.province_id` không cascade, nên xoá tỉnh sau. `user_roles`/`staff_assignments.user_id` cascade theo auth.users.
- Không reset, push hay seed DB. Không có secret hardcode: key lấy từ env hoặc `supabase status -o env`. Mật khẩu test là hằng số dùng riêng cho test.
- JWT: AppModule thật, chỉ override `ENV`. Token GoTrue thật (ES256) đi qua `SUPABASE_JWKS_URL`, token mint (HS256) đi qua `SUPABASE_JWT_SECRET`. Cả hai khớp `auth.guard.ts:81-84`. Issuer `${url}/auth/v1` khớp `auth.guard.ts:57`.
- Test có ý nghĩa: dùng DB thật, không mock. `/me` kiểm `toEqual` đầy đủ cho customer. Có case 401 khi không có token, và case manager gán rạp trả `cinemas[]` đúng. Mỗi test tự tạo dữ liệu riêng, không phụ thuộc seed.
- `fileParallelism: false` hợp lý vì các file dùng chung DB.

## Findings

### F1 — MAJOR — Không chặn URL non-local: harness có thể ghi/xoá bằng service_role trên staging/prod
`apps/api/test/integration/helpers/supabase-test.ts:12-18, 56-63`. `envFromProcess()` được **ưu tiên** hơn `supabase status`. Nếu shell hoặc CI có sẵn `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_JWT_SECRET` của staging (dev export để chạy API, hoặc job sau này có secret), `pnpm test:int` sẽ:
- tạo user, tỉnh, rạp, phòng, ghế, phim, suất `PUBLISHED`/ON_SALE trên môi trường thật;
- chạy `delete` bằng service_role và `auth.admin.deleteUser` trên DB đó.

Bước kiểm duy nhất là ping `/auth/v1/health`, và bước này đạt với mọi host. Docs (`docs/dev-setup.md`) còn chủ động hướng dẫn đặt các biến này. Repo đã có tiền lệ: `scripts/seed-demo-guard.mjs` chặn host không phải loopback. Harness cũng cần guard tương tự trên `new URL(env.url).hostname ∈ {127.0.0.1, localhost, ::1}`, và guard phải **throw** (không skip) khi host không phải local. Trái với AGENTS.md: "Cấm ... clone/seed data cho staging/prod".

### F2 — MAJOR — `cleanupScope` nuốt mọi lỗi, nên dữ liệu bị bỏ sót mà không ai biết (che lỗi thật)
`apps/api/test/integration/helpers/supabase-test.ts:121-134`. supabase-js trả `{ error }` chứ không throw. Không lệnh nào kiểm `error`: `select cinemas`, `delete showtimes`, `delete cinemas`, `delete movies`, `delete provinces`, `listUsers`, và từng `deleteUser` (kết quả `Promise.all` bị bỏ qua). Hậu quả cụ thể:
- Từ Layer 8, khi có `orders` hoặc `tickets`, FK `showtime_id ... on delete restrict` (`20261111030100_booking_tables.sql:69,159`) sẽ làm `delete showtimes` lỗi 23503. Sau đó `delete cinemas` cũng lỗi, nhưng test vẫn xanh và dữ liệu `it_` dồn dần trong DB dev dùng chung.
- Docs và comment (dòng 119) chỉ ghi "xoá đơn trước". Không có cơ chế nào báo khi người viết test quên.

Cần: kiểm `error` ở mỗi bước và throw (hoặc gom lỗi rồi throw cuối hàm), để `afterAll` fail rõ ràng.

### F3 — MINOR — CI có thể xanh giả khi suite bị skip
`supabase-test.ts:20-42, 56-63` và `ci.yml:59`. Mọi lỗi của `supabase status` (`catch {}` + `stdio ignore`) và mọi lỗi ping đều dẫn tới skip, chỉ kèm `console.warn`. Trong job `db-test`, stack được kỳ vọng đang chạy. Nếu `pnpm exec supabase status` lỗi vì lý do khác (đổi CLI, đổi format output), job vẫn xanh với 0 test. Đề xuất: khi `process.env.CI` được đặt (hoặc có biến `TEST_INT_REQUIRED=1`), throw thay vì skip.

### F4 — MINOR — `listUsers` chỉ lấy trang 1, tối đa 1000 user
`supabase-test.ts:131`. Khi DB dev có hơn 1000 user, user test có thể nằm ngoài trang 1 và bị sót (chỉ rò dữ liệu, không xoá nhầm). Nên phân trang, hoặc lưu id user đã tạo trong factory rồi xoá theo id. Cách sau cũng an toàn hơn.

### F5 — MINOR — Test "admin + manager" không assert status
`smoke.int-spec.ts:75-78`. Chỉ dùng `toMatchObject` trên body, không `expect(status).toBe(200)`. Hiện chưa sai vì body lỗi không khớp, nhưng nên assert status cho rõ ràng.

### F6 — MINOR — Không dọn dữ liệu của run bị crash
Khi process bị kill trước `afterAll`, dữ liệu `it_<run>_` sẽ còn lại mãi, vì mỗi run chỉ dọn scope của chính nó. Có thể thêm script hoặc option dọn mọi `it_%`, chỉ cho phép trên host local (đi kèm F1).

### F7 — INFO
- Cảnh báo Vite `configLoader: 'native'` (ESM trong file CJS) đã có sẵn ở `vitest.config.ts`, không phải lỗi mới của task này.
- `mintToken` ký HS256 bằng JWT_SECRET local. Cách này đúng cho local, nhưng là thêm một lý do cần guard F1: không được có key secret thật trong env khi chạy harness.

## Residual risk
- Chưa đếm được dữ liệu `it_` còn sót trên DB thật vì `docker exec psql` bị agent-guard chặn. Theo phân tích code, run vừa rồi không tạo order nên cleanup lý thuyết đủ, nhưng F2 khiến không thể xác nhận qua kết quả test. Dispatcher nên tự chạy SELECT đếm `auth.users email like 'it\_%'`, `cinemas code like 'IT%'`, `movies slug like 'it-%'`, `provinces code like 'IT\_%'`.

## Verdict
**FAIL**: 2 MAJOR (F1 không có guard URL local; F2 cleanup nuốt lỗi). Builder sửa F1 và F2 (nên sửa luôn F3, F4), rồi review round 2.
