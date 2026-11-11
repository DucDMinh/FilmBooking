# Review Report: Layer 4 / Task 06 — Identity / Social: Trigger Email Liên Kết, API Liên Kết/Huỷ Liên Kết, Facebook Không Email, Chặn Tự Gộp Trùng Email

**Agent:** reviewer (`Model: pro`)  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-06`  
**Review Round:** 1  
**Review Level:** STRICT (Auth, OAuth, Security Hooks, RLS, Database Migrations)  
**Verdict:** **FAIL**

---

## 1. Tóm tắt phạm vi review & Yêu cầu đối chiếu

- **Mã task:** `layer-4/task-06` (`tasks/build-filmbooking/layer-4-task-06.md`)
- **Requirements:** R-19, R-20, R-21, R-22, R-23, R-24; Quyết định #18; AC-04, AC-05.
- **Files trong scope review:**
  1. `supabase/migrations/20261111040500_identity_hooks.sql`
  2. `packages/shared/src/schemas/identity.ts`
  3. `apps/api/src/modules/identity/identity.module.ts`
  4. `apps/api/src/modules/identity/identity.controller.ts`
  5. `apps/api/src/modules/identity/identity.service.ts`
  6. `apps/api/test/identity.e2e-spec.ts`

---

## 2. Kết quả kiểm tra lệnh tự động (Check Commands)

- `pnpm -w lint`: **PASS**
- `pnpm -w typecheck`: **PASS**
- `pnpm --filter @filmbooking/api test test/identity.e2e-spec.ts`: **PASS (18/18 tests xanh)**
- `pnpm db:test`: **PASS (8 files, 333 tests xanh)**

> ⚠️ **CẢNH BÁO ADVERSARIAL REVIEW:** Mặc dù toàn bộ test e2e và pgTAP cũ đều xanh, quá trình đối chiếu chéo (Cross-Boundary Schema & Mock Audit) giữa NestJS Service ↔ PostgreSQL Schema đã phát hiện ra các defect nghiêm trọng và bộ mock mang tính **False-Confidence Test**.

---

## 3. Danh sách Defect chi tiết (Bắt buộc sửa)

### Defect 1: [CRITICAL] False-Confidence Test & Runtime Crash trên PostgreSQL thật do lệch kiểu tham số `p_window` trong RPC `hit_rate_limit`

- **Vị trí:**
  - `apps/api/src/modules/identity/identity.service.ts:254-259`
  - `apps/api/test/identity.e2e-spec.ts:107-112`
- **Chi tiết:**
  - Trong `apps/api/src/modules/identity/identity.service.ts`:
    ```typescript
    private async rateLimit(key: string, windowSeconds: number, max: number): Promise<void> {
      const { data, error } = await this.supabase.admin().rpc("hit_rate_limit", {
        p_key: key,
        p_window: windowSeconds, // <= TRUYỀN NUMBER (3600)
        p_max: max,
      });
      ...
    }
    ```
  - Trong migration `supabase/migrations/20261111020100_security_ops.sql` (dòng 87) và hardening `20261111030010_security_ops_hardening.sql`:
    ```sql
    create or replace function public.hit_rate_limit(p_key text, p_window interval, p_max integer)
    returns boolean
    ```
    Tham số `p_window` có kiểu PostgreSQL là **`interval`**, KHÔNG PHẢI `integer`.
  - **Chứng cứ thực nghiệm trên PostgreSQL thật:**
    Khi gọi `SELECT public.hit_rate_limit('test_key', 3600, 10);`, PostgreSQL ném lỗi ngay lập tức:
    ```text
    ERROR: function public.hit_rate_limit(unknown, integer, integer) does not exist
    HINT: No function matches the given name and argument types. You might need to add explicit type casts.
    ```
    Qua PostgREST / Supabase JS, gọi `p_window: 3600` sẽ khiến API `POST /auth/oauth/missing-email` crash với mã lỗi HTTP 500 / 400.
    Tham chiếu: Trong `apps/api/src/modules/auth-ext/auth-ext.service.ts` dòng 165 đã truyền đúng chuẩn:
    `p_window: \`${windowSeconds} seconds\``
  - **Bản chất False-Confidence:** Trong `apps/api/test/identity.e2e-spec.ts` dòng 107-109:
    ```typescript
    if (name === "hit_rate_limit") {
      const key = String(args.p_key);
      const windowMs = Number(args.p_window) * 1000; // <= Mock tự ý cast Number và nhân 1000
    ```
    Bộ mock do Builder viết đã bịa ra hành vi nhận `number` thay vì kiểm tra string interval, che giấu hoàn toàn lỗi nổ RPC trên database thật.
- **Cách khắc phục:**
  1. Trong `identity.service.ts:257`, đổi thành: `p_window: \`${windowSeconds} seconds\``.
  2. Trong `identity.e2e-spec.ts:108`, mock phải kiểm tra `typeof args.p_window === 'string'` (khớp định dạng interval) trước khi parse giây.

---

### Defect 2: [CRITICAL] State Machine Gap & Corrupted State khi gọi `DELETE /me/identities/:provider` với `provider = 'email'`

- **Vị trí:**
  - `packages/shared/src/schemas/identity.ts`
  - `apps/api/src/modules/identity/identity.controller.ts:39-46`
  - `apps/api/src/modules/identity/identity.service.ts:78-101`
  - `supabase/migrations/20261111040500_identity_hooks.sql:314-349`
- **Chi tiết:**
  - Endpoint `DELETE /me/identities/:provider` nhận `provider` dưới dạng chuỗi tự do (chưa validate qua Zod pipe, chỉ nhận string param).
  - Giả sử một người dùng đã có mật khẩu (tài khoản email/password) và liên kết thêm 1 tài khoản OAuth Google (`totalMethods = 2`, `canUnlink = true`).
  - Nếu người dùng này gọi `DELETE /me/identities/email`:
    Hàm RPC `unlink_user_identity` thực thi:
    ```sql
    delete from auth.identities
    where user_id = p_user_id and provider = p_provider;
    ```
    Hàng `provider = 'email'` bị xoá khỏi `auth.identities`.
  - **Hậu quả nghiêm trọng dẫn đến trạng thái hỏng (Corrupted State):**
    1. Cột `auth.users.encrypted_password` **KHÔNG** bị xoá (vì RPC chỉ xoá ở `auth.identities`).
    2. Hàm `get_user_identities` kiểm tra:
       ```sql
       select (
         exists (select 1 from auth.identities where user_id = p_user_id and provider = 'email')
         or exists (select 1 from auth.users where id = p_user_id and encrypted_password is not null and encrypted_password <> '')
       ) into v_has_password;
       ```
       Do `encrypted_password` vẫn còn, hệ thống vẫn báo `hasPassword: true`.
    3. User mất identity `email` nên **KHÔNG THỂ** đăng nhập bằng email được nữa (GoTrue Supabase yêu cầu identity email tồn tại).
    4. User cũng **KHÔNG THỂ** đặt lại mật khẩu qua `POST /me/password` vì API này kiểm tra `if (info.hasPassword)` và ném lỗi 409 `PASSWORD_ALREADY_SET`.
    5. Theo spec R-21 và AC-05, API huỷ liên kết phương thức chỉ áp dụng cho tài khoản MXH OAuth (`google`, `facebook`). Việc huỷ/đổi mật khẩu phải đi qua quy trình bảo mật riêng (`POST /auth/change-password`), không được phép xoá identity `'email'` qua API unlinking này.
- **Cách khắc phục:**
  1. Trong `packages/shared/src/schemas/identity.ts`, thêm schema `unlinkIdentityParamSchema = z.object({ provider: z.enum(["google", "facebook"]) })` và áp dụng `ZodValidationPipe` ở Controller.
  2. Trong `unlink_user_identity` (SQL RPC), bổ sung kiểm tra:
     ```sql
     if p_provider = 'email' then
       raise exception 'INVALID_OPERATION: Không thể huỷ phương thức email/mật khẩu qua API này.'
         using errcode = '22023';
     end if;
     ```

---

### Defect 3: [MAJOR] Vi phạm quy chuẩn độ dài hàm: `handleMissingEmail` dài 68 dòng (> 50 dòng)

- **Vị trí:** `apps/api/src/modules/identity/identity.service.ts:153-220` (68 dòng).
- **Chi tiết:** Quy chuẩn dự án (`.context/project-config.md` mục UI/Code Rules) quy định: `max_function_lines: 50`. Hàm `handleMissingEmail` hiện tại dài 68 dòng do nhồi nhét cả 2 luồng: xử lý khi email trùng (gửi email collision) và khi email mới (tạo verification request).
- **Cách khắc phục:** Refactor tách thành 2 hàm private helper: `handleExistingEmailCollision(email, userId, provider)` và `handleNewMissingEmailVerification(email, input, token)` để hàm `handleMissingEmail` ≤ 50 dòng.

---

### Defect 4: [MAJOR] Chưa ghi nhận kết quả Spike vào Task Notes và Checklist Acceptance Criteria bị bỏ trống

- **Vị trí:** `tasks/build-filmbooking/layer-4-task-06.md`
- **Chi tiết:**
  - Tiêu chí AC-04 trong Task File quy định rõ:
    ```markdown
    - [ ] **Spike đầu tiên:** xác minh Supabase Auth có tự gộp identity OAuth vào user có cùng email đã xác nhận không. Nếu có → cấu hình/hook (vd Auth Hook hoặc kiểm ở callback) để AC-04 đúng: Google a@x.com lần đầu khi đã có tài khoản mật khẩu → không tạo user mới, không tự liên kết, yêu cầu đăng nhập mật khẩu rồi liên kết. Ghi kết quả spike vào Notes task.
    ```
  - Trong `tasks/build-filmbooking/layer-4-task-06.md`:
    Mục `## Notes` hoàn toàn không có nội dung ghi lại kết quả spike hành vi auto-linking của Supabase Auth và cách cơ chế trigger `trg_guard_identity_insert` cùng endpoint `callback-check` giải quyết bài toán.
    Đồng thời, toàn bộ 4 checkbox Acceptance Criteria vẫn để nguyên `- [ ]`.
- **Cách khắc phục:** Builder cần ghi rõ kết quả spike vào mục `## Notes` và cập nhật các checklist trong `layer-4-task-06.md`.

---

### Defect 5: [MINOR] Thiếu pgTAP test trực tiếp cho các Trigger và RPC trong migration `20261111040500_identity_hooks.sql`

- **Vị trí:** `supabase/tests/`
- **Chi tiết:** Task DoD yêu cầu: "Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS". Hiện tại repo mới chỉ có các bài pgTAP từ layer trước (`000` đến `033`). Builder mới chỉ test tầng NestJS bằng mock in-memory, chưa viết bài test pgTAP nào (ví dụ `supabase/tests/040_identity_hooks.test.sql`) để xác nhận trực tiếp hành vi trigger `trg_guard_identity_insert`, `trg_on_identity_change` và các RPC `check_oauth_collision`, `link_user_identity`, `unlink_user_identity` trên PostgreSQL thật.
- **Khuyến nghị:** Bổ sung file pgTAP test để đảm bảo 100% độ bao phủ ở tầng database.

---

## 4. Kết luận & Hướng dẫn cho Builder

Task **`layer-4/task-06`** bị đánh giá **FAIL (Round 1)** do có 2 lỗi **CRITICAL** (False-confidence test che giấu lỗi type mismatch `hit_rate_limit` làm crash runtime; và lỗ hổng cho phép huỷ identity `'email'` dẫn đến trạng thái hỏng tài khoản vĩnh viễn) cùng 2 lỗi **MAJOR**.

Builder cần sửa toàn bộ các defect trên trong worktree `E:\FilmBooking\.worktrees\layer-4__task-06` trước khi yêu cầu review vòng 2.
