Agent: spec-validator

# Phase review — build-filmbooking LAYER 7 (web admin), round 1

Ghi chú path: file này nằm đúng đường dẫn coordinator yêu cầu. Quy ước `round-<R>` không có trong tên file theo yêu cầu; file cũ `build-filmbooking-layer-7-phase-7-round-1-review.md` là bản nháp trước đó, có verdict GAPS FOUND đã được đính chính ở đây (xem mục "Đính chính"). Nên xoá bản nháp đó.

## Verdict: ❌ FAIL (1 blocker, sửa một dòng, không cần đổi kiến trúc)

Blocker: **luồng quản trị rạp → phòng → sơ đồ ghế không đi được bằng click chuột** (R-38 "tạo rạp → phòng → sơ đồ ghế → bảng giá → suất chiếu hoàn toàn qua trang quản trị"; R-47/R-48 của task-02).
- Trang danh sách phòng `apps/web/src/app/admin/rap/[id]/phong/page.tsx` và editor `.../phong/[roomId]/page.tsx` tồn tại.
- Không có link nào từ `apps/web/src/app/admin/rap/page.tsx` (chỉ link `/admin/rap/moi` và `/admin/rap/${id}`) hay `apps/web/src/app/admin/rap/[id]/page.tsx` tới `/phong`. Grep `/phong` trong `app/admin/rap` chỉ thấy link ngược về trang phòng.
- Sidebar `apps/web/src/components/admin/nav-config.ts:25` trỏ `/admin/phong`, route này không tồn tại → dead link.
- Kết quả: Admin/Manager chỉ vào được phòng và sơ đồ ghế khi gõ URL. Các AC của task-02 (sweetbox, lưu/reload, sao chép, bàn phím) đạt khi vào được trang, nhưng luồng sản phẩm bị đứt.
- Sửa tối thiểu: thêm link "Phòng & sơ đồ ghế" trong `app/admin/rap/[id]/page.tsx` tới `/admin/rap/${id}/phong`, và đổi `nav-config.ts:25` thành luồng chọn rạp (hoặc `/admin/rap`). Sau đó cập nhật `components/admin/__tests__/shell.test.tsx:153` đang khoá href cũ.

Các điểm đạt (không phải blocker):
- Nút "Thêm rạp" trỏ `/admin/rap/moi`. `apps/web/src/app/admin/rap/[id]/page.tsx:12, 22` xử lý `NEW_ID = "moi"` (isNew), nên luồng tạo rạp (AC-19, R-38 bước đầu) đi được. Không có folder `rap/moi` nhưng không cần: `[id]` bắt `moi`.
- AC-26 đạt: `components/admin/cinema-status-dialog.tsx:61-62, 83, 98-122` (CONFLICT → danh sách suất, link huỷ hàng loạt, không đổi trạng thái).

## Đính chính so với bản nháp
- Bản nháp ghi "Cả 4 AC" nhưng liệt kê 7 AC — đã sửa thành liệt kê đủ.
- Bản nháp ghi GAPS FOUND, không FAIL: sai, vì luồng phòng/sơ đồ không đi được bằng click là blocker (R-38/R-47).
- Bản nháp đánh dấu API_SPEC là residual: đã xác minh `docs/API_SPEC.md:48` có `GET /admin/cinemas` (mọi trạng thái, `roomCount`), `POST /admin/uploads`; `:49` vận hành rạp; `:65` có `GET /cinemas/:cinemaId/showtimes/:showtimeId`. ✅.

## Ma trận coverage (requirement | nguồn | trạng thái | evidence)

| Requirement / AC | Nguồn | Trạng thái | Evidence |
|---|---|---|---|
| AC-19 / R-38 tạo rạp mới, xuất hiện ở /rap | spec AC-19, R-38; task-01 | ⚠️ PARTIAL | Tạo rạp đi được (`admin/rap/[id]/page.tsx:12,22` NEW_ID); API `apps/api/src/modules/catalog/cinemas.controller.ts:50-76`. Phần phòng → sơ đồ ghế không click tới được (blocker F1). |
| AC-26 đóng rạp còn suất đã bán | spec AC-26; task-01 | ✅ | `cinema-status-dialog.tsx:61-62, 83, 98-122`; `cancellation.controller.ts:132-141`. Gap chi tiết suất G21. |
| R-32 CRUD rạp, Manager sửa rạp mình | spec R-32; task-01 | ✅ | `admin/rap/page.tsx:45-62`; reviewer r2 task-01 (STRICT PASS). |
| R-41 CRUD phim, upload poster/banner, chỉ Admin | spec R-41; task-01 | ✅ | `admin/phim/page.tsx`, `phim/[id]/page.tsx`; nav `ADMIN` (`nav-config.ts:23`); `movie-form.tsx:230-231`; `apps/api/src/modules/catalog/uploads.controller.ts:21`. Storage PUT thật chưa xác minh (R-a). |
| R-42 nhãn tuổi | spec R-42; task-01 | ✅ (partial) | `movie-form.tsx:181-183` Select + zod shared; không re-verify từng giá trị P/K/T13/T16/T18. |
| R-47 phòng CRUD + editor | spec R-47; task-02 | ⚠️ PARTIAL | Editor có (`seat-layout-editor.tsx`, `room-layout-panel.tsx`, `rooms-manager.tsx`). Không đổi grid sau tạo (G10). Reachability: blocker F1. |
| R-48 Sweetbox 2 ô liền kề, lỗi tại chỗ, bàn phím | spec R-48; task-02 | ✅ | `seat-layout-editor.tsx:24, 57-58, 146-156`. |
| R-48 sao chép sơ đồ kể cả rạp khác | spec R-48; task-02 | ✅ (reviewer r2) | `copy-layout-dialog.tsx`; nguồn copy qua `/cinemas`. |
| AC-14 / R-49..R-51 suất trùng giờ | spec AC-14; task-03 | ✅ (reviewer r2) | `showtime-bulk-form.tsx` (không re-read từng dòng). |
| R-54 suất đã bán khoá sửa giờ/phòng | spec R-54; task-03 | ✅ (test) | `__tests__/showtime-detail.test.tsx:69`. |
| R-55 khoá ghế theo suất | spec R-55; task-03 | ✅ | `seat-lock-panel.tsx:26-45`; `showtimes.controller.ts:127-150`. Realtime G18. |
| AC-24 / R-108 huỷ suất preview, lý do, gõ xác nhận | spec AC-24; task-03 | ✅ (reviewer r2) | `cancel-showtimes-dialog.tsx`; `cancellation.controller.ts:93-114`. Gap G17. |
| `?cancelAll=1&cinema=` mở dialog | task-03 | ✅ | `admin/lich-chieu/page.tsx:38, 44`; link `cinema-status-dialog.tsx:96`. |
| Huỷ suất → đơn bị ảnh hưởng | task-03 | ✅ | `lich-chieu/page.tsx:93, 135` dẫn `?cinema=`; `affected-orders-list.tsx:57` đọc `cinema`. (Không phải `?showtime=` như kỳ vọng, không vi phạm AC.) |
| R-52 bảng giá hai cấp, override | spec R-52; task-04 | ✅ (reviewer r2) | `admin/gia/page.tsx`, `price-matrix.tsx`. Confirm dialog đổi giá G23. |
| AC-15 override HN02 100.000 / HN01 120.000 | spec AC-15; task-04 | ✅ (reviewer r2, 288×2) | Không đọc test case cụ thể. |
| R-53 ngày lễ Admin | spec R-53; task-04 | ⚠️ PARTIAL | `admin/ngay-le/page.tsx` có; không có trong `nav-config.ts`; chỉ link từ `admin/gia/page.tsx:22`. G11. |
| R-90 voucher, Manager chỉ xem | spec R-90; task-04 | ⚠️ PARTIAL | `admin/voucher/page.tsx`, `voucher-form.tsx`. Thiếu lượt đã dùng; TZ. G16. |
| R-56 cấu hình rạp dọn phòng + mốc đóng bán | spec R-56; task-01 | ✅ | `cinema-form.tsx:36, 76, 101, 108-111, 274-280`. |
| R-103 tra cứu đơn, Staff chỉ đọc | spec R-103; task-05 | ⚠️ PARTIAL | `admin/don-hang/page.tsx`, `[code]/page.tsx`. Tìm mã: ilike server, exact ở client. G25. |
| AC-11 needs_manual_review ở Việc cần làm + /don-can-xu-ly | spec AC-11; task-05 | ✅ | `components/admin/todo-widgets.tsx:71-82`; `admin/don-can-xu-ly/page.tsx`. Tổng lệch G13. |
| R-104 đánh dấu đã giải quyết | spec R-104; task-05 | ✅ (reviewer r2) | Badge theo `manualReviewResolvedAt`; API `POST /admin/orders/:id/resolve-manual-review` (API_SPEC:57). |
| R-105 khoá/mở khoá, gán vai trò, Manager chỉ Staff | spec R-105; task-07 | ⚠️ PARTIAL | `users-admin.tsx:54-55, 156-166`; nút khoá disabled khi `isSelf` chỉ ở UI. API không chặn tự khoá, Admin cuối (G10 backlog 1). Dialog 1 rạp/lần G24. |
| R-106 cấu hình chuỗi | spec R-106; task-07 | ⚠️ PARTIAL | `admin/cau-hinh/page.tsx`; lệch design (G26). |
| R-107 audit before/after diff | spec R-107; task-07 | ✅ / ⚠️ | `audit-log-view.tsx:54-68, 94-95`. Actor là id rút gọn (G24). |
| R-110 + AC-25 hoàn tiền thủ công: số tiền + mã GD | spec AC-25; task-06 | ✅ | `affected-resolution-form.tsx:53-70`; `packages/shared/src/schemas/cancellation.ts:61-65` (422 khi thiếu). |
| R-110 bắt buộc phương thức (method) | spec R-110; task-06 | ❌ MISSING field | `recordRefundSchema` chỉ có `refundedAmount`, `refundReference`, `note`; không có phương thức. Ngày server-side (chấp nhận nếu lưu `refundedAt`). G9 (P1). |
| R-110 CSV, lọc email status, gửi lại email | spec R-110, AC-24; task-06 | ⚠️ PARTIAL | `affected-orders-api.ts:63`; `affected-orders-list.tsx:257`; filter email client-side trên trang phân trang (G12). |
| AC-24 cột email Đã gửi/Lỗi + nút gửi lại | spec AC-24; task-06 | ✅ | `affected-orders-list.tsx:257`; `canResendEmail` (journal). |
| R-112/R-113 doanh thu, theo phim/suất/rạp | spec R-112/113; task-08 | ✅ (reviewer r2) | `bao-cao/page.tsx`, `revenue-report.tsx`. Chưa re-verify tách vé/combo. |
| R-116 đối soát PayOS | spec R-116; task-08 | ⚠️ PARTIAL | `payos-reconcile-table.tsx`; thiếu tổng theo rạp, danh sách đầy đủ, filter ngày API. G15. |
| R-119 + AC-25 đơn refunded_manual trong báo cáo suất huỷ | spec AC-25; task-08 | ✅ | `cancelled-showtimes-report.tsx:38, 48`. Spec §Q3 còn `[cần xác nhận]`. |
| AC task-08 Manager chỉ rạp được gán; VND; empty state | task-08 | ✅ (reviewer r2) | Chưa re-verify. |
| task-09 POS (REMOVED) | spec R-120..R-130 REMOVED | ✅ | Không có `apps/web/src/app/pos`; grep chỉ thấy `__tests__/shell.test.tsx`. |
| Đơn cũ EXCHANGED trong web | spec 3.0.0 (bỏ đổi suất) | ❌ leftover | `components/admin/order-utils.ts:74` `EXCHANGED: "Đã đổi vé"`. G27 (cleanup). |
| API mới layer 7 | API_SPEC | ✅ | `admin/cinemas` + `:cinemaId` (`cinemas.controller.ts:50, 59`); `POST admin/uploads` (`uploads.controller.ts:21`); `GET cinemas/:cinemaId/showtimes/:showtimeId` (`cinema-ops/showtimes.controller.ts:57`). API_SPEC:48, 49, 65 ✅. |
| Nav `/admin/phong` | task-02 | ❌ | `nav-config.ts:25`, route không tồn tại; `__tests__/shell.test.tsx:153` khoá href cũ. (xem blocker F1) |
| Nav `/admin/ngay-le` | task-04 | ⚠️ | Route có, không có trong nav. G11. |
| Dashboard → `/admin/don-bi-anh-huong` | task-05/06 | ⚠️ | `todo-widgets.tsx:86` không có `?status=`. G-minor. |

Spec 3.0.0 vs task files: task files còn trích SPECIFICATIONS 1.1.0 (tài liệu lỗi thời, không phải gap code).

## Gap đề xuất vào gap register (GAP-008…; dispatcher ghi, không ghi bởi reviewer)

| ID | Requirement | Mô tả | Nguồn | Hướng xử lý | Status đề xuất |
|---|---|---|---|---|---|
| GAP-008 | R-38, R-47, R-48 | Không có đường click tới trang phòng/sơ đồ: sidebar `/admin/phong` dead (nav-config.ts:25), không có link từ `/admin/rap` và `/admin/rap/[id]` | layer-7 phase review | BLOCKER — thêm link phòng ở trang rạp + sửa nav; cập nhật shell.test | open (P0, phải sửa trước khi đóng layer) |
| GAP-009 | R-110 | Thiếu trường phương thức hoàn tiền thủ công (bắt buộc spec) | layer-7 phase review (task-06) | Thêm `refundMethod` vào schema + form + API | open (P1) |
| GAP-010 | R-105, NFR-06 | API không chặn Admin tự khoá/tự gỡ; không guard Admin cuối cùng ở DB | task-07 r2 MINOR-4 | Backlog API | open (P1) |
| GAP-011 | R-53 | `/admin/ngay-le` không trong nav | task-04 | Thêm nav item | open (P2) |
| GAP-012 | R-110 | Filter email status client-side trên trang phân trang | task-06 r2 | Server filter | open (P2) |
| GAP-013 | R-104, AC-11 | `needs-manual-review` không lọc resolved (layer-5 owner); `/admin/todo` không có cinemaId | task-05 r2 | Server filter + cinemaId | open (P2) |
| GAP-014 | R-116 | Đối soát PayOS thiếu tổng theo rạp, danh sách đầy đủ, filter ngày | task-08 r2 | Backlog API + UI | open (P2) |
| GAP-015 | R-90 | Voucher thiếu lượt đã dùng; validFrom/To theo TZ trình duyệt | task-04 | usedCount + TZ server | open (P2) |
| GAP-016 | R-108 | Dialog huỷ chưa liệt kê suất/email/toast (B20) | task-03 F4 | Bổ sung | open (P2) |
| GAP-017 | R-108 | (gộp GAP-016) | — | — | — |
| GAP-018 | R-55 | SeatMap admin không realtime (B19); seatmap lỗi → UI coi 0 vé bán | task-03 F6, N1 | Realtime/polling; hiển thị lỗi | open (P3) |
| GAP-019 | R-47 | Không đổi grid sau tạo; editor chưa read-only khi có suất sắp chiếu; N+1 GET sơ đồ | task-02 | Backlog | open (P3) |
| GAP-020 | R-41, R-47 | Bảng rạp/phim: nhãn trạng thái, multi-select, MapView, cột Quản lý | task-01 N2 | Chấp nhận demo | accepted (cần PO) |
| GAP-021 | R-33, AC-26 | Cảnh báo đóng rạp thiếu chi tiết suất | task-01 N1 | Bổ sung | open (P3) |
| GAP-022 | R-32 | PATCH rạp + settings không atomic; ảnh mồ côi; upload chưa rate limit | task-01 N4/N5 | Transaction + cleanup | open (P3) |
| GAP-023 | R-52 | Chưa confirm dialog đổi giá; lỗi reload bị nuốt | task-04 r2 | UI polish | open (P3) |
| GAP-024 | R-105, R-107 | Dialog gán 1 rạp/lần; audit actor id rút gọn | task-07 r2 | Multi-select; join tên | open (P3) |
| GAP-025 | R-103 | Tìm mã đặt vé exact ở client | task-05 | Exact match server | open (P3) |
| GAP-026 | R-106 | Màn cấu hình lệch design | task-07 r2 | UI polish | open (P3) |
| GAP-027 | spec 3.0.0 | Leftover `EXCHANGED` trong `order-utils.ts:74` (đổi suất đã bỏ) | layer-7 phase review | Xoá nhãn | open (P3, cleanup) |

Lưu ý: GAP-017 để trống do gộp vào GAP-016 — dispatcher đánh số lại khi ghi.

## Backlog task API (ưu tiên)
1. P1 — Chặn tự khoá / tự gỡ Admin + guard Admin cuối cùng ở DB (NFR-06, R-105). Kèm e2e.
2. P1 — `refundMethod` cho `recordRefundSchema` (R-110 bắt buộc); xác nhận lưu `refundedAt`.
3. P2 — Filter resolved cho `GET /admin/orders/needs-manual-review`; `cinemaId` cho `/admin/todo`.
4. P2 — Filter `emailStatus` server-side cho affected-orders.
5. P2 — Báo cáo PayOS: filter ngày, tổng theo rạp, danh sách đầy đủ (R-116).
6. P2 — VoucherDto `usedCount` + TZ server (R-90).
7. P3 — Đổi grid phòng sau tạo (updateRoomSchema).
8. P3 — Tên actor audit log (join users).

Không cần backlog: `GET /admin/cinemas` và `GET /cinemas/:cid/showtimes/:sid` đã có (đóng gap task-03).

## Residual risk / chưa xác minh
- R-a: PUT Storage thật và `rooms(count)` chỉ kiểm bằng mock (task-01 N6). Cần smoke sau merge.
- R-b: test flaky `pricing-voucher.test.tsx`, `catalog-admin` timeout khi chạy song song.
- R-c: chưa xác minh `GET /admin/movies/:id`.
- R-d: chưa xác minh đầy đủ nội dung API_SPEC cho `GET /admin/cinemas/:cinemaId` (chỉ thấy chuỗi `admin/cinemas`).
- R-e: file vượt 300 dòng: `cinema-form.tsx` 305, `audit-log-view.tsx` 343, hai file task-04 > 300. Nợ kỹ thuật.
- R-f: task files trích SPECIFICATIONS 1.1.0, spec hiện 3.0.0.
- R-g: spec §Q3/Q4 `[cần xác nhận]` về R-119 và CSV: PO cần chốt.
- R-h: `.context/runs/build-filmbooking-layer-7-task-03.builder.md` là journal phụ untracked, không đưa vào commit.
- R-i: pgTAP 061 đã PASS (db:test 817).
- Chưa xác minh: enum nhãn tuổi đầy đủ, tách vé/combo báo cáo, test case AC-14/AC-15 cụ thể, Staff server-side write (task-06). Dựa vào reviewer round 2 STRICT PASS.

## Trạng thái
- Verdict: ❌ FAIL — blocker GAP-008 (1 dòng nav + 1 link). Sau khi sửa cần chạy lại đối chiếu đúng luồng click (round tiếp theo).
- Không sửa source/docs. Không ghi `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`.
