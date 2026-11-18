# Feature cinema-status-notice · phase-1-task-02 — Mail: template `CINEMA_STATUS_NOTICE`

- Classification / Risk: ADDITIVE (mail). Reviewer **NORMAL**. Chạy **song song** với task-01 (file rời nhau). Không phụ thuộc DB (render từ payload).
- Hợp đồng: `spec/changes/2026-11-18-cinema-status-notice.md`. Spec: R-136, AC-27.

## Thiết kế
1. `apps/api/src/modules/mail/templates.ts`: thêm `renderCinemaStatusNoticeEmail(payload)` và case `CINEMA_STATUS_NOTICE` trong `renderTemplate`. Payload (snake_case, chấp nhận camelCase như các template khác): `cinema_name`, `cinema_code`, `cinema_address`, `hotline` (thiếu → `DEFAULT_HOTLINE`), `target_status` (`CLOSED|TEMP_CLOSED|OPEN|COMING_SOON`), `current_status`, `effective_at` (ISO), `customer_name?`, `schedule_cancelled?` (true = đính chính huỷ lịch). Ngày hiệu lực hiển thị `dd/mm/yyyy` theo giờ Việt Nam (tái dùng helper format có sẵn, không thêm thư viện). Escape HTML mọi giá trị (cùng helper `escapeHtml` các template khác).
2. Nội dung tiếng Việt (giữ giao diện CINEMO như các mail khác: `wrapLayout`, `heading`, `paragraph`, `infoTable`, `noteBox`):
   - **CLOSED**: subject `[CINEMO] Thông báo: Rạp {tên} sẽ đóng cửa từ ngày {dd/mm/yyyy}`; tiêu đề "Thông báo đóng cửa rạp"; "Kính gửi {tên khách | quý khách}, CINEMO xin thông báo rạp **{tên}** ({địa chỉ}) sẽ chính thức đóng cửa kể từ ngày **{ngày}**." + bảng thông tin (Rạp, Địa chỉ, Ngày đóng cửa, Hotline) + noteBox cảnh báo: "Quý khách đã đặt vé cho các suất chiếu diễn ra **sau ngày {ngày}** tại rạp này, vui lòng đến trực tiếp quầy vé của rạp **trước ngày {ngày}** (mang theo mã đặt vé hoặc mã QR trong email vé) để được hoàn tiền. Sau thời hạn này, CINEMO sẽ không giải quyết hoàn tiền; các suất chiếu còn lại của rạp sẽ bị huỷ." + đoạn cuối: các rạp khác vẫn hoạt động bình thường, có thể chọn rạp khác để đặt vé; liên hệ hotline.
   - **TEMP_CLOSED**: như trên nhưng "tạm ngừng hoạt động từ ngày {ngày}" ("thời gian mở lại sẽ được thông báo sau"), cùng noteBox hoàn tiền (hạn: trước ngày hiệu lực).
   - **COMING_SOON**: như TEMP_CLOSED nhưng "chuyển sang trạng thái sắp khai trương, tạm ngừng nhận đặt vé từ ngày {ngày}".
   - **OPEN**: subject `[CINEMO] Thông báo: Rạp {tên} sẽ mở cửa từ ngày {ngày}`; "rạp sẽ bắt đầu/trở lại hoạt động và nhận đặt vé từ ngày {ngày}"; **không** có noteBox hoàn tiền (noteBox kiểu info/success mời khách xem lịch chiếu).
   - **schedule_cancelled = true** (mọi target): subject `[CINEMO] Đính chính: Rạp {tên} vẫn hoạt động bình thường`; "CINEMO xin đính chính: thông báo trước đó về việc rạp {tên} {đóng cửa/tạm đóng cửa/…} từ ngày {ngày} đã được huỷ; rạp tiếp tục hoạt động như bình thường, quý khách không cần đến rạp hoàn tiền vé" + xin lỗi vì sự bất tiện; không noteBox hoàn tiền.
   - Bản text thuần (`text`) tương ứng; preheader ngắn.
   - Target không nhận diện được → dùng mẫu chung "thay đổi trạng thái hoạt động" không noteBox hoàn tiền (không ném lỗi).
3. Kiểm tra `jobs.controller.ts`/`mail.service.ts`: xem kind mới có bị whitelist/enrich theo kind nào không; nếu cần thì chỉ sửa tối thiểu để kind mới được gửi như mail thường (không enrich vé). Nếu phải sửa jobs → ghi rõ lý do.
4. Test: cạnh test templates sẵn có (tìm `templates` trong `apps/api/test` hoặc `__tests__`): 4 target + biến thể đính chính × (subject, ngày dd/mm/yyyy giờ VN, tên rạp, noteBox hoàn tiền có/không, hotline mặc định khi thiếu, escape HTML tên rạp chứa `<script>`), router `renderTemplate("CINEMA_STATUS_NOTICE")` và chữ hoa/thường kind.

## KHÔNG làm
Không đụng `supabase/**`, `packages/shared/**`, `apps/web/**`, `apps/api/src/modules/cancellation|catalog|cinema-ops/**`. Không `git add/commit/checkout/reset/stash/clean`. Không đụng file dirty của user (`.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `apps/api/package.json`, `supabase/config.toml`, `package.json`).

## Files to Modify
`apps/api/src/modules/mail/templates.ts`, test templates tương ứng (+ `jobs.controller.ts` chỉ nếu bắt buộc).

## Verify
`pnpm --filter ./apps/api test`, `pnpm --filter ./apps/api lint`, `pnpm --filter ./apps/api typecheck` (lệnh thật theo `package.json`; `lint_command` cấu hình `pnpm lint`).

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: chưa có template cho thông báo đổi trạng thái rạp (kind lạ → `UNKNOWN_KIND`).
- Expected: render đúng 4 target, hạn chót hoàn tiền = ngày hiệu lực.
- Actual after: `renderTemplate("CINEMA_STATUS_NOTICE", …)` render đúng CLOSED/TEMP_CLOSED/COMING_SOON (noteBox hoàn tiền, hạn chót = "trước ngày <ngày hiệu lực>", sau hạn không giải quyết), OPEN (mời xem lịch chiếu, không noteBox hoàn tiền), `schedule_cancelled` (đính chính), target lạ (mẫu chung, không ném lỗi); ngày dd/mm/yyyy theo giờ VN; hotline mặc định; escape HTML; kind không phân biệt hoa thường. Không cần sửa `jobs.controller.ts` (không có whitelist kind; chỉ enrich vé cho TICKET*).
- Evidence: `apps/api/test/mail-templates.spec.ts` (đỏ trước: UNKNOWN_KIND; xanh sau: 69 test file này, `pnpm test` 29 file/623 test PASS; `pnpm lint`, `pnpm typecheck` sạch).
- Round 2 (reviewer FAIL round 1): F1 noteBox hoàn tiền nêu "từ ngày X trở đi" (hiệu lực rơi giữa ngày, suất trong ngày hiệu lực cũng bị huỷ); F2 mail đính chính đọc `current_status`: OPEN/thiếu -> "vẫn hoạt động bình thường", khác OPEN -> "giữ nguyên trạng thái hiện tại (đã đóng cửa / đang tạm đóng cửa / đang ở trạng thái sắp khai trương)", lịch mở cửa bị huỷ nói rõ "Ngày mở cửa dự kiến không còn áp dụng"; F3-F5 bổ sung test (escape `cinema_code` ở nút OPEN, múi giờ kiểm cả noteBox, subject một dòng + chuẩn hoá khoảng trắng tên rạp). Verify gốc repo: `pnpm test` (api 29 file / 632 test, web 595, shared 31), `pnpm lint`, `pnpm typecheck` PASS.
- Status: PASS
