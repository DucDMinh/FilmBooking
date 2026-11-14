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
| GAP-008 | R-38, R-47, R-48 | Không có đường click tới trang phòng/sơ đồ: sidebar `/admin/phong` dead, thiếu link từ `/admin/rap` và `/admin/rap/[id]` | layer-7 phase review | Đã sửa: link phòng ở trang rạp + `resolveNavHref` theo scope (layer-7 task-10) | resolved |
| GAP-009 | R-110 | Thiếu trường phương thức hoàn tiền thủ công (bắt buộc spec) | layer-7 phase review (task-06) | Thêm `refundMethod` vào schema + form + API | planned (P1, BACKLOG CR-005) |
| GAP-010 | R-105, NFR-06 | API không chặn Admin tự khoá/tự gỡ; không guard Admin cuối cùng ở DB | task-07 r2 MINOR-4 | Backlog API | planned (P1, BACKLOG CR-004) |
| GAP-011 | R-53 | `/admin/ngay-le` không trong nav | layer-7 task-04 | Đã thêm nav Ngày lễ (ADMIN) — layer-7 task-10 | resolved |
| GAP-012 | R-110 | Filter email status client-side trên trang phân trang | task-06 r2 | Server filter | open (P2) |
| GAP-013 | R-104, AC-11 | `needs-manual-review` không lọc resolved (layer-5 owner); `/admin/todo` không có cinemaId | task-05 r2 | Server filter + cinemaId | open (P2) |
| GAP-014 | R-116 | Đối soát PayOS thiếu tổng theo rạp, danh sách đầy đủ, filter ngày | task-08 r2 | Backlog API + UI | open (P2) |
| GAP-015 | R-90 | Voucher thiếu lượt đã dùng; validFrom/To theo TZ trình duyệt | task-04 | usedCount + TZ server | open (P2) |
| GAP-016 | R-108 | Dialog huỷ chưa liệt kê suất/email/toast (B20) | task-03 F4 | Bổ sung | open (P2; gộp đề xuất GAP-017) |
| GAP-018 | R-55 | SeatMap admin không realtime (B19); seatmap lỗi → UI coi 0 vé bán | task-03 F6, N1 | Realtime/polling; hiển thị lỗi | open (P3) |
| GAP-019 | R-47 | Không đổi grid sau tạo; editor chưa read-only khi có suất sắp chiếu; N+1 GET sơ đồ | task-02 | Backlog | open (P3) |
| GAP-020 | R-41, R-47 | Bảng rạp/phim: nhãn trạng thái, multi-select, MapView, cột Quản lý | task-01 N2 | Chấp nhận demo | accepted (cần PO) |
| GAP-021 | R-33, AC-26 | Cảnh báo đóng rạp thiếu chi tiết suất | task-01 N1 | Bổ sung | open (P3) |
| GAP-022 | R-32 | PATCH rạp + settings không atomic; ảnh mồ côi; upload chưa rate limit | task-01 N4/N5 | Transaction + cleanup | open (P3) |
| GAP-023 | R-52 | Chưa confirm dialog đổi giá; lỗi reload bị nuốt | task-04 r2 | UI polish | open (P3) |
| GAP-024 | R-105, R-107 | Dialog gán 1 rạp/lần; audit actor id rút gọn | task-07 r2 | Multi-select; join tên | open (P3) |
| GAP-025 | R-103 | Tìm mã đặt vé exact ở client | task-05 | Exact match server | open (P3) |
| GAP-026 | R-106 | Màn cấu hình lệch design | task-07 r2 | UI polish | open (P3) |
| GAP-027 | spec 3.0.0 | Leftover nhãn `EXCHANGED` trong `order-utils.ts` (đổi suất đã bỏ) | layer-7 phase review | Đã xoá — layer-7 task-10 | resolved |

## Follow-up kỹ thuật (không phải gap intent)

- Payment: reconcile không quét payment `CANCELLED` còn link sống (huỷ link PayOS lỗi); lỗi DB khi update đơn trong createPayment trả 409 sai thông điệp; `cancel_stale_payment` đơn không tồn tại bị đếm `cancelled`.
- cancelUrl `/xac-nhan`: đơn vẫn `pending_payment` tới webhook/reconcile → nút Thanh toán còn hiện (createPayment huỷ link cũ khi tạo mới — an toàn, cần theo dõi UX).
- Web: CTA sticky mobile màn 08; màn `/ket-qua` đơn `affected` tiêu đề sai; focus trap overlay QR + soát vé; staff kết quả NOT_FOUND/NOT_PAID hiện token khi quét QR; ngưỡng check-in 30' hardcode ở client.
- test:int: chưa có dọn dữ liệu của lần chạy bị crash trước `afterAll`.
