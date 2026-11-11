# Bug layer34-review · phase-1-task-01 — Seed fix + .env.example

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-web-seed-ci.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: guard cho db:seed:demo (chỉ DB local 127.0.0.1/localhost, từ chối host khác), seed chạy lại không nhân đôi (idempotent), ngày theo múi giờ VN thay current_date UTC; bổ sung SUPABASE_JWKS_URL, SUPABASE_JWT_ISSUER, TRUST_PROXY_HOPS, NEXT_PUBLIC_SITE_URL vào .env.example; db:types không được làm trắng file khi lỗi (ghi ra file tạm rồi mv). Giữ nguyên thay đổi dirty hiện có ở supabase/config.toml + package.json.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Status: done-pending-review (vòng 3 sửa hẹp R2-F1..F4); DB verify Blocked (xem dưới)

## Root cause (ngắn)
Seed demo ghi Admin mật khẩu công khai + khoá POS plaintext mà không kiểm đích kết nối. Guard ban đầu bị lách qua query (`?host=`, `?hostaddr=`, `?service=`), biến `PG*` và fragment `#?host=...` (libpq không coi `#` là fragment, nhưng WHATWG `url.href` giữ nguyên nên guard thấy host loopback còn libpq thấy host remote).

## Repro Verification
- Original repro: `SEED_DB_URL='postgresql://postgres:pw@127.0.0.1:54322/postgres#?host=db.x.supabase.co'` qua `assertLocalDbUrl`.
- Expected: bị từ chối. Actual before fix: được chấp nhận (guard trả href chứa fragment).
- Evidence (test-first): `node --test scripts/seed-demo.test.mjs` trên guard cũ: 3 FAIL (`#?host=`, `#?hostaddr=`, `# đơn độc`), 13 pass. Sau fix: 16/16 pass. Test từ chối nay kiểm regex message nên chứng minh đúng nhánh chặn (query string / fragment / host / giao thức).
- Fix: từ chối URL có `#`; URL trả cho psql được dựng lại chỉ từ protocol + username + password + host + port + pathname (không dùng `url.href`).
- Status: PASS (phần guard, unit test).

## Blocked (F3, verify DB)
Không chạy được `pnpm db:start`, `pnpm db:test`, `pnpm db:seed:demo` x2: lỗi `orioledb_version` đã có từ trước trong `supabase/config.toml` (không do task này), máy thiếu `psql` và docker. Lệnh user chạy tay: `pnpm db:start`, `pnpm db:test`, `pnpm db:seed:demo` hai lần, rồi so số dòng `consents` và `showtimes` giữa hai lần (phải bằng nhau).

## Skip F8 (lint scripts)
ESLint gốc chưa phủ `scripts/` và cần cấu hình node globals cho `.mjs`. Việc này ngoài scope bug seed, tách task riêng.

## Doc impact
`supabase/seed/README.md` (mục 4, giới hạn idempotent, reset DB cũ) và `docs/dev-setup.md` đã cập nhật; `.env.example` bổ sung biến. Không impact API_SPEC / ERD / DESIGN.

## Residual risk
Seed chưa từng chạy trên DB thật sau sửa: DO-guard trong `seed.sql`, `where not exists` consents, id suất 8.2 theo giờ VN và insert seat chỉ được xác minh bằng đọc code. DB local đã seed bằng bản cũ cần reset một lần.
