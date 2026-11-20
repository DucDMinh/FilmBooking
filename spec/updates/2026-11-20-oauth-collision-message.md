# Spec Update — 2026-11-20 oauth-collision-message
**spec_version:** 3.5.2 → 3.5.2 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · CR-015 · `tasks/bug-oauth-collision-message/phase-1-task-01.md` (review NORMAL PASS round 2) · workItem `bug/oauth-collision-message`

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Không đổi requirement; đưa UI về đúng **AC-04 / R-20**: đăng nhập Google/Facebook có email trùng tài khoản có sẵn → không tạo tài khoản mới, không tự gộp, hiển thị "Email này đã có tài khoản - hãy đăng nhập bằng phương thức cũ để liên kết". Liên quan **R-12** (không phản chiếu nội dung lỗi thô ra ngoài), **R-19**, **R-21** (liên kết / huỷ liên kết ở Bảo mật & liên kết), **R-23** (một tài khoản MXH ↔ một user, `identity_taken`).

## Lỗi đã sửa
1. Triệu chứng: đăng nhập Google với email trùng tài khoản email/mật khẩu có sẵn về `/dang-nhap?error=oauth` (thông báo chung "Đăng nhập với Google/Facebook không thành công. Vui lòng thử lại.") thay vì `error=email_exists`.
2. Root cause: GoTrue che nội dung lỗi của trigger DB `guard_identity_insert` (`OAUTH_AUTO_MERGE_BLOCKED`, SQLSTATE 23514) thành lỗi 500 công khai "Error creating identity"; redirect chỉ mang `error=server_error`, `error_code=unexpected_failure`, `error_description=Error creating identity`. `classifyOAuthError` cũ chỉ khớp chữ `oauth_auto_merge_blocked` / `email_collision`… nên rơi vào `oauth`.
3. Sửa: `apps/web/src/app/auth/callback/route.ts` nhận diện lỗi che (mô tả chứa "error creating identity", không phân biệt hoa/thường). Luồng đăng nhập (`next` không bắt đầu `/tai-khoan`) → `/dang-nhap?error=email_exists` (giữ `next`). Luồng liên kết (`next` bắt đầu `/tai-khoan`) và các lỗi 500 khác (vd `unexpected_failure` + "Unable to exchange external code", sai secret của CR-014) vẫn `error=oauth`. Không phản chiếu `error_description` ra URL. Log server gọn `console.warn("[auth/callback] oauth error", {error, errorCode, category, flow, maskedIdentity})` — không ghi mô tả thô, code, state, token.
4. Review: round 1 FAIL (điều kiện OR theo `error_code=unexpected_failure` gán sai mọi lỗi 500 thành `email_exists`) → thu hẹp điều kiện, thêm ca âm → round 2 PASS. Test: `apps/web/src/app/auth/callback/__tests__/route.test.ts` (+10, đỏ trước fix → xanh); lint, typecheck, test web, build PASS.

## Ảnh hưởng
- Module: web `/auth/callback` (route + test). Không đổi API, DB, migration, `login-form.tsx` (đã có message `email_exists`).
- Test: đăng nhập MXH với email trùng → đúng message; luồng liên kết và lỗi 500 khác không bị gán nhầm.
- Hồi quy: đăng nhập MXH lần đầu (user mới), đăng nhập MXH tài khoản đã liên kết, liên kết / huỷ liên kết ở `/tai-khoan/bao-mat`, Facebook thiếu email → `/bo-sung-email`, `identity_taken`.
- Residual: chưa kiểm end-to-end với Google thật (cần user đăng nhập); redirect thật của GoTrue suy ra từ log `500: Error creating identity`, chưa quan sát trên URL; không phân biệt được lỗi che 23514 do trùng email với lỗi tạo identity khác cùng mô tả (hiếm); nhánh `exchangeCodeForSession` lỗi không có query lỗi dùng phân loại cũ; Facebook chưa có log thực; 2 test web flaky `account.test.tsx` = CR-013 (ngoài phạm vi).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 33, specVersion 3.5.2.
