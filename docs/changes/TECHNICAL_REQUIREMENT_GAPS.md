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
| GAP-028 | R-04, R-05 (e2e đăng ký/xác nhận email) | Chưa có e2e "đăng ký → xác nhận email Inbucket": Turnstile thật chặn đăng ký qua UI; e2e dùng user tạo qua GoTrue admin `email_confirm` | layer-8 task-05 | Truyền Turnstile test secret "luôn pass" qua env webServer hoặc mock Turnstile; hiện test email chỉ tới outbox (int-test) | open |
| GAP-029 | R-75 (đối chiếu số tiền webhook) | `confirm_paid` nhánh lệch tiền: giữ payment `PENDING` nhưng ghi đè `amount` bằng số tiền webhook; chỉ ghi `payment_events` AMOUNT_MISMATCH | layer-8 task-03 review | Không ghi đè `amount` khi lệch; thêm assert payment ở int-test | open |
| GAP-030 | R-38 (catalog) | `GET /movies` 500 trên DB thật vì thiếu FK `showtimes.cinema_id → cinemas` (test catalog toàn mock nên lọt); `/`, `/phim`, `/lich-chieu` 500 khi rỗng (EmptyState/`getVnDateString` qua ranh giới client) | layer-8 task-06 | Đã sửa: migration `20261114190000` + int-test catalog-public (task-08); bỏ `"use client"` ở states.tsx + `lib/vn-date.ts` (task-09) | resolved |
| GAP-031 | NFR-01 (LCP ≤ 2,5s) | Chưa có số đo LCP cho `/`, `/phim`, chi tiết phim, chi tiết rạp: DB local rỗng nên chỉ đo được `/rap` (922ms); Lighthouse CI (`lighthouserc.json`, cổng 3200) chưa chạy trên dữ liệu thật; AC Lighthouse của task-06 đã bỏ tick | layer-8 phase review | Đo trước deploy (layer 9, staging có dữ liệu): chạy `lhci autorun` cho `/`, `/phim`, `/phim/<slug>`, `/rap/<code>`; ghi số đo vào task-06 | open (P1) |
| GAP-032 | AC-19 | e2e rạp mới chưa assert rạp mới xuất hiện ở `/rap` và chưa thanh toán ở rạp mới; sơ đồ ghế/suất dựng qua API, UI chỉ tới bước giữ ghế/xác nhận | layer-8 phase review | Bổ sung assert `/rap` + đi hết thanh toán mock ở rạp mới | open (P2) |
| GAP-033 | AC-04, AC-05, R-19, R-24 | OAuth Google/Facebook thật chưa kiểm: int-test chỉ mô phỏng `guard_identity_insert`; checklist kiểm tay 4 mục ở task-04 chưa tick | layer-8 phase review | Kiểm tay trên staging có OAuth app thật (layer 9) | open (P2, manual) |
| GAP-034 | NFR-14 | Cảnh báo "tỷ lệ lỗi giữ ghế tăng" là cảnh báo theo từng sự kiện lỗi, chưa có ngưỡng tỷ lệ theo cửa sổ thời gian | layer-8 task-06 | Cấu hình alert rule ở Sentry khi deploy hoặc đếm tỷ lệ trong API | open (P3) |
| GAP-035 | NFR-01 (giữ ghế p95 ≤ 1s) | Burst 100 hold đồng thời p95 ~1,4–2,9s KHÔNG gate; gate p95 ≤ 1s chỉ ở tải theo nhịp 20/s; spec không nêu tải đỉnh | layer-8 task-01 | PO chốt mô hình tải đỉnh; nếu cần thì tối ưu `hold_seats`/pool | open (P2, cần PO) |
| GAP-036 | AC-06, AC-07, AC-08, NFR-03 | Residual nhỏ chưa có bằng chứng: thông báo cho người thua khi tranh ghế; hết hạn giữ ≤ 2s chưa đo ở int; địa chỉ rạp trên màn xác nhận chưa assert; kênh realtime tách theo suất chưa test | layer-8 phase review | Bổ sung assert khi có dịp; không chặn deploy demo | open (P3) |

## Follow-up kỹ thuật (không phải gap intent)

- Payment: reconcile không quét payment `CANCELLED` còn link sống (huỷ link PayOS lỗi); lỗi DB khi update đơn trong createPayment trả 409 sai thông điệp; `cancel_stale_payment` đơn không tồn tại bị đếm `cancelled`.
- cancelUrl `/xac-nhan`: đơn vẫn `pending_payment` tới webhook/reconcile → nút Thanh toán còn hiện (createPayment huỷ link cũ khi tạo mới — an toàn, cần theo dõi UX).
- Web: CTA sticky mobile màn 08; màn `/ket-qua` đơn `affected` tiêu đề sai; focus trap overlay QR + soát vé; staff kết quả NOT_FOUND/NOT_PAID hiện token khi quét QR; ngưỡng check-in 30' hardcode ở client.
- test:int: chưa có dọn dữ liệu của lần chạy bị crash trước `afterAll`.
- Layer 8 (MINOR từ review, không mở task): pgTAP 090:158-159 xanh giả (23514 do fixture EXCHANGED, không kiểm policy theo rạp; đã phủ ở 031:258); rls-scope mã đặt vé theo runId đảo có xác suất ~1/4096; hold-expiry flake do pg_cron expire giữa backdate và assert (hold-expiry:83,87); env `IT_*` không chặn sàn; gộp helper `api-app.ts` / `app-harness.ts`; cleanup `email_outbox`/`payment_events`/`audit_logs` sót ở int-test task-03; `rate_limit_buckets` do int-test để lại làm pgTAP 032#18 fail (dọn bằng `purge_expired_ops_data()`); pgTAP 062 ca 1 nên thêm `confdeltype='r'`; FK `showtimes_cinema_id_fkey` validate khóa bảng (chấp nhận trên DB demo local).
- Layer 8 (web): `showtime-schedule.tsx` còn re-export + giữ `formatVnTime`/`isShowtimeOnlineClosed`/`generateNext7Days` trong module client (nên chuyển sang `lib/`); chưa có test chặn server import hàm từ module client; chưa kiểm `/ve`, `/rap/[code]`, `/phim/[slug]`, `/dat-ve/[showtimeId]` với DB rỗng.
- Layer 8 (scope/dọn): task-06 sửa nhiều file ngoài Files list (booking.service, webhook.controller, jobs.controller, layout/error, movie-card, lib/images, showtime-schedule) — reviewer STRICT PASS, ghi nhận scope drift; `RESEND_FROM_EMAIL` có trong `.env.example` nhưng code không đọc; fixture `EXCHANGED` ở `supabase/tests/090:122,123,158` là tàn dư tính năng đã bỏ (không phải POS).
- Layer 8 (test): FakeDb `booking.e2e-spec.ts:643,875` và `orders-report.e2e-spec.ts:611,1163` còn mô phỏng PGRST200 cho embed showtimes→cinemas (không còn đúng schema thật); e2e không nằm trong `pnpm typecheck`, `e2e/support/data.ts` import supabase-js qua `apps/api/node_modules`; `.github/workflows/e2e.yml` chưa chạy thật; e2e `listUsers` chỉ 1 trang; mobile-360 là mô phỏng viewport Chromium.
- Layer 8 (perf/obs): burst 100 hold cùng lúc p95 ~1,4–2,9s KHÔNG gate (gate p95 ≤ 1s ở ca theo nhịp 20/s theo NFR-02); Lighthouse `/` và `/phim` chưa đo (cần DB có dữ liệu).

