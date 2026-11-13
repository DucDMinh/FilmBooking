# Independent Review — Layer 5 nhóm C (task-04 soát vé, task-08 huỷ suất / đóng rạp / đơn bị ảnh hưởng)

Agent: reviewer
Ngày: 2026-11-13 · Branch: `staging` · Commit review: `dbd6708` (checkin), `967fa36` (cancellation)
Report cũ `build-filmbooking-layer-5-task-0{4,8}-round-1-review.md` KHÔNG được dùng làm bằng chứng.

## Review level
**STRICT**

## Reason
Đụng auth/RBAC + phạm vi rạp (CinemaScope), PII khách (AC-13, CSV), thao tác hàng loạt/huỷ suất (data mutation diện rộng), ghi nhận hoàn tiền (tài chính/đối soát), email outbox, export CSV, contract dùng chung `packages/shared` (web sẽ dùng).

## Blast radius
- `packages/shared/src/schemas/checkin.ts`, `cancellation.ts` (contract cho web layer sau).
- RPC DB: `checkin_ticket` (20261111040400), `preview_cancel_showtimes` / `cancel_showtimes` (20261112150000), `set_cinema_status` (20261112160000), trigger `affected_order_actions_validate/apply`, `orders_guard_transition`, bảng `email_outbox` (20261111020100).
- Module chưa đăng ký vào `AppModule` (theo kế hoạch layer-6-task-01) → hiện chưa có runtime exposure; lỗi sẽ lộ khi wiring.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @filmbooking/api exec vitest run test/checkin.e2e-spec.ts test/cancellation.e2e-spec.ts` | **Blocked** — hook `agent-guard` từ chối (không thuộc allowlist). Không thử biến thể. |
| `git show --stat dbd6708` / `git show --stat 967fa36` | Chạy OK — 5 file / 6 file, khớp "Files to Create/Modify". |
| typecheck / lint / test toàn bộ | Không chạy (session chính chạy theo brief). |
| aislop / oxlint / ocr | Không chạy (ngoài allowlist) — skip. |

Mọi kết luận dưới đây dựa trên đọc code + migration thật; không có kết quả test do tôi tự chạy.

---

## Findings

### Task-04 — Soát vé

**[MAJOR] C4-1 — Màu kết quả `USED` (và `TOO_EARLY`) là `yellow`, trái AC-12 và design-spec** — *đã xác minh*
- `packages/shared/src/schemas/checkin.ts:29-38` (`USED: "yellow"`, `TOO_EARLY: "yellow"`).
- Chuẩn: AC-12 (SPECIFICATIONS.md:375) "báo **đỏ** 'Đã sử dụng'"; R-98 (:226) liệt kê "❌ Đã sử dụng", "❌ chưa tới giờ"; `.context/design-spec.md:400-402` → `danger-banner` cho ĐÃ SỬ DỤNG và SAI SUẤT/CHƯA TỚI GIỜ.
- Test codify sai: `apps/api/test/checkin.e2e-spec.ts:206-210` kỳ vọng `color: "yellow"` → false-confidence.
- Tái hiện: RPC trả `status: "USED"` → API 200 `{ result: "USED", color: "yellow" }`.
- Sửa: `USED: "red"`, `TOO_EARLY: "red"` (chỉ OK là green); cập nhật test theo AC-12.

**[MINOR] C4-2 — Kết quả OK thiếu nhãn tuổi; kết quả USED thiếu phim/suất/ghế** — *đã xác minh*: R-98 yêu cầu "Hợp lệ (phim, suất, phòng, ghế, combo, nhãn tuổi)"; design :400 cho USED hiện phim/suất/ghế (cùng rạp). `checkin.service.ts:45-64` không có `ageRating`; RPC `checkin_ticket` cũng không trả (gốc ở layer-4). Ghi gap, mở task RPC nếu cần.

**[MINOR] C4-3 — Design màn 17 là 2 bước (tra cứu → "Xác nhận check-in"), API/RPC check-in ngay khi quét** — *đã xác minh* (`design-spec.md:399` vs `checkin_ticket` bước 6). Lệch UX/contract, ghi gap cho task web.

**[MINOR] C4-4 — Nhập booking code của đơn nhiều vé, 2 lượt quét đồng thời** — *nghi ngờ (theo lý luận Postgres, chưa repro)*: `checkin_ticket` (20261111040400:125-130) `ORDER BY ... LIMIT 1 FOR UPDATE` → cả 2 cùng chọn vé #1; lượt sau chờ khoá, re-check thấy `checked_in_at` → trả USED dù vé #2 chưa soát. Không soát 2 lần (AC-12 an toàn), chỉ là false-USED. Gốc ở RPC layer-4.

**[MINOR] C4-5 — Doc impact chưa reconcile**: `docs/API_SPEC.md` "Endpoint overview" không có `POST /checkin/scan` (và toàn bộ endpoint task-08).

Các điểm đạt (đã xác minh):
- Quyền: `@Roles("STAFF") + @CinemaScope()` (`checkin.controller.ts:16-17`); `CinemaScopeGuard` đối chiếu `body.cinemaId` với `staff_assignments` (role tại rạp đó phải thoả STAFF; Manager ⊇ Staff; Admin qua) → 403 `FORBIDDEN_CINEMA` trước khi gọi DB. RPC còn kiểm `has_cinema_scope` lần 2 (gọi bằng `forUser(jwt)`).
- `staff_id` = `user.id` từ JWT; schema `.strict()` từ chối `staffId` trong body (400); RPC chặn spoof (42501).
- Tham số RPC khớp chữ ký `checkin_ticket(text, uuid, uuid)`; 42501 → 403.
- AC-13: RPC kiểm sai rạp TRƯỚC mọi kiểm tra khác, không đánh dấu check-in; API dựng response theo whitelist → WRONG_CINEMA chỉ có `correctCinema{id,code,name,address}`.
- AC-12 chống soát 2 lần: `FOR UPDATE of t` + re-check `checked_in_at` → lượt 2 trả USED kèm `checked_in_at` + `staff_name`.

### Task-08 — Huỷ suất / đóng rạp / đơn bị ảnh hưởng

**[MAJOR] C8-1 — CSV không chống formula injection** — *đã xác minh*
- `apps/api/src/modules/cancellation/affected-csv.ts:29-36` chỉ quote khi có `, " \n \r`; không vô hiệu hoá ô bắt đầu bằng `= + - @ \t \r`.
- Trường tự do do người dùng nhập đi thẳng vào CSV: `note` (≤500 ký tự, Staff nhập), `refundReference` (Staff nhập), `contact_phone`/`contact_email` (khách nhập lúc đặt vé).
- Tái hiện: Staff ghi hoàn tiền `note: "=HYPERLINK(\"http://evil\",\"x\")"` → export → ô `=HYPERLINK(...)` chạy trong Excel của Admin/Manager.
- Sửa: trong `escapeCsvField`, nếu chuỗi bắt đầu bằng `=`,`+`,`-`,`@`,`\t`,`\r` thì thêm tiền tố `'` rồi mới escape/quote; thêm test.

**[MAJOR] C8-2 — Gửi lại email: không giới hạn, gửi trùng, không chỉ cho email lỗi** — *đã xác minh*
- `cancellation.service.ts:492-531`: tìm outbox rồi set `status=PENDING, next_attempt_at=now` cho BẤT KỲ trạng thái nào (kể cả `SENT`, kể cả `PENDING` đang được worker claim — worker dời `next_attempt_at` +5' làm khoá, `jobs.controller.ts:85-94`; resend đặt lại `now` → worker khác claim lại → gửi 2 lần).
- R-109 (SPECIFICATIONS.md:244): "cho phép **gửi lại email lỗi**". Không có cooldown/giới hạn số lần → Staff có thể spam khách vô hạn (chỉ bị Throttler chung chặn).
- Tìm bản ghi cũ bằng cách tải toàn bộ `email_outbox kind=showtime_cancelled` rồi `.find` trong JS (`:492-501`) — PostgREST cắt ở max-rows (mặc định 1000) → quá ngưỡng sẽ không thấy bản ghi cũ và INSERT bản trùng. Không có unique index `(kind, payload->>'order_id')` ở DB.
- Lỗi update/insert bị bỏ qua (`:504-530` không đọc `error`) → API vẫn trả "Email queued".
- Payload nhánh insert thiếu `cinema_name/movie_title/room_name/showtime_starts_at` → template `renderShowtimeCancelledEmail` rơi về "Rạp FilmBooking"/"Phim"/"Phòng chiếu".
- Sửa: chỉ cho resend khi `status='FAILED'` (hoặc chưa có bản ghi), cập nhật có điều kiện `.eq('status','FAILED')` + kiểm `error`; lọc DB-side `.filter('payload->>order_id','eq',orderId)`; thêm cooldown (vd không resend nếu lần cuối < N phút / tối đa K lần); payload đủ trường như `cancel_showtimes`.

**[MAJOR] C8-3 — Ghi nhận hoàn tiền không nguyên tử → hoàn trùng (double-count đối soát)** — *nghi ngờ mạnh (đã đối chiếu trigger, chưa repro đồng thời)*
- `cancellation.service.ts:382-444`: đọc `orders.status` → insert `affected_order_actions` → update orders. Trigger `affected_order_actions_validate` (20261111030100:514-526) chỉ `exists(... status='affected')` không khoá; không có unique trên `affected_order_actions(order_id)`. Hai request đồng thời đều qua validate; `apply` lần 2 update `refunded_manual → refunded_manual` (guard cho qua vì status không đổi) → 2 dòng REFUNDED_MANUAL → `v_report_cancelled_showtimes.total_refunded_amount` (20261112160000:294-299) bị cộng gấp đôi.
- Ngoài ra `:437-444` update orders thừa (trigger `apply` đã đổi) và **bỏ qua `error`**.
- `refundedAmount` cho phép 0 và không chặn vượt `orders.total_amount` (`packages/shared/src/schemas/cancellation.ts:62`).
- Sửa: chuyển ghi nhận vào một RPC `SECURITY DEFINER` khoá `orders ... FOR UPDATE` rồi insert (hoặc partial unique index `(order_id) where action='REFUNDED_MANUAL'` — cần task migration riêng); bỏ update thừa; kiểm `0 < amount ≤ total_amount`; test đồng thời.

**[MAJOR] C8-4 — Test e2e false-confidence ở ranh giới phân quyền + schema** — *đã xác minh*
- `apps/api/test/cancellation.e2e-spec.ts:416-419`: `forUser` và `admin` trả CÙNG `fakeDb`; fake RPC `cancel_showtimes`/`preview_cancel_showtimes` (`:134-230`) KHÔNG kiểm `has_cinema_role(MANAGER)` / 42501. Toàn bộ phạm vi rạp khi gửi `showtimeIds` (kể cả trộn nhiều rạp) phụ thuộc vào việc service gọi bằng JWT user (`cancellation.service.ts:61,120`) — nếu đổi thành `admin()` cho mọi người, test vẫn xanh → leo thang quyền không bị bắt.
- Không có test: danh sách suất trộn HN01+HN02 trên route `cinemas/HN01/...`; route `showtimes/cancel` không cinemaId; `allFuture`; Staff gọi `PATCH status`; formula injection CSV; resend trên email `SENT`; hoàn tiền đồng thời.
- Mock bịa cột không có trong DB: `contact_name` (orders không có cột này — 20261111030100:65-94, không migration nào thêm) dùng ở `:526, :848, :865`; test CSV khẳng định `"Nguyễn Văn A"` xuất hiện (`:897`) — DB thật luôn rỗng. Fake insert `affected_order_actions` không mô phỏng trigger validate/apply.
- Sửa: fake `forUser` ghi lại jwt + fake RPC trả 42501 khi showtime không thuộc rạp Manager; assert non-admin dùng `forUser`; bỏ `contact_name` khỏi mock (hoặc bỏ cột "Tên khách hàng"); thêm các test trên.

**[MINOR] C8-5 — Cột/field `contactName` luôn null** — `cancellation.service.ts:696`, `affected-csv.ts:61` ("Tên khách hàng"): `orders` không có `contact_name` → cột CSV luôn trống. Bỏ cột hoặc lấy từ `profiles.full_name` theo `user_id` (cân nhắc PII).

**[MINOR] C8-6 — Tải toàn bảng `email_outbox` mỗi request list/detail** — `cancellation.service.ts:308-317, 665-680`: select mọi `showtime_cancelled` rồi khớp `payload.order_id` trong JS; vượt max-rows → `emailStatus` null sai (AC-24 hiển thị trạng thái gửi). Lọc DB-side theo `payload->>order_id in (...)` hoặc join qua `affected_order_cases`.

**[MINOR] C8-7 — Ánh xạ lỗi RPC lộ nội bộ / sai status** — `cancellation.service.ts:73, 134`: mọi lỗi khác 42501 → `VALIDATION_ERROR` 400 kèm `error.message` thô của Postgres (deadlock 40P01, timeout, 23514 guard…). Nên: `P0001 CANCEL_REASON_REQUIRED` → 400, còn lại → 500 generic (log server). Tương tự `:433` (insert action lỗi → 400 với message DB; 23514 từ trigger nên → 409).

**[MINOR] C8-8 — Chi tiết lỗi 422 bị filter nuốt** — `cancellation.controller.ts:65-74` ném `HttpException` body `{error:{...details}}`; `all-exceptions.filter.ts:48-55` chỉ đọc `payload.message` → client nhận `message: "Http Exception"`, mất `details.issues`. Dùng `AppException` với code có status 422 hoặc để filter giữ body dạng `ApiErrorBody`.

**[MINOR] C8-9 — Tàn dư POS trong DTO mới** — `packages/shared/src/schemas/cancellation.ts:72-73` (`webPaidOrdersCount`, `posPaidOrdersCount`) và service `:52-53, 80-81`. Spec 2.0.0 bỏ POS; tàn dư DB là nợ có chủ đích nhưng contract API mới không nên lộ trường POS.

**[MINOR] C8-10 — Không chặn huỷ suất đã qua / đã huỷ** — `resolveShowtimeIds` (`cancellation.service.ts:589-591`) nhận nguyên `showtimeIds`; RPC update mọi id → suất quá khứ: đơn `checked_in` thành `affected`; suất đã huỷ: ghi đè `cancel_reason/cancelled_by/cancelled_at` (mất audit gốc). Preview và execute cùng hành vi nên khớp nhau, nhưng nên lọc `status <> 'CANCELLED' and starts_at > now()` hoặc trả 409. Ngoài ra `allFuture` tính lại danh sách ở thời điểm execute (có thể khác preview) — chấp nhận được, ghi nhận.

**[MINOR] C8-11 — Path `:cinemaId` không validate UUID** ở list/export/preview/cancel (`cancellation.controller.ts:100,121,163,185`): Admin gửi id rác → Postgres 22P02 → 500. Dùng `uuidParam`.

**[MINOR] C8-12 — R-110 thiếu "phương thức" hoàn tiền** — `recordRefundSchema` (`cancellation.ts:61-65`) chỉ có số tiền/mã GD/ghi chú; DB `affected_order_actions` cũng không có cột method. AC-25 vẫn đạt (chỉ yêu cầu số tiền + mã GD); ghi gap. `Người xử lý` trong CSV là UUID thay vì tên.

**[MINOR] C8-13 — Doc impact**: `docs/API_SPEC.md` thiếu toàn bộ nhóm endpoint huỷ suất / trạng thái rạp / đơn bị ảnh hưởng.

Các điểm đạt (đã xác minh):
- Đóng/mở rạp: `@Roles("ADMIN")` (`cancellation.controller.ts:131,140`) — RolesGuard chỉ cho Admin (`satisfies(held,"ADMIN")` luôn false với STAFF/MANAGER); RPC `set_cinema_status` cũng chặn non-admin (42501).
- AC-26: RPC raise `23514` với `detail = array_to_json(ids)`; service parse `error.details` → 409 `CONFLICT` + `details.showtimeIds`. Khớp DB.
- Huỷ suất Manager: guard yêu cầu MANAGER tại `:cinemaId` (hoặc `body.cinemaId` ở route không có param); DB `cancel_showtimes`/`preview` (gọi bằng JWT user) kiểm MANAGER cho TỪNG suất → danh sách trộn rạp khác → 42501 → 403. Admin dùng service role + `p_actor_id = user.id` (không spoof được vì RPC chặn khi `auth.uid()` khác).
- Kích thước batch: `showtimeIds` max 500, reason ≤500 trimmed bắt buộc.
- `exchanged`: không có endpoint/DTO nhận `exchanged`; `AFFECTED_ORDER_STATUSES = ["affected","refunded_manual"]`; action ghi cứng `REFUNDED_MANUAL`.
- Phạm vi rạp cho list/detail/refund/resend/export: kiểm `access.cinemaRoles.has(order.cinema_id)` / `resolvePermittedCinemas` → Staff HN02 với đơn HN01 → 403.
- CSV: BOM `﻿`, header tiếng Việt, escape `, " \n \r`.

---

## Acceptance criteria

### Task-04
| AC | Kết quả | Ghi chú |
|---|---|---|
| AC-12 qua API | **THIẾU** | Không soát 2 lần + trả thời điểm/người soát: đạt. Nhưng AC yêu cầu "báo **đỏ**" — API trả `yellow` (C4-1). |
| AC-13 qua API | ĐẠT | Whitelist response; RPC kiểm rạp trước, không check-in. |
| Staff gửi cinemaId không được gán → 403 | ĐẠT | Guard + RPC. |
| WRONG_CINEMA không chứa tên khách/ghế/email | ĐẠT | |
| Test thật với dữ liệu seed | KHÔNG XÁC MINH | Test là mock; không chạy được (Blocked). |

### Task-08
| AC | Kết quả | Ghi chú |
|---|---|---|
| AC-24 (10 paid → 10 affected, 10 email, list có trạng thái gửi) | ĐẠT có điều kiện | Logic qua RPC đúng; `emailStatus` có thể null sai khi outbox > max-rows (C8-6). |
| AC-25 (thiếu tiền/mã GD → 422; đủ → refunded_manual, vào báo cáo) | ĐẠT có rủi ro | 422 đúng status nhưng mất details (C8-8); race hoàn trùng làm sai báo cáo (C8-3). |
| AC-26 (đóng rạp còn suất đã bán → 409 + danh sách) | ĐẠT | |
| Staff HN02 → 403; Staff HN01 → OK | ĐẠT | |
| CSV UTF-8 BOM, cột tiếng Việt, chỉ rạp được gán | ĐẠT một phần | Đạt yêu cầu nêu, nhưng thiếu chống formula injection (C8-1); cột "Tên khách hàng" luôn rỗng (C8-5). |
| Gửi lại email (R-109) | **THIẾU** | Không giới hạn, resend cả email đã gửi, có thể trùng (C8-2). |

---

## Verdict
- **Task-04 (checkin): FAIL** — C4-1 (lệch AC-12 về màu, test codify sai).
- **Task-08 (cancellation): FAIL** — C8-1 (CSV injection), C8-2 (resend không giới hạn/trùng), C8-3 (hoàn tiền không nguyên tử), C8-4 (test false-confidence ở ranh giới quyền + mock cột không tồn tại).
