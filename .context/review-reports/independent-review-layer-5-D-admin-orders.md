# Independent Review: build-filmbooking — layer-5 nhóm D (task-06 admin, task-07 orders & report)

Agent: reviewer (independent re-review, không dựa vào report cũ `build-filmbooking-layer-5-task-0{6,7}-*`)

## Review level: STRICT

## Reason
Đụng auth/RBAC (gán vai trò, khoá tài khoản, Admin role), phạm vi rạp (tenant isolation), API contract dùng nhiều màn admin, ghi DB qua service role (bỏ RLS) trên `orders`/`showtime_seat_states`/`tickets`, audit log, báo cáo. Đều thuộc risk đỏ.

## Blast radius
- Commit `4735c18` (task-06): `apps/api/src/modules/admin/*`, `packages/shared/src/schemas/admin.ts`, `apps/api/test/admin.e2e-spec.ts`.
- Commit `d8a0c32` (task-07): `apps/api/src/modules/orders/*`, `apps/api/src/modules/report/*`, `packages/shared/src/schemas/{orders,report}.ts`, `apps/api/test/orders-report.e2e-spec.ts`.
- Module chưa đăng ký vào `app.module.ts` (để layer-6-task-01) → hiện chưa reachable ở runtime, nhưng layer-6 sẽ wire nguyên trạng.
- Shared schema `admin.ts`/`orders.ts`/`report.ts` sẽ được web admin dùng.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `cd "E:/FilmBooking" && pnpm --filter @filmbooking/api exec vitest run test/admin.e2e-spec.ts test/orders-report.e2e-spec.ts` | **Blocked** — agent-guard: chỉ được `cd` vào `.worktrees/` |
| `pnpm --filter @filmbooking/api exec vitest run test/admin.e2e-spec.ts test/orders-report.e2e-spec.ts` | **Blocked** — agent-guard: lệnh không nằm trong allowlist |
| typecheck / lint / test toàn bộ | Không chạy (session chính tự chạy theo brief) |
| aislop / oxlint / ocr | Không chạy (ngoài allowlist reviewer) — skip |

Mọi kết luận dưới đây dựa trên đọc code + đối chiếu migration thật, **không** dựa trên kết quả test. Kết quả AC = "không chạy; đánh giá từ code + mock".

## Verdict
- **task-06 (admin): ❌ FAIL**
- **task-07 (orders & report): ❌ FAIL**

## Findings

### CRITICAL

**C1 — `resolveManualReview` hỏng trên DB thật: CONFIRM_SALE vi phạm máy trạng thái + ghi nửa vời; REFUND_MANUAL nuốt lỗi** (task-07, **đã xác minh** bằng migration)
- `apps/api/src/modules/orders/orders.service.ts:507-516` cập nhật `status: "paid"` cho đơn `needs_manual_review`. Trigger `orders_guard_transition` bản mới nhất (`supabase/migrations/20261112150000_cancel_showtimes_hardening.sql:29-37`) **không có nhánh nào đi ra từ `needs_manual_review`** → raise `23514` → `throw updErr` → 500.
- Trước đó `orders.service.ts:491-504` đã upsert `showtime_seat_states` SOLD từng ghế (gọi riêng lẻ, không transaction, **không kiểm `error`**), và `:519-532` upsert tickets cũng không kiểm lỗi. Kết quả: ghế có thể bị đánh SOLD cho một đơn vẫn `needs_manual_review` (ghế "ma", khách khác không mua được), đơn không có vé, API trả 500.
- Upsert `showtime_seat_states` không truyền `onConflict` → mặc định theo PK `id` (không truyền id) ⇒ thực chất là INSERT; nếu ghế còn dòng HELD (kể cả hết hạn) của đơn khác → `23505` bị nuốt.
- Kiểm tra "ghế trống" `:472-488` chỉ xét `state = 'SOLD'`, bỏ qua HELD còn hạn của đơn khác, `showtime_seat_locks`, suất đã huỷ/đã chiếu; lại là SELECT-rồi-ghi không khoá — đúng pattern K4 double-sell mà `20261112060000_prevent_double_sell.sql` đã phải sửa bằng `sell_order_seats`.
- Spec cũng **không cho** chuyển trạng thái này: `SPECIFICATIONS.md:311` `needs_manual_review → (kết thúc)` "Manager/Admin đánh dấu đã giải quyết"; R-104 (`:239`) chỉ "ghi chú cách xử lý, đánh dấu đã giải quyết". Task description ("chốt bán thủ công nếu ghế trống") mâu thuẫn spec/DB → cần Change Request, không được tự làm ở API.
- REFUND_MANUAL `:563-574` insert `affected_order_actions` cho đơn `needs_manual_review`; trigger `affected_order_actions_validate` (`20261111030100_booking_tables.sql:514-525`) yêu cầu đơn `affected` → raise `23514`; code **không đọc `error`** → mất refund_reference/refunded_amount, vẫn set `manual_review_resolved_at` + ghi audit + trả 201 "thành công".
- Test xanh giả: FakeDb `apps/api/test/orders-report.e2e-spec.ts:427-631` không mô phỏng `orders_guard_transition`, `affected_order_actions_validate`, unique `(showtime_id, seat_id)`; test `:809-835` khẳng định `status === "paid"` — hành vi DB thật cấm. **False-confidence test.**
- Tái hiện (DB thật): đơn `needs_manual_review` → `POST /orders/:id/resolve-manual-review {action:"CONFIRM_SALE"}` bằng Manager rạp → 500, `showtime_seat_states` có dòng SOLD mới cho đơn đó.
- Đề xuất: theo spec, resolve = chỉ set `manual_review_resolved_at` (+ ghi chú vào audit/bảng ghi chú) trong **một RPC SECURITY DEFINER** (atomic, kiểm vai trò Manager rạp/Admin trong DB); kiểm `error` mọi lệnh ghi. Nếu PO muốn "chốt bán thủ công" thì phải qua `/change` + migration thêm transition và dùng `sell_order_seats`. Viết test chạy với mô phỏng trigger (hoặc test SQL) cho cả hai nhánh.

### MAJOR

**M1 — R-107 audit thiếu "ai" cho cấp/thu hồi Admin và không audit khoá tài khoản** (task-06, **đã xác minh**)
- `apps/api/src/modules/admin/users.controller.ts:298-318` ghi `user_roles` bằng `supabase.admin()` (service role) → trigger `audit_row_change` ghi `actor_id = auth.uid()` = NULL (`20261111010000_core_identity_chain.sql:293-294`). Thao tác nhạy cảm nhất (nâng Admin) mất người thực hiện.
- `lockUser` `:118-137` chỉ gọi `auth.admin.updateUserById`, không bảng nào có trigger → **không có audit nào** cho khoá/mở khoá.
- Test không kiểm audit của hai thao tác này.
- Đề xuất: ghi qua `forUser(jwt)` (RLS `user_roles_admin_insert/delete` đã cho Admin) để trigger có actor; với lock ghi thêm `audit_logs` tường minh (actor, target, locked) qua service role.

**M2 — Manager đọc được audit log, trái quyết định user "Audit log chỉ Admin"** (task-06, **đã xác minh**)
- `apps/api/src/modules/admin/audit.controller.ts:36,45` `@Roles("ADMIN","MANAGER")`; `.context/design-spec.md:747` (§15 Quyết định của user): "Audit log chỉ Admin". Test `admin.e2e-spec.ts:688` còn khoá cứng hành vi sai.
- Phụ: nhánh non-admin dùng `access.cinemaRoles.keys()` (gồm cả rạp chỉ là STAFF) `:62-73`; RLS cứu nhưng logic API sai.
- Đề xuất: `@Roles("ADMIN")`, sửa test.

**M3 — Xoá voucher cứng làm mất lịch sử lượt dùng** (task-06, **đã xác minh**)
- `apps/api/src/modules/admin/vouchers.controller.ts:158-171` DELETE thẳng; `voucher_redemptions.voucher_id ... on delete cascade` (`20261111030100_booking_tables.sql:209`) và `orders.voucher_id on delete set null` (`:75`) → xoá voucher đã áp cho đơn sẽ xoá toàn bộ redemption (kể cả HELD của đơn đang chờ thanh toán) và cắt liên kết đơn↔voucher. Sai yêu cầu "không sửa voucher theo cách làm sai đơn đã áp".
- Đề xuất: chặn DELETE khi đã có redemption (409) hoặc chỉ cho `active=false`.

**M4 — PATCH voucher một phần bỏ qua ràng buộc chéo → 500** (task-06, **đã xác minh**)
- `packages/shared/src/schemas/admin.ts:155-162` chỉ kiểm khi cả hai trường có trong body. PATCH `{discountType:"PERCENT"}` cho voucher FIXED 50000, hoặc `{validTo}` sớm hơn `valid_from` hiện có → CHECK DB `23514` → `vouchers.controller.ts:199-204` map thành `INTERNAL_ERROR` 500. `movieId` không tồn tại → `23503` → 500.
- Đề xuất: merge với bản ghi hiện tại rồi validate, hoặc map `23514/23503` → 400/422.

**M5 — Staff nhận dữ liệu ngoài phạm vi: danh sách needs_manual_review và email lỗi** (task-07, **đã xác minh** theo spec)
- `apps/api/src/modules/orders/orders.controller.ts:42-49, 75-79, 91-97` `@Roles("STAFF","MANAGER")` cho `needs-manual-review` và `/admin/todo`. R-104 (`SPECIFICATIONS.md:239`): danh sách cho "Manager rạp mình / Admin". `.context/design-spec.md:425`: "Staff: chỉ card Đơn bị ảnh hưởng + lối tắt Soát vé". `getAdminTodo` (`orders.service.ts:614-763`) trả Staff cả `failedEmails` (`to_email`, `last_error`) và đơn needs_manual_review.
- Đề xuất: list needs_manual_review → `@Roles("MANAGER")` + chỉ rạp có vai trò MANAGER; todo lọc theo vai trò tại từng rạp (Staff chỉ affected).

**M6 — "Lịch sử trạng thái" (R-103) là dữ liệu bịa** (task-07, **đã xác minh**)
- `orders.service.ts:281-346` dựng history từ heuristic: mọi đơn có payment đều có bước `pending_payment`; đơn needs_manual_review có payment PAID hiện bước "paid" (đơn chưa từng paid); bất kỳ `affected_order_actions` nào (kể cả EXCHANGED) đều gắn `refunded_manual`; không bao giờ có `expired`; "đã xử lý" hiển thị status `needs_manual_review`. Nguồn thật đã có: trigger `orders_audit` (`booking_tables.sql:570-571`) ghi before/after từng lần đổi status.
- Đề xuất: đọc `audit_logs` (`table_name='orders' and record_id=:id`) lấy chuỗi transition thật.

**M7 — OrdersModule/ReportModule thiếu `imports: [AuthModule]` → lỗi DI khi wire** (task-07, **đã xác minh** bằng code, chưa chạy)
- `apps/api/src/modules/orders/orders.module.ts:5-9`, `apps/api/src/modules/report/report.module.ts:4-8` inject `AccessService` nhưng không import `AuthModule` (không `@Global`, `apps/api/src/common/auth/auth.module.ts:14-19`). Mọi module khác đều import (`admin.module.ts:9`, `checkin.module.ts:8`...). Test che lỗi vì tự `providers: [AccessService]` (`orders-report.e2e-spec.ts:686`).
- Tái hiện: thêm `OrdersModule` vào `app.module.ts` → Nest "can't resolve dependencies of OrdersService (SupabaseService, ?)".
- Đề xuất: thêm `imports: [AuthModule]`; test nên import module thật thay vì liệt kê provider.

**M8 — AI-readable gate: ≥3 indicators** (cả hai task)
- `orders.service.ts` 764 dòng, `users.controller.ts` 412, `report.controller.ts` 374 (>300).
- Hàm >50 dòng: `getOrderDetail` (~160), `resolveManualReview` (~180), `getAdminTodo` (~150).
- Controller alias trùng lặp (`OrdersController`/`AdminOrdersController`, `ReportController`/`AdminReportController`, settings PUT/PATCH, voucher PUT/PATCH, admin-role 3 endpoint); `OrderSeatDbRow` khai báo 2 lần (`:225`, `:441`); interface khai báo trong thân hàm.
- Theo gate → FAIL.

### MINOR
- m1 `users.controller.ts:77` ghép `query.q` vào `.or()` → chèn điều kiện PostgREST (vd `q = "x%,created_at.gt.2000-01-01,email.ilike.%x"`) và tên có dấu phẩy/ngoặc → 500. Chỉ Admin gọi được nên không leo thang; nên escape/quote hoặc giới hạn ký tự. (đã xác minh bằng đọc code)
- m2 `packages/shared/src/schemas/orders.ts:8-13` các trường tìm kiếm không có `.max()`, `%`/`_` không escape trong `ilike` (`orders.service.ts:160-166`).
- m3 `orders.service.ts:142-152` lọc `transactionRef` quét payments toàn chuỗi rồi `.in("id", ids)` → giá trị rộng (`%`) làm URL quá dài → 500.
- m4 `packages/shared/src/schemas/report.ts:4-34` không kiểm `fromDate <= toDate`, không giới hạn khoảng ngày; regex chấp nhận `2026-13-45` → Postgres lỗi → 500 (`throw error`).
- m5 `report.ts:11` còn `channel: "POS"` sau CR remove-pos.
- m6 `users.controller.ts:384-410` N+1 `getUserById` (tới 100 call/trang), lỗi bị nuốt thành `locked:false`.
- m7 `orders.service.ts:253` trả `qrToken` cho Staff/Manager (token vé dùng soát cửa).
- m8 Không chặn Admin tự gỡ quyền Admin / tự khoá mình / gỡ Admin cuối cùng (`users.controller.ts:118-158, 298-318`). Spec không yêu cầu rõ → MINOR.
- m9 Đọc đơn bằng service role (`orders.service.ts:143-212, 392-396`) → không có lớp RLS phòng thủ thứ hai, trong khi AC-16 ghi "RLS chặn". Scope API hiện đúng, nhưng nên dùng `forUser(jwt)` (RLS `orders_select` đã đủ).
- m10 Mock RBAC RPC `orders-report.e2e-spec.ts:315-322` là code chết: `currentJwt.includes(MANAGER_HN01)` không bao giờ đúng vì uuid nằm trong payload base64url → nhánh 42501 của DB không được test; các test 403 báo cáo chỉ phủ kiểm tra tầng API.
- m11 AC "số liệu khớp seed test" của báo cáo không kiểm chứng được: RPC mock trả số cứng (`:324-344`).
- m12 Test settings audit `admin.e2e-spec.ts:647-651` pass sẵn vì seed đã có dòng audit `app_settings/seat_hold_minutes_web` (`:75-85`).
- m13 `listNeedsManualReview` không có lý do vào needs_manual_review (lệch tiền / tiền về muộn ghế đã bán) — brief yêu cầu "kèm lý do".
- m14 `assignStaff` theo email (`users.controller.ts:320-335`) cho Manager dò email có tồn tại (404 vs 201).
- m15 Doc reconcile: `docs/API_SPEC.md` chưa có dòng cho các endpoint admin/orders/reports.

### Good
- Guard vai trò có trên mọi endpoint; `@CinemaScope` + `@Roles("ADMIN","MANAGER")` cho gán Staff kiểm đúng vai trò TẠI rạp; Manager gán MANAGER → 403, gán rạp khác → 403, xoá MANAGER → 403; RLS `staff_assignments_insert/delete` là lớp hai.
- Settings: whitelist key + schema giá trị theo key; ghi qua `forUser` nên trigger audit có actor; `hold_seats` đọc `value #>> '{}'` nên giá trị số mới có hiệu lực cho hold mới.
- Voucher create/update/delete qua `forUser` (RLS admin-only + audit có actor); `23505` → 409.
- Báo cáo: `assertManagerAccess` chỉ tính rạp có vai trò MANAGER + RPC `has_cinema_manager_scope` ở DB; Staff → 403.
- Tra cứu đơn/chi tiết: scope theo rạp được gán ở tầng API đúng; Staff ghi resolve → 403.
- Không còn code khoá API POS trong module admin.

## Acceptance criteria

### task-06
| AC | Kết quả |
|---|---|
| Manager cấp MANAGER/ADMIN → 403; thêm Staff rạp khác → 403 | Đạt (code: `users.controller.ts:194-196`, guard CinemaScope; RLS lớp hai). Test có nhưng không chạy được. |
| Đổi thời gian giữ ghế → hold mới dùng giá trị mới; ghi audit | Đạt ở code (trigger `app_settings_audit` + `hold_seats_hardening.sql:426-433`). Test audit là xanh giả (m12); phần "hold mới" không có test. |
| Manager tạo/sửa voucher → 403; xem được | Đạt. |
| R-107 audit mọi thao tác thay đổi | **Thiếu** — M1. |
| R-105 voucher/user quản lý không phá dữ liệu | **Thiếu** — M3, M4. |

### task-07
| AC | Kết quả |
|---|---|
| AC-11: needs_manual_review HN01 thấy cho Admin + Manager HN01, không cho Manager HN02 | Đạt ở tầng API (scope). Nhưng Staff cũng thấy (M5). |
| AC-16: Manager HN01 gọi báo cáo/đơn HN02 → 403/rỗng | Đạt ở tầng API; nhánh DB 42501 chưa được test (m10). |
| Staff ghi xử lý needs_manual_review → 403 | Đạt. |
| Báo cáo doanh thu chỉ tính paid; khớp seed test | Không kiểm chứng được (view tính `paid, checked_in`; test dùng RPC mock trả số cứng — m11). |
| R-104 ghi kết quả xử lý / đánh dấu đã giải quyết | **Thiếu/hỏng** — C1. |
| R-103 lịch sử trạng thái | **Sai dữ liệu** — M6. |

## Verdict Reasoning
- task-07: 1 CRITICAL (C1: hỏng trên DB thật + ghi dữ liệu nửa vời + test xanh giả) và 4 MAJOR (M5, M6, M7, M8) → FAIL.
- task-06: MAJOR M1 (audit thiếu actor/thiếu bản ghi cho thao tác nâng quyền/khoá), M2 (trái quyết định user về audit), M3/M4 (voucher), M8 → FAIL.
- Report cũ ghi "STRICT PASS" cho cả hai task là không đúng.
