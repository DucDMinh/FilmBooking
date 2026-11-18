# Spec Update — 2026-11-18 cinema-status-notice
**spec_version:** 3.3.0 → 3.4.0 (MINOR — thêm requirement R-136, R-137 và đổi hành vi R-33)
**Trigger:** feature-update (MODIFY) · `spec/changes/2026-11-18-cinema-status-notice.md` (CR-009) · `tasks/feature-cinema-status-notice/phase-1-task-01.md` (DB, STRICT PASS round 2), `phase-1-task-02.md` (mail, NORMAL PASS round 2), `phase-2-task-03.md` (API, STRICT PASS), `phase-3-task-04.md` (web, NORMAL PASS round 1)

## Requirements
Yêu cầu của user (2026-11-18): "user click vào rạp đã đóng cửa thì thông báo đã đóng cửa, không để lỗi 404. Bất cứ thao tác nào của admin liên quan đến việc đóng/mở, tạm dừng rạp đều phải thông báo đến khách hàng trước 7 ngày ... khi admin chọn 'đóng cửa' thì 7 ngày sau mới chính thức đóng, đồng thời gửi mail đến toàn bộ khách hàng ...". Làm rõ ở checkpoint: mọi đổi trạng thái (không chỉ đóng cửa) hiệu lực sau đúng 7 ngày; bỏ điều kiện "phải huỷ hàng loạt trước khi đóng rạp"; đến hạn hệ thống tự huỷ suất còn lại, không email từng đơn; không chặn bán vé trong 7 ngày chờ.

- **THÊM R-136 (Đổi trạng thái rạp hiệu lực sau 7 ngày + báo khách)**: mọi đổi trạng thái rạp do Admin thực hiện (đóng cửa / tạm đóng / mở lại / sắp khai trương → mở) không hiệu lực ngay: rạp giữ nguyên trạng thái, có lịch đổi (trạng thái hẹn + ngày hiệu lực = đúng 168 giờ sau lúc xác nhận) và email gửi toàn bộ khách (mọi tài khoản có email đã xác nhận). Hẹn lại = thay lịch cũ (tính lại 7 ngày, gửi lại email). Hẹn đúng trạng thái hiện tại: đang có lịch = **huỷ lịch** (email đính chính tới toàn bộ khách), không có lịch = bị từ chối. Đến hạn job tự áp dụng và xoá lịch. Không có đường đổi tức thì nào (kể cả `PATCH /cinemas/:id`). Chỉ Admin (Manager không có quyền).
- **THÊM R-137 (Trang rạp không hoạt động)**: `/rap/<mã>` của rạp Tạm đóng / Ngừng hoạt động / Sắp khai trương → HTTP 200 với thông báo trạng thái + tên rạp + đường về danh sách rạp, không lịch chiếu, không 404; mã không tồn tại vẫn 404; rạp Đang hoạt động có lịch đổi → banner ngày hiệu lực.
- **SỬA R-33 (Đóng cửa rạp)**
  - Cũ: rạp còn suất tương lai đã bán vé → **bắt buộc** chạy huỷ hàng loạt (R-108, kèm email) **trước khi** cho đổi trạng thái rạp.
  - Mới: bỏ điều kiện chặn đó. Khách có vé suất sau ngày đóng cửa đến tận rạp hoàn tiền trong 7 ngày báo trước (ngoài hệ thống); đến ngày hiệu lực hệ thống **tự huỷ** các suất tương lai còn lại, đơn `paid` → `affected` (Admin ghi nhận các khoản đã hoàn thủ công ở màn Đơn bị ảnh hưởng — R-110; quá hạn rạp không giải quyết hoàn tiền thêm), **không** gửi email từng đơn. Rạp mọi trạng thái khác Đang hoạt động (kể cả Sắp khai trương) không hiện suất mới và không có trong danh sách rạp.
- **SỬA R-32**: ghi chú mọi đổi trạng thái rạp hiệu lực sau 7 ngày + báo khách (R-136).
- **SỬA R-37**: ghi chú rạp không Đang hoạt động xem R-137.
- **SỬA R-108**: thao tác tay "tất cả suất tương lai của một rạp" vẫn gửi email từng đơn (R-109); bỏ gắn với "khi đóng cửa".
- **SỬA R-109**: nhánh "đóng cửa rạp" thành "job áp dụng lịch đóng cửa rạp (R-136): không gửi email từng đơn — khách đã nhận thông báo 7 ngày trước".
- **SỬA R-134**: ngoại lệ rạp đóng cửa = khách đến tận rạp hoàn tiền thủ công trong 7 ngày báo trước; sau ngày đóng cửa đơn suất tương lai → `affected` để ghi nhận.
- **SỬA NFR-17**: thêm test lịch đổi trạng thái rạp 7 ngày (R-136).
- **SỬA AC-26** (viết lại): Admin chọn "Đóng cửa" → rạp vẫn hoạt động, có lịch đóng sau đúng 7 ngày, mọi khách nhận email; đến hạn rạp `CLOSED`, suất bị huỷ, đơn `paid` → `affected`, không email từng đơn. (Cũ: hệ thống yêu cầu huỷ hàng loạt 3 suất trước khi cho đổi trạng thái.)
- **THÊM AC-27** (hẹn lịch, email `CINEMA_STATUS_NOTICE` cho mọi tài khoản đã xác nhận, `PATCH /cinemas/:id` không đổi được `status`, hẹn trùng trạng thái = huỷ lịch/từ chối, hẹn lại thay lịch, chỉ Admin), **AC-28** (trang rạp đóng: 200 + thông báo; mã sai 404; banner), **AC-29** (lịch chuyển sang OPEN đến hạn: không huỷ suất/đơn nào), **AC-30** (dialog admin nêu ngày hiệu lực + nhãn lịch chờ + huỷ lịch).
- `SPECIFICATIONS.md` ngoài các requirement trên còn đổi: frontmatter (`spec_version` 3.4.0, `source`), mục Dữ liệu (rạp có lịch đổi trạng thái), mục "Quyết định PO 2026-11-18", bảng truy vết (BR-CHN-02→R-33,R-136; BR-CHN-06→R-37,R-137; BR-ADM-02→R-32; dòng CR cinema-status-notice) và dòng "Tổng (spec 3.4.0)": 137 mã requirement (R-01…R-137), 125 còn hiệu lực (112 MVP, 13 GĐ2), AC 26/26 còn hiệu lực.

## Lý do
Đóng cửa rạp tức thì (hoặc chặn bằng huỷ hàng loạt) không cho khách thời gian xử lý vé đã mua; PO muốn báo trước 7 ngày cho mọi đổi trạng thái rạp và để khách tự đến rạp hoàn tiền trong thời gian đó. Trang rạp đã đóng trả 404 gây hiểu nhầm là lỗi hệ thống.

## Thay đổi hiện thực (as-built)
- **DB** (`supabase/migrations/20261118100000_cinema_status_schedule.sql`, `20261118110000_cinema_status_schedule_fixes.sql`):
  - Cột `cinemas.scheduled_status`, `cinemas.scheduled_effective_at` (check cùng null / cùng có) + partial index.
  - **Đổi quyền cột `cinemas` của `authenticated`**: thu UPDATE bảng, chỉ grant UPDATE theo cột (không có `status`, `scheduled_*`); INSERT theo cột (không `scheduled_*`; `status` giữ để tạo rạp COMING_SOON). Không còn đường PostgREST đổi trạng thái tức thì.
  - RPC mới `schedule_cinema_status(uuid, cinema_status)` (Admin; hẹn lịch +7 ngày, xếp hàng email `CINEMA_STATUS_NOTICE` cho mọi tài khoản đã xác nhận, huỷ lịch + email đính chính); **gỡ** `set_cinema_status`.
  - `cancel_showtimes` tách thành `cancel_showtimes_core(..., p_send_emails)` (nội bộ) + `cancel_showtimes` công khai giữ hành vi cũ.
  - `apply_due_cinema_status_changes()` (service_role) + job **pg_cron `apply-cinema-status-changes` mỗi phút**: đến hạn đổi status, xoá lịch, đích khác OPEN → huỷ suất tương lai (đơn `paid` → `affected`, không email từng đơn); lỗi một rạp không chặn rạp khác.
  - Khoá dòng rạp `FOR NO KEY UPDATE` (tránh deadlock với hold_seats/confirm_paid). Gắn **HIGH_RISK_MIGRATION** (đổi quyền cột, DROP function, job huỷ hàng loạt); rollback ghi trong migration.
- **API**: `PATCH|POST /admin/cinemas/:id/status` và `/cinemas/:id/status` hẹn lịch (Admin), trả `{ success, cinemaId, status, scheduledStatus, scheduledEffectiveAt, emailsEnqueuedCount }`, bỏ 409 `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES`; `PATCH /cinemas/:id` từ chối `status` khác hiện tại (VALIDATION_ERROR); `GET /cinemas/:code` trả 200 cho mọi rạp tồn tại (rạp không OPEN → `rooms: []`, `showtimes: []`), mã sai 404; `GET /cinemas` vẫn chỉ OPEN; `CinemaDto` thêm `scheduledStatus`, `scheduledEffectiveAt`.
- **Mail**: kind `CINEMA_STATUS_NOTICE` (`templates.ts`, `renderCinemaStatusNoticeEmail`): đóng cửa/tạm đóng (khách có vé suất từ ngày hiệu lực trở đi đến tận rạp hoàn tiền trước hạn chót, sau đó không giải quyết), mở lại / khai trương, mail đính chính khi huỷ lịch.
- **Web**: `/rap/[code]` rạp không OPEN → trang thông báo (`cinema-closed-notice.tsx`, noindex, không JSON-LD/bản đồ/lịch chiếu), banner cho rạp OPEN có lịch (`lib/cinema-schedule.ts`); Admin `cinema-status-dialog.tsx` giải thích quy tắc 7 ngày + nhãn lịch chờ + huỷ lịch; `cinema-form.tsx` sửa rạp không gửi `status`.
- **Docs as-built**: `docs/API_SPEC.md`, `docs/ERD.md`, `docs/DESIGN.md`, `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` (GAP-021), `docs/specs/2026-11-10-filmbooking-mvp-design.md`.

## Ảnh hưởng
- Module: `supabase-cinema-status-schedule` (migration, RPC, pg_cron, quyền cột), `api-cancellation`, `api-catalog-cinemas`, `api-mail-templates`, `shared-schemas`, `web-rap-detail`, `web-admin-cinema-status`. Test: pgTAP 066, 067 (mới), 010, 043, 048 (cập nhật), `cancellation.e2e-spec`, `catalog.e2e-spec`, `cancel-showtime.int-spec`, `catalog-public.int-spec`, `mail-templates.spec`, web `rap/[code]/page.test`, `catalog-admin.test`, `shell.test`, `cinemas.test`, `home.test`.
- Test luồng: Admin hẹn đóng/tạm đóng/mở lại/sắp mở, hẹn lại thay lịch, hẹn trùng trạng thái (huỷ lịch / từ chối), Manager bị chặn; email cho mọi tài khoản đã xác nhận; job áp dụng đến hạn (huỷ suất, `paid` → `affected`, không email từng đơn; mở lại không huỷ gì); `/rap/<mã>` rạp không OPEN trả 200 + thông báo, mã sai 404, banner rạp OPEN có lịch; PATCH rạp không đổi được status.
- Regression: `cancel_showtimes` sau refactor core (R-108/R-109, email từng đơn vẫn gửi), quyền cột `cinemas` cho Manager/Admin (sửa thông tin rạp, tạo rạp), bán vé `hold_seats`/`confirm_paid` (`CINEMA_NOT_OPEN`), danh sách rạp và lịch chiếu công khai, màn Đơn bị ảnh hưởng / ghi nhận hoàn tiền (R-110), job gửi email outbox, SEO JSON-LD trang rạp.
- Doc impact: có (`docs/API_SPEC.md`, `docs/ERD.md`, `docs/DESIGN.md`, GAP-021, design doc cũ đã reconcile). Intent doc `docs/BRD.md`: **chưa cập nhật** (BR-CHN-02, AC-26, §7.3, BR-ADM-13, Q3 vẫn ghi quy tắc cũ "huỷ hàng loạt trước khi đóng rạp"); theo Quyết định PO 2026-11-18, R-33/R-136/R-137 thắng cho tới khi có CR riêng sửa BRD.

## Residual
- **Khoảng hở PO đã chấp nhận**: trong 7 ngày chờ **không chặn bán vé mới** cho suất sau ngày hiệu lực; khách mua trong thời gian đó không nhận email riêng, đến hạn suất bị huỷ, đơn → `affected` (hoàn tiền thủ công ngoài hệ thống).
- `docs/BRD.md` chưa cập nhật (xem trên).
- Từ spec-validator phase-end (không có CRITICAL/HIGH mở): G-1 chính sách "sau hạn không giải quyết" vs đơn `affected` vẫn ghi nhận hoàn tiền thủ công (R-33 đã làm rõ một câu, cần PO xác nhận); G-2 `/rap/<mã>` lỗi 5xx của API hiện 404; G-3 suất **tạo mới** cho rạp không OPEN chưa được quy định/chặn (chưa kiểm hold_seats có chặn rạp không OPEN); G-4 mốc hạn chót theo ngày, hiệu lực theo giờ; G-5 nhánh `set_cinema_status` chết trong `cancellation.e2e-spec`; G-6 test API cho PATCH đổi status bị từ chối cần xác nhận.
- Chưa kiểm giao diện thật (375/768/1280) và chưa chạy tay luồng email thật; API đang chạy phải build + restart; job áp dụng lịch chỉ được đăng ký khi extension `pg_cron` có (không có → lịch đến hạn không tự áp dụng, phải gọi `apply_due_cinema_status_changes()` tay).
- **HIGH_RISK_MIGRATION**: đổi quyền cột `cinemas`, DROP `set_cinema_status`, job huỷ hàng loạt; không promote production khi chưa verify staging.

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 26, specVersion 3.4.0, trigger `feature-update`, risk **high** (đổi quyền DB, job huỷ hàng loạt, email hàng loạt). Các mục scope cũ về AC-26 "huỷ hàng loạt trước khi cho đổi trạng thái" và "chuyển rạp Tạm đóng → email huỷ suất" được đánh dấu bị thay thế bởi v26.
