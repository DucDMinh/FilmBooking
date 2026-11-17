# builder 2a — feature-order-level-qr phase-2-task-02 (shared + API soát vé + DTO đơn + docs)

Đã làm
- shared `checkin.ts`: `ScanTicketResponse.ticket` -> `order{orderId, bookingCode, movieTitle, cinemaName, roomName, seats[], seatCount, startsAt, checkedInAt}`.
- `checkin.service.ts`: đọc `order_id`, `seats` (lọc phần tử không phải string), `seat_count` (số, mặc định seats.length); WRONG_CINEMA/USED không lộ ghế.
- shared `orders.ts` + `orders.service.ts`: `OrderTicketDto.qrToken` bỏ, thêm `checkedIn: boolean`; bỏ `qr_token` khỏi `orders.types.ts`.
- Test: `checkin.e2e-spec.ts` (OK N ghế, lọc kiểu, WRONG_CINEMA/USED không lộ ghế), `orders-report.e2e-spec.ts` (DTO không lộ qrToken), `rls-scope.int-spec.ts` (order undefined).
- Docs: `docs/API_SPEC.md`, `docs/ERD.md`.

Chưa đụng (2b/task-03): mail/jobs, `.context/decisions.md`, `apps/web/**`.
Web cần task-03: xem báo cáo handback.
