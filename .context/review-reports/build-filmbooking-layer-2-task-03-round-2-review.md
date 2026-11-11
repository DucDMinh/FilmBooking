Agent: reviewer

# Review — build-filmbooking layer-2 task-03 (Nest guards) — round 2

- Worktree: `E:\FilmBooking\.worktrees\layer-2__task-03` (chưa commit)
- Review level: **STRICT**
- Reason: auth/RBAC, cô lập dữ liệu theo rạp (AC-16, NFR-05), JWT/JOB_SECRET, service role, contract `AuthUser` dùng chung.
- Blast radius: `apps/api/src/common/auth/*`, `AuthUser` (đã bỏ `emailConfirmed`), các task sau dùng guard và trạng thái email (`/me` layer-3-task-03, đặt vé R-05, banner layer-5-task-11), `all-exceptions.filter.ts`.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS — shared 14, api 45 (5 files), web 10 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS — api "Built 22 files", web next build OK |

## Responsive Checklist Gate
N/A — diff không đụng UI.

## Skill gates
- aislop: skip, chưa cài (round 1: exit 127).
- oxlint: skip, oxlint not configured; ESLint + tsc PASS.
- ocr: skip, bản cài hỏng (round 1).
- AI-readable: OK — file ≤ 75 dòng, hàm ngắn, comment nói WHY.
- ai-friendly-web: N/A.
- blitzstrike: skip, không có môi trường được phép; đã soi tay.

## Đóng finding round 1
| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| M1 `emailConfirmed` từ `user_metadata` | **Đã đóng** | `auth.guard.ts` không còn đọc `user_metadata`; `AuthUser` = {id, email, jwt} (`decorators.ts:10-15`); `AccessService.isEmailConfirmed` đọc `auth.admin.getUserById().email_confirmed_at` (`access.service.ts:44-57`), lazy + WeakMap theo request; test: token mang `user_metadata.email_verified=true` nhưng DB chưa xác nhận → `confirmed:false`; test `keys` xác nhận không còn field này trên `req.user`. |
| m1 tra quyền 2 lần | Đã đóng | `loadForRequest` + WeakMap (`access.service.ts:30-37`), dùng ở `roles.guard.ts:26`, `cinema-scope.guard.ts:44`; test đếm đúng 2 query/request. |
| m2 thiếu test | Đã đóng | Có test alg none, HS384, thiếu sub, iss sai, query lặp cinemaId, `resolve` (HN01 200 / HN02 403), DUAL Manager HN01 + Staff HN02 → 403 FORBIDDEN_CINEMA ở HN02, non-admin `@Roles('ADMIN')` → 403. |
| m3 iss / JWKS | Đóng một phần | Thêm `issuer: <SUPABASE_URL>/auth/v1` (bỏ `/` cuối); hạn chế chỉ HS256 đã ghi rõ trong doc comment. JWKS vẫn chưa có (fail-closed). |
| m4 ghi chú service role vào design doc | Còn mở (MINOR) | Làm ở close-out (Doc Impact). |

## Soát lại an toàn
- WeakMap khoá theo object request → không rò cache giữa request/user; promise lỗi chỉ ảnh hưởng chính request đó (lỗi đi tới filter → 500 chung).
- `getUserById` dùng `sub` đã verify chữ ký, chạy phía server bằng service role; không có input user khác.
- CinemaScopeGuard, RolesGuard, JobSecretGuard giữ nguyên logic đã đạt ở round 1.

## Findings
### [MINOR] n1 — Kiểm `iss` so khớp chính xác với `SUPABASE_URL`
`auth.guard.ts:34`. Nếu GoTrue phát `iss` theo URL khác giá trị `SUPABASE_URL` của API (local `127.0.0.1` vs `localhost`, custom domain, API gọi Supabase qua URL nội bộ) thì mọi request sẽ 401 (fail-closed, không phải lỗ hổng). Đề xuất ghi chú trong `docs/dev-setup.md`, hoặc cho cấu hình `SUPABASE_JWT_ISSUER` riêng khi cần. Kiểm khi wiring ở layer-3.

### [MINOR] n2 — Contract `AuthUser` khác mô tả task
Task ghi `req.user {id, email, emailConfirmed, jwt}`; nay `emailConfirmed` chuyển sang `AccessService.isEmailConfirmed(request)` (đúng về bảo mật). Close-out cần ghi vào task file/PLAN để layer-3-task-03 (`/me` trả emailConfirmed) và task đặt vé (R-05) gọi `isEmailConfirmed`, không đọc claim.

### [MINOR] m4 (còn mở) — Ghi việc dùng service role để tra quyền và trạng thái email vào design doc (as-built) khi close-out.

## Residual risk
- Throttler theo `req.ip` cần `trust proxy` khi wiring ở layer-3.
- Endpoint đọc rạp qua key khác/lồng phải khai `resolve`.
- `req.user.jwt` là token thô — không log/serialize `req.user` (đã có comment cảnh báo).
- Chỉ HS256; project dùng khoá bất đối xứng sẽ cần JWKS.
- aislop/ocr/blitzstrike không chạy được.

## Verdict
✅ **PASS** — không còn CRITICAL/MAJOR. M1 đã đóng có test chứng minh; verify commands đều PASS. Các MINOR n1, n2, m4 xử lý ở close-out hoặc lúc wiring layer-3.
