Agent: spec-validator

# Phase-end review — CR cinema-status-notice (phase 1-3, 4 task)

Mode: phase review (cross-check build vs spec). Chỉ đọc, không sửa code/spec.
Nguồn: `spec/changes/2026-11-18-cinema-status-notice.md`, `SPECIFICATIONS.md` (R-33 :125, R-136 :126, R-137 :127, R-108 :246, R-109 :247, NFR-17 :360, AC-26..30 :392-396, Quyết định PO :552-553), tasks `tasks/feature-cinema-status-notice/phase-{1-01,1-02,2-03,3-04}.md`.

## Verdict: ⚠️ GAPS FOUND (không có CRITICAL/HIGH mở)

Hành vi cốt lõi (404→200, hẹn lịch 7 ngày + email, job áp dụng, bỏ đường đổi tức thì, mail/banner/dialog cùng câu chữ hoàn tiền) đã có trong code và test. Còn các điểm MEDIUM/LOW bên dưới.

## Ma trận coverage

| # | Requirement / AC | Source (spec) | Bằng chứng code + test | Status | Ghi chú |
|---|---|---|---|---|---|
| 1 | R-136 lịch 168h, giữ status, email toàn bộ khách (dedupe, loại deleted/banned/chưa xác nhận) | SPEC :126; AC-27 :393 | `supabase/migrations/20261118100000_cinema_status_schedule.sql:321-436` (schedule_cinema_status, recipients :392-403); fixes `20261118110000:52-62` (F4 quyền trước khoá), `:70-73` (no key update) ; pgTAP `supabase/tests/066_cinema_status_schedule.test.sql` tests 2,8,9,14,16,16a-c | ✅ | |
| 2 | R-136 hẹn lại thay lịch; đúng trạng thái hiện tại: có lịch = huỷ + đính chính, không lịch = từ chối | R-136; AC-27 | RPC `20261118110000:79-105`; test 21, 22(177), 24, 26 trong 066 | ✅ | Spec R-136 đã ghi đủ (sửa so với round 1). |
| 3 | Chỉ Admin hẹn lịch | R-136; AC-27 | RPC kiểm admin `20261118110000:52-62`; test 27,29a (066); controller `apps/api/src/modules/cancellation/cancellation.controller.ts:134-150` `@Roles("ADMIN")` | ✅ | |
| 4 | Không đường đổi tức thì: PATCH /cinemas/:id status, PostgREST, RPC cũ gỡ | R-136; AC-27; CR acceptance | `apps/api/src/modules/catalog/cinemas.service.ts:235-246` (từ chối status khác hiện tại); migration `:45-49` revoke update + grant column (không status/scheduled_*), `:25-29` insert column (F3); `DROP set_cinema_status` `20261118100000:444`; test 31,32,33a,35 (066) | ✅ | Test API cho PATCH bị từ chối: chưa xác minh (xem gap G-6). |
| 5 | R-33/AC-26 job đến hạn: đổi status, xoá lịch, huỷ suất tương lai, paid→affected, không email từng đơn | R-33 :125; AC-26 :392 | `20261118100000:449-506` + fixes `20261118110000:160-220` (`p_send_emails=false` :203-208); test 40-49, 45, 48, 49 (066) | ✅ | |
| 6 | AC-29 mở lại không huỷ suất | AC-29 :395 | test 51 (066) ; logic `20261118110000:190` (chỉ khi ≠ OPEN) | ✅ | Spec có AC-29 (round 1 báo thiếu, đã bổ sung). |
| 7 | Lỗi 1 rạp không làm hỏng rạp khác | CR job; AC-26 | `20261118110000:212-215` exception per rạp; test 067 (concurrency) | ✅ | |
| 8 | R-137/AC-28: /rap/<mã> rạp không OPEN → 200 thông báo, không 404; mã sai 404; OPEN có lịch → banner | R-137 :127; AC-28 :394 | API `cinemas.service.ts:146-152` (detailPublic 200, rooms/showtimes rỗng); RLS `cinemas_select using(true)` `core_identity_chain.sql:409`; web `apps/web/src/app/(public)/rap/[code]/page.tsx:132-146, 203` (banner); `components/catalog/cinema-closed-notice.tsx:48-143`; test `apps/web/src/app/(public)/rap/[code]/__tests__/page.test.tsx:90-166` | ✅ | Xem G-2 về fetch lỗi 5xx. |
| 9 | Danh sách rạp /cinemas chỉ OPEN | R-33 :125; CR | `cinemas.service.ts:135` `.eq("status","OPEN")` | ✅ | |
| 10 | AC-30 dialog admin + nhãn lịch + huỷ lịch | AC-30 :396; R-136 | `apps/web/src/components/admin/cinema-status-dialog.tsx:36-188`; `apps/web/src/app/admin/rap/page.tsx:99-104,137-147`; `cinema-form.tsx:118,149` (edit không gửi status); test `apps/web/src/components/admin/__tests__/catalog-admin.test.tsx:203-300,378-403` | ✅ | |
| 11 | Nội dung email: thông báo chung, hạn hoàn tiền = ngày hiệu lực, sau hạn không giải quyết | CR yêu cầu; R-136 | `apps/api/src/modules/mail/templates.ts:693-694` (refundNoticeContent), `:757-786`, `:799-835`; test `apps/api/test/mail-templates.spec.ts:239-545` | ✅ | |
| 12 | Nhất quán câu chữ mail / banner / dialog | CR Web | Banner `apps/web/src/lib/cinema-schedule.ts:39-41` và dialog `cinema-status-dialog.tsx:146-152` dùng cùng cụm "từ ngày ... trở đi ... trước ngày ..., sau hạn sẽ không giải quyết" như mail `templates.ts:694`. Khớp về ý; dialog dùng câu rút gọn (không có "mã QR") | ✅ (ý) / ⚠️ nhỏ | G-7 |
| 13 | Khoảng hở "không chặn bán 7 ngày chờ" | Quyết định PO :553; CR | Có nêu trong SPECIFICATIONS.md :553 và CR `Ghi chú` | ✅ | (a) đã nêu trong spec. |
| 14 | Suất tạo mới trong lúc job chạy / sau khi rạp đóng | — | Job chỉ huỷ `starts_at > now()` tại thời điểm chạy (`20261118110000:190-195`); không có chặn tạo suất cho rạp không OPEN; spec không nói | ⚠️ MISSING | G-3 |
| 15 | Rạp OPEN bị tạo với scheduled_* | — | INSERT column-level không có scheduled_* (`20261118110000:25-29`); test 33a | ✅ | (c) đã khoá. |
| 16 | NFR-17 test cho lịch đổi trạng thái | NFR-17 :360 | Đã thêm "lịch đổi trạng thái rạp 7 ngày (R-136)"; test 066 + web + mail | ✅ | (d) đã có. |
| 17 | Quyết định PO thay BRD (BR-CHN-02, BRD §7.3, AC-26 BRD) | Quyết định PO :552 | `docs/BRD.md` vẫn ghi quy tắc cũ (chỉ ghi nhận, CR riêng) | ✅ (đã ghi nhận) | Intent doc, không sửa. |

## Findings

### CRITICAL
Không có.

### HIGH
Không có (HIGH-1 và HIGH-2 của round delta đã xử lý trong spec: R-33/R-108/R-109 nay có ràng buộc; BRD chỉ ghi nhận theo Quyết định PO).

### MEDIUM
- **G-1 (MEDIUM) — Chính sách "sau hạn không giải quyết" vs đơn `affected` vẫn ghi nhận hoàn tiền thủ công.** Mail `templates.ts:694` cam kết CINEMO không giải quyết sau hạn; R-33 (`SPECIFICATIONS.md:125`) và CR vẫn để Admin ghi "hoàn tiền thủ công" ở "Đơn bị ảnh hưởng". Cần PO chốt: đơn affected sau hạn có được hoàn tiền thủ công không. Đề xuất: làm rõ một câu trong R-33 hoặc mail.
- **G-2 (MEDIUM) — Lỗi mạng/5xx trên `/rap/<mã>` hiện thành 404.** `apps/web/src/app/(public)/rap/[code]/page.tsx:83-92` nuốt mọi lỗi (`fetchCinemaDetail` trả null) → `notFound()`; test `page.test.tsx` ("lỗi 5xx ... notFound") ghim hành vi này. Với rạp đóng, khách có thể thấy 404 khi API lỗi. Không vi phạm "mã sai 404" nhưng đi ngược tinh thần R-137. Đề xuất: chỉ 404 khi API trả 404; 5xx → trang lỗi.
- **G-3 (MEDIUM) — Suất tạo mới cho rạp không OPEN (trong 7 ngày chờ hoặc sau khi đóng) không được quy định và không bị chặn.** Job chỉ huỷ suất có `starts_at > now()` tại thời điểm chạy (`20261118110000:190-195`); suất tạo sau đó (kể cả sau đóng cửa) có thể bán được vì `/rap` không OPEN không hiện lịch nhưng API booking/hold có thể chưa kiểm status rạp. Cần xác minh `hold_seats`/`confirm` có kiểm `cinemas.status='OPEN'` hay không (chưa kiểm — xem phần chưa kiểm). Đề xuất: spec thêm một dòng về suất tạo mới và (nếu thiếu) chặn bán cho rạp không OPEN.

### LOW
- **G-4 (LOW) — Mốc hạn chót "từ ngày X / trước ngày X" dùng ngày, không dùng giờ hiệu lực** (`now()+7 ngày` có giờ). Suất ngày X trước giờ hiệu lực không bị huỷ (đã diễn ra); suất ngày X sau giờ hiệu lực bị huỷ dù hạn chót "trước ngày X" đã qua lúc 00:00. Đề xuất: ghi rõ mốc giờ trong R-136 hoặc mail (R-136 đã nói "ngày hiển thị theo giờ VN").
- **G-5 (LOW) — Stale mock trong test API.** `apps/api/test/cancellation.e2e-spec.ts:299-301` vẫn có nhánh `set_cinema_status` (không ảnh hưởng vì RPC mới đã có nhánh riêng `:236`), nên xoá nhánh chết.
- **G-6 (LOW) — Chưa thấy test tự động cho PATCH /cinemas/:id đổi status bị từ chối** (AC-27). Logic có tại `cinemas.service.ts:235-243`; cần xác nhận test API (`catalog.e2e-spec.ts` / `catalog-public.int-spec.ts`) có case này. Chưa kiểm.
- **G-7 (LOW) — Dialog admin dùng câu rút gọn** so với mail/banner (không nhắc "mã QR"). Nhất quán ý, không sai.
- **G-8 (LOW) — Bookkeeping spec**: `SPECIFICATIONS.md` đếm R/AC và bảng traceability cần bump khi spec-publisher chạy (round delta LOW-1). Chưa kiểm sau khi bump.

## Doc as-built còn lỗi thời (chỉ liệt kê, không sửa)
- Đã sửa (theo báo của primary, đã kiểm một phần): `docs/ERD.md:73,92` (đã nêu schedule_cinema_status, gỡ set_cinema_status); `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` GAP-021; `docs/specs/2026-11-10-filmbooking-mvp-design.md` dòng cũ.
- Chưa xác minh sau sửa: `docs/API_SPEC.md:192` (mô tả "RPC set_cinema_status"), `docs/DESIGN.md:50` ("chỉ Admin (`set_cinema_status`)"). Cần sửa khi reconcile.
- `spec/test-scope/current.json:448,502` (scope cũ "huỷ suất / Tạm đóng → email", AC-26 cũ) — spec-publisher sinh lại khi publish.
- `GEMINI.md:55` — nhật ký lịch sử, giữ nguyên (theo primary).
- `docs/BRD.md:226,348,413,644,654` — intent, chỉ ghi nhận (CR riêng).
- `tasks/build-filmbooking/layer-4-task-04.md:14,23` và `tasks/bug-layer34-review/*` — lịch sử task đã đóng, không cần sửa.

## Phần chưa kiểm (do giới hạn lượt)
- Xác minh `hold_seats`/luồng bán vé có kiểm `cinemas.status = 'OPEN'` (G-3).
- Test API cho PATCH bị từ chối và `GET /cinemas/:code` 200 trong `catalog.e2e-spec.ts` / `catalog-public.int-spec.ts` (G-6).
- Grep xác nhận `docs/API_SPEC.md:192` và `docs/DESIGN.md:50` đã sửa chưa.
- Chạy test thật (pgTAP, vitest) — không chạy, chỉ đối chiếu nội dung test. Bằng chứng "PASS" lấy từ run-log của builder/reviewer, chưa tự xác minh.

## Verdict Reasoning
Không có CRITICAL/HIGH và không có ❌ MISSING cho requirement cốt lõi. Có 3 MEDIUM và ≥3 mục ⚠️ (G-1, G-2, G-3) nên theo tinh thần phase review: ⚠️ GAPS FOUND. Đề xuất: PO chốt G-1, G-3; sửa G-2 (code) và G-5/G-6; reconcile doc as-built; rồi review lại (round 2).
