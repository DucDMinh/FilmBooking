# Review — bug-ticket-email-qr · phase-1-task-01 · round 2

Agent: reviewer

## Review level
**NORMAL**

## Reason
Round 2 sửa F1/F2/F3 của round 1. Phạm vi giờ gồm thêm bước enrich trong job outbox (`jobs.controller.ts`) và một truy vấn PostgREST có embed. Diff không đụng auth/RBAC/schema/migration. Job đọc dữ liệu bằng `admin()` (service role), nên tôi kiểm tra cả RLS, hình dạng embed và việc lộ token ra log.

## Blast radius
- Mọi mail `TICKET_ISSUED`/`TICKET` (payload mới có `tickets: [{seat_label, qr_token}]`).
- Bước enrich trong `JobsService.processEmailOutbox`, chạy theo batch 20 mail.
- `MailTransport.sendMail` thêm trường optional `attachments`.
- Không đổi DB, API hay web.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | PASS: shared 31/31, **api 599/599** (29 file), **web 594/594** (47 file, lần này không timeout), scripts 31/31 |
| build dist / `node -e require` | không chạy lại. Round 1 đã chứng minh tĩnh và cách import `qrcode` không đổi. `node -e` bị agent-guard chặn |
| aislop / oxlint / ocr | skip (không có trong allowlist; oxlint/ocr chưa cấu hình) |

## Đối chiếu F1–F3 của round 1

**F1 (HIGH): ĐÃ SỬA**
- Truy vấn mới không còn `.limit(1).maybeSingle()`: `.select("qr_token, order_seats(seat_label)").eq("order_id", orderId)` (`apps/api/src/modules/jobs/jobs.controller.ts:96-98`). Kết quả đi qua `orderTicketsForEmail` rồi ghi vào `enriched.tickets` (`:99-101`).
- Hình dạng embed: `tickets.order_seat_id` là FK `unique` duy nhất tới `order_seats` (`supabase/migrations/20261111030100_booking_tables.sql:158`). Đây là quan hệ to-one nên PostgREST trả object, khớp bằng chứng primary bạn gửi. Không có FK thứ hai nên không lo PGRST201 (embed mơ hồ). `orderTicketsForEmail` xử lý được cả object, mảng và null (`jobs.controller.ts:51`).
- Sắp xếp dùng `localeCompare("vi", { numeric: true })` nên A2 đứng trước A10. Vé không nhãn xếp cuối (`:54-59`). Dòng thiếu token bị bỏ (`:50`). Trang web sắp xếp y hệt (`apps/web/src/components/ticket/ticket-data.ts:62`), nên thứ tự ghế trong email khớp web.
- `hasQr` (`jobs.controller.ts:79-80`): `tickets` không rỗng thì bỏ qua truy vấn. `tickets` rỗng nhưng không có `qr_token` thì vẫn truy vấn. Cả hai đều đúng.
- RLS: `admin()` dựng client bằng `SUPABASE_SERVICE_ROLE_KEY` (`apps/api/src/common/supabase/supabase.service.ts:31-32`), nên bỏ qua RLS. Xác nhận job không bị RLS chặn.
- Log: nhánh `catch` chỉ log order id và `err` (`:104-106`). Lỗi truy vấn hay throw đều không làm hỏng việc gửi; mail vẫn đi, chỉ thiếu QR.
- `mail.service.ts:177-191`: tạo N PNG (tối đa `MAX_TICKET_QR_IMAGES = 10`, `:136`), cid `ticket-qr-<n>` không trùng nhau (`:209`).
  - Mỗi vé có try/catch riêng, nên một vé lỗi không ảnh hưởng vé khác và không throw (`:210-214`).
  - Câu warn chỉ có số thứ tự vé và `error.message`, không có token.
  - Không bao giờ gửi `attachments` rỗng (`:190`).
  - Template ghép `qrImageCids` theo đúng vị trí từng vé (`templates.ts:308`).
  - cid luôn qua `escapeHtml`; mọi token và nhãn ghế cũng được escape (`:281,288`).
- Câu hướng dẫn đã sửa theo số vé. Đơn nhiều vé có câu "Mỗi ghế có một mã QR riêng — nhân viên soát vé sẽ quét từng mã" và tiêu đề "Ghế X" cho từng khối. Đơn 1 vé vẫn dùng "Đưa mã này cho nhân viên soát vé tại rạp" (`templates.ts:295,305-307`).
- `text` liệt kê `Ghế X: <token>` cho từng vé. Đơn 1 vé vẫn giữ `QR Token:` như cũ (`:312-318`). Các trường R-86/R-133 khác không đổi.

**F2 (MEDIUM): ĐÃ SỬA**
- Fake supabase cho bảng `tickets` giờ chỉ có `select(...).eq(...)` và await trực tiếp, không còn `limit`/`maybeSingle` (`apps/api/test/outbox-job.e2e-spec.ts:97-115`).
  - Nếu code quay lại `.limit(1)`, gọi hàm không tồn tại sẽ ném TypeError. Lỗi bị `catch` nuốt nên mail không có `tickets`, và test đơn 3 ghế sẽ fail ở bước kiểm `attachments` và thứ tự. Test này thật sự đỏ với code cũ.
  - Fake trả `order_seats` dạng object, khớp hình dạng PostgREST thật.
  - Test test assert cả chuỗi select (`:699`).
- Có thêm test cho đơn 1 ghế, outbox cũ đã có sẵn `qr_token` (không truy vấn) và vé không có nhãn (`:728-777`).
- `mail-ticket-qr.spec.ts:98-121` giải mã từng PNG và so với đúng token theo thứ tự. Test còn phủ các trường hợp:
  - một vé lỗi tạo ảnh (`:142-162`),
  - mọi vé đều lỗi (`:164-174`),
  - vượt trần 10 ảnh (`:176-188`),
  - MIME thật có 2 Content-ID khác nhau (`:216-224`).
- Token test là 32 ký tự hex, khớp CHECK `^[0-9a-f]{32}$`.

**F3 (LOW): ĐÃ SỬA**: `readTicketQrs` (`templates.ts:253-268`) là chỗ duy nhất đọc token, được cả `extractTicketQrs` và `renderTicketEmail` dùng (`:325`).

**decisions.md**: đã cập nhật lý do mỗi ghế một QR, phương án `booking_code` bị loại, trần 10 ảnh và gap "link bản đồ".

## Findings (round 2)

1. **LOW**: `jobs.controller.ts:99`. Khi PostgREST trả `error` (không throw), bước enrich im lặng bỏ qua, không log. Mail vé vẫn gửi nhưng không có QR và không để lại dấu vết. Hành vi im lặng này có từ trước diff. Gợi ý: thêm `logger.warn` với order id và `error.code`. Không chặn PASS.
2. **LOW**: outbox cũ có sẵn `qr_token` đơn lẻ (`hasQr` true) thì vẫn chỉ có 1 QR, dù đơn có nhiều ghế. Đây là giới hạn chấp nhận được vì RPC hiện tại không bao giờ đưa `qr_token` vào payload (`confirm_paid_order_code_lookup.sql:314-323`). Đã ghi trong decisions.
3. **INFO, hiệu năng/kích thước**:
   - Mỗi mail thêm đúng 1 truy vấn có dùng `tickets_order_id_idx`, không có N+1.
   - Ảnh PNG tạo song song, tối đa 10 ảnh mỗi mail. Các mail trong batch vẫn chạy tuần tự như trước.
   - 10 ảnh khoảng 3KB mỗi ảnh, cộng base64 thì khoảng 40KB, chấp nhận được.
   - Đơn trên 10 ghế: từ vé thứ 11 chỉ có chữ token, đã ghi rõ.
4. **INFO**: Trong vòng đời TICKET_ISSUED, truy vấn không lọc vé theo trạng thái `cancelled`. Đơn mới phát hành vé thì chưa có vé huỷ, nên không ảnh hưởng.
5. **INFO**: `templates.ts` vốn đã dài hơn 300 dòng từ trước. Các hàm mới đều ngắn (dưới 25 dòng), tên rõ nghĩa, không có magic number ngoài hằng `MAX_TICKET_QR_IMAGES`. AI-chaos indicators: 0.

## Verdict
**NORMAL PASS**. F1–F3 của round 1 đều đã sửa và có test đỏ-trước có ý nghĩa. Lint, typecheck và test đều xanh. Chỉ còn 2 finding LOW không chặn.
