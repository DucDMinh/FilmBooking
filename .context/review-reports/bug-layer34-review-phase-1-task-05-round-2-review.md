Agent: reviewer

# Review: bug-layer34-review, phase-1, task-05 (K4 bán trùng ghế), round 2 (vòng cuối)

- **Worktree:** `E:\FilmBooking\.worktrees\bug-layer34-review__phase-1__task-05`, chưa commit. Các file đã sửa: `docs/ERD.md`, `packages/shared/src/database.types.ts`, `tasks/bug-layer34-review/phase-1-task-05.md`. File mới: `supabase/migrations/20261112060000_prevent_double_sell.sql`, `supabase/tests/047_double_sell.test.sql`.
- **Review level:** STRICT
- **Reason:** đổi schema/migration (backfill, SET NOT NULL, UNIQUE trên dữ liệu cũ), đụng payment RPC `confirm_paid`, thêm hàm SECURITY DEFINER mới, xử lý concurrency.
- **Blast radius:** bảng `tickets` (mọi đường phát vé), `showtime_seat_states`, webhook PayOS, `email_outbox`.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS: 16 file / 622 test, 047 ok (plan 30, đếm tay khớp 30 assert) |
| `pnpm test` | PASS: shared 14, api 211, web 89, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip vì diff chỉ có SQL. oxlint chưa cấu hình, ocr chưa cài |
| File probe trong `.context/review-reports/` | Không còn (đã kiểm) |

## Xác minh các MAJOR của round 1

### MAJOR-1: ĐÃ ĐÓNG
- `20261112060000_prevent_double_sell.sql:669-670`: `revoke all ... confirm_paid(...) from public, anon, authenticated` rồi `grant execute ... to service_role`.
- `:134`: `sell_order_seats` bị revoke khỏi `public, anon, authenticated, service_role`.
- `:70`: `tickets_fill_seat` bị revoke khỏi `public, anon, authenticated` (đây là trigger function, không gọi qua RPC được).
- `047:103-114` có 6 assert `has_function_privilege`: anon và authenticated không gọi được confirm_paid, service_role gọi được; cả anon, authenticated, service_role đều không gọi được sell_order_seats. Cả 6 PASS trên DB local, khớp với xác nhận của dispatcher.

### MAJOR-2: ĐÃ ĐÓNG
Mỗi case đều assert trên dòng dữ liệu cụ thể, không có assert tautology.
- **(a)** `047:152-161`: trả false. A2 có count = 0 dòng seat_state, nghĩa là subtransaction đã rollback. A3 vẫn thuộc đơn Q. Nếu bỏ khối exception thì test lỗi. Nếu bỏ WHERE thì A3 bị ghi đè sang P. Vậy test đỏ khi logic sai.
- **(b)** `:164-169`: B1 vẫn là `<R>HELD`. Nếu bỏ điều kiện `expires_at <= now()` thì test đỏ.
- **(c)** `:172-177`: B2 thành `<T>SOLDnull`, kiểm cả `order_id`, `state` và `expires_at`.
- **(d)** `:180-181`: ghế bị khoá thì trả false, không ném lỗi.
- **(e)** `:184-193`: đơn holding, precheck qua, `sell_order_seats` trả false (C1 bị khoá). Kết quả là `NEEDS_MANUAL_REVIEW`, đơn ở `needs_manual_review`, có 0 vé và 0 dòng ghế.
- Test không còn `ALTER TABLE` hay `DISABLE TRIGGER`. Dòng 145-146 chỉ là comment giải thích.
- dblink không để lại gì:
  - `create extension if not exists dblink` nằm trong transaction test (`:10`, `:13`) và bị rollback cùng các hàm `tap47_*` và temp table.
  - Không migration nào khác dùng dblink.
  - Dữ liệu commit thật qua dblink được dọn ở `:281`, kể cả khi có exception (`:287-296`). Assert ở `:323-327` xác nhận đã dọn sạch.

### MAJOR-3: ĐÃ ĐÓNG
Task file `tasks/bug-layer34-review/phase-1-task-05.md:6` và `:28-34` đã đủ các mục:
- Nhãn `HIGH_RISK_MIGRATION` và cam kết không promote production trước khi verify staging.
- Các thao tác rủi ro: backfill, SET NOT NULL, UNIQUE INDEX, DISABLE/ENABLE TRIGGER.
- Khoá mạnh trên `tickets`; lý do không dùng được CONCURRENTLY; khuyến nghị chạy giờ thấp tải.
- Query kiểm trùng chạy trên staging trước. Query join qua `order_seats` nên vẫn đúng khi chưa có cột `seat_id`.
- Danh sách verify sau khi áp trên staging, gồm cả ACL `confirm_paid`.
- Rollback đầy đủ: drop index, trigger, function, column; khôi phục `confirm_paid` cũ và giữ ACL an toàn.

## Kiểm lại toàn bộ migration sau khi sửa tại chỗ
Tôi đã đọc lại toàn file (671 dòng). So với nội dung đã review ở round 1, chỉ khác dòng comment `:668` và việc thêm `authenticated` vào revoke ở `:669`. Không có thay đổi ngữ nghĩa nào khác:
- `sell_order_seats` ở `:79-133` giữ nguyên.
- `confirm_paid` gọi `sell_order_seats` ở `:309-311` và `:505-509`, giữ nguyên.
- Phần backfill, dup-check, NOT NULL, trigger và index ở `:27-74` giữ nguyên.

## Findings (round 2)
Không có CRITICAL hay MAJOR. Chỉ còn các MINOR, không chặn PASS:
- **m6 (còn, và task file ghi sai):** task file `:47` nói đã "bỏ dòng trống kép trong migration", nhưng dòng trống kép vẫn còn ở `20261112060000_prevent_double_sell.sql:312-313` và `:510-511`. Chỉ là thẩm mỹ, nhưng nên sửa lại câu trong task file cho đúng.
- **m7 (mới, nhỏ):** case (d) `047:180-181` chỉ assert giá trị trả về `false`, chưa assert rằng B3 không có dòng seat_state. Phần này đã được case (e) `:190-193` bao gián tiếp cho C1.
- m1, m2, m4, m5 của round 1 chưa làm và đã ghi vào Residual risk (`task:79`). Chấp nhận được.
- **Ngoài phạm vi (task K7):** task `:78` đã ghi nhận `record_payment_event`, `mark_payment_cancelled`, `confirm_pos_sale`, `confirm_zero_amount` có thể còn EXECUTE cho `authenticated`. Không đánh giá ở đây.

## Verdict: **STRICT PASS**
