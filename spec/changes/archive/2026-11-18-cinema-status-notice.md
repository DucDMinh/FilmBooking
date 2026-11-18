---
id: cinema-status-notice
type: feature
status: done
created: 2026-11-18
---

# Rạp đóng cửa: thông báo thay vì 404; mọi đổi trạng thái rạp phải báo khách trước 7 ngày

## Yêu cầu
User (2026-11-18): "user click vào rạp đã đóng cửa thì thông báo đã đóng cửa, không để lỗi 404. Bất cứ thao tác nào của admin liên quan đến việc đóng/mở, tạm dừng rạp đều phải thông báo đến khách hàng trước 7 ngày. Tức là khi admin chọn "đóng cửa" thì 7 ngày sau mới chính thức đóng, đồng thời gửi mail đến toàn bộ khách hàng. Thông báo chung chung kiểu rạp A sẽ đóng cửa, toàn bộ khách hàng đã đặt vé sau ngày đóng cửa cần đến tận rạp để hoàn tiền, sau thời gian đó sẽ không giải quyết, cái này thì bạn tự nghĩ văn".

Làm rõ thêm với user (checkpoint 2026-11-18):
- Thời hạn hoàn tiền = **đúng 7 ngày từ lúc gửi mail đến lúc đóng cửa** (đóng cửa rồi thì không còn ai hoàn tiền); mail ghi hạn chót = ngày hiệu lực.
- Phạm vi: **mọi đổi trạng thái** (đóng cửa, tạm đóng, mở lại, sắp khai trương → mở) đều hiệu lực sau 7 ngày + email toàn bộ khách. Sửa thông tin rạp (tên, địa chỉ…) không bị ảnh hưởng.
- Suất đã bán vé: **bỏ** điều kiện "phải huỷ hàng loạt trước khi đóng rạp" (R-33/AC-26 cũ). Đến ngày hiệu lực (đóng/tạm đóng) hệ thống **tự huỷ** các suất tương lai còn lại của rạp, đơn `paid` → `affected` (để admin ghi nhận hoàn tiền ở màn "Đơn bị ảnh hưởng"); **không** gửi thêm email từng đơn (khách đã được báo, hạn hoàn tiền đã qua).
- Trong 7 ngày chờ: **không chặn** bán vé mới (ghi nhận rủi ro còn lại).

## Hiện trạng (bằng chứng code)
- 404: `CinemasService.detailPublic` chỉ chọn `status = 'OPEN'` (`apps/api/src/modules/catalog/cinemas.service.ts:141`) → rạp đóng ném `NOT_FOUND`; `rap/[code]/page.tsx` gọi `notFound()`.
- Đổi trạng thái tức thì: RPC `set_cinema_status` (chặn khi còn suất đã bán, AC-26) qua `PATCH|POST /admin/cinemas/:id/status` và `/cinemas/:id/status`; ngoài ra `PATCH /cinemas/:id` có `status` (`cinemas.service.ts:update`) cũng đổi tức thì → phải chặn đường vòng.

## Hợp đồng giữa các task
- DB: `cinemas.scheduled_status cinema_status null`, `cinemas.scheduled_effective_at timestamptz null` (cả hai cùng null hoặc cùng có; `scheduled_effective_at = lúc hẹn + 7 ngày` đúng 7×24h). RPC `schedule_cinema_status(p_cinema_id, p_status)` (Admin/service_role): `p_status` = trạng thái hiện tại: **đang có lịch chờ → huỷ lịch** (xoá `scheduled_*`, enqueue email đính chính cùng kind với payload `schedule_cancelled: true`), không có lịch → từ chối `STATUS_UNCHANGED`; ghi lịch (hẹn lại = thay lịch cũ, tính lại 7 ngày, gửi lại email); enqueue `email_outbox` kind `CINEMA_STATUS_NOTICE` tới mọi tài khoản có email đã xác nhận (mỗi email 1 dòng). Hàm nội bộ `apply_due_cinema_status_changes()` chạy pg_cron mỗi phút: tới hạn → đổi `status`, xoá lịch; nếu trạng thái mới khác `OPEN` (`TEMP_CLOSED`/`CLOSED`/`COMING_SOON` — rạp không bán vé) thì huỷ các suất tương lai còn lại (suất → `CANCELLED`, nhả ghế giữ, đơn `paid` → `affected`, **không** enqueue email từng đơn). `authenticated` không còn quyền `update` cột `status`/`scheduled_*` của `cinemas`; `anon`/`authenticated` được `select` hai cột `scheduled_*` (banner trang rạp). RPC `set_cinema_status` (tức thì) bị gỡ.
- Email payload `CINEMA_STATUS_NOTICE`: `cinema_name`, `cinema_code`, `cinema_address`, `hotline`, `target_status`, `effective_at`, `customer_name?`. Template `renderCinemaStatusNoticeEmail`: đóng cửa/tạm đóng (khách có vé suất sau ngày hiệu lực đến tận rạp hoàn tiền trước hạn chót, sau đó không giải quyết), mở lại / khai trương (báo ngày mở).
- API: `PATCH|POST /admin/cinemas/:id/status` và `/cinemas/:id/status` giờ **hẹn lịch** (Admin), trả `{ success, cinemaId, status (hiện tại), scheduledStatus, scheduledEffectiveAt, emailsEnqueuedCount }`; bỏ nhánh 409 `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES`. `PATCH /cinemas/:id` từ chối `status` khác hiện tại (VALIDATION_ERROR). `GET /cinemas/:code` (public) trả **200 cho mọi rạp tồn tại** kèm `cinema.status`; rạp không `OPEN` → `rooms: []`, `showtimes: []`. Mã rạp không tồn tại vẫn 404. `GET /cinemas` (danh sách) vẫn chỉ `OPEN`. `CinemaDto` thêm `scheduledStatus`, `scheduledEffectiveAt` (nullable).
- Web: `/rap/[code]` rạp không `OPEN` → trang thông báo ("đã đóng cửa" / "tạm đóng cửa" / "sắp khai trương") + nút về danh sách rạp, **không** `notFound()`; rạp `OPEN` đang có lịch → banner "Rạp sẽ … từ <ngày>". Admin: dialog đổi trạng thái giải thích quy tắc 7 ngày (ngày hiệu lực) + xác nhận; danh sách rạp hiện nhãn lịch đang chờ.

## Acceptance (bắt buộc)
- [x] Khách mở `/rap/<mã rạp>` của rạp `CLOSED`/`TEMP_CLOSED`/`COMING_SOON` → thấy thông báo tương ứng (HTTP 200, có tên rạp, link về danh sách rạp), **không** 404; mã rạp sai vẫn 404; rạp `OPEN` không đổi.
- [x] Admin chọn "Đóng cửa" (hoặc Tạm đóng / Mở lại / Sắp mở) → rạp **giữ nguyên trạng thái** ngay lúc đó, có lịch `scheduled_status` + `scheduled_effective_at` = +7 ngày; **mọi tài khoản** có email đã xác nhận nhận 1 email thông báo (nội dung đúng loại, ngày hiệu lực, hạn chót hoàn tiền = ngày hiệu lực).
- [x] Không có đường nào đổi `cinemas.status` tức thì: API `PATCH /cinemas/:id` với `status` đổi → bị từ chối; Manager/Admin qua PostgREST không update được cột `status`.
- [x] Đến ngày hiệu lực (job chạy): trạng thái đổi, lịch xoá; nếu đóng/tạm đóng: suất tương lai còn lại bị huỷ, đơn `paid` của các suất đó → `affected`, không gửi email từng đơn; rạp mở lại không huỷ gì.
- [x] Hẹn lại khi đang có lịch: lịch cũ bị thay, gửi lại email; hẹn đúng trạng thái hiện tại: đang có lịch → huỷ lịch + email đính chính (rạp tiếp tục hoạt động), không có lịch → bị từ chối.
- [x] Rạp có lịch chuyển sang `OPEN` đến hạn → `OPEN`, lịch xoá, không huỷ suất/đơn nào (AC-29). Chỉ Admin hẹn/huỷ lịch được; Manager bị chặn.
- [x] Màn Quản lý rạp: dialog nêu ngày hiệu lực +7 ngày + gửi email trước khi xác nhận, nhãn lịch chờ, nút huỷ lịch (AC-30).
- [x] Trang `/rap/<mã>` rạp `OPEN` có lịch → banner thông báo sắp đóng/mở và ngày hiệu lực.
- [x] pgTAP, test API, test web, test template mail, lint, typecheck PASS; verify thật trên stack local.

## Ghi chú
Sửa spec: R-32, R-33 (viết lại), R-37, R-108/R-109 (làm rõ), R-134, thêm R-136 (lịch đổi trạng thái 7 ngày, huỷ lịch), R-137 (trang rạp không hoạt động), AC-26 (viết lại), thêm AC-27..AC-30, NFR-17, mục Quyết định PO 2026-11-18 (BRD chưa cập nhật — CR riêng). Rủi ro còn lại: không chặn bán vé mới trong 7 ngày chờ cho suất sau ngày hiệu lực (khách vẫn được báo hoàn tiền ở email; sau đóng cửa đơn thành `affected`). Quy trình hoàn tiền tại quầy trong 7 ngày diễn ra ngoài hệ thống; admin ghi nhận sau ở "Đơn bị ảnh hưởng".

## Kết quả (2026-11-18)
spec 3.4.0, scope v26. Residual: chưa kiểm giao diện web thật trên trình duyệt (chỉ jsdom + API thật trên cổng riêng: /cinemas/HN02 200 CLOSED, mã sai 404, danh sách chỉ OPEN); không chặn bán vé trong 7 ngày chờ; BRD chưa cập nhật.
