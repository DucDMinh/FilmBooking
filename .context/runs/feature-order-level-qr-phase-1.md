# Run Journal — feature/order-level-qr · phase-1..3 (task-01 DB -> task-02 backend -> task-03 web)

```yaml
workItem: feature/order-level-qr
phaseTask: phase-2-task-02 (2a checkin/shared/DTO/docs + 2b email, song song)
step: done
agent: null
status: done
attempt: 1
interrupted: false
updatedAt: 2026-11-18T04:00:00+07:00
filesTouched:
  - packages/shared/src/database.types.ts
  - supabase/tests/044_checkin_reports.test.sql
  - .context/decisions.md
  # USER dirty, KHÔNG thuộc task, KHÔNG stage: .claude/settings.json, .gitignore, CLAUDE.md, apps/api/package.json (hunk start), supabase/config.toml (Gmail cá nhân)
  - SPECIFICATIONS.md   # R-85, R-87, R-98, R-99, AC-12 (spec delta, primary)
  - spec/changes/BACKLOG.md
filesNew:
  - supabase/migrations/20261117130000_order_level_qr_fixes.sql
  - supabase/tests/065_order_level_qr_cancel_race.test.sql
  - supabase/migrations/20261117120000_order_level_qr.sql
  - supabase/tests/063_order_level_qr.test.sql
  - supabase/tests/064_order_level_qr_concurrency.test.sql
  - .context/runs/feature-order-level-qr-phase-1-task-01.builder.md
  - spec/changes/2026-11-17-order-level-qr.md
  - tasks/feature-order-level-qr/phase-1-task-01.md
  - tasks/feature-order-level-qr/phase-2-task-02.md
  - tasks/feature-order-level-qr/phase-3-task-03.md
evidence:
  reportPath: .context/review-reports/feature-order-level-qr-phase-2-task-02-round-2-review.md
  round: 2
  verdict: PASS   # task-01 STRICT PASS r2; task-02 STRICT PASS r2; task-03 NORMAL PASS r1 (report: ...phase-3-task-03-round-1-review.md)
next: "done — commit staging (không push). USER: restart API (đã build lại), tự xem giao diện web (375/768/1280) + quét QR thật bằng camera với đơn seed nhiều ghế; xoá thư mục rỗng E:	mp-order-qr-sample; staging/prod: chạy migration 20261117120000/130000 sau khi verify staging (HIGH_RISK_MIGRATION)."
loopSignal: none
approvals:
  - gate: phase_plan
    at: 2026-11-17T23:10:00+07:00
    ok: true   # user yêu cầu trực tiếp; plan tự duyệt theo memory autonomy
batchQueue: []
```

## Notes
- Classify MODIFY; spec R-85 vốn đã "một QR/đơn" (hiện thực lệch) + làm rõ R-99 theo đơn => bump 3.3.0 (spec-publisher).
- QR = token ngẫu nhiên của ĐƠN, không nhúng nội dung đơn (chuỗi nhúng ai cũng giả mạo được); staff quét thấy đủ thông tin từ server. Soát theo đơn; giữ bảng tickets từng ghế; QR cũ vẫn dùng được.
- 3 phase tuần tự vì phụ thuộc hợp đồng (DB -> shared/API -> web); không worktree (file rời user dirty, tránh lỗi merge script).
- Không sửa apps/api/package.json, supabase/config.toml (của user).

## History
- 2026-11-17T23:10:00+07:00 journal created; SPECIFICATIONS.md sửa; ▶ START [agent: builder] phase-1-task-01 DB (cancel sẽ redo bước này)
- 2026-11-17T23:50:00+07:00 ✅ DONE [agent: builder] task-01 DB: migration 20261117120000 đã áp local, 310 đơn/310 token duy nhất, 063 57/57, 044 45/45, race 064 5/5 (15 vòng, 1 OK + 1 USED), RPC thật trên đơn 8 vé trả đủ 8 ghế, quét lại USED. Builder hết 40 lượt 1 lần (SendMessage tiếp tục, không tăng attempt). pnpm db:test nguyên bản FAIL do data demo (có từ trước, 044 gốc cũng vậy). Primary đối chiếu DB: không đơn/vé nào checked_in, checkin_logs 2 dòng cũ 16/11. ▶ START [agent: reviewer] STRICT task-01 (cancel sẽ redo bước này)
- 2026-11-18T00:20:00+07:00 ✅ DONE [agent: reviewer] task-01 round 1 STRICT FAIL (attempt 1): F1 deadlock tiềm ẩn với cancel_showtimes (checkin_logs FK showtimes), F2 audit_logs lưu orders.qr_token, F3 HIGH_RISK_MIGRATION. ▶ START [agent: builder] fix round 1 (cancel sẽ redo bước này)
- 2026-11-18T01:00:00+07:00 ✅ DONE [agent: builder] fix round 1: khoá showtimes→orders→tickets (F1, test 065 đỏ 3/3 40P01 → xanh), audit bỏ qr_token (F2), HIGH_RISK_MIGRATION (F3), bỏ tra tickets.id (F4), guard qr_token bất biến (F5), sửa test (F6/F7). 063 64/64, 044 45/45, 064/065 PASS. Primary đối chiếu DB: 2 migration đã áp, 310 token duy nhất, 0 checked_in, checkin_logs 2 dòng cũ, không trigger tạm. ▶ START [agent: reviewer] STRICT round 2 (cancel sẽ redo bước này)
- 2026-11-18T01:30:00+07:00 ✅ DONE [agent: reviewer] task-01 round 2 STRICT PASS. Primary chạy độc lập 044 45/45 + 063 64/64 (transaction+rollback), DB demo nguyên vẹn. ▶ START [agent: builder] x2 phase-2-task-02 (2a checkin/shared/DTO/docs, 2b email) song song, file rời nhau (cancel sẽ redo bước này)
- 2026-11-18T02:10:00+07:00 ✅ DONE [agent: builder] x2 task-02: 2a (shared order{seats[]}, checkin.service, DTO admin bỏ qrToken + checkedIn, docs API_SPEC/ERD) + 2b (email 1 QR đơn: jobs enrich orders.qr_token, templates/mail.service 1 PNG cid ticket-qr, decisions SUPERSEDED). Primary đối chiếu: api 598/598, lint sạch, tsc api OK; web typecheck đỏ 5 chỗ (dự kiến, task-03). Thư mục rỗng thừa E:	mp-order-qr-sample (gốc ổ E) bị safety check chặn xoá -> để user xoá tay. ▶ START [agent: reviewer] STRICT task-02 (cancel sẽ redo bước này)
- 2026-11-18T02:50:00+07:00 ✅ DONE [agent: reviewer] task-02 round 1 STRICT FAIL (attempt 1): F1 MEDIUM orders-report.e2e-spec fixture thiếu orders.qr_token => không chứng minh token mới không lộ; F2 LOW ghế email không xếp tự nhiên; F3 LOW seatCount lệch seats.length; F4 INFO int test chưa quét bằng token đơn. ✅ DONE [agent: builder] task-03 web (1 QR/đơn trên trang vé, checkin-result hiện N ghế; lint/tsc xanh, web 595 PASS khi chạy riêng, flake timeout do tải). ▶ START [agent: builder] x2 fix task-02 (cancel sẽ redo bước này)
- 2026-11-18T03:30:00+07:00 ✅ DONE [agent: builder] x2 fix task-02 round 1: F1 orders-report fixture có orders.qr_token + helper expectNoQrCredential (primary tự kiểm: cố ý làm lộ token vé => test ĐỎ, đã gỡ, source sạch), F2 ghế email xếp tự nhiên, F3 seatCount = seats.length, F4 int test quét bằng orders.qr_token. api 600, web 595, test:int 92/92, lint/tsc sạch. ▶ START [agent: reviewer] round 2 task-02 + round 1 task-03 (cancel sẽ redo bước này)
- 2026-11-18T04:00:00+07:00 ✅ DONE [agent: reviewer] task-02 round 2 STRICT PASS + task-03 round 1 NORMAL PASS. Primary verify đầu-cuối: email đơn 8 ghế = 1 PNG cid ticket-qr, giải mã == orders.qr_token; RPC/pgTAP/int 92/92. Repro Verification điền PASS cho 3 task. ▶ START [agent: spec-publisher] bump 3.3.0 (cancel sẽ redo bước này)
- 2026-11-18T04:20:00+07:00 ✅ DONE [agent: spec-publisher] spec 3.3.0, scope v25 (hết 20 lượt 1 lần, sản phẩm đã đủ trên đĩa, primary kiểm tra hợp lệ). progress.json cập nhật, change archive, commit.
