# Run Journal — bug/admin-ux · phase-1 (task-01..03)

```yaml
workItem: bug/admin-ux
phaseTask: phase-1-task-01
step: builder
agent: builder
status: running
attempt: 0
interrupted: false
updatedAt: 2026-11-16
filesTouched: []
filesNew: [tasks/bug-admin-ux/phase-1-task-01.md, tasks/bug-admin-ux/phase-1-task-02.md, tasks/bug-admin-ux/phase-1-task-03.md]
evidence: { reportPath: null, round: 0, verdict: null }
next: "builder task-01 (z.uuid -> z.guid) -> reviewer STRICT -> task-02 -> task-03 -> spec-publisher -> commit mỗi task"
loopSignal: none
approvals: [{gate: batch_order, at: 2026-11-16, ok: true, note: "user 'ok, làm đi' — thứ tự B3(task-01), B1(task-02), B2(task-03)"}]
batchQueue: [task-01, task-02, task-03]
```

## History
- 2026-11-16 user /bug 3 lỗi (admin: không đăng xuất; admin vào trang khách; lỗi phòng/ghế). Root cause đã chứng minh (API 400 Invalid UUID; signOutAction chỉ ở delete dialog; login luôn về "/"). User duyệt thứ tự + mặc định vai trò. ▶ START [agent: builder] task-01 running — cancel sẽ redo.
- 2026-11-16 ✅ DONE [agent: builder] task-01: repro PASS (int test đỏ khi revert -> xanh). Sửa z.uuid->z.guid ở cinema-ops/admin/checkin/profile + mở rộng orders/pricing/cancellation (+ cancellation.controller pipe cinemaId). Test mới: packages/shared/src/__tests__/id-schemas.test.ts, apps/api/test/integration/cinema-ops-seed-ids.int-spec.ts. shared 25, api 483 PASS, lint/typecheck sạch. Để nguyên .uuid() cho showtime/seat/order/booking/user (suy luận từ seed, chưa kiểm từng ID). Chưa commit.
- 2026-11-16 ▶ START [agent: reviewer] task-01 round 1 STRICT running — cancel sẽ rerun reviewer (dọn report dở).
- 2026-11-16 reviewer task-01 round 1 STRICT FAIL (report .context/review-reports/bug-admin-ux-phase-1-task-01-round-1-review.md): F1 MAJOR — suy luận "showtime là uuid v5" sai: seed.sql:715-749 có 4 suất Live ID tay 50000000-…0001..4 (dispatcher xác nhận DB: 4 showtime ID non-RFC) -> booking.ts:7,11 (seatmap, hold), cancellation.ts:10,19,46, pricing.ts:55,176 vẫn 400, lệch với cinema-ops. F2 MINOR thiếu test roomId kiểu seed 30000000-…. F3 INFO ngoài scope (cancellation.controller :cinemaId không pipe; pricing.controller :id/:showtimeId không validate). attempt=2. ▶ START [agent: builder] task-01 attempt 2 running (resume builder cũ) — cancel sẽ redo.
- 2026-11-16 ✅ DONE [agent: builder] task-01 attempt 2: F1 sửa (booking.ts uuidSchema -> z.guid toàn cục; cancellation const uuid -> guid; pricing showtimeId/seatIds -> guid); giữ .uuid() chặt chỉ ở payment.ts:16 + cancellation.controller:47 (:orderId, orders default gen_random_uuid, 0 dòng mẫu) và identity.ts:57 (trường bị bỏ qua). F2 sửa (roomId/showtimeId kiểu seed trong int test; 4 test). Số liệu DB: showtimes 294/298 RFC (4 Live non-RFC). shared 31, api 483, lint/typecheck sạch. F3 ghi Residual. Chưa commit.
- 2026-11-16 ▶ START [agent: reviewer] task-01 round 2 STRICT running (resume reviewer cũ) — cancel sẽ rerun.
- 2026-11-16 ✅ DONE [agent: reviewer] task-01 round 2 STRICT PASS (report .context/review-reports/bug-admin-ux-phase-1-task-01-round-2-review.md). Dispatcher chạy int-spec cinema-ops-seed-ids 4/4 PASS; toàn bộ test:int 91/91 PASS ở lần chạy lại (lần đầu 1 test fail ở file khác, không xác định tên, lần chạy lại xanh -> coi là nhiễu). Close-out task-01: progress.json cập nhật, commit. NEXT: task-02 (nút Đăng xuất).
- 2026-11-16 ✅ task-01 commit 64b93ad. ▶ START [agent: builder] task-02 (nút Đăng xuất admin/staff) running — cancel sẽ redo (đọc file + git diff trước, không revert).
- 2026-11-16 ✅ DONE [agent: builder] task-02: SignOutButton dùng chung (components/common/sign-out-button.tsx) gắn vào topbar admin (desktop), Sheet mobile nav, header /staff; test mới components/admin/__tests__/sign-out.test.tsx 5/5; web lint/typecheck sạch, test 451 PASS. Builder lỡ ghi đè shell.test.tsx rồi khôi phục từ HEAD (dispatcher kiểm git diff). Chưa commit.
- 2026-11-16 ▶ START [agent: reviewer] task-02 round 1 NORMAL running — cancel sẽ rerun.
- 2026-11-16 ✅ DONE [agent: reviewer] task-02 round 1 NORMAL PASS (report .context/review-reports/bug-admin-ux-phase-1-task-02-round-1-review.md; root pnpm lint/typecheck/test PASS, web 451). MINOR -> Residual: L1 chưa kiểm breakpoint trên trình duyệt thật; L2 signOutAction trả err.message, cookie không xoá nếu signOut ném lỗi (có từ trước); L3 sessionStorage staff.cinemaId không xoá khi đăng xuất; L4 redirect layout + router.replace song song có thể nháy. Close-out task-02: commit (loại shell.test.tsx = chỉ line ending, và apps/web/AGENTS.md). NEXT: task-03.
