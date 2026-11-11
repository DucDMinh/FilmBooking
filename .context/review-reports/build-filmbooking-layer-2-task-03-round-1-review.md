Agent: reviewer

# Review — build-filmbooking layer-2 task-03 (Nest guards) — round 1

- Worktree: `E:\FilmBooking\.worktrees\layer-2__task-03` (chưa commit)
- Review level: **STRICT**
- Reason: auth/RBAC/permission, tenant isolation theo rạp (AC-16, NFR-05), token/secret (JWT, JOB_SECRET), dùng service role, shared guards/decorators/`AuthUser` contract mà mọi module sau dùng, sửa global exception filter.
- Blast radius: `apps/api/src/common/auth/*` (mọi controller từ layer-3 trở đi qua APP_GUARD), `AuthUser` (`req.user`: `emailConfirmed`, `jwt`) dùng ở `/me` (layer-3-task-03), banner R-05 (layer-5-task-11) và các luồng đặt vé; `all-exceptions.filter.ts` (mọi response lỗi 5xx).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — shared 14, api 38 (5 files), web 10 |
| `pnpm build` | PASS — api "Built 22 files", web next build OK |

## Responsive Checklist Gate
N/A — diff không đụng UI (chỉ `apps/api`).

## Skill gates
- aislop: skip, `aislop` not installed (exit 127).
- oxlint (anti-slop): skip, oxlint not configured (không có `.oxlintrc.json`); ESLint + tsc PASS.
- ocr (open-code-review): skip, cài đặt `ocr` hỏng (`Cannot find module '../package.json'` khi chạy `ocr review`).
- AI-readable: OK — file ngắn (≤70 dòng), hàm < 50 dòng, tên rõ, comment nói WHY; 0–1 indicator (sentinel `"\u0000invalid"` hơi gián tiếp).
- ai-friendly-web: N/A (API nội bộ, không phải trang public).
- blitzstrike: skip, không có môi trường chạy được phép; đã soi thủ công các vector bypass bên dưới.

## Phân tích trọng tâm STRICT
- **Bypass JWT:** `jwtVerify(..., { algorithms: ["HS256"], audience: "authenticated" })` → `alg:none`, RS/ES, HS384 bị jose từ chối; anon/service_role key của Supabase không có `aud`/`sub` → 401. Thiếu `sub` → 401. Mọi lỗi jose bị nuốt → 401 chung, không lộ lý do. OK. Không kiểm `iss` (MINOR, secret HS256 vốn theo project).
- **Header giả:** chỉ đọc `Authorization: Bearer`; không tin header nào khác (x-user-id...). OK.
- **IDOR cinemaId:** gom params/query/body (+ `resolve`), MỌI giá trị phải nằm trong rạp được gán, vai trò tính TẠI rạp đó; mảng/object (`?cinemaId=a&cinemaId=b`, `cinemaId[]=`) → sentinel → từ chối; chuỗi rỗng → không khớp → từ chối; không tìm thấy cinemaId → từ chối (fail-closed). Khoá UUID so sánh chính xác, khác hoa/thường → từ chối (an toàn). Admin bypass có chủ đích. OK. Giới hạn: chỉ đọc key cấp 1 tên `key`; handler đọc cinema từ chỗ khác (vd `showtimeId`, mảng lồng) phải tự khai `resolve` — ghi Residual risk cho các task dùng guard.
- **RolesGuard:** `@Roles('ADMIN')` chỉ Admin qua (`satisfies(held,'ADMIN')` luôn false với STAFF/MANAGER). Kết hợp CinemaScope: Manager HN01 + Staff HN02 gọi endpoint MANAGER ở HN02 → bị chặn ở CinemaScope (vai trò tại rạp). Logic đúng.
- **JobSecretGuard:** SHA-256 hai phía + `timingSafeEqual` (độ dài cố định), header mảng/thiếu → 401, `JOB_SECRET` thiếu → luôn 401. OK.
- **Service role trong AccessService:** chỉ `select` có lọc `user_id = sub` đã verify; key không ra client. Lệch nhẹ với design doc (service role liệt kê cho webhook/job/POS/admin) — chấp nhận được vì đây là tra cứu quyền phía server, nhưng nên ghi vào design doc (MINOR).
- **Lộ thông tin:** filter chỉ log `message`/`stack`, không log request/headers → JWT không lọt log. AppException ≥500 giờ bị che (test `app-500` xác nhận không lộ `hunter2`). `req.user.jwt` là token thô — rủi ro nếu sau này serialize `req.user` vào log (Residual). (Ghi chú nhỏ: `PostgrestError` có thể không phải `Error` → log `[object Object]`; vẫn fail-closed 500 chung.)
- **Thứ tự guard:** comment module ghi Auth → Roles → CinemaScope → Throttler, khớp design §97. Throttler chưa global (đúng Notes task).

## Findings

### [MAJOR] M1 — `emailConfirmed` lấy từ claim user-writable, giả mạo được → bypass R-05
`apps/api/src/common/auth/auth.guard.ts:59` — `emailConfirmed: claims.user_metadata?.email_verified === true`.
`user_metadata` (raw_user_meta_data) trong Supabase do **chính user ghi được** qua `supabase.auth.updateUser({ data: { email_verified: true } })` với anon key; token refresh kế tiếp sẽ mang claim này. Spec/design cho phép Customer chưa xác nhận vẫn đăng nhập (banner `UnverifiedEmailBanner`, màn 11 "Customer chưa xác nhận → rỗng + banner"), nên R-05 ("chưa xác nhận email không được đặt vé") phụ thuộc vào cờ này. `AuthUser.emailConfirmed` là contract dùng chung (`/me` layer-3-task-03, luồng đặt vé) → mọi nơi tin field này đều bị bypass. Supabase khuyến cáo không dùng `user_metadata` cho quyết định phân quyền.

**Fix đề xuất (2 phương án; gate chung: code trong scope KHÔNG được tin `user_metadata.email_verified`):**
- **(a) Trong scope ngay:** lấy `emailConfirmed` phía server từ `auth.users.email_confirmed_at`, vd `supabase.admin().auth.admin.getUserById(sub)` đặt trong `access.service.ts` (file chia sẻ Builder đã báo), lazy hoặc memo theo request.
- **(b) Ưu tiên dài hạn:** claim server-trusted qua Supabase Custom Access Token Hook hoặc trigger ghi `email_confirmed_at` vào `app_metadata` (user không sửa được) → cần migration, ngoài danh sách Files → báo dispatcher đổi scope.

Thêm test: token có `user_metadata.email_verified=true` nhưng nguồn trusted chưa xác nhận → `emailConfirmed=false`.

### [MINOR] m1 — Tra quyền 2 lần mỗi request
`roles.guard.ts:25` và `cinema-scope.guard.ts:43` đều `access.load()` → 4 query service-role/req cho route có cả `@Roles` + `@CinemaScope`. Fix: memo kết quả trên request (vd `request.access` hoặc `WeakMap<request, Promise<UserAccess>>` trong AccessService).

### [MINOR] m2 — Thiếu test cho vài vector quan trọng
`apps/api/test/auth-guards.spec.ts`: chưa có test `alg: none`/HS384, token thiếu `sub`, query trùng key (`?cinemaId=a&cinemaId=b`), nhánh `resolve` (trả id / trả undefined → fail-closed), Manager HN01 + Staff HN02 gọi endpoint MANAGER ở HN02 (vai trò tại rạp), non-admin với `@Roles('ADMIN')`. Logic hiện đúng (đã soi tay) nhưng nên khoá bằng test.

### [MINOR] m3 — Chỉ hỗ trợ HS256 secret, không JWKS; không kiểm `iss`
Task mô tả "jose, JWKS/secret". Project Supabase dùng signing key bất đối xứng (ES256/RS256) sẽ khiến mọi token bị 401 (fail-closed, không phải lỗ hổng). Đề xuất ghi rõ giả định HS256 trong design doc hoặc hỗ trợ `createRemoteJWKSet` khi có cấu hình; thêm `issuer: \`${SUPABASE_URL}/auth/v1\``.

### [MINOR] m4 — Service role cho tra cứu quyền chưa được ghi trong design doc
`access.service.ts:22` hợp lý về mặt bảo mật (chỉ đọc, lọc theo `sub` đã verify), nhưng design doc §19 liệt kê use-case service role không gồm việc này. Ghi bổ sung vào design doc/DESIGN.md (as-built) khi close-out.

### Ghi chú phạm vi (không tính lỗi)
- `access.service.ts` ngoài danh sách Files — chia sẻ cho 2 guard, Builder đã báo; hợp lý.
- `all-exceptions.filter.ts` + `errors.spec.ts` ngoài danh sách nhưng có ủy quyền ở `tasks/build-filmbooking/PLAN.md:376` (follow-up L1-T02 MINOR 2). Không task layer-2 nào khác đụng file này → không rủi ro conflict merge.

## Residual risk
- Throttler theo `req.ip`: sau proxy (Render) cần `app.set('trust proxy', ...)` ở task wiring layer-3, nếu không mọi client chung 1 IP.
- Handler đọc cinema theo key khác/lồng cần khai `resolve`; nếu quên mà request vẫn có `cinemaId` hợp lệ ở top-level, guard sẽ cho qua dù thao tác nhắm entity rạp khác — phải kiểm ở các task module (và RLS lớp 1).
- `req.user.jwt` chứa token thô — không được log/serialize `req.user`.
- Không chạy được aislop/ocr/blitzstrike.

## Verdict
❌ **FAIL** — 1 MAJOR (M1: `emailConfirmed` dựa trên `user_metadata` user tự sửa được, bypass R-05). Các guard còn lại đạt AC (401/403/FORBIDDEN_CINEMA/timing-safe) và verify commands PASS. Sửa M1 (kèm test), cân nhắc m1–m2 trong cùng vòng.
