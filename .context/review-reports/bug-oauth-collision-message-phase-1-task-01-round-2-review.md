# Review: bug-oauth-collision-message phase-1-task-01, round 2

Agent: reviewer

- **Review level:** NORMAL (vòng xác nhận hẹp sau round 1)
- **Reason:** round này chỉ kiểm lại phần sửa MAJOR-1, MINOR-1 và INFO-1 của round 1. Thay đổi vẫn chỉ nằm ở phân loại thông báo lỗi, không đổi hình dạng redirect.
- **Blast radius:** `GET /auth/callback`, nhánh lỗi trong query, giống round 1.

## Verify commands + result (chạy độc lập, từ repo root)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | shared 39/39 PASS, api 679/679 PASS. Web 682/684: 2 test đỏ, cả hai ở `src/components/account/__tests__/account.test.tsx` (ChangePasswordForm: timeout 5000ms, và input gõ lẫn ký tự `"rWdr1o2n3gOld123"`). Đây là 2 test flaky đã biết (CR-013), không liên quan diff này, và đã xanh ở lần chạy round 1. Mọi test trong `auth/callback/__tests__/route.test.ts` đều PASS. Script `node --test scripts/*.test.mjs` không chạy vì chuỗi `&&` dừng ở bước web; các script này không đụng code của task và đã PASS 31/31 ở round 1. |
| `pnpm build` | không chạy lại (round 1 PASS; round 2 chỉ đổi thân hàm và test, typecheck đã xanh). Builder báo PASS. |

## Kiểm tra từng điểm

- **MAJOR-1 đã sửa.** `route.ts:68` chỉ còn `isMaskedIdentityCreationError(errorDescription)`, kiểm mô tả chứa `"error creating identity"` (không phân biệt hoa/thường). Nhánh `error_code=unexpected_failure` đã bỏ hẳn.
- **Không còn chỗ dùng chữ ký cũ.** Grep chỉ thấy `route.ts:68,84,161` và test `route.test.ts:12,151,160`, tất cả dùng 1 tham số.
- **Ca dương:** đăng nhập + mô tả che trả `email_exists`, kể cả khi giữ `next` hoặc mô tả viết HOA.
- **Ca âm:**
  - Chỉ có `error_code=unexpected_failure` trả `oauth`.
  - 500 với mô tả "Unable to exchange external code" trả `oauth`.
  - `access_denied` trả `oauth`.
- **Luồng liên kết:** giữ `/tai-khoan/bao-mat?error=oauth`.
- **Nhánh cũ không đổi.** `classifyOAuthError` vẫn chạy trước và override chỉ áp dụng khi kết quả là `oauth`. Nhánh exchange và nhánh không có code/error giữ nguyên.
- **MINOR-1 đã sửa.** Log có thêm `maskedIdentity`, và test kiểm `"maskedIdentity":true`.
- **INFO-1 đã sửa.** `error`/`errorCode` được cắt còn 64 ký tự. Log không ghi mô tả thô, code, state hay token (có test).
- **Test không tautology.** Nếu đưa lại nhánh error_code thì ca "chỉ có error_code" sẽ đỏ; nếu bỏ override thì ca login+masked sẽ đỏ.

## Findings

Không có finding mới (không có CRITICAL, MAJOR hay MINOR).

- INFO: 2 test flaky ở `account.test.tsx` (CR-013) vẫn còn, nằm ngoài scope.
- Nhắc: task file chưa có `## Repro Verification`. Dispatcher viết ở close-out, không tính là lỗi round này.

## Verdict: NORMAL PASS
