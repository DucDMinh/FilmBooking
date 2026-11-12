# Bug layer34-review · phase-1-task-06 — K5 rate limit voucher R-95

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-db.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: bộ đếm phải bền sau khi từ chối (trả mã lỗi thay vì raise gây rollback); sửa test 042_voucher.test.sql:449-463 không bơm sẵn số lượt.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: done (chờ reviewer)
- Root cause (xác nhận): `apply_voucher` gọi `hit_rate_limit` (UPSERT bucket) rồi mọi nhánh lỗi nghiệp vụ `raise exception` -> rollback cả transaction RPC gồm cả lần tăng bộ đếm; chỉ lần thành công được đếm. Ngưỡng cũ 5/10 phút lệch spec R-95 (10 lần/phút/khách) -> đã đổi theo spec.
- Fix: migration `20261112070000_voucher_rate_limit_fix.sql`. `apply_voucher_core` = logic cũ (bỏ rate limit, vẫn raise, không grant cho anon/authenticated/service_role). `apply_voucher` (giữ chữ ký, SECURITY DEFINER, search_path, grant) = wrapper: `hit_rate_limit` ngoài khối EXCEPTION, gọi core trong BEGIN..EXCEPTION; P0001 mã nghiệp vụ (`^[A-Z][A-Z0-9_]*$`) -> trả `{ok:false,error_code}`, transaction commit nên bộ đếm bền; thành công trả jsonb cũ + `ok:true`; vượt ngưỡng trả `error_code=RATE_LIMITED` kể cả mã đúng. FORBIDDEN (42501) và lỗi lạ vẫn raise. Chọn wrapper thay vì dblink/autonomous txn vì đơn giản, đồng bộ, không cần extension.
- Contract change: lỗi voucher nghiệp vụ không còn là exception mà là jsonb. Hiện KHÔNG có code nào trong apps/api gọi apply_voucher (grep) nên không cần sửa API/test API; khi làm endpoint voucher phải ánh xạ `error_code` -> HTTP (RATE_LIMITED -> 429).
- Repro Verification: Original repro = 1 khách thử 30 mã sai (mỗi lần 1 transaction) rồi mã đúng. TRƯỚC fix: 30 lần đều chỉ VOUCHER_INVALID, lần mã đúng áp thành công (không bị chặn) = FAIL; test mới 042 chạy trên code cũ: lỗi `VOUCHER_ALREADY_APPLIED` raise/ chỉ 8/40 test chạy = đỏ. SAU fix: 042 = 41/41 PASS (10 lần sai -> VOUCHER_INVALID, lần 11 mã đúng -> RATE_LIMITED, đơn không bị áp voucher, bucket hits = 11). Status: PASS.
- Verify: `npx supabase test db` 16 files / 625 tests PASS; `pnpm test` 16/16; `pnpm lint`, `pnpm typecheck` PASS; `pnpm db:types` diff +3 dòng (apply_voucher_core).
- Doc impact: `docs/ERD.md` dòng RPC Layer 4 (đã cập nhật); `docs/API_SPEC.md` no doc impact (chưa có endpoint voucher).
- Residual risk: (1) caller tương lai phải đọc `ok/error_code`, nếu bỏ qua sẽ coi lỗi là thành công; (2) `apply_voucher` còn grant cho `authenticated` và dùng bucket key theo uid - bucket chỉ tăng với lời gọi qua wrapper, ok; quyền hàm hiện hữu thuộc task K7; (3) bộ đếm cố định theo cửa sổ (fixed window), cho phép tối đa ~20 lần trong biên cửa sổ; (4) service_role (uid null) dùng key theo user_id của đơn; (5) test không dùng dblink nhưng lời gọi hàm kết thúc trong cùng transaction pgTAP, bằng chứng bền dựa trên cơ chế BEGIN..EXCEPTION không rollback phần ngoài khối (xác nhận bởi đỏ/xanh).

## Round 2 (sau reviewer round 1 FAIL)
- F1: 6 `lives_ok(apply_voucher)` đổi thành `is(...->>'ok','true')`; thêm assert đơn 55 có voucher_id PERUSER1; thêm assert `ok='false'` trên nhánh lỗi (NOSUCHCODE). Chứng minh đỏ: tạm đổi mã MINUS30K thành NOPE -> test 16-18 FAIL (3/44); khôi phục -> xanh.
- F4: thêm test trigger tạm ném P0001 với thông điệp không phải mã nghiệp vụ -> `throws_ok` P0001 (nhánh `raise;` hoạt động, không bị nuốt thành jsonb). Plan 44.
- Verify: `npx supabase test db` 16 file / 628 test PASS.
- Residual risk bổ sung:
  - F2: khi uid null (service_role) bucket key theo user_id của đơn, hoặc order_id nếu đơn guest -> dò mã bằng nhiều đơn guest né giới hạn. Endpoint service_role tương lai phải kiểm tra quyền sở hữu đơn và cân nhắc key theo IP.
  - F3 (có sẵn, không sửa ở task này): mã lỗi DB VOUCHER_INVALID/VOUCHER_MIN_NOT_MET/... chưa có trong `packages/shared/src/errors.ts:31-36,75-80` và `apps/web/src/lib/api/error-messages.ts:30-35`; cần bổ sung khi làm endpoint voucher.
