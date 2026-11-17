# Review — feature/custom-mail-templates · phase-1 (task-01 + task-02) · round 1

Agent: reviewer

## Review level
**NORMAL** (không nâng STRICT).

## Reason
Thay đổi chỉ ở phần trình bày và ngôn ngữ: `apps/api/src/modules/mail/templates.ts` (layout HTML), 6 file HTML tĩnh `supabase/templates/*.html`, 6 khối `[auth.email.template.*]` trong `supabase/config.toml`, test mới, doc. Không đụng schema, auth logic, API contract hay tenant. Đã kiểm 3 điểm có thể khiến phải nâng STRICT, không điểm nào dính:
- XSS/chèn HTML: mọi giá trị động vẫn đi qua `escapeHtml`, kể cả preheader, title, href và các ô bảng.
- Trường bắt buộc của vé (R-86/R-133): giữ đủ ở cả html lẫn text.
- Hạn link Auth: đúng spec. Hạn 1 giờ của recovery được Nest tự kiểm.

## Blast radius
- Mọi mail giao dịch do Nest gửi qua outbox (10 kind của `renderTemplate`).
- Mọi mail Supabase Auth ở local (staging/prod phải dán template vào Dashboard; config.toml chỉ áp dụng cho local).
- Đã đối chiếu với `apps/web/src/app/auth/callback/route.ts`: web chỉ dùng `exchangeCodeForSession`. Template giữ `{{ .ConfirmationURL }}` như bản mặc định nên luồng redirect không đổi.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `npx tsc -p apps/api/tsconfig.json --noEmit` | PASS (không lỗi) |
| `pnpm lint` (gồm `apps/api: eslint src test`) | PASS (shared/web/api Done, 0 lỗi) |
| `pnpm test` | PASS: shared 31/31, api 28 file / 565 test, web 46 file / 570 test, scripts 31/31 |
| `npx eslint src test` / `npx vitest run` riêng trong `apps/api` | Hook agent-guard chặn `cd`/`--dir`. Thay bằng `pnpm lint` + `pnpm test` (allowlist), hai lệnh này đã chạy chính các script đó của apps/api |
| aislop / oxlint / ocr | skip: không có trong allowlist verify, oxlint chưa cấu hình, ocr chưa cài |
| graphify query | Hook chặn (không có trong allowlist). Thay bằng Grep/Read có mục tiêu |

## Cross-check nội dung bắt buộc (so với `HEAD:apps/api/src/modules/mail/templates.ts`)
- **Vé R-86/R-133/AC-26**: html còn đủ mã đặt vé, qr_token, tên rạp, địa chỉ, hotline, phòng, suất, ghế, combo, tổng tiền (`templates.ts:220-247`). Còn đủ 4 câu lưu ý: 15 phút, "Vé chỉ dùng tại rạp ghi trên vé", "Vé không huỷ / không hoàn tiền", giấy tờ tuỳ thân (`templates.ts:249-258`). Phần `text` (`templates.ts:280-294`) chỉ đổi tên thương hiệu, không rơi dòng nào.
- **R-11** "5 lần liên tiếp" + "15 phút": html `:309-310`, text `:317-318`. Giữ nguyên.
- **R-24**: câu cảnh báo liên kết/huỷ liên kết giữ nguyên (`:330-336`).
- **R-78**: lý do, bảng mã đặt vé/mã đơn/mã giao dịch/số tiền/rạp, hướng dẫn hotline + hoàn tiền thủ công. Giữ nguyên.
- **R-109**: hướng dẫn hoàn tiền thủ công + câu "không hỗ trợ đổi sang suất chiếu khác". Giữ nguyên (`<small>` chuyển thành `<span>`).
- **Escape**: `heading`, `infoTable`, `button`, `fallbackLink`, `wrapLayout` (title + preheader) đều escape. `paragraph`, `noteBox`, `bulletList` nhận HTML đã escape sẵn từ caller. Đã soát từng caller, không chỗ nào chèn giá trị động thô.
- **Auth**: đủ 6 template. Chỉ dùng biến `.ConfirmationURL/.Email/.NewEmail/.Token`, không `<script`, không URL cứng. Confirmation ghi "24 giờ", khớp `otp_expiry = 86400` (R-04). Recovery ghi "1 giờ", khớp R-13: GoTrue để 24h nhưng Nest tự kiểm 1h qua `recovery_sent_at` (`apps/api/src/modules/auth-ext/auth-ext.service.ts:39,171-174`), nên câu chữ trong mail đúng thực tế. Câu "chưa xác nhận thì chưa thể đặt vé" khớp AC-01.
- **config.toml**: TOML hợp lệ, đúng 6 khối `[auth.email.template.*]` (`supabase/config.toml:270-292`), cả 6 `content_path` trỏ tới file có thật. `[auth.email.notification.*]` vẫn bị comment (`:299-303`), không bật. Hunk `[auth.email.smtp]` nằm ngoài phạm vi review, không ảnh hưởng template.
- **Surgical diff**: task-01 chỉ sửa `templates.ts`, `mail-templates.spec.ts` (mới) và `outbox-job.e2e-spec.ts` (3 assert subject). Task-02 chỉ có 6 HTML, `auth-email-templates.spec.ts` và `docs/dev-setup.md`. Cả hai khớp "Files to Modify", không vi phạm mục "KHÔNG làm" nào: không đụng `mail.service.ts`, `jobs.controller.ts`, `identity.service.ts` hay web.

## Findings

Không có finding mức CRITICAL/HIGH/MEDIUM.

1. **LOW — Màu chưa đồng bộ giữa hai bộ template.** Nest dùng `pageBg #EEF0F4`, link `#C2410C` (`apps/api/src/modules/mail/templates.ts:29-39`). Auth dùng nền `#F3F4F6`, link `#C2402E`, chữ `#111827/#374151` (`supabase/templates/confirmation.html:9,32` và 5 file còn lại). Header/accent/CTA vẫn giống nhau nên không vi phạm acceptance, chỉ lệch nhỏ về nhận diện.
2. **LOW — Thiếu test cho config.toml.** `apps/api/test/auth-email-templates.spec.ts:1-68` chỉ kiểm file HTML. Không test nào khẳng định đủ 6 khối `[auth.email.template.*]`, `content_path` tồn tại, hay `notification` không bật (acceptance dòng 19). Lần này tôi đã kiểm tay và thấy đúng, nhưng sau này có hồi quy sẽ không bị bắt.
3. **LOW — Test vé chưa khoá câu "chỉ dùng tại rạp" trong `text`.** `apps/api/test/mail-templates.spec.ts:100-117`: câu "Vé chỉ dùng tại rạp ghi trên vé" chỉ được assert trên `html`, chưa assert trên `text`. Thêm nữa, assert `DEFAULT_HOTLINE` ở `:69` luôn đúng vì footer layout luôn in hotline, nên assert này không bắt được việc hotline của rạp bị rơi.
4. **LOW — Outlook desktop.** Bảng container có `width="600"` kèm `style="width:100%;max-width:600px"` (`templates.ts:97`, `supabase/templates/*.html:14`). Outlook (Word engine) bỏ qua `max-width`, nên container có thể giãn hết chiều ngang. Cách xử lý phổ biến là bọc thêm bảng ghost MSO cố định 600px. Gmail/Apple Mail không bị.
5. **INFO (có từ trước, ngoài diff)** — `DEFAULT_WEB_ORIGIN = "https://filmbooking.vn"` (`templates.ts:22`). Khi thiếu `WEB_ORIGIN`, link dự phòng mà người dùng nhìn thấy vẫn mang domain "filmbooking". `payload.url` cũng không bị kiểm scheme trước khi đưa vào href (`templates.ts:451-452, 496, 538-540`), nhưng hiện chưa caller nào set `url` (`identity.service.ts:135-227`), nên không có đường khai thác. Mail `password_set` được gửi sau khi đặt mật khẩu thành công (`identity.service.ts:141`) nhưng vẫn hiện nút "Thiết lập mật khẩu" và câu "liên kết có hiệu lực…", tức nội dung lệch ngữ nghĩa. Lỗi này có từ trước, không do diff gây ra. Nên đưa vào backlog riêng, không chặn task này.
6. **INFO — AI-readable.** `templates.ts` dài 616 dòng (>300) và `renderTicketEmail` khoảng 84 dòng (>50). Cả hai đều đã vượt ngưỡng từ trước diff. Phần lớn màu đã gom vào `BRAND`/`NOTE_STYLES`, chỉ còn vài hex trực tiếp (`#B91C1C`, `#B45309`, `#059669`). Diff tách được helper rõ tên (`heading`, `infoTable`, `noteBox`, `button`, `fallbackLink`). Chưa tới 3 indicator mới nên không FAIL.
7. **INFO — Không commit chung các file bẩn của user.** Working tree có `apps/api/package.json:11` (script `start` thêm `--env-file=../../.env.local`), `.gitignore:39-42` (bỏ qua `graphify-out/`), `.claude/settings.json`, `CLAUDE.md`, và hunk `[auth.email.smtp]` trong `supabase/config.toml:259-266`. Journal `.context/runs/feature-custom-mail-templates-phase-1.md:13` xác nhận đây là thay đổi của user, không thuộc task (task-01 còn ghi rõ "không đụng package.json"). Khi commit phase-1, primary chỉ stage file/hunk thuộc task, riêng `config.toml` chỉ stage hunk `[auth.email.template.*]`.

## Test có thật sự bắt lỗi không
- `mail-templates.spec.ts` chạy đủ 10 kind. Nếu quay lại `<style>`/flex hoặc còn tên "FilmBooking" thì test fail. Test escape dùng payload độc (`<script>`, `<img onerror>`, dấu nháy) và kiểm cả href lẫn preheader, không phải tautology. Test vé kiểm giá trị thật trên cả html và text.
- `auth-email-templates.spec.ts` kiểm whitelist biến bằng regex trên toàn file, các biến bắt buộc, câu "24 giờ"/"1 giờ", không `<script`, và ít nhất 3 lần xuất hiện `ConfirmationURL`. Có hiệu lực thật, chỉ thiếu phần config như Finding 2.

## Verdict
**NORMAL PASS.** Các finding LOW/INFO ở trên không chặn commit, nên xử lý trong lần chỉnh sau hoặc đưa vào backlog. Finding 7 là ràng buộc khi stage commit.
