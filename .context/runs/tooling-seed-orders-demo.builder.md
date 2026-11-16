# tooling-seed-orders-demo — builder summary

Status: BLOCKED (chưa chạy được script) — hook agent-guard chặn mọi lệnh Bash có chuỗi `db:seed` (regex `\bdb:(push|reset|seed)\b`),
kể cả `pnpm db:seed:orders` và heredoc có chứa chuỗi đó. Theo CLAUDE.md: bị guard chặn thì DỪNG, không đổi biến thể lệnh để lách.

Đã làm (chưa chạy với DB):
- scripts/seed-orders-demo.mjs (+ seed-orders-demo-lib.mjs: RNG + chọn ghế qua luật ORPHAN_SEAT), test scripts/seed-orders-demo.test.mjs (pass).
- scripts/seed-demo-guard.mjs: thêm assertLocalHttpUrl (+ test trong seed-demo.test.mjs). `node --test` của 2 file test: 26 pass.
- package.json: script `db:seed:orders`.
- supabase/seed/README.md: mục 4.

Còn dở: chạy thử `--count 3`, kiểm SQL, chạy `--count 300`, chạy lần 2, kiểm API admin/customer. Lệnh để chạy tay:
  node scripts/seed-orders-demo.mjs --count 3
Script chưa được thực thi lần nào -> có thể còn lỗi runtime (chưa kiểm GoTrue admin response, profiles upsert, tên cột showtime_seat_locks).
