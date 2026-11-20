# Review: bug-oauth-collision-message phase-1-task-01, round 1

Agent: reviewer

- **Review level:** NORMAL
- **Reason:** đây là auth callback, nhưng diff chỉ đổi cách phân loại thông báo lỗi (`OAuthErrorCategory`). Hình dạng redirect (`buildRedirectForError`), `sanitizeNext`, nhánh `exchangeCodeForSession` và DB/migration đều không đổi, nên không lên STRICT.
- **Blast radius:** `GET /auth/callback`, chỉ nhánh lỗi trong query. Ảnh hưởng thông báo ở `/dang-nhap` (login-form `initialError`) cho mọi lỗi 500 của GoTrue trên luồng đăng nhập Google/Facebook. Luồng liên kết `/tai-khoan/*` giữ nguyên.

## Verify commands + result (chạy độc lập, từ repo root)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: shared 39/39, api 679/679, web 682/682 (gồm `account.test.tsx`, lần này xanh), scripts 31/31 |
| `pnpm build` | PASS (api + web next build) |
| aislop / oxlint / ocr | skip: không có trong allowlist verify của project-config, oxlint chưa cấu hình, ocr chưa cài |

## Findings

### MAJOR-1: `isMaskedIdentityCreationError` quá rộng, chỉ cần `error_code=unexpected_failure` là đủ kích hoạt

- Vị trí: `apps/web/src/app/auth/callback/route.ts:72` (dùng ở `:89`).
- `unexpected_failure` là error_code chung của GoTrue cho **mọi** lỗi 500 (InternalServerError). Chính task file cũng gọi chuỗi trong redirect là "thông điệp công khai của lỗi 500". Nó không đặc trưng cho việc tạo identity. Với OR hiện tại, trên luồng đăng nhập, mọi lỗi 500 ở `/callback` đều bị gán `email_exists`. Người dùng sẽ thấy câu "Email này đã có tài khoản - hãy đăng nhập bằng phương thức cũ để liên kết.", tức một thông báo khẳng định nhưng sai, và nó che mất lỗi thật. Các trường hợp thực tế:
  - Sai hoặc không nạp client secret của provider, nên GoTrue đổi code với Google/Facebook thất bại (500, kiểu "Unable to exchange external code"). Tình huống này **đang xảy ra trong chính dự án**: CR-014 (`spec/changes/2026-11-20-real-oauth-google-facebook.md`, commit `c0bf911`) là sự cố cấu hình OAuth vẫn còn mở. Nếu lỗi rơi vào bước exchange ở GoTrue, người dùng mới tinh sẽ được bảo là "email đã có tài khoản".
  - Provider lỗi hoặc timeout khi lấy profile, hoặc trigger `after insert on auth.users` (`supabase/migrations/20261111010000_core_identity_chain.sql:257`) lỗi với user mới ("Database error saving new user"). Cả hai cũng là 500 / `unexpected_failure`.
  - Rủi ro R-19 (đánh dấu là rủi ro, chưa chứng minh bằng log): nếu Facebook không trả email và GoTrue báo 500 với mô tả không khớp allowlist `missing_email`, thì trước đây kết quả là `oauth`, còn giờ thành `email_exists`. Như vậy sai cả hai thông báo, và người dùng không được dẫn tới `/bo-sung-email`.
- Phải sửa vì bằng chứng thật trong change doc cho thấy redirect luôn mang `error_description=Error creating identity`. Bỏ nhánh chỉ-code thì không mất AC nào, mà loại được báo sai.
- **Khuyến nghị:** điều kiện bắt buộc phải là mô tả chứa `error creating identity` (không phân biệt hoa/thường). Có thể dùng riêng điều kiện đó, hoặc AND với `errorCode === "unexpected_failure"` khi có code. Không dùng OR.
- **Test cần đổi** (`apps/web/src/app/auth/callback/__tests__/route.test.ts`):
  - Test "chỉ có error_code=unexpected_failure hoặc chỉ mô tả … vẫn nhận ra" (khoảng dòng 101-108) đang khóa hành vi quá rộng. Ca `error_code=unexpected_failure` không kèm mô tả phải mong đợi `/dang-nhap?error=oauth`.
  - Ca `["unexpected_failure", null, true]` trong `it.each` (khoảng dòng 141) phải đổi thành `false` (nếu giữ OR với mô tả thì giữ ca mô tả).
  - Thêm ca âm: luồng đăng nhập, `error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code`, mong đợi `/dang-nhap?error=oauth`.

### MINOR-1: log mất thông tin phân biệt loại 500

- Vị trí: `route.ts:163-168`. Log chỉ có `error`/`errorCode`/`category`/`flow`. Mọi lỗi 500 đều ra `server_error`/`unexpected_failure`, nên log không cho biết đó là lỗi "Error creating identity" hay lỗi khác. Như vậy chưa đạt hẳn mục tiêu "lần sau không phải đoán". Gợi ý thêm một boolean, ví dụ `maskedIdentity: isMaskedIdentityCreationError(...)`, không cần ghi mô tả thô.

### INFO-1: giá trị client kiểm soát được đưa vào log

- `error`/`errorCode` lấy từ query nên client có thể giả mạo. Vì log dạng object có cấu trúc, rủi ro chèn dòng log thấp. Có thể giới hạn độ dài (ví dụ cắt 64 ký tự) để tránh log phình to. Không chặn PASS.

### INFO-2: các mục đã kiểm và đạt

- Thứ tự ưu tiên: `classifyOAuthError` chạy trước, override chỉ áp dụng khi kết quả là `oauth`. Nhờ đó `identity_taken`, `email_exists` khi có chữ thật, và `missing_email` vẫn thắng như cũ.
- Luồng liên kết (`next` bắt đầu bằng `/tai-khoan`) giữ `error=oauth`. `tai-khoan/bao-mat/page.tsx:43` truyền `error` vào `linked-accounts.tsx:53-63`, rơi về câu chung "Không thể liên kết tài khoản…", hợp lý.
- Nhánh `exchangeCodeForSession` lỗi (`route.ts:182`) và nhánh không có code lẫn error (`:187`) không đổi.
- `sanitizeNext` chạy trước `isLinkFlow`, không ảnh hưởng open-redirect.
- `error_description` không bị phản chiếu ra Location, và cũng không vào log (có test chứng minh).
- `/dang-nhap/page.tsx:41,122` đọc `?error` rồi truyền `initialError`. Message email_exists ở `login-form.tsx:55-56` khớp AC-04.
- Test không tautology: bỏ override thì ca login+masked trả `oauth`, nên test đỏ.
- Trigger `guard_identity_insert` (`supabase/migrations/20261113090000_identity_link_intent_hardening.sql:45-74`) nhánh #2 và #3 đều mang nghĩa trùng email (23514), nên việc gán `email_exists` cho "Error creating identity" ở luồng đăng nhập là đúng ngữ nghĩa.

### Nhắc (không tính lỗi round này)

Task file chưa có `## Repro Verification`. Dispatcher bổ sung ở bước close-out.

## Verdict: FAIL

Lý do: MAJOR-1. Điều kiện nhận diện quá rộng khiến mọi lỗi 500 trên luồng đăng nhập bị báo "email đã có tài khoản", trong đó có trường hợp lỗi cấu hình OAuth đang mở trong dự án (CR-014). Cách sửa nhỏ: bắt buộc mô tả phải chứa `error creating identity`, rồi cập nhật hai test đang khóa hành vi rộng và thêm ca âm.
