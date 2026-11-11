Agent: reviewer

# Review: bug-layer34-review · phase-1-task-01 · round 2 (vòng cuối)

- **Review level:** STRICT
- **Reason:** guard an toàn môi trường cho seed (Admin mật khẩu công khai + khoá POS plaintext), DO-guard trong `seed.sql`, config `[db.seed]`, script sinh `database.types.ts` (shared), đổi lệnh `test` gốc.
- **Blast radius:** mọi dev chạy `pnpm db:seed:demo`/psql tay; DB local/CI; `packages/shared/src/database.types.ts` qua `pnpm db:types`; lệnh `pnpm test` toàn repo (CI).
- **Scope đã xem:** `git diff` (package.json, .gitignore, .env.example, supabase/config.toml, supabase/seed.sql, supabase/seed/README.md, docs/dev-setup.md, .context/progress.json) + file mới `scripts/seed-demo-guard.mjs`, `scripts/seed-demo.mjs`, `scripts/seed-demo.test.mjs`, `scripts/gen-types.mjs`; task file `tasks/bug-layer34-review/phase-1-task-01.md`; journal `.context/runs/bug-layer34-review-phase-1-task-01*.md`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS: shared 14/14, api 209/209, web 89/89, rồi `node --test scripts/*.test.mjs` 12/12. Lệnh `test` gốc không hỏng; glob được node ≥22 tự expand nên chạy được trên cmd.exe |
| `node --test "scripts/*.test.mjs"` trực tiếp | agent-guard chặn (không có trong allowlist). Đã được bao trong `pnpm test` ở trên |
| `pnpm lint` | PASS, nhưng chỉ quét `apps/*/src`, `apps/api/test`, `packages/shared/src`. `scripts/` vẫn chưa được lint (F8) |
| DB (`pnpm db:start`/`db:test`/seed ×2) | Không chạy, môi trường Blocked (`orioledb_version` có từ trước) |
| aislop / oxlint / ocr | skip: chưa cài / oxlint not configured / ocr not installed |

## Xác minh F1–F8 của vòng 1

| # | Trạng thái | Ghi chú |
|---|---|---|
| F1 guard lách | **CHƯA ĐÓNG** | `?host=`/`?hostaddr=`/`?service=` đã bị chặn và `PG*` đã bị xoá khỏi env. Nhưng còn lách qua fragment `#` (R2-F1) |
| F2 test + repro | **Một phần** | Đã có unit test guard, và test bắt lỗi thật: bỏ check `url.search` thì 3 case `?…` đỏ, không phải tautology. Nhưng task file không có `Repro Verification`/evidence (R2-F2) |
| F3 verify DB | **Không chấp nhận** | Điều kiện để chấp nhận Blocked là phải ghi rõ trong task. Task file không ghi gì, chỉ journal có câu "F3 Blocked env" (R2-F2) |
| F4 docs | Nội dung **OK**, mục Doc impact **thiếu** | README §4 và `docs/dev-setup.md` đã đúng hành vi mới. Mục "Doc impact" trong task vẫn chưa ghi (R2-F2) |
| F5 TZ id 8.2 | OK | `to_char(starts_at at time zone 'Asia/Ho_Chi_Minh', …)` không phụ thuộc TimeZone session. README đã ghi giới hạn `23P01` khi tạo suất qua UI |
| F6 comment 8.1 | OK | Comment mục 8 + README đã sửa |
| F7 db:types | OK | `scripts/gen-types.mjs`: ghi ra `.tmp`, xoá khi lỗi/rỗng, rename khi OK. `shell: win32` cho shim `.cmd`. `.gitignore` có `packages/shared/src/*.tmp` |
| F8 lint scripts | **Skip không có lý do trong task** | Chấp nhận skip chỉ khi có lý do, mà task không ghi lý do (R2-F2) |

## Kiểm đặc biệt theo brief

- **Query string:** bị chặn (`seed-demo-guard.mjs:18`).
- **PG\* env:** `sanitizedPsqlEnv` bỏ mọi key bắt đầu `PG` (không phân biệt hoa thường). Test có `pgservicefile` thường. OK.
- **URL userinfo:** `127.0.0.1@evil.com` có hostname `evil.com` nên bị từ chối. `a@evil.com@127.0.0.1`: WHATWG lấy `@` cuối, và `href` encode `@` trong userinfo thành `%40`, nên libpq vẫn thấy host `127.0.0.1`. OK, vì script truyền `href` đã chuẩn hoá.
- **%-encoding host:** `postgresql:` là scheme non-special nên host là opaque và không được decode. `%31%32%37.0.0.1` và `localhost%2eevil.com` không có trong Set, nên bị từ chối (fail-closed). `127.1`, `LOCALHOST` cũng bị từ chối, chấp nhận được.
- **Multi-host libpq:** `127.0.0.1,evil.com` thành hostname lạ và bị từ chối. `127.0.0.1:5432,evil.com:5432` có port không hợp lệ nên `new URL` ném lỗi. OK.
- **IPv6:** `[::1]` được chấp nhận, dạng đầy đủ `[0:…:1]` serialize về `[::1]`, `[::ffff:7f00:1]` bị từ chối. OK.
- **Fragment `#`:** **LÁCH ĐƯỢC.** Xem R2-F1.
- **DO-guard `seed.sql:13-18`:** cú pháp đúng. `current_setting(…, true)` trả NULL khi chưa set, và `is distinct from 'on'` xử lý đúng NULL. psql (≥9.6) chạy `-c` rồi `-f` theo thứ tự **trong cùng một kết nối/phiên**. `SET` (không `LOCAL`) có hiệu lực cả phiên nên guard không chặn nhầm. Grep `seed.sql` không thấy `\c`/`reset`/`discard`/`begin;` có thể làm mất cờ. `-X` bỏ psqlrc. OK.
- **Seat insert `seed.sql:285-287`:** chỉ có một `WHERE` sau `cross join (…) grid`, không có `JOIN … ON` nên không mơ hồ với `ON CONFLICT`. Cú pháp OK (đọc code, chưa chạy DB).
- **gen-types trên Windows:** `shell: true` + shim `supabase.cmd` + stdout là fd file thì chạy được. Node 24 có thể in cảnh báo DEP0190 (args + shell) nhưng không lỗi. `statSync(tmpFile)` an toàn vì file đã được `openSync` tạo trước.

## Findings

### MAJOR

**R2-F1. Guard lách được qua fragment `#`. `scripts/seed-demo-guard.mjs:18` và `:24`**
- Guard chỉ kiểm `url.search`, rồi trả `url.href`. Với scheme non-special, `href` **giữ nguyên fragment**. Mọi thứ sau `#` là `hash` nên `search === ''`.
- Parser URI của libpq (`conninfo_uri_parse_options`, `fe-connect.c`) không coi `#` là ký tự phân cách. Sau `/`, nó đọc dbname tới `?` rồi parse phần còn lại làm tham số. Một giá trị `host=` hay `hostaddr=` ở đây sẽ ghi đè host trong authority, đúng cơ chế F1 vòng 1.
- PoC: `SEED_DB_URL='postgresql://postgres:pw@127.0.0.1:54322/postgres#?host=db.xxx.supabase.co'` (hoặc `#?hostaddr=<IP staging>`).
  - WHATWG cho hostname `127.0.0.1`, search rỗng, nên guard PASS.
  - libpq đọc dbname `postgres#` và host `db.xxx.supabase.co`.
  - Script tự gửi `-c 'set app.allow_demo_seed = on'`, nên DO-guard trong `seed.sql` cũng không cản. Admin `LocalDev@123!` và khoá POS được ghi lên remote.
  - Kết luận này dựa trên đối chiếu spec WHATWG và mã libpq. Reviewer không chạy được `node -e`/psql do allowlist.
- Đề xuất:
  - Cách 1: từ chối `url.hash !== ''`.
  - Cách 2 (nên làm): không truyền `href`. Dựng lại URL chỉ từ `protocol`, `username:password`, `hostname`, `port`, `pathname`, hoặc truyền `-h/-p/-U/-d` riêng cho psql.
  - Thêm test case `#?host=` và `#?hostaddr=` vào `scripts/seed-demo.test.mjs`.

**R2-F2. Task file không được cập nhật. Thiếu các điều kiện closure. `tasks/bug-layer34-review/phase-1-task-01.md:7-8`**
- File vẫn y nguyên bản gốc: `Status: pending`, `Doc impact: ghi rõ sau khi xong`. Còn thiếu:
  - mục `Repro Verification` (status + evidence: test nào đỏ trước fix, xanh sau fix);
  - ghi `Blocked` cho F3, gồm lý do `orioledb_version` có từ trước, các lệnh DB chưa chạy được, và residual risk "seed chưa từng chạy trên DB thật sau sửa, kể cả DO-guard, `where not exists` consents, 8.2 TZ";
  - lý do skip F8;
  - Doc impact thực tế (README seed §4, `docs/dev-setup.md`, `.env.example`).
- Theo luật bug closure: thiếu Repro Verification/evidence kiểm chứng được thì FAIL (unverifiable). Câu "F3 Blocked env / F8 skip" trong journal không thay được task file.

### MINOR

**R2-F3. Đổi công thức id 8.2 làm hỏng lần chạy lại trên DB local đã seed bằng bản cũ. `supabase/seed.sql:769, 788`**
- Id cũ dùng `to_char` theo TZ session (thường UTC) và `current_date`. Id mới dùng giờ VN. Cùng `room_id` + `starts_at` nhưng ra id khác, nên `on conflict (id)` không bắt được, đụng exclusion `23P01`, và `ON_ERROR_STOP` dừng seed.
- README "Giới hạn Idempotent" nên thêm: "DB đã seed trước thay đổi này: reset DB local một lần".

**R2-F4. `assert.throws` không kiểm message. `scripts/seed-demo.test.mjs:18`**
- Các case `?…` vẫn phân biệt được nhánh check search, nhưng nếu khớp regex lý do (`/query string/`, `/host/`) thì test chứng minh đúng nhánh đã chặn. Không chặn PASS.

**R2-F5 (= F8 cũ). `scripts/*.mjs` vẫn ngoài lint.** Chấp nhận skip nếu task ghi lý do (xem R2-F2).

## Surgical diff / AI-readable
- Diff trace về task. `.context/progress.json` đổi là phần của dispatcher cho work item remediation, không phải phần builder.
- Script ngắn, tên rõ ràng, comment giải thích WHY. AI-chaos indicators: 0. Gate PASS.

## Verdict: **FAIL**

Lý do chặn:
- **R2-F1:** guard host vẫn lách được qua `#?host=`/`#?hostaddr=`, nên mục tiêu B-M1/F1 chưa đạt.
- **R2-F2:** task file chưa có Repro Verification, ghi Blocked cho F3, lý do skip F8 và Doc impact. Bug closure không kiểm chứng được.

Đây là vòng 2 (cuối) nên theo journal chuyển `architecture_review_needed`, hoặc để session chính quyết định có cho thêm 1 vòng sửa nhỏ không. Cả hai lỗi đều hẹp: 1 dòng guard + test, và cập nhật task file.
