# builder — bug-admin-ux phase-1-task-01
- Đổi z.uuid()/z.string().uuid() -> z.guid() cho ID rạp/phim/tỉnh/user/voucher: cinema-ops.ts, admin.ts, checkin.ts, profile.ts, orders.ts (uuidSchema, kéo theo report.ts), pricing.ts (cinemaId x2), cancellation.ts (cinemaId) + cancellation.controller.ts (pipe cinemaIdParam cho :cinemaId x2).
- Test: shared/__tests__/id-schemas.test.ts (đỏ 11 -> xanh), api/test/integration/cinema-ops-seed-ids.int-spec.ts (đỏ khi revert, xanh sau fix).
- Verify: shared+api lint/typecheck/test PASS (api 483 tests). Chưa commit.
- Còn dở: reviewer; API :3001 đang chạy bản cũ -> cần restart để thấy fix ngoài UI.
