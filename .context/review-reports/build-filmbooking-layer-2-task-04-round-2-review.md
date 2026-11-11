Agent: reviewer

# Review — build-filmbooking layer-2 task-04 (round 2)

Worktree: `E:\FilmBooking\.worktrees\layer-2__task-04` (chưa commit). Round 1: FAIL (MAJOR-1 cookie không HttpOnly).
Quyết định user/dispatcher cho round 2: cookie HttpOnly + trình duyệt gọi API qua Route Handler `/api/proxy`; đổi `middleware.ts` -> `proxy.ts`; proxy không phải lớp authz (authz ở Nest).

- **Review level:** STRICT
- **Reason:** auth/session/cookie, route handler chuyển tiếp request có gắn token (SSRF/CSRF/lộ token), proxy chặn route bảo vệ, API client dùng chung.
- **Blast radius:** mọi request web (proxy.ts), mọi lời gọi API từ trình duyệt (`/api/proxy`) và từ server (`apiFetch`), cookie phiên Supabase, luồng redirect đăng nhập (layer 5 tiêu thụ `sanitizeNext`).

## Diff in scope (untracked, chưa commit)
`apps/web/src/proxy.ts`, `apps/web/src/app/api/proxy/[...path]/route.ts` (+ `__tests__/route.test.ts`), `apps/web/src/lib/api/{client.ts,error-messages.ts,__tests__/client.test.ts}`, `apps/web/src/lib/auth/safe-next.ts`, `apps/web/src/lib/supabase/{browser.ts,server.ts,cookie-options.ts,env.ts}`. `middleware.ts` đã bỏ; `next-env.d.ts` không còn bị xoá.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS — shared 14, api 20, web 34 (3 file) |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS — không còn cảnh báo deprecation middleware; route `ƒ /api/proxy/[...path]`, `ƒ Proxy (Middleware)` |
(`pnpm -w ...` bị agent-guard chặn ở round 1; root script tương đương `pnpm -r --if-present`.)

## Round 1 findings — trạng thái
| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| MAJOR-1 cookie không HttpOnly | **Đã xử lý** | `cookie-options.ts:7-15` (`httpOnly: true`, `sameSite: "lax"`, `secure` prod, `path: "/"`), dùng ở mọi đường ghi cookie: `proxy.ts:24` (refresh), `server.ts:16`. Browser client không giữ phiên (`browser.ts:12` persistSession/autoRefreshToken/detectSessionInUrl = false); `client.ts:30` trình duyệt luôn gọi `/api/proxy`, không đọc token |
| MINOR-1 sanitizeNext trong middleware | Đã xử lý | `lib/auth/safe-next.ts`, thêm chặn DEL (127) |
| MINOR-2 lặp cookie options | Đã xử lý | một nguồn `sessionCookieOptions` |
| MINOR-3 matcher | Đã xử lý | `proxy.ts:49` loại robots/sitemap/manifest/font/avif |
| MINOR-4 thiếu env | Đã xử lý | `env.ts` fail-fast nêu tên biến + test |
| MINOR-5 edge apiFetch + test | Đã xử lý | `client.ts:69-75`, test client.test.ts:99-136 |
| middleware -> proxy.ts | Đã xử lý | `src/proxy.ts`, export `proxy` |

## Security review `/api/proxy` (route.ts)
| Vấn đề | Kết quả | Bằng chứng |
|---|---|---|
| SSRF / path traversal | OK | Base cố định từ env (`route.ts:22-24`); từng segment phải khớp `SAFE_SEGMENT` (`:14,28`) — chặn `..`, `.`, `/` (kể cả `%2F` sau khi Next decode), `%`, `:`, rỗng; URL ghép `${base}/${segments}${search}` nên search (bắt đầu `?`) không đổi host. Test `:62-69` |
| Header smuggling / `x-forwarded-*` / method override | OK | Whitelist request header (`:12`): không chuyển `cookie`, `host`, `x-forwarded-*`, `x-http-method-override`; method chỉ là handler đã export (GET/POST/PUT/PATCH/DELETE) |
| Lộ token/cookie | OK | Token chỉ vào header `Authorization` gửi Nest; response whitelist (`:13`) chỉ `content-type`, `retry-after` — không trả `set-cookie`; test `:37-48` |
| CSRF | OK (chấp nhận) | SameSite=Lax + chặn mutation có `Origin` khác (`:31-33`). Thiếu `Origin` -> cho qua, nhưng cross-site POST không mang cookie Lax -> forward ẩn danh, Nest trả 401 |
| Không có phiên | OK theo quyết định | Forward không Authorization (`:52`), Nest quyết định; test `:50-60` |
| Body DoS | OK | 413 theo `content-length` và theo byteLength thực (`:40-45`) |
| Redirect upstream | OK | `redirect: "manual"`, không chuyển `Location` |
| API_URL sai/không có | OK | rỗng -> 500 `INTERNAL_ERROR`; fetch lỗi -> 502; không lộ chi tiết lỗi |
| `/api/proxy` có bị proxy.ts chặn? | OK | `/api/...` không thuộc `PROTECTED_PREFIXES` -> không redirect; proxy.ts vẫn chạy trên `/api/*` nên refresh token trước khi route đọc cookie (cookie đã refresh truyền qua `NextResponse.next({ request })`) |
| Public vs protected | OK | `isProtectedPath` khớp chính xác prefix hoặc `prefix/`; test `/vexyz` không chặn, `/ve/abc` chặn |
| Open redirect | OK | `sanitizeNext` chặn `//`, `\`, URL tuyệt đối, ký tự điều khiển + DEL; test CRLF |
| Service role ở web | OK | chỉ `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`env.ts`) |
| Message lỗi | OK | chỉ map theo code; `jsonError` trả code, không stack/chi tiết |

## Findings

Không có CRITICAL / MAJOR.

### [MINOR-1] Thiếu test khẳng định HttpOnly — chính là fix của MAJOR round 1
- `apps/web/src/lib/supabase/cookie-options.ts` không có test; test proxy mock `createServerClient` nên `setAll` không được chạy. Nếu sau này ai bỏ `httpOnly` thì không test nào bắt. Đề xuất: test `sessionCookieOptions({ httpOnly: false, sameSite: "none" })` -> `httpOnly: true, sameSite: "lax", path: "/"`, và 1 test proxy.ts có mock gọi `setAll` -> cookie trên response có `HttpOnly`. Nên làm ở close-out hoặc follow-up nhỏ.

### [MINOR-2] Status không có body từ upstream
- `route.ts:71`: chỉ xử lý 204; 205/304 với body (ArrayBuffer rỗng vẫn tính là body khác null) -> `new Response` ném TypeError -> 500. Hiện khó xảy ra vì không chuyển `if-none-match`. Đề xuất: `[204, 205, 304].includes(status) ? null : ...`.

### [MINOR-3] Mất IP client khi đi qua proxy
- Mọi request trình duyệt tới Nest giờ xuất phát từ server Next. Spec hiện không có rate limit theo IP (grep không thấy), nhưng nếu sau này Nest throttle theo IP hoặc gửi `remoteip` cho Turnstile thì mọi user dùng chung 1 bucket. Ghi follow-up: khi cần thì chuyển IP đáng tin (từ header của nền tảng deploy) qua header riêng, Nest chỉ tin header đó khi request đến từ web.

### [MINOR-4] Origin check sau reverse proxy
- `route.ts:33` so `Origin` với `request.nextUrl.origin`. Nếu nền tảng deploy làm `nextUrl` thành host/proto nội bộ (http vs https) thì mutation hợp lệ bị 403. Trên Vercel thông thường đúng. Residual: kiểm tra trên staging.

### [MINOR-5] Process / doc impact (dispatcher xử lý ở close-out)
- Task file (`tasks/build-filmbooking/layer-2-task-04.md`, cả bản main và worktree) chưa cập nhật Files to Create/Modify (thêm `proxy.ts`, `app/api/proxy/[...path]/route.ts` + test, `lib/auth/safe-next.ts`, `lib/supabase/cookie-options.ts`, `lib/supabase/env.ts`; bỏ `middleware.ts`) và chưa ghi quyết định HttpOnly + proxy.
- Biến env mới, chỉ dùng phía server: `API_URL` (`route.ts:23`, `client.ts:31`; fallback `NEXT_PUBLIC_API_URL`) chưa có trong `.env.example` / `docs/dev-setup.md` / design doc §Secrets.
- Kiến trúc đổi (browser -> `/api/proxy` -> Nest) -> cập nhật `docs/DESIGN.md` current-state (nếu có) hoặc ghi chú trong design doc; ghi cho layer-5: đăng nhập/OAuth callback/đăng xuất BẮT BUỘC chạy phía server (Route Handler/Server Action) vì browser client không giữ phiên; Realtime kênh riêng tư (nếu có) cần token, browser client hiện không có.

## Responsive Checklist Gate
N/A — diff không đụng UI (route handler API + data layer + proxy).

## Skill gates
| Gate | Kết quả |
|---|---|
| aislop | skip, `aislop` chưa cài (round 1 exit 127) |
| oxlint (anti-slop) | skip, oxlint chưa cấu hình; eslint PASS |
| ocr | skip, ocr chưa cài |
| AI-readable | OK — tên rõ, file ≤ 82 dòng, `forward` ~50 dòng (sát ngưỡng), hằng số có tên (`MAX_BODY_BYTES`, whitelist), comment nêu WHY. <3 indicator |
| ai-friendly-web | N/A — không public-facing |
| blitzstrike | skip — không có môi trường được phép; review tĩnh |

## Residual risk
- Không chạy app/browser: flag cookie thực tế, refresh token qua proxy.ts -> route handler, Origin sau reverse proxy chưa kiểm chứng end-to-end (test mock `@supabase/ssr`).
- Nest phải tự áp authz cho mọi endpoint (proxy forward cả khi không có phiên) — theo quyết định dispatcher.

## Verdict
**PASS** — MAJOR round 1 đã xử lý đúng intent NFR-06 (HttpOnly áp lên mọi đường ghi cookie), proxy an toàn trước SSRF/traversal/header smuggling/CSRF/lộ token, verify PASS. Còn 5 MINOR, không chặn; MINOR-1 (test HttpOnly) và MINOR-5 (cập nhật task file + env/doc) nên xử lý ở close-out.
