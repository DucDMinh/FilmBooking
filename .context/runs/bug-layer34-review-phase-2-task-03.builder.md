builder phase-2-task-03: migration 20261112120000 + test 053 xong, db:test 22 file/737 PASS. Chưa review/commit.

## Round 3
F8: 054 phần 2 dựng lại race thật (C gửi sau pg_sleep driver); lộ 40P01 do FK tickets.seat_id => migration thêm `seats FOR KEY SHARE` trước sell_order_seats ở cả hai hàm. F9: precheck POS HELD hết hạn của đơn khác => HOLD_EXPIRED (053 P8). Task file cập nhật. pnpm db:test: 23 file / 768 test PASS. Chưa commit. Follow-up: confirm_paid cùng đảo thứ tự khoá; F10 errors.ts -> layer-5-task-05.
