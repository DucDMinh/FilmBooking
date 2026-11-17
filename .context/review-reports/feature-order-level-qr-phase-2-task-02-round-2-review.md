# Review — feature/order-level-qr · phase-2-task-02 · round 2

Agent: reviewer

- **Review level:** STRICT, giữ nguyên như round 1 vì task đụng credential QR, hợp đồng API soát vé và email.
- **Reason:** kiểm lại F1–F4 của round 1 (`...-round-1-review.md`) và soát lại toàn bộ diff `apps/api` + `packages/shared`.
- **Blast radius:** không đổi so với round 1. Phần sửa thêm chỉ nằm ở test, ở `jobs.controller.ts` (thứ tự ghế) và `checkin.service.ts` (`seatCount`).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS (shared, web, api) |
| `pnpm test` | PASS: shared 31/31, **api 29 file / 600/600**, web 47 file / 595/595, `scripts/*.test.mjs` 31/31. Lần này không có flake |
| `pnpm test:int` | **9 file / 92/92 PASS** trên DB local. Ca mới có `cleanupScope` dọn dữ liệu nhờ dùng `factories` + `scope.prefix` |
| aislop / ocr | skip, chưa cài |
| oxlint | không có thay đổi TS mới đáng kể so với round 1 (round 1 ra 0 error); repo không có cấu hình oxlint |

## Kiểm từng finding của round 1

- **F1 (MEDIUM) — ĐÃ ĐÓNG.** File `apps/api/test/orders-report.e2e-spec.ts`.
  - Mọi hàng `orders` của fixture nay có `qr_token` riêng: `b`..`f` x32 (`:123, :149, :175, :201, :227`). Hàng `tickets` giữ `a` x32.
  - Helper `expectNoQrCredential` (`:1008-1012`) chặn cả tên khoá `qrToken|qr_token` lẫn giá trị `([a-f])\1{31}`.
  - Phạm vi chạy: `/orders`, `/orders?bookingCode=`, `/orders/needs-manual-review`, `/admin/orders/needs-manual-review`, `/admin/todo` (cả manager và admin), `GET /orders` với admin (`items.length > 1`), và `GET /orders/:id` (`:1080-1093`).
  - Fake DB trả `select("*")` kèm `qr_token`, nên chỉ cần một lần spread `...row` là test đỏ. Primary đã chứng minh điều này bằng cách cố ý thêm `leak: t.qr_token`.
  - Regex không bắt nhầm UUID test (chỉ gồm `0` và số), nên không có dương tính giả.
  - Diff `orders.service.ts` chỉ còn đúng `qrToken` → `checkedIn`.
- **F2 (LOW) — ĐÃ ĐÓNG.** File `jobs.controller.ts:109-113`: ghế được xếp bằng `localeCompare(..., "vi", { numeric: true })`, cùng cách xếp với `ticket-data.ts:63` của web. Test `outbox-job.e2e-spec.ts` kiểm `"A2, A10, B1"` và `"A2, A10, B1, B3, C2, C12"` (dữ liệu vào cố ý lộn xộn) trên cả html lẫn text.
  - Với nhãn ghế dạng `<chữ><số>` của repo, kết quả trùng với cách xếp `(hàng, số)` của RPC. Chỉ khác ở trường hợp lý thuyết khi nhãn có hậu tố chữ.
- **F3 (LOW) — ĐÃ ĐÓNG, chấp nhận được.** File `checkin.service.ts:60`: `seatCount = seats.length`, bỏ qua `seat_count` của RPC.
  - RPC tính `seat_count = jsonb_array_length(v_seats)`, tức đúng độ dài của cùng mảng (`20261117130000_order_level_qr_fixes.sql:385-386`). Vì vậy với dữ liệu hợp lệ hai giá trị luôn bằng nhau.
  - Lấy từ mảng đã lọc thì không bao giờ xảy ra chuyện màn hình ghi "N ghế" mà chỉ liệt kê được M ghế. Không mất thông tin, vì RPC không có trường hợp `seat_count` khác độ dài mảng.
  - Test (`checkin.e2e-spec.ts`) đã cập nhật: `seat_count: "2"` → 2, và `seats` không phải mảng → 0.
- **F4 (INFO) — ĐÃ ĐÓNG.** File `rls-scope.int-spec.ts:478-537`.
  - Ca mới tạo đơn 3 ghế (`A1, A2, A10`) rồi quét bằng `orders.qr_token` một lần. Kết quả mong đợi: `OK`, `order.seats` đúng thứ tự tự nhiên, `seatCount` 3, body không chứa token, cả 3 vé có `checked_in_at`; quét lần 2 ra `USED`. Ca này chạy trên RPC thật và đã pass.
  - Ca WRONG_CINEMA thêm `a.orderQrToken` vào danh sách bí mật cấm lộ (`:554`).
- **F5, F6 (INFO):** giữ nguyên như round 1. Cả hai có từ trước, đã ghi ở decisions.md, ngoài phạm vi task.

## Findings mới

1. **INFO — Ca WRONG_CINEMA vẫn chỉ quét bằng token vé cũ.** File `rls-scope.int-spec.ts:546-547` quét bằng `a.qrToken`. Chưa có ca sai rạp quét bằng `orders.qr_token`. Rủi ro thấp: nhánh sai rạp của RPC không phụ thuộc vào cách tìm ra đơn, và pgTAP 063 đã cover. Không chặn.

Không có finding CRITICAL, HIGH hay MEDIUM.

## Verdict: **STRICT PASS**
