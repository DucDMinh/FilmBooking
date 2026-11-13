# Review Report — bug/layer34-review · phase-2-task-07 (Round 1)

**Reviewer:** Adversarial Reviewer (bạn - tôi)  
**Review Level:** STRICT (auth / identity security)  
**Task File:** `tasks/bug-layer34-review/phase-2-task-07.md`  
**Run Journal:** `.context/runs/bug-layer34-review-phase-2-task-07.md`  
**Date:** 2026-11-13  
**Verdict:** **STRICT PASS**

---

## 1. Mục tiêu & Bối cảnh Review

Task `phase-2-task-07` giải quyết dứt điểm 2 vấn đề lớn trong hệ thống xác thực và liên kết danh tính (OAuth / Identity):
1. **F-2 (HIGH):** Trigger `guard_identity_insert` trước đây chặn mọi identity OAuth chèn vào tài khoản đã có mật khẩu hoặc identity `email` (do thiếu cờ `app.allow_identity_link`, vốn là cờ RPC cũ đã bị gỡ ở phase-1-task-04 vì rủi ro an ninh K2). Hệ quả là người dùng đăng nhập hợp lệ không thể liên kết thủ công tài khoản mạng xã hội (Google / Facebook).
2. **M-05:** Lỗ hổng auto-merge ngầm của Supabase GoTrue đối với tài khoản chỉ dùng OAuth (OAuth-only, không có mật khẩu): khi người dùng OAuth đăng nhập tài khoản OAuth khác trùng email, GoTrue có xu hướng tự động gộp mà không có sự đồng thuận chủ động.
3. **N-1:** Dọn dẹp cờ thừa `app.allow_identity_link` trong các fixture test `045_identity_hooks.test.sql` và `046_identity_rpc_privileges.test.sql`.

Theo quyết định của người dùng (2026-11-12T04:25:22Z), giải pháp link-intent được triển khai với:
- TTL link-intent: 10 phút.
- Bắt buộc kiểm tra Re-auth gần đây (≤ 5 phút / 300 giây) tại tầng API qua claim `auth_time` (hoặc fallback `iat`) trong JWT đã ký của Supabase.
- Bảng `public.identity_link_intents` khoá chặt RLS, chỉ cho phép `service_role`.

---

## 2. Đối chiếu chéo Database Schema & Logic Trigger (Cross-Boundary Audit)

### 2.1. Bảng `public.identity_link_intents` (`supabase/migrations/20261112170000_identity_link_intent.sql`)
- Cấu trúc:
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade` (Đảm bảo cascade delete khi user bị xoá).
  - `provider text not null`
  - `expires_at timestamptz not null default (now() + interval '10 minutes')`
  - `consumed_at timestamptz`
  - `created_at timestamptz not null default now()`
- Index: `identity_link_intents_user_provider_idx` trên `(user_id, provider) where consumed_at is null` giúp tra cứu nhanh intent chưa dùng.
- Bảo mật / RLS:
  - `alter table public.identity_link_intents enable row level security;`
  - `revoke all on public.identity_link_intents from public, anon, authenticated;`
  - `grant select, insert, update, delete on public.identity_link_intents to service_role;`
  - Kiểm tra phân quyền: `authenticated` và `anon` không có quyền `select/insert/update/delete` (ném `42501` khi thử truy vấn trực tiếp). Đã được kiểm chứng trong `058_identity_link_intent.test.sql` (tests 11, 12).

### 2.2. Trigger `public.guard_identity_insert()` trên `auth.identities`
- **Loại bỏ hoàn toàn cờ giả lập `app.allow_identity_link`**: Không còn dựa vào session config của Postgres mà GoTrue không thể cấp.
- **Xử lý provider nội bộ**: Bỏ qua `email` và `phone` (`if NEW.provider in ('email', 'phone') then return NEW; end if;`).
- **Bảo toàn R-23**: Kiểm tra duy nhất `(provider, provider_id)` trên toàn hệ thống — chặn tài khoản MXH bị gắn chéo sang user khác (ném `23505 OAUTH_IDENTITY_ALREADY_LINKED`).
- **Đóng M-05 & F-2 (Existing User Check)**:
  - Sử dụng điều kiện `if exists (select 1 from auth.identities where user_id = NEW.user_id)`:
    - Bất kể user có mật khẩu hay là user OAuth-only, nếu `user_id` đã có bất kỳ identity nào trong hệ thống, mọi hành vi thêm identity mới BẮT BUỘC phải có link-intent hợp lệ.
    - Tìm intent: `where user_id = NEW.user_id and provider = NEW.provider and consumed_at is null and expires_at > now() order by created_at desc limit 1 for update`.
    - **Chống Race Condition**: Mệnh đề `FOR UPDATE` khoá dòng intent, đảm bảo 2 request insert đồng thời không thể tái sử dụng cùng 1 intent (Postgres Read Committed re-evaluate condition sau khi lock nhả, dòng đã bị `consumed_at is not null` nên transaction thứ 2 sẽ thấy null).
    - Khi tìm thấy: Cập nhật `consumed_at = now()` ngay trong transaction chèn identity và cho phép insert.
    - Khi không tìm thấy hoặc intent hết hạn/sai provider: Ném ngoại lệ `23514 OAUTH_AUTO_MERGE_BLOCKED`.
- **Bảo toàn AC-04 (First-time OAuth Registration)**:
  - User mới toanh chưa có identity: kiểm tra va chạm email với user khác đã có trong `auth.users` -> nếu trùng email ném `23514 OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED`.

---

## 3. Kiểm tra Tầng API Backend & DTO

### 3.1. Trích xuất Fresh Auth trong `AuthGuard` (`apps/api/src/common/auth/auth.guard.ts`)
- Mở rộng interface `SupabaseClaims` với `auth_time?: number` và `iat?: number`.
- Trích xuất:
  ```ts
  const authTime =
    typeof claims.auth_time === "number"
      ? claims.auth_time
      : typeof claims.iat === "number"
        ? claims.iat
        : 0;
  ```
  - Ưu tiên `claims.auth_time` (thời điểm người dùng nhập thông tin xác thực/đăng nhập ban đầu, không bị cập nhật khi refresh token).
  - Gắn vào `request.user.authTime`.
  - Không để lộ `jwt` hay `authTime` ra ngoài response của `GET /me`.

### 3.2. Endpoint `POST /me/identities/link-intent` (`apps/api/src/modules/me/me.controller.ts`)
- Xác thực: Được bảo vệ bởi global `AuthGuard`, trả về 401 `UNAUTHENTICATED` nếu không có token.
- Validation DTO: `createLinkIntentInputSchema` cưỡng chế `provider` nằm trong `["google", "facebook"]`.
- Kiểm tra Re-auth:
  ```ts
  const nowSec = Math.floor(Date.now() / 1000);
  if (!user.authTime || nowSec - user.authTime > 300) {
    throw new AppException(ERROR_CODES.REAUTH_REQUIRED, "Vui lòng đăng nhập lại để liên kết tài khoản");
  }
  ```
  - Nếu token cũ hơn 5 phút (300 giây) hoặc thiếu `authTime`, ném `AppException(ERROR_CODES.REAUTH_REQUIRED)`.
- Ghi dữ liệu: Sử dụng `this.supabase.admin()` (`service_role`) để insert vào `identity_link_intents` với `expires_at = now + 10 phút`.
- Trả về mã HTTP: `204 No Content` (`@HttpCode(204)`), không leak thông tin nội bộ.

### 3.3. Đồng bộ Catalog Mã lỗi & Mapping Frontend
- `packages/shared/src/errors.ts`: Thêm `REAUTH_REQUIRED: "REAUTH_REQUIRED"` với HTTP status 401 trong `ERROR_HTTP_STATUS`.
- `apps/web/src/lib/api/error-messages.ts`: Map `REAUTH_REQUIRED: "Vui lòng đăng nhập lại để liên kết tài khoản."`.
- `packages/shared/src/database.types.ts`: Cập nhật schema types của bảng `identity_link_intents`.

---

## 4. Kiểm tra Test Suite & Tính Chân thực (Mock Audit)

1. **pgTAP Database Tests (`supabase/tests/058_identity_link_intent.test.sql`)**:
   - 12/12 tests PASS trên PostgreSQL thật.
   - Bao phủ các kịch bản:
     - User mật khẩu chèn OAuth không có intent -> chặn 23514.
     - User OAuth-only chèn OAuth không có intent (M-05) -> chặn 23514.
     - Intent hết hạn -> chặn 23514.
     - Intent đã tiêu thụ -> chặn 23514.
     - Intent sai provider -> chặn 23514.
     - Intent hợp lệ -> PASS và intent tự động đánh dấu `consumed_at`.
     - Không thể tái sử dụng intent vừa consume -> chặn 23514.
     - User OAuth-only có intent hợp lệ -> PASS (đóng F-2 & M-05).
     - User mới tinh đăng ký OAuth lần đầu -> PASS.
     - Phân quyền RLS: role `authenticated` bị chặn đọc/ghi vào bảng `identity_link_intents` (42501).
2. **Dọn dẹp fixture cũ (N-1)**:
   - `supabase/tests/045_identity_hooks.test.sql` và `supabase/tests/046_identity_rpc_privileges.test.sql` đã gỡ bỏ hoàn toàn `set local app.allow_identity_link = 'true'` và sử dụng intent thật.
3. **E2E & Unit Tests (`apps/api/test/me.e2e-spec.ts` & `auth-guards.spec.ts`)**:
   - `401 without token`
   - `400 with invalid provider`
   - `401 REAUTH_REQUIRED` khi token `auth_time` cũ hơn 300 giây.
   - `204 No Content` khi token mới (< 300s) và provider hợp lệ, xác nhận intent được ghi vào DB.

---

## 5. Kết quả Verify Commands

| Lệnh | Kết quả | Chi tiết |
|---|---|---|
| `pnpm db:test` | **PASS** | 27 test files, 783 tests pass (bao gồm 058 pgTAP mới). |
| `pnpm typecheck` | **PASS** | Monorepo sạch lỗi TypeScript (packages/shared, apps/api, apps/web). |
| `pnpm test` | **PASS** | 337/337 tests pass (shared: 14, api: 214, web: 93, scripts: 16). |
| `pnpm lint` | **PASS** | ESLint pass toàn bộ monorepo không có cảnh báo. |
| `oxlint` | **PASS** | 0 warnings, 0 errors trên toàn bộ các file thay đổi. |

---

## 6. Đánh giá Surgical Diff & AI Gates
- **Surgical Diff**: Các thay đổi bám sát yêu cầu của task, không có code refactor lạc đề, không có dependencies thừa.
- **AI-slop / AI-readable**: Code rõ ràng, đặt tên biến chuẩn plpgsql và TypeScript, hàm ngắn gọn (< 50 dòng), có chú thích giải thích lý do bảo mật.
- **Open Code Review / Aislop Gate**: oxlint pass; ocr preview OK; không phát hiện lỗ hổng SQLi, XSS, IDOR hay PII leak.

---

## 7. Kết luận

Diff đạt chuẩn an toàn xác thực và đóng hoàn toàn các gap F-2, M-05, N-1 đúng theo spec và quyết định thiết kế của người dùng.

**Verdict:** **STRICT PASS**
