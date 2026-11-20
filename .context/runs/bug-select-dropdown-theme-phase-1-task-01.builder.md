builder · bug/select-dropdown-theme phase-1-task-01 — xong code + verify, chưa commit.
- globals.css: `appearance: base-select` + popup/option/checkmark/picker-icon theo token trong @supports; fallback `option` tối ngoài @supports.
- Bẫy: lightningcss xoá `::picker(select):popover-open` (để lại opacity 0) → dùng @starting-style lồng trong rule, chỉ chuyển động mở.
- filter-field.ts: SELECT_FIELD_CLASS; 13 file thay class; home-hero.css: `.qfield select` appearance base-select + ẩn picker-icon, bỏ `.qfield select option{background}`.
- quick-book-bar.tsx không đổi. Test: catalog/__tests__/select-theme.test.ts.
- Verify: lint, typecheck, test (web 656, api 658, node 31), build đều PASS; scrub Playwright 21 PASS (chạy trước khi bỏ :popover-open; sau đó kiểm tay home/lich-chieu).
