---
id: account-test-flaky
type: bug
status: pending
created: 2026-11-20
---

# Hai test `ChangePasswordForm` trong `account.test.tsx` chạy không ổn định (lúc xanh lúc đỏ)

## Yêu cầu
Làm hai test của `ChangePasswordForm` hết flaky để `pnpm test` ổn định.

## Bối cảnh / tái hiện (bug)
- File: `apps/web/src/components/account/__tests__/account.test.tsx`.
- Phát hiện: reviewer CR-004 round 2 (2026-11-20), chạy `pnpm test` lần 2 thì tái hiện; lần 1 xanh. Diff của CR-004 không đụng `apps/web`, nên là lỗi có sẵn.
- Test `báo lỗi khi mật khẩu mới vi phạm chính sách mật khẩu…` (~:179): timeout 5000ms khi gõ bằng `userEvent.type`.
- Test `báo lỗi khi mật khẩu cũ không chính xác…` (~:224): mock nhận `"2W3rongOld123"`, tức phím gõ của test trước tràn sang test sau.
- Expected: xanh ổn định mọi lần chạy.
- Actual: thỉnh thoảng đỏ khi chạy song song toàn bộ bộ test web.

## Acceptance (bắt buộc)
- [ ] Hai test không còn flaky: chạy `pnpm test` (web) ít nhất 5 lần liên tiếp đều xanh.
- [ ] Không đổi hành vi `ChangePasswordForm`; chỉ sửa test (hoặc nguyên nhân thật nếu là lỗi component, có root cause).

## Ghi chú
Nghi do `userEvent.type` chậm khi chạy song song (timeout) và phím tràn giữa các test (thiếu `await user.clear`/cleanup/ `userEvent.setup()` riêng mỗi test). Chưa xác minh. P3.
