# Technical Requirement Gaps (gap register)

> As-built ≠ intent. **Không** hạ cấp intent (`SPECIFICATIONS.md`, design-spec) cho khớp code. Mỗi gap đóng bằng code (hoặc Change Request nếu đổi intent).
> Status: `open` · `planned` (đã có task) · `resolved` · `accepted` (PO chấp nhận lệch, cần CR ghi intent).

| ID | Req | Gap (as-built) | Nguồn | Hướng xử lý | Status |
|---|---|---|---|---|---|
| GAP-001 | R-98 | Kết quả soát vé OK không có nhãn tuổi — `checkin_ticket` / `checkin.service.ts` không trả `ageRating` | layer-6 phase review | API trả age rating từ movie của suất → web `checkin-result.tsx` hiển thị | open |
| GAP-002 | R-98, design §17 | Không có bước "Xác nhận check-in" riêng: RPC `checkin_ticket` check-in ngay khi quét | layer-6 task-06 review | Giữ như as-built (demo); nếu cần 2 bước → CR + RPC preview | open |
| GAP-003 | R-98 | Không có kết quả "Sai suất" riêng (RPC chỉ có WRONG_CINEMA / TOO_EARLY / EXPIRED) | layer-6 phase review | PO quyết map; mặc định giữ as-built | open |
| GAP-004 | R-64 | Web không có ConfirmDialog khi khách đang giữ đơn ở suất khác; API trả `HOLD_EXISTS` → toast | layer-6 task-03 review | API endpoint đơn đang giữ + dialog ở màn chọn ghế | open |
| GAP-005 | R-67 | Web hardcode đóng bán online 15' trước suất; API chưa expose cutoff cấu hình theo rạp | layer-6 task-03 review | Seatmap/showtime API trả `salesCloseAt` → web dùng | open |
| GAP-006 | design màn 09 | Không build màn VietQR riêng: màn 08 redirect thẳng PayOS checkout (PayOS hiển thị VietQR) — quyết định dispatcher 2026-11-13 | layer-6 task-04 | Accepted cho demo; nếu cần màn riêng → API trả lại checkoutUrl/QR | accepted |
| GAP-007 | R-87, design 11/32 | `/ve` 2 section "Sắp tới / Đã qua" thay Tabs "Sắp tới / Đã xem"; QR dùng Wake Lock, không chỉnh độ sáng | layer-6 task-05 review | UI polish | open |

## Follow-up kỹ thuật (không phải gap intent)

- Payment: reconcile không quét payment `CANCELLED` còn link sống (huỷ link PayOS lỗi); lỗi DB khi update đơn trong createPayment trả 409 sai thông điệp; `cancel_stale_payment` đơn không tồn tại bị đếm `cancelled`.
- cancelUrl `/xac-nhan`: đơn vẫn `pending_payment` tới webhook/reconcile → nút Thanh toán còn hiện (createPayment huỷ link cũ khi tạo mới — an toàn, cần theo dõi UX).
- Web: CTA sticky mobile màn 08; màn `/ket-qua` đơn `affected` tiêu đề sai; focus trap overlay QR + soát vé; staff kết quả NOT_FOUND/NOT_PAID hiện token khi quét QR; ngưỡng check-in 30' hardcode ở client.
- test:int: chưa có dọn dữ liệu của lần chạy bị crash trước `afterAll`.
