# Review — bug-admin-ux · phase-1-task-03 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** auth/RBAC redirect, open-redirect surface (`next`), shared layout `(public)` (mọi trang khách), `proxy.ts` (mọi request), OAuth callback.
- **Blast radius:** mọi trang thuộc `(public)`, `/dang-nhap` (render + server action), `/auth/callback`, `proxy.ts` (thêm request header), `LoginForm`. Không đụng API/DB/schema → không có cross-boundary SQL; contract duy nhất là `MeResponse` (`packages/shared/src/schemas/me.ts`: `isAdmin: boolean`, `cinemas[].role ∈ {STAFF, MANAGER}`) — mock trong các test khớp đúng shape này.

## Verify commands + result (chạy từ gốc repo)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — shared 31, api 483, web 39 files / 505 tests, scripts 16 |
| `pnpm build` | PASS (Next 16.4.6; `next dev` ghi vào `.next/dev` nên build chạy song song an toàn — docs `06-cli/next.md:60`). Mọi route `(public)` vẫn `ƒ` như trước; `/robots.txt` `○`, `/sitemap.xml` ISR 1h không đổi |
| aislop / oxlint / ocr | skip — chưa cấu hình / chưa cài |

## Kiểm tra theo trọng tâm

1. **Open redirect / path trick** — `sanitizeNext` chạy trước `isStaffAllowedPath` ở mọi đường redirect (`resolvePostLoginTarget`, `LoginForm` dùng `sanitizeNext(res.redirectTo) ?? safeNext`). Tự suy luận: `//evil`, `https://evil`, `/\evil`, `javascript:` → bị `sanitizeNext` loại; `/admin/../phim`, `/admin/%2e%2e/phim` → URL chuẩn hoá thành `/phim` → không được phép; `/admin@evil`, `/adminx`, `/staffing`, `/administrator`, `/tai-khoanx` → so khớp "bằng hoặc tiền tố + `/`" nên bị chặn; `/admin/..%2f..%2fphim` → giữ nguyên trong `/admin` (cùng origin, admin layout tự kiểm quyền) → vô hại. Không có open redirect.
2. **Header `x-pathname`** — đã kiểm bằng code Next thật:
   - `proxy.ts:20` `request.headers.set(...)` (ghi đè giá trị client gửi) rồi `NextResponse.next({ request })`; `handleMiddlewareField` (`next/dist/server/web/spec-extension/response.js:24-36`) đọc `init.request.headers` (NextRequest.headers là `Headers`) → sinh `x-middleware-request-*` + `x-middleware-override-headers`.
   - `next/dist/server/lib/router-utils/resolve-routes.js:415+` ghi đè `req.headers` từ các header đó → `headers()` ở Server Component đọc được. Khớp pattern docs `03-file-conventions/proxy.md:431-468`.
   - Nhánh `setAll` tạo lại `NextResponse.next({ request })` sau khi header đã set → vẫn mang `x-pathname`.
   - Matcher phủ toàn bộ route `(public)` (chỉ loại static/ảnh/robots/sitemap).
   - `proxy.test.ts` kiểm đúng contract `x-middleware-request-x-pathname` và chống giả mạo.
3. **Loop / phân vai** — customer → `/admin` → `/khong-co-quyen` (nằm ngoài `(public)`) → không loop. STAFF → `/staff/chon-rap`: `staff/layout.tsx:30` chấp nhận mọi `resolveAdminRole` khác null → vào được. ADMIN/MANAGER → `/admin` qua `admin/layout.tsx:36-37`. `/dang-nhap` khi phiên hết hạn: `/me` 401 → null → hiện form, không vòng `/staff → /dang-nhap → /staff`. Nhiều vai dùng đúng `resolveAdminRole` (ADMIN > MANAGER > STAFF). Fail-open khi `/me` lỗi: chỉ là hạ cánh ở trang khách; API `/admin`, `/staff` tự kiểm quyền → không phải lỗ hổng, chấp nhận.
4. **Hiệu năng / rendering** — khách chưa đăng nhập: `getUser()` trả null → không gọi `/me` (có test). `headers()` chỉ gọi khi là nhân sự; layout vốn đã dynamic do `cookies()` → không mất cache/SEO; robots/sitemap/metadata không đổi (build xác nhận).
5. **Test không xanh giả** — layout test mock `headers()` trả `Headers` có/không có `x-pathname`, mock `redirect` ném lỗi như Next thật; `staff-area-guard.test.tsx` thiếu bước đỏ nhưng một guard no-op sẽ fail test 1 → có kiểm hành vi thật. Mock `exchangeCodeForSession` trả `{ data: { session }, error }` đúng shape supabase-js.
6. **`redirect()` ngoài try/catch** — layout (`(public)/layout.tsx:42-45`) và login page (`dang-nhap/page.tsx` gọi `redirect` sau `staffRedirectTarget`, try/catch chỉ bọc phần lấy token + `/me`). Không lộ thông tin (không phản chiếu lỗi/vai trò ra URL).

## Findings

Không có finding Critical/Major.

| # | Mức | Vị trí | Nội dung |
|---|---|---|---|
| m1 | Minor | `apps/web/src/lib/auth/role-home.ts:14` | Prefix `/staff` cho phép đúng `/staff` (không có page → 404). Nhân sự đăng nhập với `next=/staff` sẽ vào 404. Đề xuất (không chặn): coi `/staff` chính xác như không hợp lệ hoặc map về `STAFF_HOME`. |
| m2 | Minor | `apps/web/src/app/(auth)/dang-nhap/page.tsx:43-44` | Redirect nhân sự đã đăng nhập chạy trước khi xét `error`: `/dang-nhap?error=identity_taken\|email_exists\|oauth` (từ callback khi `next` không phải `/tai-khoan*`) sẽ bị nuốt thông báo lỗi với nhân sự đang đăng nhập. Hiếm (luồng liên kết OAuth đi qua `/tai-khoan`), không chặn. |
| m3 | Minor (perf) | `apps/web/src/app/(public)/layout.tsx:33-34` | Customer đã đăng nhập tốn thêm 1 `getSession` + 1 `/me` mỗi lần tải cứng trang khách. Câu "khách không tốn /me" chỉ đúng với khách chưa đăng nhập. Phù hợp thiết kế đã duyệt (không gọi ở proxy); ghi nhận chi phí. |
| m4 | Minor (latent) | `apps/web/src/lib/auth/role-home.ts:24-31` | `isStaffAllowedPath` tự nó coi `//host/admin` hay `http://evil/admin` là hợp lệ (URL lấy pathname). Hiện không khai thác được: mọi lời gọi redirect đều qua `sanitizeNext` trước; ở layout giá trị là `nextUrl.pathname` (Next 308 chuẩn hoá `//`). Nên ghi chú/guard đầu vào nếu helper được dùng lại. |
| m5 | Minor (test gap) | `apps/web/src/lib/auth/__tests__/role-home.test.ts:41-50` | Thiếu case `/staffing`, `/admin@evil`, `/admin%2f..%2fphim` (logic đúng qua suy luận, chỉ thiếu coverage). |
| i1 | Info | `apps/web/src/proxy.ts:56` | Đường dẫn khớp đuôi ảnh (vd `/phim/x.png`) bị matcher bỏ qua → `x-pathname` client gửi đi thẳng vào layout. Chỉ ảnh hưởng chính nhân sự đó (UX), guard client vẫn chặn; API tự kiểm quyền. |
| i2 | Info | task AC | AC ghi STAFF → `/staff`; builder dùng `/staff/chon-rap` vì `app/staff/page.tsx` không tồn tại (đã xác minh bằng `git ls-files`). Lệch hợp lý nhưng phải ghi nhận (xem close-out). |

## Close-out bắt buộc (cho dispatcher, không phải lỗi code)

- `.context/decisions.md` **chưa** được append (task ghi "decision impact: append") — cần ghi quyết định vai trò → đích, kèm lệch `/staff` → `/staff/chon-rap`.
- Không stage vào commit task: `apps/web/src/components/admin/__tests__/shell.test.tsx` (chỉ đổi line ending, `--stat` rỗng), `.context/runs/build-filmbooking-layer-8.md` (journal không liên quan), `apps/web/AGENTS.md` (do `next dev` tự sinh — commit riêng/có chủ đích nếu muốn).
- E2E thật chưa chạy. Đề xuất kiểm bằng cookie phiên thật: `curl -sI -b "<sb-...-auth-token của admin>" http://localhost:3000/phim` → kỳ vọng `307 Location: /admin`; cùng cookie với `/tai-khoan/bao-mat` → `200`; cookie staff với `/` → `307 Location: /staff/chon-rap`.

## Verdict

**STRICT PASS** — logic điều hướng đúng, không open-redirect, không loop, header `x-pathname` được xác minh qua code Next 16.4.6, lint/typecheck/test/build xanh. Các finding Minor/Info không chặn; close-out phải append `decisions.md` và loại file ngoài scope khỏi commit.
