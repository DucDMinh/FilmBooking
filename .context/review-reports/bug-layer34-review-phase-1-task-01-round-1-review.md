Agent: reviewer

# Review: bug-layer34-review · phase-1-task-01 · round 1

- **Review level:** STRICT
- **Reason:** seed tạo tài khoản Admin với mật khẩu công khai và khoá POS plaintext (security, môi trường). Thay đổi chạm config DB (`[db.seed]`), script chạy SQL ra DB, script sinh `database.types.ts` (file shared) và `.env.example` (cấu hình deploy).
- **Blast radius:** DB local/CI (`supabase db reset`/`start` không còn nạp seed), mọi dev chạy `pnpm db:seed:demo`, `packages/shared/src/database.types.ts` (qua `pnpm db:types`), người deploy dùng `.env.example`.
- **Scope diff:** `scripts/seed-demo.mjs` (mới), `package.json`, `supabase/seed.sql`, `supabase/config.toml`, `.env.example`. Báo cáo gốc: `.context/review-reports/independent-review-layer-3-4-web-seed-ci.md` (B-M1, B-M2, B-M3, B-m1, C-M2, D-M2, D-m1).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS. Lưu ý: lint không quét `scripts/`, nên `seed-demo.mjs` chưa được lint |
| `pnpm db:start` / `pnpm db:test` | Không chạy. Builder ghi CLI lỗi ở `orioledb_version` (xem mục 5) |
| Chạy seed 2 lần (psql/docker) | **Không verify được.** `psql`, `docker` và `node -e` không nằm trong allowlist của reviewer (agent-guard chặn) |
| aislop | skip, chưa cài và không có trong allowlist |
| oxlint | skip, oxlint not configured |
| ocr | skip, ocr not installed |

## Kiểm theo brief

### (1) Guard host trong `scripts/seed-demo.mjs`
- Mấy trường hợp sau bị chặn đúng: `user@host` (WHATWG lấy host sau `@`, ví dụ `postgresql://127.0.0.1@evil.com` cho hostname `evil.com`), `localhost.evil.com` (so khớp chính xác bằng Set), `[::1]`/`::1` (có trong Set). `SEED_DB_URL=""`: `??` không fallback với chuỗi rỗng nên `new URL('')` ném lỗi và script `exit 1`. Fail-closed, chấp nhận được.
- **Lách được**, xem F1: libpq đọc tham số kết nối trong query string và biến môi trường `PG*`. Phần này WHATWG `URL.hostname` không thấy.

### (2) `seed.sql`
- Cast `consent_type`: `v.consent_type::public.consent_type`. Enum `('TERMS_OF_SERVICE','PRIVACY_POLICY','NO_REFUND_BOOKING')` (`20261111010000_core_identity_chain.sql:27`). Cột khớp (`:144-151`). `where not exists` theo `(user_id, consent_type, version)` không nhân đôi. **OK.**
- Múi giờ: `((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval + time) at time zone 'Asia/Ho_Chi_Minh'` cho ra timestamptz đúng giờ VN. **OK.**
- Lọc `r.id::text like '30000000-0000-0000-0000-%'` cho ghế (mục 4) và suất (8.2) đúng hướng B-M3.
- 8.1/8.2 đổi sang `on conflict (id) do nothing` theo đề xuất "8.1 chỉ insert khi chưa có". Hệ quả còn lại ghi ở F4 và F5.
- `[db.seed] enabled = false`, nên pgTAP chạy trên DB sạch. Không thấy chỗ nào làm hỏng dữ liệu pgTAP. **OK.**

### (3) `db:types`
- `> ….tmp && node -e "renameSync(tmp, final)"`: khi `supabase gen` trả exit ≠ 0, `&&` dừng nên file gốc được giữ. Trên Windows, pnpm chạy script qua `cmd.exe`, chuỗi `"…'…'…"` hợp lệ. `fs.renameSync` trên Windows ghi đè đích (libuv `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING`). **OK.** Chỉ còn F6.

### (4) `.env.example`
- 4 biến đã thêm khớp với code: `NEXT_PUBLIC_SITE_URL` (`apps/web/src/app/sitemap.ts:13`, `robots.ts:9`, `rap/[code]/page.tsx:40`), `SUPABASE_JWKS_URL` / `SUPABASE_JWT_ISSUER` / `TRUST_PROXY_HOPS` (`apps/api/src/config/env.ts:34-38`). **OK.**
- `RESEND_FROM_EMAIL` (`.env.example:31`) vẫn còn trong khi `env.ts` không đọc biến này (D-M2 gạch 3). Mục này ngoài yêu cầu task, chỉ ghi chú. `SEED_DB_URL` không có trong `.env.example`. Thiếu như vậy là chấp nhận được, thậm chí an toàn hơn.

### (5) `orioledb_version`
- `supabase/config.toml:44` `orioledb_version = ""` **không nằm trong diff**. Hunk duy nhất ở `[db.seed]` (`:68-71`). Lần cuối file đổi là commit `4f3ca9d`. Vậy lỗi CLI **có sẵn từ trước, không do thay đổi này gây ra**. Nhưng hệ quả là thay đổi này **chưa được chạy trên DB nào** (F3).

### (6) Seed 2 lần
- **Không verify được** (không có quyền psql/docker). Idempotency mới chỉ được chứng minh bằng đọc code.

## Findings

### MAJOR

**F1. Guard host lách được qua tham số libpq. `scripts/seed-demo.mjs:7-22`**
- Script kiểm `new URL(dbUrl).hostname` rồi đưa **nguyên chuỗi** `dbUrl` cho `psql`. libpq cho phép ghi đè host trong query của URI:
  - `SEED_DB_URL='postgresql://postgres:pw@127.0.0.1:5432/postgres?host=db.xxx.supabase.co'`: WHATWG ra hostname `127.0.0.1` nên guard cho qua, nhưng libpq dùng `host=` trong query (giá trị sau ghi đè giá trị trước) và kết nối tới remote.
  - `?hostaddr=<IP remote>`: khi có `hostaddr`, libpq kết nối tới IP đó bất kể `host`.
  - `?service=staging`, kết hợp `pg_service.conf`.
- Biến môi trường kế thừa: `spawnSync` không đặt `env`, nên `PGHOSTADDR` / `PGSERVICE` / `PGSERVICEFILE` trong shell của dev (thường có sẵn khi dev đang làm việc với staging) vẫn được áp dụng. URL mặc định không có `hostaddr`, nên `PGHOSTADDR=<IP staging>` sẽ đưa seed (Admin `LocalDev@123!` + 5 khoá POS) sang remote.
- Đây chính là mục đích của B-M1, mà guard không đạt được. Đề xuất:
  - Từ chối URL có bất kỳ search param nào thuộc `host`, `hostaddr`, `service`, `port`. Đơn giản nhất là từ chối mọi query.
  - Spawn `psql` với `env` đã xoá `PG*`.
  - Phòng thủ chiều sâu theo B-M1: thêm guard ngay trong SQL ở đầu `seed.sql`, ví dụ `do $$ begin if current_setting('app.allow_demo_seed', true) is distinct from 'on' then raise exception …` và script truyền `-c "set app.allow_demo_seed=on"` hoặc `PGOPTIONS`. Như vậy `supabase db push --include-seed` / `db reset --linked` hoặc psql tay cũng không nạp được.
- Cần kèm test (xem F2).

**F2. Vi phạm quy tắc test-first của task. `tasks/bug-layer34-review/phase-1-task-01.md:6`**
- Task yêu cầu "test tái hiện fail trước fix, pass sau fix". Diff **không có test nào**:
  - Không có unit test cho hàm guard (các case `?host=`, `user@host`, `localhost.evil.com`, `[::1]`, rỗng).
  - Không có bước CI nạp seed **2 lần** trên DB sạch (B-M2.3 / C-m3).
  - Không có kiểm số dòng `consents` / `showtimes` sau 2 lần chạy.
- Trạng thái task vẫn `pending`, không có evidence, không có `Repro Verification`. Theo luật bug closure, thiếu evidence kiểm chứng được thì kết quả là FAIL (unverifiable).

**F3. Không có evidence chạy thật. Seed chưa từng chạy sau sửa**
- `.context/runs/bug-layer34-review-phase-1-task-01.builder.md:1` ghi: "Chưa verify DB". Mọi khẳng định về idempotent, cú pháp và exclusion `23P01` đều chưa được DB xác nhận. Lỗi `orioledb_version` có từ trước không miễn trừ việc này: builder phải ghi `Blocked` hoặc sửa riêng, không đóng task khi chưa verify. Cần chạy `pnpm db:start` → `pnpm db:test` (xanh khi seed tắt) → `pnpm db:seed:demo` ×2 → đếm dòng.

**F4. Tài liệu chưa reconcile, đang mô tả sai hành vi mới. Doc impact chưa ghi**
- `supabase/seed/README.md:63` ghi "`pnpm db:start` … sẽ tự động nạp `supabase/seed.sql`". Sai từ khi `enabled = false`.
- `supabase/seed/README.md:66` vẫn ghi "**Idempotent 100%** … không gặp … vi phạm ràng buộc unique/exclusion". Câu này vẫn sai (xem F5).
- `supabase/seed/README.md:53-62` không nhắc `pnpm db:seed:demo`. Cách 1 (`docker exec … psql`) không qua guard.
- `docs/dev-setup.md:13` ghi `db:start` áp dụng `seed.sql`.
- B-M2.4 và D-m1 của báo cáo gốc yêu cầu đúng các điểm này. Task cũng yêu cầu "Doc impact: ghi rõ sau khi xong", mà chưa được ghi.

### MINOR

**F5. Idempotency 8.2 phụ thuộc TimeZone của session; exclusion chưa được xử lý. `supabase/seed.sql:756-759, 794`**
- `id = uuid_generate_v5(…, to_char(starts_at, …))`, mà `to_char(timestamptz)` định dạng theo `TimeZone` của session. Nếu hai lần chạy có `TimeZone` khác nhau (`PGTZ`, client khác), id khác nhau với cùng `room_id`/`starts_at`. Khi đó `on conflict (id)` không bắt được, đụng exclusion chống chồng giờ, `23P01`, và `ON_ERROR_STOP` dừng toàn bộ seed. Nên dùng `to_char(starts_at at time zone 'UTC', …)` hoặc `extract(epoch …)`.
- Nếu dev đã tạo suất qua UI trong **phòng seed** trùng khung 09:30/14:00/19:30, chạy lại cũng nổ `23P01`. Cần ghi nhận rõ như giới hạn đã biết.

**F6. Mục 8.1 `do nothing`: chạy lại sau vài giờ không còn suất "trong 2 giờ tới". `supabase/seed.sql:695-748`**
- Hướng sửa đúng theo đề xuất (tránh dời giờ suất đã bán và tránh `23P01` trung gian). Nhưng comment `:695` "BẮT BUỘC có ít nhất 1 suất ON_SALE trong vòng 2 giờ tới" chỉ còn đúng trên DB mới. Cần sửa comment hoặc README để dev biết phải `db reset` rồi seed lại khi cần demo live.

**F7. `db:types` để lại `database.types.ts.tmp` khi lỗi và chưa chặn output rỗng. `package.json:20`**
- File `.tmp` không nằm trong `.gitignore` (grep `tmp`: không có), nên dễ bị commit nhầm vào `packages/shared/src`.
- Nếu CLI thoát 0 mà stdout rỗng, file vẫn bị ghi trắng. Đề xuất: rename chỉ khi `size > 0`, xoá `.tmp` khi thất bại, và thêm `*.tmp` vào `.gitignore`.

**F8. `scripts/` nằm ngoài lint.** `pnpm lint` chỉ quét `apps/*/src`, `packages/shared/src`, nên `seed-demo.mjs` không được lint hay test.

## Surgical diff / AI-readable
- Mọi dòng trong diff đều gắn với task. Không thấy refactor ngoài phạm vi. Hunk `config.toml` giữ nguyên các thay đổi dirty khác như yêu cầu.
- AI-chaos indicators: 0 (script ngắn, tên rõ ràng, comment giải thích WHY). Gate PASS.

## Verdict: **FAIL**

Cần sửa: F1 (guard lách được bằng `?host=` / `?hostaddr=` / `PGHOSTADDR` / `PGSERVICE`), F2 (thiếu test tái hiện, không có repro evidence), F3 (chưa chạy seed trên DB thật, chưa chạy 2 lần), F4 (README và dev-setup sai, chưa ghi doc impact). Nên sửa luôn trong cùng vòng: F5–F8.
