Agent: reviewer

# Review — build-filmbooking layer-0 task-01 (round 1)

Task: pnpm monorepo + tooling + packages/shared (mã lỗi, enum, tiền VND, giờ VN)
Worktree: `E:\FilmBooking\.worktrees\layer-0__task-01` (branch `wt/layer-0__task-01`, chưa commit)

## Review level
STRICT

## Reason
`packages/shared` là nền dùng chung cho web + api + DB (catalog mã lỗi = API contract, enum khớp cột Postgres, hàm tiền/giờ quyết định giá vé). Root `package.json` + lockfile + tooling ảnh hưởng mọi task song song sau này. Theo AGENTS.md: shared service / API contract dùng nhiều client → STRICT.

## Blast radius
- `packages/shared/src/{errors,enums,money,time,index}.ts`: mọi module api (exception filter, pricing R-52/R-72, voucher, check-in), mọi màn web (map mã lỗi, format giá/giờ), migration enum Postgres.
- Root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`: mọi package/verify command.
- `apps/web/package.json`, `apps/api/package.json`: khoá bộ dependency cho layer 1+.
- `.env.example`, `.gitignore`: quản lý secret.

## Scope check (surgical diff)
`git status --short --untracked-files=all`: `.gitignore` (M) + 19 file untracked, tất cả nằm trong "Files to Create/Modify". Không chạm file ngoài scope. Diff `.gitignore` chỉ thêm dòng (không xoá dòng cũ). OK.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` | **Blocked** — agent-guard: lệnh không nằm trong allowlist reviewer. Gián tiếp: `node_modules` có sẵn, lockfile v9 có importers `.`, `apps/api`, `apps/web`, `packages/shared` (vd `vitest-axe`, `@payos/node` có trong importer). Residual risk. |
| `pnpm -w lint` | Chạy dạng `pnpm lint` (agent-guard coi `-w` là cờ mutating) → root script `pnpm -r --if-present lint` → `packages/shared lint: Done`, exit 0 |
| `pnpm -w typecheck` | chạy `pnpm typecheck` → `tsc -p tsconfig.json` Done, exit 0 |
| `pnpm -w test` | chạy `pnpm test` → vitest 5.1.0: 1 file, **14/14 passed** |
| `pnpm -w build` | **Blocked** (`pnpm build` không trong allowlist). Đọc tay: không package nào có script `build` (shared/web/api) → `pnpm -r --if-present build` là no-op. Rủi ro thấp. |

Ghi chú cho primary: khi điền `.context/project-config.md`, verify command dạng `pnpm -w <x>` sẽ bị guard reviewer chặn (regex MUTATING_FLAGS bắt `-w`); `build`/`install` cần đưa vào `verifyCommands` qua `node scripts/apply-verify-permissions.mjs --write`. Đây là vấn đề cấu hình workflow, không phải defect của task.

## Acceptance Criteria
| AC | Kết quả | Bằng chứng |
|---|---|---|
| Frozen install trên máy sạch, Node theo `.nvmrc` | Chưa tự xác minh (Blocked) | `.nvmrc` = `22`; `engines.node >=22`; `packageManager pnpm@10.28.0`; `onlyBuiltDependencies` (@swc/core, esbuild, sharp, supabase) |
| Root script lint/typecheck/test/build = `pnpm -r --if-present …` | OK | `package.json:10-13` |
| Script DB + test:int + e2e | OK | `db:start/stop/migrate(--local)/test/types`, `test:int` (đệ quy), `e2e: playwright test` — `package.json:16-22` |
| Dependency web/api/root khai trước | OK | Đối chiếu đủ từng mục AC #4: web (next, react, tailwindcss v4, @supabase/ssr, supabase-js, zod, lucide-react, leaflet, react-leaflet, qrcode.react, html5-qrcode, turnstile, @sentry/nextjs, 8 radix, cva, clsx, tailwind-merge, tw-animate-css, sonner, react-hook-form, @hookform/resolvers, vitest, @testing-library/react, vitest-axe); api (@nestjs/common/core/platform-express, throttler, testing, supabase-js, jose, zod, helmet, resend, @payos/node, @sentry/nestjs, csv-stringify, reflect-metadata, rxjs, vitest, supertest); root (typescript, eslint, prettier, supabase, @playwright/test, @lhci/cli). Extra devDeps (@nestjs/cli, swc, jsdom, @vitejs/plugin-react, …) hợp lý cho layer 1. |
| Unit test money/time | OK | `formatVnd(120000)` → `120.000 ₫`; `vnLocalToUtc("2026-11-14","17:00")` → `10:00Z` + chiều ngược; regex không thập phân |
| `.env.example` đủ biến, không secret; `.gitignore` chặn `.env*.local` | OK | Tất cả 15 biến ở design doc line 115 có mặt, mọi giá trị rỗng; `.gitignore`: `.env`, `.env.*`, `!.env.example` → `.env.local`, `.env.production.local` bị chặn |
| Export wildcard `./*` | OK | `packages/shared/package.json:6-9` `"./*": "./src/*.ts"` |

## Logic checks
- Mã lỗi: đủ danh sách AC (test khoá 22 mã); `ERROR_HTTP_STATUS: Record<ErrorCode, number>` → compiler bắt buộc mọi mã có HTTP status; test kiểm ≥400. OK.
- Enum đơn khớp SPECIFICATIONS §8.5 (10 trạng thái, test sort-equal). Vai trò customer/staff/cinema_manager/admin (R-105). Kênh WEB/POS. Loại ghế standard/vip/sweetbox/aisle/broken (R-48). Nhãn tuổi P/K/T13/T16/T18 (R-42). Trạng thái rạp 4 giá trị (R-32). OK.
- Biên 17:00: `hour >= 17` → 17:00 thuộc "sau 17h", 16:59 trước (khớp quyết định #19). OK.
- Cuối tuần: Thứ 7 + CN theo weekday giờ VN (shift +7h rồi `getUTCDay`), test cả trường hợp lệch ngày UTC. Khớp #19. OK.
- Múi giờ: offset cố định UTC+7 (VN không DST) — đúng, không phụ thuộc ICU/TZ máy. Validate ngày không tồn tại (30/02), giờ 25, phút 60. OK.
- VND: `Number.isSafeInteger`, format thủ công không phụ thuộc ICU, `percentOfVnd` làm tròn xuống. OK.

## Findings
### [CRITICAL]
Không có.

### [MAJOR]
Không có.

### [MINOR]
1. `packages/shared/src/money.ts:29-34` — `percentOfVnd` nhận `percent` thập phân rồi tính `Math.floor(amount * percent / 100)`; số thực có thể cho 6.9999… → floor lệch 1đ (vd percent không nguyên). `cap` âm chỉ được `assertVnd` kiểm số nguyên, không kiểm ≥0; `amount` âm floor xa 0. Đề xuất: bắt buộc `Number.isInteger(percent)` (hoặc dùng basis points nguyên), từ chối `cap < 0` và `amount < 0` (hoặc ghi rõ hợp đồng).
2. `packages/shared/src/time.ts:48-69` — `toVnParts`/`isVnWeekend`/`isVnEveningSlot` nhận `Invalid Date` im lặng (NaN → `false`), có thể dẫn tới tính giá sai mà không lỗi. Đề xuất: `if (Number.isNaN(instant.getTime())) throw new RangeError(...)`.
3. `package.json:20` — `db:types` dùng `>` redirect: nếu `supabase gen types` lỗi, shell đã truncate `database.types.ts` thành rỗng. Chấp nhận được ở local; cân nhắc ghi ra file tạm rồi rename (task sau, không chặn).
4. (Advisory cho layer 1) `@filmbooking/shared` xuất `.ts` thô, import nội bộ không đuôi (`./enums`), tsconfig `moduleResolution: Bundler`. Next cần `transpilePackages: ["@filmbooking/shared"]`; NestJS chạy bằng Node không load được `.ts` trong `node_modules` → task scaffold api phải bundle/transpile shared (SWC/webpack/tsx). Không phải defect task này (AC yêu cầu đúng dạng export), nhưng cần ghi vào brief layer 1.

## Skill gates
| Gate | Kết quả | Bằng chứng |
|---|---|---|
| aislop | OK — score 100 (Healthy) | `npx aislop scan --changes --json`: 0 error/0 warning; 2 info (knip chưa cấu hình, pnpm audit không chạy được: `spawn pnpm ENOENT`) |
| oxlint (anti-slop) | skip, oxlint not configured | Không có `.oxlintrc*` ở root (chỉ có trong node_modules của @nestjs/schematics). ESLint + typescript-eslint pass. |
| ocr (open-code-review) | skip, ocr not installed / không chạy | — |
| AI-readable | OK (0 indicator) | Tên rõ, hàm ≤ 25 dòng, file ≤ 100 dòng, không magic number (17, offset, MS_PER_MINUTE đều là hằng có tên), comment giải thích WHY. Không đổi luồng chính → không cần README/ARCHITECTURE. |
| ai-friendly-web | N/A | Task tooling/shared, không public-facing |
| blitzstrike | N/A | Không có auth/API public/input surface |
| Security | OK | `.env.example` không giá trị; `.gitignore` chặn `.env*`; không secret trong diff; `onlyBuiltDependencies` giới hạn lifecycle script |

## Responsive Checklist Gate
N/A — diff không đụng UI (không route/component/CSS).

## Residual risk
- `pnpm install --frozen-lockfile` và `pnpm build` không tự chạy được (agent-guard allowlist). Build hiện là no-op (không package có script build); install dựa vào lockfile có đủ importers + node_modules hiện có + lint/typecheck/test chạy được trên node_modules đó.
- `pnpm audit` không chạy (aislop báo ENOENT) — chưa kiểm vulnerability dependency.
- Version dependency (Nest 12, Next 16, zod 4.6, vitest 5.1, TS ~6.0.3) chỉ kiểm qua lockfile resolve, chưa kiểm tương thích runtime (sẽ lộ ở layer 1 scaffold).

## Verdict
✅ PASS — không có CRITICAL/MAJOR. 4 MINOR đề xuất xử lý ở task sau hoặc builder tuỳ chọn sửa trước commit.
