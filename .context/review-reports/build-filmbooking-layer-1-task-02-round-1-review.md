Agent: reviewer

# Review: build-filmbooking layer-1 task-02, round 1
Scaffold NestJS: config env, exception filter mã lỗi, SupabaseService, health

- Worktree: `E:\FilmBooking\.worktrees\layer-1__task-02` (chưa commit)
- Review level: **STRICT**
- Reason: shared foundation (global exception filter + error contract dùng cho mọi client), security (service role key, secret trong env/log, CORS, helmet), build/deploy pipeline (script build tự viết).
- Blast radius: toàn bộ `apps/api` (mọi module sau dùng `AllExceptionsFilter`, `AppException`, `SupabaseService`, `ENV`, `ZodValidationPipe`); web client (error shape `{error:{code,message,details}}`); deploy Render (`build`/`start` script, đường dẫn `dist/apps/api/src/main.js`).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm lint` | PASS (shared + api) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — shared 14/14, api 4 file / 20 test |
| `pnpm build` | PASS — `Built 15 files -> apps\api\dist` |

Kiểm tra output build (Grep trên dist): `dist/apps/api/src/common/errors/all-exceptions.filter.js` require `../../../../../packages/shared/src` → resolve đúng `dist/packages/shared/src/index.js`; shared index require `./enums`, `./errors`… (không đuôi `.ts`). Thư mục dist không có package.json `type: module`, nearest là `apps/api/package.json` (không có `type`) → chạy CommonJS đúng. `zod` (dep của shared) resolve được từ `apps/api/node_modules`.
Không chạy `node dist/apps/api/src/main.js` (ngoài quyền verify) → Residual risk.

## Acceptance Criteria
| AC | Kết quả | Bằng chứng |
|---|---|---|
| `GET /health` → 200 `{status:'ok'}` (supertest) | OK | `test/health.e2e-spec.ts:35-39` |
| Lỗi chưa biết → 500 không lộ stack; AppException(SEAT_TAKEN) → 409 đúng shape | OK (code `INTERNAL_ERROR` theo catalog shared, task ghi `INTERNAL` — catalog là source of truth, chấp nhận) | `test/errors.spec.ts:73-96`; filter `all-exceptions.filter.ts:74-88` (HttpException ≥500 cũng bị che message) |
| Thiếu env → không khởi động, log tên biến, không log giá trị | OK | `env.ts:58-78` message chỉ `path: issue.message`; test `env.spec.ts:22-38` kiểm không chứa giá trị; `main.ts:18-26` exit(1); test bootstrap AppModule `env.spec.ts:56-61` |
| `forUser()` không bao giờ dùng service role key | OK | `supabase.service.ts:19-25`; test `supabase.service.spec.ts:26-35`; thêm guard anon≠service role `env.ts:41-50` |

## Security check
- Secret/stack trong response: không — 5xx trả message cố định; stack chỉ log server-side. Body-parser lỗi 4xx (`expose:true`) map 400.
- Env error: không chứa giá trị (zod v4 message không echo input cho các rule đang dùng).
- Service role: chỉ trong `admin()`, `forUser` dùng anon key + Bearer, client mới mỗi lần, `persistSession:false`.
- CORS: `origin` = danh sách URL đã validate, không wildcard, không `credentials` (auth bằng Bearer) → OK. Test origin lạ không có header ACAO.
- Helmet: bật, có test `nosniff`.

## File ngoài danh sách
`apps/api/package.json` (chỉ thêm scripts), `scripts/build.mjs`, `src/config/configure-app.ts`, `src/common/pipes/zod-validation.pipe.ts`, `test/env.spec.ts`, `test/supabase.service.spec.ts`. Tất cả trace về task (Description có "ValidationPipe/zod pipe"; build/test cần scripts; configure-app tránh lặp giữa main và e2e; test cho AC3/AC4). Không đụng file của task song song khác. Chấp nhận, nhưng dispatcher cần biết khi merge (xem MINOR-1).

## Responsive Checklist Gate
N/A — task backend, diff không đụng UI.

## Skill gates
- aislop: skip, lệnh `aislop` không nằm trong danh sách verify được phép cho reviewer.
- oxlint (anti-slop): skip, oxlint not configured (repo dùng eslint; `pnpm lint` PASS, typecheck PASS).
- ocr (open-code-review): skip, ocr not installed / không được phép.
- AI-readable: OK — tên rõ, hàm ngắn (<50 dòng), file <100 dòng, comment giải thích WHY (vd vì sao không dùng `nest build`, vì sao `abortOnError:false`), không magic number đáng kể. 0 indicator.
- ai-friendly-web: N/A (API nội bộ, không phải web public).
- blitzstrike: skip, không có môi trường chạy app được phép.

## Findings
Không có CRITICAL / MAJOR.

- [MINOR-1] Phạm vi file: 6 file ngoài "Files to Create/Modify" (Notes yêu cầu báo Blocked/dispatcher). Builder đã báo rõ; các file hợp lý. Đề xuất: dispatcher ghi nhận danh sách này khi merge layer-1 để tránh conflict (đặc biệt `apps/api/package.json`).
- [MINOR-2] `src/common/errors/all-exceptions.filter.ts:71-72`: `AppException` đi thẳng ra client kể cả khi status ≥500 (vd `new AppException(INTERNAL_ERROR, err.message)`) → có thể lộ message nội bộ nếu task sau dùng sai. Đề xuất (task sau/không chặn): với AppException status ≥500, log server-side và thay message bằng thông điệp chung.
- [MINOR-3] `all-exceptions.filter.ts:44`: 4xx không có trong map (405/413/415…) rơi về `VALIDATION_ERROR` — chấp nhận được, ghi chú để biết.
- [MINOR-4] Task file AC2 ghi `INTERNAL`, code dùng `INTERNAL_ERROR` (đúng catalog shared). Đề xuất close-out sửa text task/ghi chú, không sửa code.
- [MINOR-5] `apps/api/vitest.config.ts`: cảnh báo Vite "ESM syntax in a file loaded as CommonJS". Không ảnh hưởng; có thể đổi sang `.mts` sau.
- [MINOR-6] Deploy Render: `build` cần devDependencies (`typescript`, `@swc/core`) lúc build — đảm bảo Render không cài với `NODE_ENV=production`/`--prod` ở bước build (việc của task DevOps).

## Residual risk
- Chưa chạy thực tế `node dist/apps/api/src/main.js` (ngoài quyền); xác minh bằng đọc output build (đường dẫn require + module type). SWC `decoratorMetadata` với import `type Env` dự kiến emit fallback an toàn — nên smoke-test `pnpm --filter @filmbooking/api start` ở bước close-out/DevOps.
- `ZodValidationPipe` chưa đăng ký global (dùng per-route) — đúng thiết kế, module sau phải tự gắn.

## Verdict
✅ PASS
