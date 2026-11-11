Agent: reviewer

# Review: bug-layer34-review · phase-1-task-01 · round 3 (vòng bổ sung, user duyệt)

- **Review level:** STRICT
- **Reason:** guard an toàn đích kết nối cho seed demo (Admin mật khẩu công khai + khoá POS plaintext), đổi lệnh `test` gốc, task file bug closure.
- **Blast radius:** mọi dev chạy `pnpm db:seed:demo`; DB local; `pnpm test` toàn repo/CI. Vòng 3 chỉ đụng `scripts/seed-demo-guard.mjs`, `scripts/seed-demo.test.mjs`, `supabase/seed/README.md`, task file.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS: shared 14/14, api 209/209, web 89/89, `node --test scripts/*.test.mjs` 16/16 |
| `pnpm lint` | PASS (chỉ quét `apps/*/src`, `apps/api/test`, `packages/shared/src`; `scripts/` ngoài lint, đã ghi skip F8) |
| `node -e` probe / psql / DB commands | Không chạy (ngoài allowlist / env Blocked). Các kiểu lách bên dưới xác minh bằng đối chiếu spec WHATWG + libpq URI parser |
| aislop / oxlint / ocr | skip: chưa cài / oxlint not configured / ocr not installed |

## Xác minh R2-F1..F4

| # | Trạng thái | Bằng chứng |
|---|---|---|
| R2-F1 fragment `#` | **ĐÃ ĐÓNG** | `seed-demo-guard.mjs:22` chặn `url.hash !== '' \|\| rawUrl.includes('#')`, nên `#` đơn độc (hash rỗng) cũng bị chặn. `:29-32` dựng lại URL từ `protocol` + `username[:password]@` + `host` + `pathname`, không dùng `href`, không còn search/hash. Test `:12-14` có `#?host=`, `#?hostaddr=`, `#` đơn độc, test `:25-30` kiểm output đúng chuỗi |
| R2-F2 task file | **ĐÃ ĐÓNG** | Task có Status, Repro Verification (repro, expected/actual, evidence 3 FAIL trước, 16/16 sau, Status PASS), Blocked F3 (lý do + lệnh user chạy tay), Skip F8 (lý do), Doc impact, Residual risk |
| R2-F3 id 8.2 làm hỏng DB đã seed cũ | **ĐÃ ĐÓNG** (có MINOR về cách reset, xem R3-F1) | README §Giới hạn Idempotent dòng 66 |
| R2-F4 assert message | **ĐÃ ĐÓNG** | `seed-demo.test.mjs:21` `assert.throws(fn, reason)` với regex theo nhánh (`/host/`, `/query string/`, `/fragment/`, `/không hợp lệ/`, `/giao thức/`). Không còn tautology: mỗi regex khớp đúng message của một nhánh riêng |

## Thử các kiểu lách thêm (theo brief)

Vì psql chỉ nhận chuỗi **dựng lại** (không nhận input thô), libpq chỉ còn thấy các thành phần WHATWG đã chuẩn hoá.

- **`\` thay `/`:** `postgresql:` là scheme non-special nên `\` không phải dấu phân cách. `postgresql:\\evil.com/x` cho opaque path, hostname rỗng, bị từ chối. `postgresql://127.0.0.1\@evil.com/x` cho userinfo `127.0.0.1%5C`, host `evil.com`, bị từ chối.
- **Tab/newline:** WHATWG bỏ ASCII tab/LF/CR trước khi parse, và output là chuỗi dựng lại nên libpq không thấy ký tự điều khiển. `?` hoặc `#` bị chèn tab xen giữa vẫn bị bắt (`search` khác rỗng / `rawUrl.includes('#')`).
- **`%23` / `%3F`:** trong path, libpq tách dbname tới `?` thô rồi mới percent-decode, nên `%3Fhost%3D…` chỉ là tên DB literal, không thành tham số. Trong host thì hostname lạ, bị từ chối.
- **Host viết hoa:** host opaque của scheme non-special không bị lowercase. `LOCALHOST` không có trong Set nên bị từ chối (fail-closed, chấp nhận được).
- **Port lạ:** port hợp lệ vẫn là loopback nên không rủi ro. `:99999` hoặc multi-host `:5432,evil:5432` thì `new URL` ném lỗi. `127.0.0.1,evil.com` có hostname lạ, bị từ chối.
- **Nhiều `@`:** WHATWG lấy `@` cuối. Các `@` trước được encode `%40` trong `url.username`, nên chuỗi dựng lại chỉ còn đúng 1 `@` thô và libpq thấy host loopback. Cách dựng lại dùng `url.username`/`url.password` (đã encode `: / @ ? #`), nên libpq tách user/password đúng.
- **Spawn:** `spawnSync('psql', [dbUrl, …])` không qua shell, `dbUrl` luôn bắt đầu bằng `postgres`, nên không có injection hay option-injection. `sanitizedPsqlEnv` bỏ `PG*` không phân biệt hoa thường.

Không tìm được đường lách.

## File lạ

`tasks/bug-layer34-review/phi-1-task-01.md` **không tồn tại**. Thư mục chỉ có `phase-1-task-01..08.md`.

## Findings

### MINOR (không chặn PASS)

**R3-F1. Hướng dẫn reset "`pnpm db:stop` rồi `pnpm db:start`" không xoá data. `supabase/seed/README.md:66`**
`supabase stop` mặc định giữ data volume, chỉ xoá khi có `--no-backup`. Làm theo hướng dẫn thì DB không được reset, và seed vẫn dừng ở `23P01`. Phương án thứ hai trong cùng câu (`supabase db reset --local`) đúng, và vì `[db.seed] enabled = false` nên DO-guard không chặn reset. Đề xuất: sửa thành `pnpm db:stop --no-backup` hoặc chỉ giữ `supabase db reset --local`.

**R3-F2. README §4 chưa nói URL có `#` bị từ chối. `supabase/seed/README.md:60`**
Dòng này mới ghi "query string hoặc host khác bị từ chối". Đề xuất thêm "fragment `#`". Chỉ là doc, hành vi code đã đúng.

### Đã chấp nhận theo brief
- F3 Blocked (env: `orioledb_version` có từ trước, thiếu psql/docker): đã ghi trong task, kèm lệnh user chạy tay và residual risk.
- F8 skip lint `scripts/`: đã ghi lý do trong task.

## Surgical diff / AI-readable
Thay đổi vòng 3 trace đúng về R2-F1..F4. Guard 39 dòng, hàm ngắn, comment nêu WHY (libpq coi `#` khác WHATWG). AI-chaos indicators: 0.

## Verdict: **STRICT PASS**

R2-F1..F4 đã đóng trên đĩa. `pnpm test` (16/16 test guard) và `pnpm lint` xanh. Không tìm được kiểu lách mới. R3-F1/F2 là MINOR về doc, nên sửa khi close-out hoặc ghi follow-up. Residual risk vẫn còn: seed chưa chạy trên DB thật (F3 Blocked), và user cần chạy các lệnh DB tay theo task file.
