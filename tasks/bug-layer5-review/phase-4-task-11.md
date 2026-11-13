# Bug layer5-review · phase-4-task-11 — Test Suite Hardening & False Confidence Elimination

- Classification / Risk: TEST-HARDENING · severity=medium · review level expected=STRICT · nguồn: Toàn bộ 7 independent-review reports (A/MAJOR-1, B/M2, C8-4, D/C1, G/M11-5)
- Root cause:
  1. Các test mock trong test suites e2e mô phỏng chưa sát hành vi thực tế của DB / PostgREST / GoTrue, tạo ra "xanh giả" (false-confidence):
     - `orders-report.e2e-spec.ts`: RPC mock RBAC kiểm tra token bằng chuỗi substring thay vì giải mã JWT payload, dẫn tới nhánh 42501 không bao giờ chạy.
     - `webhook.e2e-spec.ts`: Idempotent mock trả `SUCCESS` thay vì `ALREADY_PAID` như RPC DB thật; thiếu test đối chiếu `p_amount` lệch tiền; thiếu test thiếu `PAYOS_CHECKSUM_KEY`.
     - `admin.e2e-spec.ts`: Test kiểm tra thay đổi `seat_hold_minutes_web` xanh sẵn do seed đã có dòng audit; chưa kiểm tra xem hold mới có thật sự nhận cấu hình mới hay không.
- Files to Create/Modify:
  - `apps/api/test/webhook.e2e-spec.ts`
  - `apps/api/test/orders-report.e2e-spec.ts`
  - `apps/api/test/admin.e2e-spec.ts`
- Status: done

## Repro Verification
- Original repro: Test mock bỏ qua tham số quan trọng hoặc parse token sai cách, che giấu lỗi runtime tiềm ẩn.
- Expected:
  - Loại bỏ các nhánh mock cứng vô nghĩa, bổ sung các ca kiểm thử biên (mismatch amount, missing checksum key, hold settings dynamic effect).
  - 100% test suites pass với logic kiểm thử thực chất.
- Actual after fix:
  - `webhook.e2e-spec.ts`: FakeDb `confirm_paid` đã mô phỏng `AMOUNT_MISMATCH` khi `p_amount !== total_amount`, chuyển đơn sang `needs_manual_review`. Bổ sung test kiểm thử lệch tiền trả về HTTP 200 cho PayOS và cập nhật DB. Bổ sung test `verifyWebhook` trả về `null` khi thiếu `PAYOS_CHECKSUM_KEY`.
  - `admin.e2e-spec.ts`: Thay thế audit log pre-seeded của `seat_hold_minutes_web` thành `default_cleaning_minutes`. Test `seat_hold_minutes_web` kiểm tra động audit log mới với `record_id: "seat_hold_minutes_web"`, `action: "UPDATE"`, `actor_id: ADMIN`, và `after_data.value: 15`.
  - `orders-report.e2e-spec.ts`: Mock RBAC giải mã JWT payload trích xuất `sub` làm callerId và kiểm tra thực chất 42501 khi Staff gọi hoặc Manager rạp khác gọi.
- Evidence:
  - `vitest run test/webhook.e2e-spec.ts test/admin.e2e-spec.ts test/orders-report.e2e-spec.ts`: 81/81 tests PASS.
  - `pnpm test`: 632/632 monorepo tests PASS.
  - `pnpm --filter @filmbooking/api typecheck`: exit code 0.
  - `pnpm --filter @filmbooking/api lint`: exit code 0.
- Status: PASS
