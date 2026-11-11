Agent: reviewer

# Review — build-filmbooking layer-2 task-04 (round 1)

Web data layer: API client REST, map mã lỗi -> tiếng Việt, Supabase SSR, middleware phiên.
Worktree: `E:\FilmBooking\.worktrees\layer-2__task-04` (chưa commit).

- **Review level:** STRICT
- **Reason:** auth/session/cookie, middleware chặn route bảo vệ (RBAC entry), chống open redirect, API client dùng chung cho mọi màn (shared client + error contract).
- **Blast radius:** mọi trang web (middleware chạy trên mọi request không phải asset); mọi lời gọi REST từ web (`apiFetch`, `ApiError`); toàn bộ UX thông báo lỗi; luồng đăng nhập/redirect `next` (layer 5 sẽ tiêu thụ); cấu hình cookie phiên Supabase.

## Diff in scope
- `apps/web/src/lib/api/client.ts` (new)
- `apps/web/src/lib/api/error-messages.ts` (new)
- `apps/web/src/lib/api/__tests__/client.test.ts` (new)
- `apps/web/src/lib/supabase/browser.ts` (new)
- `apps/web/src/lib/supabase/server.ts` (new)
- `apps/web/src/middleware.ts` (new)
- `apps/web/next-env.d.ts` (deleted — theo brief, dispatcher xử lý khi close-out; không tính lỗi)
Không có file ngoài danh sách Files to Create/Modify.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm -w lint` / `-w typecheck` / `-w test` | Blocked bởi agent-guard (cờ `-w` bị hiểu là cờ ghi file) -> chạy bản tương đương root script `pnpm lint/typecheck/test/build` (`pnpm -r --if-present ...`) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — shared 14, api 20, web 18 (2 file) |
| `pnpm build` | PASS — Next 16.4.6, cảnh báo `"middleware" file convention is deprecated. Please use "proxy"` |

## Acceptance Criteria
| AC | Kết quả | Bằng chứng |
|---|---|---|
| `SEAT_TAKEN` -> ApiError tiếng Việt; mã lạ -> thông điệp chung | OK | client.test.ts:27-41 |
| `/ve` chưa đăng nhập -> `/dang-nhap?next=%2Fve`; `next` ngoài domain bị loại | OK | client.test.ts:62-69, 83-89 |
| Mọi mã lỗi shared có message (lặp toàn bộ enum) | OK | `Record<ErrorCode,string>` + test client.test.ts:53-58 so sánh key set 2 chiều |
| Không import service role ở web | OK | Grep `service.?role` trong `apps/web` chỉ ra comment browser.ts:3; chỉ dùng `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Description: cookie `HttpOnly/Secure/SameSite=Lax` | **FAIL** | xem MAJOR-1 |

## Findings

### [MAJOR-1] Cookie phiên không HttpOnly — lệch intent spec mà không có phê duyệt/gap
- `apps/web/src/lib/supabase/server.ts:5-7`, `apps/web/src/middleware.ts:32-36`: chỉ set `sameSite: "lax"`, `secure` ở production; không `httpOnly`.
- Intent yêu cầu rõ: task Description ("Supabase SSR cookie (`HttpOnly/Secure/SameSite=Lax`)"), `SPECIFICATIONS.md:346` (NFR-06) và `SPECIFICATIONS.md:446` ("Phiên: cookie `HttpOnly`/`Secure`/`SameSite`"), `docs/BRD.md:530`.
- Lý do builder đưa ra (createBrowserClient của @supabase/ssr đọc cookie qua `document.cookie`) là đúng về kỹ thuật, nhưng hệ quả là access + refresh token đọc được bằng JS -> mọi XSS thành chiếm phiên lâu dài (refresh token). Theo AGENTS.md "Code ≠ intent -> ghi gap, KHÔNG hạ cấp intent" — ở đây chưa có gap entry, chưa có phê duyệt user, task file không ghi deviation.
- Cách fix (chọn 1, cần dispatcher/user quyết vì là quyết định kiến trúc):
  a. **Giữ đúng intent (khuyến nghị nếu chấp nhận refactor nhỏ):** set `httpOnly: true` ở cả `sessionCookieOptions` và middleware (dùng chung 1 hàm); session chỉ quản lý phía server (đăng nhập/đăng xuất/OAuth callback qua Route Handler/Server Action ở layer 5); `apiFetch` ở client không đọc token từ browser client mà gọi qua Server Action/Route Handler proxy (hoặc chỉ gọi API từ server với `getServerAccessToken`). `createBrowserSupabase` khi đó chỉ dùng cho việc không cần phiên (hoặc bỏ).
  b. **Chấp nhận deviation:** user duyệt rõ, ghi gap register (NFR-06 partial: non-HttpOnly do @supabase/ssr browser client) + ghi vào task file Notes/Residual risk, kèm biện pháp giảm thiểu bắt buộc: CSP chặt (không `unsafe-inline` script, nonce) ở layer làm security headers, rút ngắn JWT expiry, bật refresh token rotation + reuse detection trong Supabase, không render HTML không tin cậy (`dangerouslySetInnerHTML`).
- Không phải lỗi code thuần, nhưng là requirement explicit chưa đạt và chưa được phê duyệt -> MAJOR.

### [MINOR-1] `sanitizeNext` đặt trong `middleware.ts`
- `apps/web/src/middleware.ts:13-17`. Phía middleware tự build `next` từ `pathname` (luôn bắt đầu bằng `/`) nên chỗ phòng thủ open-redirect thực sự là **nơi tiêu thụ** `next` (form đăng nhập/OAuth callback layer 5). Đặt helper trong file middleware khiến page/route handler phải import từ `middleware.ts` (kéo theo `@supabase/ssr` server client). Đề xuất: chuyển sang `apps/web/src/lib/auth/safe-next.ts` (follow-up, hoặc round 2 nếu dispatcher mở rộng file list) và ghi rõ trong task layer-5 rằng login/callback BẮT BUỘC gọi `sanitizeNext` trước `redirect`.

### [MINOR-2] Lặp logic cookie options
- `apps/web/src/middleware.ts:32-36` lặp lại `sessionCookieOptions` (`server.ts:5-7`). Nên import dùng chung để HttpOnly/Secure không bị lệch giữa 2 nơi (liên quan trực tiếp MAJOR-1).

### [MINOR-3] Matcher và chi phí `getUser()` trên mọi request
- `apps/web/src/middleware.ts:60-62`: chưa loại `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, font (`woff2`), `.avif` -> các request này cũng gọi Supabase Auth. `getUser()` (middleware.ts:44) là 1 round-trip mạng tới Supabase cho mọi trang (kể cả công khai). Đúng khuyến nghị bảo mật của Supabase (không tin cookie thô), nhưng nên bổ sung các đuôi asset vào matcher. Không chặn nhầm asset tĩnh (`_next/static`, `_next/image` được loại).

### [MINOR-4] Thiếu env -> middleware ném lỗi cho mọi trang
- `middleware.ts:22-24`, `server.ts:13-14`, `browser.ts:6-7` dùng `?? ""`; `createServerClient("")` sẽ throw -> 500 toàn site nếu thiếu env. Nên fail-fast rõ ràng (throw message "Thiếu NEXT_PUBLIC_SUPABASE_URL…") hoặc validate env lúc build. Residual, không chặn.

### [MINOR-5] Edge của `apiFetch`
- `client.ts:77-78`: response 200 với body rỗng / không phải JSON sẽ ném `SyntaxError` thô (không phải `ApiError`). Đề xuất: đọc `res.text()` rồi parse, rỗng -> `undefined`.
- Thiếu test: lỗi mạng (status 0), body lỗi không phải JSON, `isProtectedPath("/vexyz")` không bị chặn, `sanitizeNext` với ký tự điều khiển. Nên bổ sung (nhỏ).

### Ghi nhận OK (security)
- Open redirect: chặn `//host`, `/\host`, URL tuyệt đối, ký tự điều khiển; redirect giữ cookie đã refresh (`middleware.ts:54`).
- Middleware dùng `getUser()` (xác thực với Supabase), không tin cookie thô. `getServerAccessToken` dùng `getSession()` nhưng chỉ chuyển token cho API (API verify JWT) — chấp nhận được; không dùng nó để quyết định quyền ở web.
- Không log token; token chỉ gửi tới `NEXT_PUBLIC_API_URL`. Message lỗi tiếng Việt không chứa `message`/stack từ server (chỉ map theo code; `INTERNAL_ERROR` -> thông điệp chung).
- `isKnownErrorCode` dùng `Object.hasOwn` (không dính prototype như `__proto__`/`toString`).

## Khuyến nghị middleware.ts -> proxy.ts
Next 16.4.6 build vẫn chạy (`ƒ Proxy (Middleware)`), chỉ cảnh báo deprecate. Khuyến nghị: **đổi ngay trong round 2** nếu dispatcher cập nhật Files to Create/Modify (vì task này là owner duy nhất của file trong layer 2, round 2 đằng nào cũng phải chạy; chi phí rất nhỏ: `git mv` -> `src/proxy.ts`, đổi export `middleware` -> `proxy`, sửa import test, cập nhật comment). Nếu dispatcher không muốn mở rộng scope -> ghi follow-up bắt buộc trước layer-5 (auth pages) để tránh conflict. Lưu ý proxy chạy Node runtime — tương thích `@supabase/ssr`.

## Responsive Checklist Gate
N/A — diff không đụng UI (không route/component/CSS; chỉ data layer + middleware).

## Skill gates
| Gate | Kết quả |
|---|---|
| aislop | skip, `aislop` not installed (exit 127) |
| oxlint (anti-slop) | skip, oxlint not configured (không có `.oxlintrc.json`); eslint PASS |
| ocr (open-code-review) | skip, ocr not installed |
| AI-readable | OK — 0-1 indicator (tên rõ, hàm ≤50 dòng — `middleware` ~40 dòng, file ≤100 dòng, không magic number đáng kể, comment giải thích WHY) |
| ai-friendly-web | N/A — task nội bộ data layer |
| blitzstrike | skip — không có môi trường được phép; review tĩnh |

## Residual risk
- Không chạy app/browser: hành vi cookie thực tế (flags, refresh) chưa kiểm chứng end-to-end; middleware test dùng mock `@supabase/ssr`.
- `pnpm -w <cmd>` bị guard chặn; đã chạy root script tương đương (`pnpm -r --if-present`).

## Verdict
**FAIL** — 1 MAJOR (MAJOR-1: cookie phiên không HttpOnly, lệch NFR-06/task description, chưa có phê duyệt/gap). Code còn lại chất lượng tốt, verify PASS. Round 2: chọn phương án (a) hoặc (b) cho MAJOR-1 (b cần user duyệt + gap entry), xử lý MINOR-2 cùng lúc; MINOR khác tuỳ chọn.
