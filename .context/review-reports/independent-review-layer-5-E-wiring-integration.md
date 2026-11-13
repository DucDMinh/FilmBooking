# Independent Review — Layer 5 nhóm E: task-09 wiring + tích hợp toàn layer

- Agent: reviewer (độc lập, chỉ đọc)
- Ngày: 2026-11-13
- Range: `7583bc1..7574049` (branch `staging`), task-09 commit `5217698`, merge `919520b`..`22ee5fc`, close-out `7574049`
- **Review level:** STRICT
- **Reason:** wiring AppModule (global guard/filter), shared `database.types.ts`, merge 12 task song song, close-out `progress.json` + tag layer, gate phase review.
- **Blast radius:** toàn API runtime (module nào được mount), mọi client dùng `@filmbooking/shared`, source of truth trạng thái (`progress.json`, tag `layer-5-done`), quyết định unlock Layer 6.
- Báo cáo cũ `build-filmbooking-layer-5-*` KHÔNG được dùng làm bằng chứng.

## Verify commands + result (chỉ lệnh thực sự chạy)

| Lệnh | Kết quả |
|---|---|
| `git -C E:/FilmBooking log --oneline 7583bc1..7574049` | 25 commit (12 task, 12 merge, 1 close-out) |
| `git log --format="%h %p %s" --merges` / `--no-merges` | Mọi task commit có parent `7583bc1`; mỗi merge = tích hợp tuần tự 1 task |
| `git show --cc` cho 12 merge | Combined diff RỖNG cho cả 12 → không có conflict resolution / evil merge |
| `git diff --name-status 7583bc1 7574049` | 115 file; không có `supabase/`, `.claude/`, `.github/`, `scripts/`, `tools/`, `package.json`, `pnpm-lock.yaml`, `AGENTS.md`/`CLAUDE.md`, `common/auth/*`, `me.controller.ts`, `profile.service.ts`, `.env*` |
| `git diff --stat 7583bc1 7574049 -- packages/shared/src/database.types.ts` | rỗng (không đổi trong Layer 5) |
| `git show --stat 5217698` | chỉ `apps/api/src/app.module.ts` +4 |
| `git log -- packages/shared/src/database.types.ts`, `-- supabase/migrations` | lần đổi types cuối `c675fdb`; migration cuối `bb68b3b` (20261113090000); cả hai trước `7583bc1` (`merge-base --is-ancestor bb68b3b 7583bc1` exit 0) |
| `git log --tags --no-walk --format="%h %D"` | `7574049 ... tag: layer-5-done, layer-5-integration` |
| `git diff 7583bc1 7574049 -- .context/progress.json` | xem Finding M-1 |
| `git show --stat --format=%B 7574049` | 30 file, body rỗng, không trailer |
| `node scripts/parallel-dispatch.mjs plan --layer 5` | **Blocked** (agent-guard: không trong allowlist). Thay bằng Grep mục "Files to Create/Modify" trong `tasks/build-filmbooking/layer-5-task-*.md` |
| `git tag --list "layer-*"` | **Blocked** (agent-guard chỉ cho git read-only nhóm log/show/diff…); thay bằng `git log --tags --no-walk` ở trên |
| `pnpm typecheck/lint/test/build` | KHÔNG chạy (session chính chạy, theo brief) |
| `aislop` / `oxlint` / `ocr` | không chạy (ngoài allowlist của brief; diff task-09 chỉ 4 dòng) |

## Trả lời các điểm kiểm

1. **Wiring** — `apps/api/src/app.module.ts:25-36` import: AppConfig, Supabase, Auth, Me, Catalog, CinemaOps, AuthExt, Profile, **Identity, Pricing** (task-09). 9 module Layer 5 (booking, payment, mail, jobs, checkin, admin, orders, report, cancellation) **chưa đăng ký** → endpoint của chúng không tồn tại ở runtime. **Đúng kế hoạch**: `tasks/build-filmbooking/layer-6-task-01.md` ("Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, admin, orders, report, cancellation", phụ thuộc layer-5-task-09; PLAN.md:141). Guard global còn nguyên đúng thứ tự `AuthGuard → RolesGuard → CinemaScopeGuard → ThrottlerGuard` (`app.module.ts:39-43`), `AllExceptionsFilter` còn; `ThrottlerModule.forRoot` nằm trong `AuthModule` (`common/auth/auth.module.ts:15`); trust-proxy `onModuleInit` còn. Pipe validate là Zod per-route (không có global pipe trước đó, không bị mất). Đã xác minh.
2. **`database.types.ts`** — KHÔNG đổi trong Layer 5 (task-09 khai file này nhưng không chạm). Spot-check khớp migration: có `identity_link_intents` (:302, đủ cột), `has_cinema_manager_scope` (:980), `cancel_showtimes(p_actor_id?, p_reason, p_showtime_ids)` (:950), `hold_seats` returns TABLE khớp `20261112140000:18`, `report_revenue` khớp `20261112160000:310-327`; không còn `pos_api_*`, `pos_requests`, `confirm_pos_sale`, `extend_pos_hold`. Migration `20261113090000` chỉ thêm CHECK + replace trigger function → không ảnh hưởng types. Định dạng (`},"identity_link_intents": {`) là output của `supabase gen types` (không prettier), không có dấu hiệu sửa tay. Kết luận: types đồng bộ, việc không regen là hợp lệ; nhưng commit message "sync database types" + report cũ "đồng bộ hoàn chỉnh" là khẳng định sai (MINOR m-1).
3. **Merge** — 12 merge sạch (combined diff rỗng), các task chạm tập file rời nhau; file chung trong range chỉ `app.module.ts` (task-09) và `(public)/layout.tsx` (task-11), mỗi file đúng 1 task. `packages/shared/src/errors.ts`, `schemas/index*` (không tồn tại; shared export qua `./*` subpath), `apps/web/src/lib/api/error-messages.ts`, `client.ts`, `package.json`, `pnpm-lock.yaml` **không bị task nào sửa** → không mất thay đổi, không trùng khoá. Không thấy xung đột route giữa module (đối chiếu toàn bộ decorator `@Controller/@Get/...`), nhưng có alias route trùng chức năng (m-5).
4. **Ngoài scope** — xem danh sách cuối báo cáo. Không đụng migration, `.claude/`, `.github/`, `scripts/`, `tools/`, config, `AGENTS.md`/`CLAUDE.md`, hook, `common/auth/auth.guard.ts`, `recent-login.ts`, `me.controller.ts`, `profile.service.ts`. Không có `.env`, secret, artefact build (dist/.next) trong range. Đã xác minh qua name-status.
5. **Dependency** — không có `package.json`/lockfile nào đổi. Gói mà code mới import (`resend`, `@payos/node` khai sẵn ở `apps/api/package.json:18,25`; `@marsidev/react-turnstile`, `@supabase/ssr`, `@testing-library/user-event` ở `apps/web/package.json:16,26,48`) đều đã có từ trước. Không có dependency mới.
6. **Close-out `7574049`** — xem M-1, M-2. `currentLayer` 4→5; `bugs` và `remediation.followups` **không bị mất**; `remediation.p1.completed` thêm "02".."08" và `p1Status: "done"` (đổi trạng thái work item khác trong commit layer-5). Tag `layer-5-done` CÓ, trỏ `7574049`. "Phase review PASS" dựa trên `.context/review-reports/build-filmbooking-layer-5-phase-review.md` — chỉ khẳng định, không có lệnh + output thô, và có sai sự thật (M-2).
7. **Docs** — `docs/API_SPEC.md`, `docs/ERD.md`, `docs/PERMISSION.md` không đổi trong range; endpoint Layer 5 chưa có trong API_SPEC. Kế hoạch dời sang `layer-8-task-07` (as-built docs) và module chưa wired → chấp nhận được, ghi MINOR m-4. Intent docs (`SPECIFICATIONS.md`, `docs/BRD.md`) **không bị sửa**. Đã xác minh.
8. **POS/đổi suất** — không còn route/DTO/nhánh POS hay đổi suất. Tàn dư trong contract mới: `cancellation.service.ts:81` trả `posPaidOrdersCount`, `report.controller.ts:262,279` trả `exchangedOrders`; copy UI `profile-form.tsx:192` "thay đổi suất chiếu", `tai-khoan/thong-bao/page.tsx:127` "thông báo thay đổi suất chiếu" (m-3).
9. **Spec coverage layer** — mọi file khai trong "Files to Create/Modify" của 12 task đều tồn tại, trừ `packages/shared/src/database.types.ts` (task-09) khai nhưng không sửa (hợp lệ, xem điểm 2). task-05 removed, không có file.

## Findings

### MAJOR

**M-1 — Close-out xoá dữ liệu trạng thái remediation của Layer 3/4 trong `progress.json` (đã xác minh)**
- Vị trí: commit `7574049`, `.context/progress.json` (khối `completedTasks` layer-3/task-01..07, layer-4/task-01..12); nguyên nhân gốc `tools/progress-write.mjs:160-174` (`normalizeCompleted` chỉ giữ `task, review, round, report, completedAt`, rơi mọi field khác).
- Bằng chứng: diff xoá `"status": "needs_remediation"` và `"previousReview"` của 19 entry, không có ghi chú/quyết định nào. `review` vẫn ghi "SUPERSEDED … cần sửa trong work item bug/layer34-review" → trạng thái nay mâu thuẫn và không còn máy đọc được. Mỗi lần dispatcher ghi lại sẽ tiếp tục làm rơi field.
- Đề xuất: khôi phục 2 field cho 19 entry (hoặc thay bằng trạng thái đúng nếu P0/P1 đã đóng chúng, có ghi lý do); sửa `normalizeCompleted` giữ nguyên field lạ (`{...x, task:id}`) + test. Việc sửa tool là thay đổi `tools/` → đi qua change-request.

**M-2 — Gate "phase review PASS" + tag `layer-5-done` dựa trên báo cáo không có bằng chứng và có sai sự thật (đã xác minh)**
- Vị trí: `.context/review-reports/build-filmbooking-layer-5-phase-review.md` (và bản trùng `…layer-5-round-1-review.md`, cùng 219 dòng); tag `layer-5-done` → `7574049`.
- Bằng chứng:
  - Không có lệnh + output thô nào; chỉ khẳng định "374/374", "96 files dist", "23 routes" (:30-33).
  - :79 "SALES_CLOSED sang HTTP 400" nhưng `packages/shared/src/errors.ts:72` = 409; :78 "ORPHAN_SEAT sang HTTP 409" nhưng `errors.ts:71` = 422.
  - :112-114 gán R-112/R-113/R-116 cho `orders/orders.controller.ts` và route `GET /admin/reports/movie-showtimes`; thực tế report nằm ở `report/report.controller.ts:335-367`, route là `admin/reports/showtimes`, không có `movie-showtimes`.
  - :24 "task-09 … `database.types.ts` 100% schema sync" — commit `5217698` không chạm file đó.
  - Report task-09 (`…task-09-round-1-review.md:60`) nói AC "App khởi động" verify qua `app.e2e-spec.ts`, nhưng `apps/api/test/app.e2e-spec.ts:105-201` ("Wiring #2") không có case `/me/identities` hay `/showtimes/:id/prices`; `pricing.e2e-spec.ts:319` và `identity.e2e-spec.ts:369` dựng TestingModule riêng, không qua AppModule.
  - Ma trận đánh "COVERED/PASS" cho R/AC của 9 module chưa mount ở runtime mà không ghi chú.
- Hệ quả: Layer 5 bị đóng và gắn tag như đã PASS khi chưa có review thật; trái AGENTS.md (report phải có Verify commands + result thật).
- Đề xuất: coi phase review và 12 report task là không hợp lệ; chỉ coi Layer 5 PASS sau khi 7 review độc lập (nhóm A–F + nhóm này) PASS và có output thật của `pnpm typecheck/lint/test/build`; ghi lại phase review mới có bằng chứng; ghi trong `progress.json` rằng tag `layer-5-done` đặt trước khi review thật (không xoá/di chuyển tag nếu chưa được user duyệt). Các ghi chú "COVERED" nên ghi rõ "module-level, chưa wired (layer-6-task-01)".

### MINOR

- **m-1** `5217698` message "sync database types" + task-09 DoD "Tests added" — không đổi types (đúng, vì đã đồng bộ từ `c675fdb`), không thêm test smoke AppModule cho AC `GET /me/identities` 401 / `GET /showtimes/:id/prices` 200 (file `app.e2e-spec.ts` không nằm trong file list task-09). DI của Identity/Pricing chỉ được phủ gián tiếp vì `app.e2e-spec.ts` compile AppModule. Đề xuất: thêm 2 case này khi làm `layer-6-task-01` (task đó có `app.e2e-spec.ts` trong file list). Đã xác minh.
- **m-2** File tạo ngoài "Files to Create/Modify" (6 file, đều nằm trong thư mục module của chính task, rủi ro thấp) + close-out đưa vào 11 journal `.context/runs/bug-layer34-review-*.builder.md` của work item khác và cập nhật `remediation.p1.completed/p1Status` trong commit layer-5; commit `7574049` không có trailer theo `.agent/workflows/state-commit.md` §2.8. Đã xác minh.
- **m-3** Tàn dư POS/đổi suất lọt vào contract API mới: `apps/api/src/modules/cancellation/cancellation.service.ts:81` (`posPaidOrdersCount`), `apps/api/src/modules/report/report.controller.ts:262,279` (`exchangedOrders`); copy UI `apps/web/src/components/account/profile-form.tsx:192`, `apps/web/src/app/(public)/tai-khoan/thong-bao/page.tsx:127`. DB còn trả các cột này là nợ có chủ đích, nhưng không nên phơi ra contract mới. Đề xuất: bỏ khỏi DTO trả về, sửa copy. Đã xác minh.
- **m-4** `docs/API_SPEC.md` chưa có endpoint Layer 5 (dời sang `layer-8-task-07`); ngoài ra dòng 51 (Pricing) lệch code có sẵn từ Layer 4 (`/admin/pricing/holidays`, `GET …/price-quote` vs code `holidays`, `price-rules`, `GET showtimes/:id/prices`, `POST …/price-quote` ở `pricing.controller.ts:84-147`). Ghi vào layer-8-task-07. Đã xác minh.
- **m-5** Nhiều alias route trùng chức năng làm phình contract/bề mặt phân quyền: `reports/*` + `admin/reports/*` (`report.controller.ts:291,335`), `orders/*` + `admin/orders/*` (`orders.controller.ts:29,71`), mảng path ở `cancellation.controller.ts:91-233`, `PATCH`+`PUT admin/vouchers/:id` (`vouchers.controller.ts:139,149`), `PATCH …/admin-role` + `PUT/DELETE …/roles/admin` (`users.controller.ts:140-155`). `report.controller.ts` dài > 300 dòng (decorator ở dòng 367). Chuyển cho nhóm admin/orders/report xác nhận; đề xuất chốt 1 path theo API_SPEC. Nghi ngờ (chưa kiểm guard từng alias có cùng `@Roles/@CinemaScope`).

## File ngoài scope (so với "Files to Create/Modify" của các task Layer 5)

Code:
- `apps/api/src/modules/booking/booking.helper.ts` (task-01 `d22a25c`)
- `apps/web/src/components/auth/auth-ui.tsx`, `apps/web/src/components/auth/turnstile-field.tsx` (task-10 `a65ca4e`)
- `apps/web/src/components/account/change-email-dialog.tsx`, `apps/web/src/components/account/__tests__/account.test.tsx` (task-11 `8004d09`)
- `apps/web/src/components/admin/admin-shell.tsx` (task-13 `8305618`)

Workflow artefact (close-out `7574049`): `.context/progress.json`, 17 report `build-filmbooking-layer-5-*`, `.context/runs/build-filmbooking-layer-5.md`, 11 journal `.context/runs/bug-layer34-review-*.builder.md` (thuộc work item khác).

Không có file nhạy cảm (migration, `.claude/`, `.github/`, `scripts/`, `tools/`, config, auth guard, `.env`, build artefact).

## Verdict

**FAIL** (STRICT).

Phần code tích hợp tự thân sạch: wiring đúng kế hoạch, guard/filter nguyên vẹn, types đồng bộ migration, 12 merge không conflict, không đụng vùng nhạy cảm, không dependency mới. FAIL vì gate đóng layer không hợp lệ: phase review/tag `layer-5-done` dựa trên báo cáo không có bằng chứng và sai sự thật (M-2), và close-out làm mất dữ liệu trạng thái remediation trong source of truth (M-1).
