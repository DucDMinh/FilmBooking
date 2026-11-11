# Review Report: Layer 4 / Task 06 — Identity / Social: Trigger Email Liên Kết, API Liên Kết/Huỷ Liên Kết, Facebook Không Email, Chặn Tự Gộp Trùng Email

**Agent:** reviewer (`Model: pro`)  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-06`  
**Review Round:** 2  
**Review Level:** STRICT (Auth, OAuth, Security Hooks, RLS, Database Migrations)  
**Verdict:** **STRICT PASS**

---

## 1. Tóm tắt phạm vi review & Đối chiếu Round 1

- **Mã task:** `layer-4/task-06` (`tasks/build-filmbooking/layer-4-task-06.md`)
- **Requirements:** R-19, R-20, R-21, R-22, R-23, R-24; Quyết định #18; AC-04, AC-05.
- **Tài liệu đối chiếu:** Báo cáo review Round 1 (`.context/review-reports/build-filmbooking-layer-4-task-06-round-1-review.md`).
- **Danh sách file kiểm tra trong worktree `E:\FilmBooking\.worktrees\layer-4__task-06`:**
  1. `supabase/migrations/20261111040500_identity_hooks.sql`
  2. `supabase/tests/045_identity_hooks.test.sql`
  3. `packages/shared/src/schemas/identity.ts`
  4. `apps/api/src/modules/identity/identity.module.ts`
  5. `apps/api/src/modules/identity/identity.controller.ts`
  6. `apps/api/src/modules/identity/identity.service.ts`
  7. `apps/api/test/identity.e2e-spec.ts`

---

## 2. Kết quả kiểm tra lệnh tự động (Check Commands)

Mọi lệnh verify trong allowlist (`.context/project-config.md`) đều đã được thực thi trực tiếp trên worktree:

| Lệnh kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `pnpm lint` | **PASS** | 0 warnings, 0 errors trên toàn bộ workspace packages |
| `pnpm typecheck` | **PASS** | TypeScript compile sạch, không có lỗi type |
| `pnpm --filter @filmbooking/api test test/identity.e2e-spec.ts` | **PASS** | 19/19 tests xanh (bổ sung test case chặn huỷ `email`) |
| `pnpm db:test` (pgTAP trên PostgreSQL thật) | **PASS** | 9 files, 351/351 tests xanh (bao gồm 18 assertions mới của `045_identity_hooks.test.sql`) |

---

## 3. Xác minh đóng Defect từ Round 1 (Defect Closure Audit)

### Defect 1: [CRITICAL] Type mismatch `p_window` trong RPC `hit_rate_limit` & False-confidence Mock
- **Hiện trạng:** Đã được khắc phục triệt để.
- **Bằng chứng code:**
  - Trong `apps/api/src/modules/identity/identity.service.ts` (dòng 291): Đã sửa `p_window: \`${windowSeconds} seconds\`` khớp chính xác với kiểu `interval` của PostgreSQL hàm `public.hit_rate_limit(p_key text, p_window interval, p_max integer)`.
  - Trong `apps/api/test/identity.e2e-spec.ts` (dòng 107-120): Mock đã bổ sung guard regex kiểm tra định dạng interval `^\d+\s+seconds$/i`. Nếu caller truyền sai định dạng chuỗi hoặc truyền number, mock sẽ trả về đúng mã lỗi PostgreSQL `42883` ("function public.hit_rate_limit(text, integer, integer) does not exist"), loại bỏ hoàn toàn tính chất false-confidence.
- **Trạng thái:** **CLOSED**.

---

### Defect 2: [CRITICAL] Chặn huỷ phương thức `'email'` qua API và RPC (Tránh Corrupted State)
- **Hiện trạng:** Đã được gia cố ở cả 3 lớp: Schema, Controller và Database RPC.
- **Bằng chứng code:**
  - **Shared Zod Schema** (`packages/shared/src/schemas/identity.ts:8-14`):
    Định nghĩa `unlinkProviderSchema = z.enum(["google", "facebook"])`.
  - **Controller Pipe** (`apps/api/src/modules/identity/identity.controller.ts:45`):
    Tham số `@Param("provider", new ZodValidationPipe(unlinkProviderSchema))` chặn đứng các giá trị ngoài `google` và `facebook` (bao gồm `email`) ngay từ tầng HTTP validation và ném HTTP 400 Bad Request.
  - **PostgreSQL RPC** (`supabase/migrations/20261111040500_identity_hooks.sql:365-369`):
    Bổ sung guard logic:
    ```sql
    if v_provider = 'email' then
      raise exception 'INVALID_OPERATION: Không thể huỷ phương thức email/mật khẩu qua API này.'
        using errcode = '22023';
    end if;
    ```
  - **Bộ test đối chứng:**
    - `apps/api/test/identity.e2e-spec.ts:496-515`: Test case kiểm tra `DELETE /me/identities/email` trả về 400 VALIDATION_ERROR và giữ nguyên identity email.
    - `supabase/tests/045_identity_hooks.test.sql:101-106`: pgTAP kiểm tra gọi RPC trực tiếp với `'email'` ném lỗi SQLSTATE `22023`.
- **Trạng thái:** **CLOSED**.

---

### Defect 3: [MAJOR] Quy chuẩn độ dài hàm (`identity.service.ts`)
- **Hiện trạng:** Đã refactor toàn bộ các hàm tuân thủ tiêu chí `<= 50` dòng.
- **Bằng chứng code:**
  - Hàm `handleMissingEmail` (trước đây 68 dòng) đã được tách thành:
    - `handleMissingEmail`: 36 dòng (`apps/api/src/modules/identity/identity.service.ts:181-216`)
    - `handleExistingEmailCollision`: 13 dòng (`apps/api/src/modules/identity/identity.service.ts:218-230`)
    - `createMissingEmailVerification`: 23 dòng (`apps/api/src/modules/identity/identity.service.ts:232-254`)
  - Hàm dài nhất trong file hiện tại là `addPassword` với 38 dòng (dưới ngưỡng 50 dòng).
  - Toàn bộ file `identity.service.ts` dài 299 dòng (dưới ngưỡng 300 dòng theo `.context/project-config.md`).
- **Trạng thái:** **CLOSED**.

---

### Defect 4: [MAJOR] Spike Report về GoTrue Auto-Linking
- **Hiện trạng:** Spike Report đã được bổ sung đầy đủ, chi tiết và có cấu trúc rõ ràng.
- **Bằng chứng tài liệu & code:**
  - Phần mở đầu file migration `supabase/migrations/20261111040500_identity_hooks.sql` (dòng 7-40) và header của `apps/api/src/modules/identity/identity.service.ts` (dòng 1-24) đã trình bày cụ thể:
    1. Vấn đề của Supabase GoTrue khi tự động gộp (auto-merge) identity OAuth vào tài khoản đã có sẵn mật khẩu khi trùng email.
    2. Rủi ro bảo mật chiếm đoạt tài khoản đối với tiêu chí AC-04.
    3. Kiến trúc 2 lớp phòng thủ (Two-Layer Defense Architecture):
       - Lớp 1 (Trigger Before Insert): Hook `trg_guard_identity_insert` chặn insert identity khi user đã có mật khẩu hoặc trùng email tài khoản khác trừ khi có cờ session `app.allow_identity_link = 'true'`.
       - Lớp 2 (API Callback Collision Guard): RPC `check_oauth_collision` kiểm tra va chạm trước khi exchange code.
- **Trạng thái:** **CLOSED**.

---

### Defect 5: [MINOR] Thiếu pgTAP test trực tiếp cho Migration
- **Hiện trạng:** Đã bổ sung file test `supabase/tests/045_identity_hooks.test.sql` với 18 assertions.
- **Bằng chứng test:**
  - File test bao quát toàn bộ các kịch bản database:
    1. `get_user_identities`: kiểm tra chính xác `hasPassword` và `canUnlink` cho các trường hợp chỉ có OAuth, có mật khẩu, và đa phương thức.
    2. `unlink_user_identity`: kiểm tra chặn huỷ `email` (22023), chặn huỷ phương thức cuối (23514), huỷ thành công khi còn $\ge 2$ phương thức, và trigger tự động enqueue email `identity_unlinked` vào `email_outbox` (R-24).
    3. `link_user_identity` & Trigger `guard_identity_insert`: kiểm tra R-23 (1 tài khoản MXH chỉ gắn 1 user - 23505), chặn auto-merge không phép (23514), và trigger enqueue `identity_linked`.
    4. `check_oauth_collision`: kiểm tra AC-04 (`CONFLICT_EMAIL`), R-23 (`CONFLICT_IDENTITY`), và trường hợp hợp lệ (`OK`).
    5. `mark_password_set`: kiểm tra tự tạo identity `email` và cập nhật quyền huỷ liên kết cho OAuth.
  - Chạy thực tế bằng `pnpm db:test` trên PostgreSQL local stack: PASS 18/18 assertions.
- **Trạng thái:** **CLOSED**.

---

## 4. Đánh giá chất lượng kỹ thuật & Bảo mật (Adversarial Audit)

1. **Bảo mật OAuth & Phân quyền (Security & IDOR):**
   - Mọi RPC liên quan đến identity (`get_user_identities`, `unlink_user_identity`, `link_user_identity`, `mark_password_set`) đều có kiểm tra phân quyền chặt chẽ:
     `if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501';`
   - Ngăn chặn IDOR ở tầng database ngay cả khi có bypass ở tầng API.
2. **Chống dò email & Thu thập thông tin (Account Enumeration):**
   - API `POST /auth/oauth/missing-email` luôn trả về phản hồi chung `status: "CHECK_EMAIL"` bất kể email đã tồn tại hay chưa, đồng thời áp dụng rate limiting 2 lớp (theo IP và theo SHA-256 hash của email), tuân thủ nghiêm ngặt Quyết định #18 và khuyến nghị bảo mật OWASP.
3. **State Machine & Data Integrity:**
   - Đảm bảo bất biến (invariant): Một tài khoản không bao giờ rơi vào trạng thái không còn phương thức đăng nhập nào (`canUnlink` luôn được kiểm soát chặt ở cả database và API).
   - Không thể xoá identity `'email'` qua API huỷ liên kết mạng xã hội.

---

## 5. Kết luận

Task **`layer-4/task-06`** đã hoàn thành xuất sắc toàn bộ yêu cầu, khắc phục triệt để mọi defect phát hiện ở Round 1, đáp ứng đầy đủ các tiêu chuẩn khắt khe về bảo mật, kiến trúc và kiểm thử đối chiếu chéo.

**Đánh giá:** **STRICT PASS** (Đủ điều kiện sáp nhập vào branch staging / hoàn tất Layer 4).
