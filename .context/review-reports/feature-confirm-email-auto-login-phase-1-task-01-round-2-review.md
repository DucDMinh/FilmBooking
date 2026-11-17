# Review — feature-confirm-email-auto-login · phase-1-task-01 · round 2

Agent: reviewer

- **Review level:** STRICT
- **Reason:** risk đỏ — tạo phiên đăng nhập từ link email; round 2 sửa cách ghi cookie phiên (auth/session).
- **Blast radius:** `apps/web/src/app/auth/confirm/route.ts` (cookie `fb-remember` + `sb-*-auth-token*` của trình duyệt bấm link), refresh phiên sau đó qua `apps/web/src/proxy.ts`; test template `apps/api/test/auth-email-templates.spec.ts`; docs `docs/dev-setup.md`, `.context/decisions.md`.

## Verify commands + result (root)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | PASS — shared 31/31, api 574/574, web 593/593 (+3 test mới so với round 1), scripts 31/31 |
| Live local (primary cung cấp, không lặp lại) | `fb-remember=1` → 307 `?status=success`, `Set-Cookie fb-remember=0` + `sb-127-auth-token` không Max-Age/Expires, `email_confirmed_at` set; token đã dùng/type sai/token sai → `?status=expired`, không Set-Cookie. Chốt round-1 Finding 2 (GoTrue nhận `type=signup` + `token_hash`; cookie thật có trên redirect). |

## Đối chiếu round 1

| R1 | Trạng thái | Bằng chứng |
|---|---|---|
| F1 MEDIUM (fb-remember=1 → 30 ngày) | **Đã sửa** | `route.ts:26-33` `pinBrowserSessionCookies()` ghim `fb-remember=0` + ghi lại mọi cookie chứa `-auth-token` với `sessionCookieOptions({}, false)`; gọi ở `route.ts:58` chỉ khi `verifyOtp` thành công và có `access_token`. Lỗi (`route.ts:53`) / throw (`route.ts:55-56`) return trước, không đụng cookie. |
| F2 MEDIUM (thiếu verify live) | **Đã đóng** | evidence live của primary ở trên. Primary còn phải điền Repro Verification vào task file khi close-out. |
| F3 LOW (login-CSRF) | **Đã ghi** | `.context/decisions.md` Consequences: kịch bản, giảm nhẹ, hướng sửa sau (trang trung gian POST). |
| F4 LOW (regex `&`) | **Đã sửa** | `auth-email-templates.spec.ts`: regex ghim `&amp;type=signup&amp;next=\/`. |
| F5 INFO (Site URL `/` cuối) | **Đã ghi** | `docs/dev-setup.md` (dòng template Auth) + decisions.md. |

Kiểm tra trọng tâm:
- **Option cookie:** `sessionCookieOptions({}, false)` → `httpOnly: true`, `sameSite: "lax"`, `secure: NODE_ENV === "production"`, `path: "/"`, không `maxAge` (`cookie-options.ts:23-33`). Cùng nguồn với `createServerSupabase` (`server.ts:17`) và `proxy.ts:31`, nên production vẫn có `Secure` như các đường khác. Thiếu `Secure` trên localhost http là đúng thiết kế.
- **Chunk cookie:** `name.includes("-auth-token")` bắt cả `sb-<ref>-auth-token`, `.0`, `.1`, … (và `-auth-token-code-verifier`). Tất cả về phiên trình duyệt.
- **Refresh sau đó:** `proxy.ts:29` đọc `fb-remember=0` → `isRemember === false` → xoá `maxAge` (`cookie-options.ts:31-33`). Không nâng lên 30 ngày.
- **Giả lập cookie store trong test:** Next thật (`node_modules/next/dist/server/web/spec-extension/adapters/request-cookies.js:114-127`) bọc cookie request vào `ResponseCookies`, `getAll()` thấy ngay giá trị vừa `set` trong cùng request. Fake `cookieJar` (`route.test.ts:9-18`) mô phỏng đúng hành vi đó.
- **Test đỏ-trước-xanh-sau:** bỏ `pinBrowserSessionCookies` thì `route.test.ts:158-159` (cờ vẫn `"1"`/maxAge 30 ngày) và `:162` (chunk còn maxAge) đỏ → không tautology. `route.test.ts:179-187` khoá hành vi "verify lỗi không đụng cookie".
- **Ghi đè phiên người đang đăng nhập khác:** thành công thì phiên A bị thay bằng B và cờ "Ghi nhớ" của A bị hạ về 0. Đây là hệ quả của R1-F3 (đã ghi decisions), không phải hồi quy mới. Thất bại thì phiên A và cờ giữ nguyên (có test).

## Findings

1. **LOW: có thể "hồi sinh" cookie chunk đã bị xoá thành cookie rỗng** (`apps/web/src/app/auth/confirm/route.ts:30-31`).
   - **Cơ chế:** khi phiên mới cần ít chunk hơn phiên cũ (hoặc đổi giữa base key và chunk), `@supabase/ssr` xoá chunk thừa bằng cách set value `""` kèm `maxAge: 0`. `getAll()` của Next vẫn trả các entry đã xoá này (ResponseCookies), nên vòng lặp ghi lại chúng với value `""` và không có `maxAge`. Trình duyệt giữ cookie rỗng thay vì xoá.
   - **Tác động:** gần như không có. `combineChunks` dừng ở chunk rỗng (falsy), phiên vẫn đọc đúng (live verify PASS). Chỉ để lại cookie rác cho đến khi đóng trình duyệt.
   - **Đề xuất (không chặn):** bỏ qua `value === ""` trong vòng lặp, kèm 1 test.
2. **INFO:** fake cookie store (`route.test.ts:11-17`) không mô phỏng việc xoá cookie (`maxAge: 0`), nên không bắt được Finding 1. Chấp nhận được vì đã có live verify.
3. **INFO:** mỗi lần xác nhận thành công đều hạ "Ghi nhớ" của phiên đang có trên trình duyệt đó về phiên trình duyệt. Hành vi này đúng R-15 cho phiên mới và đã ghi trong decisions.md.

Không còn finding CRITICAL/HIGH/MEDIUM. Code mới gọn: hàm 8 dòng, comment nêu WHY, file 66 dòng. Diff không có thay đổi ngoài scope.

## Verdict

**STRICT PASS.** Finding 1 (LOW) và 2-3 (INFO) không chặn. Khi close-out, primary điền Repro Verification bằng evidence live ở trên.
