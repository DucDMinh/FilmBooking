# Báo cáo Thẩm định Độc lập (Adversarial Review) — Round 2
## Task: Bug layer5-review · Phase 3 · Task 08 — Web Auth, OAuth Callback Error Mapping & IP Forwarding (F-01..F-05)
- **Reviewer**: Adversarial Reviewer (Agent: reviewer)
- **Mức độ thẩm định**: STRICT (Web Auth / Security / OAuth / Session Management)
- **Vòng thẩm định**: Round 2
- **Ngày**: 2026-11-13
- **Verdict**: **STRICT PASS**

---

## 1. Kết quả chạy Verify Commands (Allowlist)

Tất cả các lệnh kiểm tra tự động theo `.context/project-config.md` đều chạy thành công trên commit hiện tại:

| Lệnh kiểm tra | Kết quả | Chi tiết |
|---|---|---|
| `pnpm --filter @filmbooking/web test src/components/auth/__tests__/auth-forms.test.tsx src/components/account/__tests__/linked-accounts.test.tsx` | **PASS** | 50/50 tests passed (34 tests auth-forms, 16 tests linked-accounts, thời gian 14.37s) |
| `pnpm --filter @filmbooking/web typecheck` | **PASS** | Exit code 0, không có lỗi TypeScript |
| `pnpm --filter @filmbooking/web lint` | **PASS** | Exit code 0, 0 error, 0 warning |
| `pnpm --filter @filmbooking/api typecheck` | **PASS** | Exit code 0, không có lỗi TypeScript |

---

## 2. Kiểm chứng khắc phục các phát hiện từ Round 1

### Finding 1: [MAJOR / HIGH] F-04 — Đọc cờ `REMEMBER_COOKIE_NAME` khi refresh token trong `proxy.ts` và `server.ts`
- **Đánh giá thẩm định**: **ĐÃ KHẮC PHỤC TRIỆT ĐỂ**
- **Chi tiết kiểm chứng**:
  - Tại [proxy.ts](file:///E:/FilmBooking/apps/web/src/proxy.ts#L23-L26): Middleware đã trích xuất `const rememberVal = request.cookies.get(REMEMBER_COOKIE_NAME)?.value;` từ request và truyền vào `sessionCookieOptions(options, rememberVal)`.
  - Tại [server.ts](file:///E:/FilmBooking/apps/web/src/lib/supabase/server.ts#L15-L18): Đã trích xuất `const rememberVal = cookieStore.get(REMEMBER_COOKIE_NAME)?.value;` và truyền vào `sessionCookieOptions(options, rememberVal)`.
  - Khi người dùng đăng nhập có tick "Ghi nhớ đăng nhập 30 ngày" (`rememberVal === "1"`), nhánh `isRemember === true` thiết lập `base.maxAge = REMEMBER_MAX_AGE` (30 ngày). Phiên làm việc không còn bị hạ cấp nhầm thành Session Cookie sau khi token refresh.
  - Khi người dùng không tick "Ghi nhớ" (`rememberVal === "0"`), nhánh `isRemember === false` tiếp tục xóa `maxAge` để đảm bảo cookie phiên kết thúc khi tắt trình duyệt.

### Finding 2: [MEDIUM] F-01 — Điều hướng lỗi `identity_taken` từ luồng đăng nhập công khai
- **Đánh giá thẩm định**: **ĐÃ KHẮC PHỤC TRIỆT ĐỂ**
- **Chi tiết kiểm chứng**:
  - Tại [route.ts](file:///E:/FilmBooking/apps/web/src/app/auth/callback/route.ts#L68-L79): Đã phân tách rõ ràng hai ngữ cảnh:
    - Nếu `next.startsWith("/tai-khoan")`: Chuyển về `next?error=identity_taken` (trang bảo mật tài khoản hiển thị thông báo đã liên kết).
    - Nếu bắt đầu từ bên ngoài (`/dang-nhap` hoặc public flow): Chuyển về `/dang-nhap?error=identity_taken` kèm tham số `next` an toàn (nếu khác `/`).
  - Tại [login-form.tsx](file:///E:/FilmBooking/apps/web/src/components/auth/login-form.tsx#L50-L55): Đã bổ sung ánh xạ thông báo: `"Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác."`, không còn để người dùng bị văng về trang chủ hoặc rơi vào trạng thái im lặng không có thông báo.
  - Đã có test case tự động kiểm chứng hành vi này trong `auth-forms.test.tsx` (dòng 223 và 498).

### Finding 3: [MINOR] Dọn dẹp cờ `fb-remember` khi đăng xuất
- **Đánh giá thẩm định**: **ĐÃ KHẮC PHỤC TRIỆT ĐỂ**
- **Chi tiết kiểm chứng**:
  - Tại [actions.ts](file:///E:/FilmBooking/apps/web/src/app/auth/actions.ts#L30): `signOutAction()` đã gọi `cookieStore.delete(REMEMBER_COOKIE_NAME)` cùng với việc dọn dẹp các cookie phiên `sb-*`, loại bỏ hoàn toàn nguy cơ rò rỉ trạng thái ghi nhớ sang tài khoản đăng nhập tiếp theo trên cùng trình duyệt.

---

## 3. Tổng kết theo 5 tiêu chí F-01..F-05

| Hạng mục | Trạng thái | Đánh giá |
|---|---|---|
| **F-01**: OAuth Callback Error Mapping & Safe Next | **PASS** | Phân loại theo allowlist (`identity_taken`, `email_exists`, `missing_email`, `oauth`), không lộ raw error description, điều hướng chính xác theo ngữ cảnh `/tai-khoan` và `/dang-nhap`, `sanitizeNext` bảo vệ chống CRLF / protocol-relative URL / array params. |
| **F-02**: AuthExt Redirect URLs | **PASS** | `AuthExtService` inject `ENV`, cấu hình `redirectTo` (`/dat-lai-mat-khau`) và `emailRedirectTo` (`/auth/callback?next=/tai-khoan`), kết thúc hoàn toàn lỗi link rơi về `/`. |
| **F-03**: IP Forwarding cho Rate Limit | **PASS** | Forward `x-forwarded-for` và `x-real-ip` đầy đủ qua Route Handler Proxy và Server Action đăng nhập, bảo vệ rate limit theo IP khách thay vì chặn toàn site. |
| **F-04**: Ghi nhớ đăng nhập 30 ngày (R-15) | **PASS** | Duy trì cờ `fb-remember` qua các chu kỳ refresh token trong cả middleware `proxy.ts` và `server.ts`, cookie giữ đúng `Max-Age: 30 ngày` khi remember=true và là Session Cookie khi remember=false. |
| **F-05**: Turnstile State Reset khi lỗi | **PASS** | Cả 3 form (`LoginForm`, `RegisterForm`, `ForgotPasswordContent`) đều reset widget và xóa captcha token sau mỗi lần submit lỗi hoặc timeout, giải quyết triệt để lỗi kẹt `CAPTCHA_FAILED`. |

---

## 4. Kết luận

Task 08 (Phase 3) đã hoàn thành đầy đủ các tiêu chí kỹ thuật và bảo mật nghiêm ngặt. Không còn defect tồn đọng.

**Verdict chính thức: STRICT PASS**
