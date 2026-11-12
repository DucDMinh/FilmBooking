# Bug layer34-review · phase-1-task-01 — Seed fix + .env.example

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-web-seed-ci.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: guard cho db:seed:demo (chỉ DB local 127.0.0.1/localhost, từ chối host khác), seed chạy lại không nhân đôi (idempotent), ngày theo múi giờ VN thay current_date UTC; bổ sung SUPABASE_JWKS_URL, SUPABASE_JWT_ISSUER, TRUST_PROXY_HOPS, NEXT_PUBLIC_SITE_URL vào .env.example; db:types không được làm trắng file khi lỗi (ghi ra file tạm rồi mv). Giữ nguyên thay đổi dirty hiện có ở supabase/config.toml + package.json.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Status: done (Reviewer STRICT PASS vòng 3; DB verify PASS 2026-11-12, xem dưới)

## Root cause (ngắn)
Seed demo ghi Admin mật khẩu công khai + khoá POS plaintext mà không kiểm đích kết nối. Guard ban đầu bị lách qua query (`?host=`, `?hostaddr=`, `?service=`), biến `PG*` và fragment `#?host=...` (libpq không coi `#` là fragment, nhưng WHATWG `url.href` giữ nguyên nên guard thấy host loopback còn libpq thấy host remote).

## Repro Verification
- Original repro: `SEED_DB_URL='postgresql://postgres:pw@127.0.0.1:54322/postgres#?host=db.x.supabase.co'` qua `assertLocalDbUrl`.
- Expected: bị từ chối. Actual before fix: được chấp nhận (guard trả href chứa fragment).
- Evidence (test-first): `node --test scripts/seed-demo.test.mjs` trên guard cũ: 3 FAIL (`#?host=`, `#?hostaddr=`, `# đơn độc`), 13 pass. Sau fix: 16/16 pass. Test từ chối nay kiểm regex message nên chứng minh đúng nhánh chặn (query string / fragment / host / giao thức).
- Fix: từ chối URL có `#`; URL trả cho psql được dựng lại chỉ từ protocol + username + password + host + port + pathname (không dùng `url.href`).
- Status: PASS (phần guard, unit test).

## Verify DB (F3) — PASS 2026-11-12
Ban đầu ghi Blocked. Nguyên nhân thật: lỗi `orioledb_version` do gọi `supabase` global 2.107.0 trên PATH (`C:\nvm4w\nodejs\supabase`), không phải config sai — CLI dự án 3.1.0 (`npx supabase` / `pnpm db:*`) chạy bình thường. Docker có sẵn; máy chỉ thiếu `psql` nên dùng `psql` trong container `supabase_db_filmbooking`.
- `npx supabase start`: OK. `npx supabase test db`: 14 file / 566 test PASS.
- `seed.sql` không có cờ `app.allow_demo_seed`: bị chặn (`ERROR: seed.sql bị chặn…`) — DO-guard hoạt động.
- Seed lần 1 (DB trống) và lần 2 (`set app.allow_demo_seed = on` + `-f seed.sql`): đều exit 0, số dòng giống hệt: 298 showtimes, 2 consents, 5 cinemas, 1056 seats, 6 users → idempotent.
- Chưa chạy chính `pnpm db:seed:demo` (máy không có `psql` trên PATH); logic guard của script đã có unit test 16/16.

## Skip F8 (lint scripts)
ESLint gốc chưa phủ `scripts/` và cần cấu hình node globals cho `.mjs`. Việc này ngoài scope bug seed, tách task riêng.

## Doc impact
`supabase/seed/README.md` (mục 4, giới hạn idempotent, reset DB cũ) và `docs/dev-setup.md` đã cập nhật; `.env.example` bổ sung biến. Không impact API_SPEC / ERD / DESIGN.

## Residual risk
`pnpm db:seed:demo` cần `psql` trên PATH (máy dev hiện chưa có). Seed chưa được thử trên DB đã có suất tạo qua UI (rủi ro `23P01`, đã ghi README). DB local đã seed bằng bản cũ cần `supabase db reset --local` một lần. Gọi `supabase` global 2.107.0 sẽ lỗi `orioledb_version` — dùng `pnpm db:*` hoặc `npx supabase`.
