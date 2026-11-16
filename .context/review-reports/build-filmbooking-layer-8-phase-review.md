Agent: spec-validator

# Phase review — build-filmbooking LAYER 8 (test tích hợp, e2e, giám sát, as-built docs), round 1

Ghi chú path: file ghi đúng đường dẫn primary yêu cầu (`build-filmbooking-layer-8-phase-review.md`), không có `round-<R>` trong tên file theo quy ước layer 7. Header ghi rõ round 1. Nếu cần đúng quy ước `phase-<N>-round-<R>`, primary đổi tên khi close-out; không gộp vòng khác vào file này.

Nguồn đối chiếu: `SPECIFICATIONS.md` 3.0.0 (R-04/05/06/11/20/21/38/60/62/63/74/75/78/80/108–110, NFR-01..04, NFR-12..14, NFR-17, AC-01..08, AC-19, AC-24..26), `tasks/build-filmbooking/layer-8-task-01..09.md`, 14 reviewer report layer 8, `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`, `.context/runs/build-filmbooking-layer-8.md`, code/test/migration liên quan.

Phạm vi kiểm: đọc-chỉ (không chạy lại test). Số verify tổng lấy từ dispatcher (journal 2026-11-16, `fe13814`): lint/typecheck exit 0; unit shared 14 + api 483 + web 446 PASS; build PASS; `check-api-routes` 145=145; `db:test` 32 file/866 PASS; `test:int` 8 file/87 PASS; `pnpm e2e` 10 passed, 0 skipped; realtime 764ms (desktop) / 283ms (mobile), ngưỡng 2000ms. Đã kiểm thêm: `git diff --stat 4478116..94241ff` (89 file), grep POS/EXCHANGED/TODO, nội dung e2e booking/admin-new-cinema/seat-realtime, `lighthouserc.json`, migration `20261114190000`, cron `expire-overdue-holds` (`* * * * *`).

## Verdict: ⚠️ GAPS FOUND (phase review, không FAIL nghiệp vụ)

Không tìm thấy requirement MVP nào bị hỏng trong code, không có test xanh giả trên tiêu chí có gate, và không có intent doc nào bị hạ cấp (xem mục 3 dưới). Có 3 blocker để đóng layer 8 và chuyển layer 9 (deploy). Các mục còn lại là non-blocker, nên đưa vào gap register.

### Blocker (phải xử lý trước khi tag `layer-8-done` / chuyển layer 9)

- **B1 — Bằng chứng LCP NFR-01 chưa đủ, AC đang đánh dấu [x] sai.** `lighthouserc.json` đo `/`, `/phim`, `/rap`. Số đo thật (journal, reviewer task-06): chỉ `/rap` 922ms và `/dang-nhap` 919ms (`/dang-nhap` không nằm trong config). `/` và `/phim` chưa đo. NFR-01 yêu cầu LCP ≤ 2,5s cho trang chủ, chi tiết phim, chi tiết rạp; `/rap` là trang danh sách, không phải chi tiết. Task-06 AC "LCP ≤ 2,5s trang chủ/phim/rạp" đang [x], và reviewer task-06 round 1 ghi PASS dù thiếu số đo. Hướng xử lý: đo `/`, `/phim`, `/phim/[slug]`, `/rap/[code]` trên build production có dữ liệu seed (hoặc LHCI), ghi số vào task-06; nếu không đo được trước layer 9 thì bỏ [x] và mở GAP-031 `open`, để PO chấp nhận rõ ràng. Không tự đánh PASS.
- **B2 — As-built docs còn TODO của dispatcher.** `README.md:42` (biến Sentry), `README.md:57` (cổng/biến e2e, lighthouserc), `docs/DESIGN.md:64` (cấu hình Sentry + Lighthouse CI) còn `<!-- TODO(dispatcher) ... -->`. Task-07 AC và DoD (docs as-built) chưa đóng. Đã đối chiếu: `SENTRY_DSN` (api `apps/api/src/instrument.ts:5`, `config/env.ts:45`) và `NEXT_PUBLIC_SENTRY_DSN` (web `sentry-config.ts:32`) đúng tên biến và hành vi tắt khi thiếu DSN, nên chỉ cần xoá TODO và điền cổng/lệnh e2e/Lighthouse thật.
- **B3 — Close-out trạng thái chưa đồng bộ với bằng chứng.** (a) Task file DoD/AC chưa tick: task-01..04 còn "Check commands" và "committed" chưa [x] (task-03 DoD trống); task-05 AC chưa tick dù `pnpm e2e` 10/10; task-08/09 thiếu verification summary và Repro Verification theo bug rules. (b) GAP-028 gắn nhãn "AC-08 (đăng ký)" sai: AC-08 trong spec 3.0.0 (SPEC:371) là màn tóm tắt + checkbox đồng ý điều khoản + nút thanh toán bị vô hiệu tới khi tick (đã được `e2e/booking.spec.ts:24-33` phủ). Đăng ký và xác nhận email là R-04/R-05 (AC-01/AC-02), đã có int `auth-flows`; phần còn thiếu là e2e đăng ký qua UI. (c) GAP-029 còn placeholder `R-xx`; cần map sang R-74/R-75/R-78/R-80 (đúng requirement của lệch tiền webhook). Đây là sửa tài liệu, không cần đổi code.

### Non-blocker (đưa vào gap register, không chặn đóng layer 8)

Xem danh sách gap đề xuất ở mục 4.

## 1. Ma trận coverage (requirement | nguồn | trạng thái | bằng chứng)

Trạng thái: [OK] = có bằng chứng; [PARTIAL] = một phần, ghi rõ phần thiếu; [MISSING] = chưa có bằng chứng.

| # | Requirement / AC | Nguồn | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|---|---|
| 1 | AC-06 / R-62 — 2 khách cùng E5, đúng 1 thắng (lặp 50) | SPEC:369; task-01 AC | [OK] | `apps/api/test/integration/concurrency.int-spec.ts` (report task-01 r1: AC-06 50 vòng PASS). Chưa thấy bằng chứng UI "E5 vừa có người chọn" cho người thua (SPEC AC-06) — xem gap G-036. |
| 2 | R-62 / NFR-04 — không bán trùng ghế, ràng buộc DB | SPEC:170, 344; task-01 | [OK] | 0 ghế trùng ở 100 client/20 s và burst 100; pgTAP `031_booking_rls` có unique 23505 (task-01 r1 "không có đường bán trùng"). |
| 3 | NFR-02 — ≥100 user đồng thời, ≥20 giữ ghế/s không bán trùng | SPEC:342; task-01 | [OK] theo nhịp; [PARTIAL] burst | Nhịp 20/s × 30 s: p95 26–590ms qua 4 lần (reviewer r1 đo lại 26/46ms). Burst 100 cùng lúc p95 1,4–2,9s không gate (`task-01` ghi "không chặn p95"). Cách đọc này hợp lý cho "không bán trùng", nhưng NFR-01 "giữ ghế p95 ≤ 1s" không nói rõ ở tải đỉnh → xem G-035 (cần PO chốt, không tự thêm requirement). |
| 4 | NFR-01 — giữ ghế p95 ≤ 1s | SPEC:341; task-01 | [OK] theo nhịp 20/s | 600 hold/30 s p95 371/590ms (builder, máy tải) và 26–55ms (reviewer). Ngưỡng 1000ms đạt cả 4 lần. |
| 5 | AC-07 / R-63 — hold hết 10' → nhả, đơn expired | SPEC:370; task-01 | [OK] chức năng; [PARTIAL] thời gian | `hold-expiry.int-spec.ts` backdate + cron (pg_cron `expire-overdue-holds` mỗi phút, `rpc_hold.sql:770`). Thời gian ≤ 2s **không được đo** trong int-test. UI nhả ghế ≤ 2s có cơ chế client theo `expires_at` (`seat-map.test.tsx:296`, `seatmap.service.ts:13,149`), nên không phải blocker; ghi như residual. |
| 6 | NFR-03 / R-60 — realtime 2 phiên ≤ 2s, kênh tách theo suất | SPEC:168, 343; task-05 | [OK] đo; [PARTIAL] kênh theo suất | `e2e/seat-realtime.spec.ts:58-70` đo từ click A tới `data-state=held` của B: 764ms / 283ms. Không có test chứng minh kênh tách theo suất (chỉ thấy `seats:${showtimeId}` trong `use-showtime-seats.ts:85`). Cách đo của reviewer task-05 r2 hợp lệ (không xanh giả). |
| 7 | AC-09 — chữ ký sai → đơn không đổi + log | SPEC:366?; task-03 | [OK] | `payos-webhook.int-spec.ts` (report task-03 r1 STRICT PASS, int 6/6 ×3 do dispatcher chạy). |
| 8 | AC-10 — 3 webhook song song → 1 payment/vé/email | task-03 | [OK] | Như trên. |
| 9 | AC-11 — tiền về muộn → needs_manual_review + email | SPEC:368 (AC-11 không nằm trong dòng liệt kê; nguồn task-03) | [PARTIAL] | Đạt hành vi; MINOR task-03 r1: AC-11 chưa assert reason và payment PAID; nhánh lệch tiền chưa assert payment (GAP-029). |
| 10 | Webhook lỡ → reconcile đưa về paid đúng 1 lần | task-03 AC | [OK] | Như trên (report r1). |
| 11 | AC-13 / AC-16 / AC-17 — phân quyền theo rạp, không lộ PII | SPEC:(AC-13/16/17); task-02 | [OK] | `rls-scope.int-spec.ts` 29/29 ×2 (r2 STRICT PASS): WRONG_CINEMA không PII (`:476-509`), Manager HN01 bị 403 với HN02, khách A không đọc đơn B. pgTAP `090_rls_matrix` 46/46, kiểm `relrowsecurity` trên mọi bảng public (`090:49,57`). |
| 12 | Phân quyền theo rạp — báo cáo qua JWT trực tiếp (3 view còn lại cho Manager) | task-02 r1 mục 7 | [PARTIAL] | Chỉ phủ 1 view `v_report_revenue_daily` (`044:334-345`); MINOR, chưa có trong register. |
| 13 | AC-01 / AC-02 / AC-03 — chưa xác nhận bị chặn giữ ghế; resend cooldown; lockout 5 lần + email | SPEC:364–366; task-04 | [OK] | `auth-flows.int-spec.ts` 15 ca, 30/30 ×2 cùng cancel-showtime (r2 STRICT PASS). |
| 14 | AC-04 — OAuth Google trùng email không tự gộp | SPEC:367; task-04 AC | [PARTIAL] | Mô phỏng guard DB `guard_identity_insert` (`auth-flows:197-232`), không phải GoTrue/Google thật. Checklist kiểm tay 4 mục (`task-04:48-51`) đều chưa tick, và chưa có trong gap register → G-033. |
| 15 | AC-05 — huỷ liên kết Facebook cuối cùng bị từ chối + hướng dẫn | SPEC:368; task-04 | [PARTIAL] | Int: DELETE 409 + hướng dẫn (`auth-flows:277`), mô phỏng user OAuth-only qua encrypted_password. Facebook thật chưa kiểm → G-033. |
| 16 | AC-24 / AC-25 / AC-26 — huỷ suất, email hàng loạt, hoàn thủ công, đóng rạp | SPEC:(AC-24..26); task-04 | [OK] | `cancel-showtime.int-spec.ts` 15 ca ×2 (r2 STRICT PASS sau fix MAJOR-1: giữ ghế đã nhả, 409 SHOWTIME_CANCELLED). |
| 17 | AC-08 — checkbox đồng ý + nút thanh toán disabled + dialog đúng tên và địa chỉ rạp + bản ghi đồng ý kèm thời điểm | SPEC:371 | [PARTIAL] | `e2e/booking.spec.ts:24-33` phủ: heading, tên rạp, nút disabled trước khi tick, enabled sau tick. Chưa assert địa chỉ rạp trong dialog (G-036). Task-05 mô tả AC-08 là đăng ký → sai mapping (xem B3b). |
| 18 | AC-19 — admin tạo rạp/phòng/sơ đồ/suất → rạp mới xuất hiện ở /rap và bán được ngay | SPEC:382; task-05 | [PARTIAL] | `e2e/admin-new-cinema.spec.ts`: tạo rạp qua UI, phòng/suất qua API, khách giữ ghế (`:81-91`) và sang `/xac-nhan` (`:95-115`). **Không** assert rạp mới xuất hiện ở danh sách `/rap` công khai; **không** thanh toán ở rạp mới (thanh toán chỉ phủ ở rạp khác trong booking.spec). Task-05 ghi trung thực (residual). → G-032. |
| 19 | NFR-12 — axe 0 vi phạm serious/critical (SeatMap, đăng nhập, xác nhận đơn) | SPEC:352; task-06 AC | [OK] | `seat-map.a11y.test.tsx` (report task-06 r1 STRICT PASS): 4 trạng thái ghế, LoginForm, OrderConfirmPage. Mức unit (jsdom/axe), không phải e2e trên browser thật. |
| 20 | NFR-14 — Sentry gắn cinema_id, scrub PII, tắt khi thiếu DSN | SPEC:354; task-06 | [OK] | `sentry.ts` (reportAlert no-op khi thiếu DSN), `all-exceptions.filter.ts` (tag cinema_id), `sentry-config.test.ts`; PII không nằm trong payload email_failed (report r1). Transport mock, không gửi thật. |
| 21 | NFR-14 — cảnh báo "tỷ lệ lỗi giữ ghế tăng bất thường" | SPEC:354 | [PARTIAL] | Có cảnh báo `hold_error` nhưng là **per-event** 5xx không phải ngưỡng tỷ lệ (`booking.service.ts:57`). Cảnh báo webhook sai chữ ký (`webhook.controller.ts:52`) và email FAILED (`jobs.controller.ts:254`) là per-event, đạt. → G-034. |
| 22 | NFR-01 — LCP ≤ 2,5s trang chủ / chi tiết phim / chi tiết rạp | SPEC:341; task-06 AC | [MISSING] bằng chứng | Chỉ `/rap` và `/dang-nhap` đo được. `/`, `/phim`, `/phim/[slug]`, `/rap/[code]` chưa đo. → B1 / G-031. |
| 23 | Task-06 ISR/revalidate cho trang phim/rạp | task-06 Description | [PARTIAL] | Builder: "ISR" = fetch cache 60s, trang vẫn dynamic do cookie (journal 2026-11-14). Mô tả task không khớp hoàn toàn. Ghi nhận như deviation, không ảnh hưởng spec (NFR-13 chỉ yêu cầu SSR). |
| 24 | NFR-17 — bắt buộc test: web↔web, webhook (chữ ký/idempotent/tiền muộn), auth (xác nhận email, liên kết), phân quyền theo rạp, huỷ suất + email hàng loạt | SPEC:357 | [OK] | Đủ 5 nhóm, mỗi nhóm có int-spec/pgTAP tương ứng (mục 1–16). |
| 25 | R-38 / GAP-030 — GET /movies và catalog public không 500 trên DB thật | SPEC:(R-38); task-08 | [OK] | Migration `20261114190000_showtimes_cinema_fk.sql` (HIGH_RISK, header đủ: thao tác, rollback, verify; ON DELETE RESTRICT); `movies.service.ts:260,328` dùng `cinemas!showtimes_cinema_id_fkey!inner`; `catalog-public.int-spec.ts` 10/10 ×2; bỏ FK → 7/10 đỏ (dispatcher). pgTAP 062. PostgREST thật không PGRST201 ở `ticket-data.ts:47`. |
| 26 | Task-09 — `/`, `/phim`, `/rap`, `/lich-chieu` trả 200 khi DB rỗng; không còn caller truyền function qua client | task-09 AC | [OK] một phần | Builder: stack thật qua stub API cho `/ /phim /rap /lich-chieu` = 200 (trước fix 500). `states-server-boundary.test.tsx` là test cấu trúc. `/ve`, `/rap/[code]`, `/phim/[slug]`, `/dat-ve/[showtimeId]` chưa kiểm với DB rỗng (journal, gap register follow-up). Mô tả task 09 có nêu `/ve` → residual, không chặn. |
| 27 | Task-07 — API_SPEC liệt kê mọi controller; ERD khớp migration; README ≤ 10 bước | task-07 AC | [OK] một phần | `scripts/check-api-routes.mjs` 145=145. ERD:95 ghi FK `showtimes_cinema_id_fkey` khớp migration. README 8 bước. [PARTIAL]: còn TODO dispatcher (B2). |
| 28 | Intent docs (SPECIFICATIONS, spec/, docs/BRD, PRD, USER_FLOW, docs/specs) không bị đổi trong layer 8 | FEATURE_AGENTS rule | [OK] | `git diff --stat 4478116..94241ff`: không có SPECIFICATIONS.md, spec/, docs/BRD.md, docs/PRD.md, docs/USER_FLOW.md, docs/specs/. Thay đổi chỉ ở as-built (API_SPEC, ERD, DESIGN, gap register) và tasks. |
| 29 | POS đã bỏ (spec 2.0.0): không có tàn dư mới trong layer 8 | memory pos-removed; SPEC:27 | [OK] với MINOR | Không có POS trong `apps/api/test/integration/**`, `e2e/**`. Docs (API_SPEC:17, DESIGN:26, README:3, ERD:46,96) ghi rõ POS đã gỡ, enum `POS` còn là nợ DB có chủ đích. MINOR: `supabase/tests/090_rls_matrix.test.sql:122,123,158` (file layer 8 mở rộng) dùng fixture `affected_order_actions` action `EXCHANGED` (đổi suất đã bỏ, spec 3.0.0). Đây là tàn dư tính năng đã bỏ trong test mới; không phải tái thêm POS. → G-036-b. |
| 30 | Gap register đầy đủ | docs/changes/TECHNICAL_REQUIREMENT_GAPS.md | [PARTIAL] | GAP-028..030 có; GAP-028 sai mapping, GAP-029 `R-xx`. Thiếu các mục ở mục 4 bên dưới. |

## 2. Cross-document conflict

| Conflict | Nguồn A | Nguồn B | Mức | Ghi chú |
|---|---|---|---|---|
| Mapping AC-08 | SPEC:371 (checkbox đồng ý) | task-05 Description (đăng ký → xác nhận email) | Medium (tài liệu) | Sửa task-05 và GAP-028. Không phải conflict với intent; intent đúng. |
| LCP scope | NFR-01 (chi tiết phim/rạp) | lighthouserc.json (`/phim`, `/rap` danh sách) | Medium | Sửa config đo hoặc ghi gap (B1). |
| Realtime release ghế ≤2s | R-63/AC-07 (≤2s) | cron mỗi phút `expire_overdue_holds` | Low | Client tự nhả theo `expires_at` nên UI đạt ≤2s; DB-level/realtime push của cron chậm tới ~60s. Không có HIGH conflict; ghi residual và cân nhắc spec note khi có CR. |
| Burst p95 | NFR-01 "giữ ghế p95 ≤ 1s" (không nói tải đỉnh) | task-01 không gate burst | Medium (ambiguous) | Cần PO chốt đây là mục tiêu tải đỉnh hay không. Không tự thêm requirement. |

Không có HIGH conflict. Không có mâu thuẫn giữa BRD/PRD và as-built (intent docs không đổi).

## 3. Kiểm "intent không bị hạ cấp"

- `git diff --stat 4478116..94241ff` không chạm SPECIFICATIONS.md, spec/, docs/BRD.md, docs/PRD.md, docs/USER_FLOW.md, docs/specs/.
- Các thay đổi as-built đối chiếu với code (ERD `showtimes_cinema_id_fkey` khớp migration; API_SPEC khớp route count; DESIGN ghi đúng expire/hold theo report r3 task-07).
- GAP-030 đóng bằng sửa code và migration, không đổi spec.

## 4. Gap đề xuất vào register (dispatcher ghi; reviewer/spec-validator không sửa)

| ID đề xuất | Requirement | Mô tả | Nguồn | Hướng xử lý | Status đề xuất |
|---|---|---|---|---|---|
| GAP-028 (sửa) | AC-08 → đổi thành R-04/R-05 (đăng ký); AC-08 riêng đã phủ | e2e "đăng ký → xác nhận email" thiếu (Turnstile); AC-08 không còn là gap | task-05 | Mock/test-secret Turnstile hoặc bỏ | open |
| GAP-029 (sửa) | R-74/R-75/R-78/R-80 (map cụ thể) | confirm_paid nhánh lệch tiền ghi đè amount; assert payment thiếu | task-03 | Không ghi đè amount; thêm assert | open |
| GAP-031 | NFR-01 | LCP chưa đo: `/`, `/phim`, `/phim/[slug]`, `/rap/[code]` (task-06 AC đang [x]) | task-06 r1 | Đo trên build production có seed, ghi số; hoặc PO chấp nhận | open (P1, chặn layer 9 nếu chưa đo) |
| GAP-032 | AC-19, R-38 | e2e admin rạp mới: không assert xuất hiện ở /rap công khai; không thanh toán ở rạp mới | task-05 | Thêm assert /rap; thêm thanh toán 1 đơn ở rạp mới | open (P2) |
| GAP-033 | AC-04, AC-05 (R-20, R-21) | OAuth thật chưa kiểm: mô phỏng guard DB; checklist 4 mục chưa tick | task-04 | Kiểm tay trước deploy, ghi kết quả; hoặc accepted có PO | open (P2, manual) |
| GAP-034 | NFR-14 | Cảnh báo "tỷ lệ lỗi giữ ghế tăng bất thường" là per-event, chưa có ngưỡng tỷ lệ | task-06 r1 | Thêm ngưỡng/aggregation (monitoring) | open (P3) |
| GAP-035 | NFR-01 (giữ ghế p95 ≤ 1s ở tải đỉnh) | Burst 100 cùng lúc p95 1,4–2,9s không gate; spec không rõ tải đỉnh | task-01 | PO chốt mục tiêu; nếu cần, CR sửa NFR | open (P2, cần PO) |
| GAP-036 | AC-06, AC-08, NFR-03, AC-07 | Residual nhỏ: người thua AC-06 chưa có bằng chứng thông báo "E5 vừa có người chọn"; AC-08 chưa assert địa chỉ rạp trong dialog; NFR-03 kênh theo suất chưa có test; AC-07 ≤2s chưa đo ở int | task-01, task-05 | Bổ sung assert khi có dịp | open (P3) |
| (follow-up, không gap intent) | — | FakeDb `booking.e2e-spec.ts:643,875` và `orders-report.e2e-spec.ts:611,1163` còn mô phỏng PGRST200 cho embed nay hợp lệ → test xác nhận lỗi không còn tồn tại (xanh giả nhẹ); fixture `EXCHANGED` trong `090:122,123,158`; `RESEND_FROM_EMAIL` có trong .env.example nhưng code không đọc (task-07 r1); task-05 khe `phx_reply` trước `postgres_changes` (r2 MINOR-1); task-06 chỉnh file ngoài Files list (booking.service, webhook.controller, jobs.controller, layout/error/global-error, movie-card, lib/images, showtime-schedule) — reviewer đã STRICT PASS nhưng cần ghi nhận scope drift | các report | Đưa vào follow-up register | open (P3) |

Ghi chú: số gap mới đề xuất = 6 (GAP-031..036) + 2 sửa mapping (GAP-028, GAP-029). Không cần sửa `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md` trong report này.

## 5. Blocker vs non-blocker (kết luận cho bước đóng layer 8 và chuyển layer 9)

Blocker:
- B1 (LCP chưa đo cho `/`, `/phim`, chi tiết phim, chi tiết rạp; AC đang [x] sai). Đo hoặc mở GAP-031 và được PO chấp nhận trước deploy.
- B2 (TODO(dispatcher) trong `README.md:42,57` và `docs/DESIGN.md:64`). Xoá TODO, điền thông tin thật.
- B3 (close-out: task file DoD/AC chưa tick, GAP-028 sai mapping, GAP-029 placeholder `R-xx`).

Non-blocker: GAP-032 (AC-19 scope), GAP-033 (OAuth manual), GAP-034 (NFR-14 ngưỡng), GAP-035 (burst p95, chờ PO), GAP-036 (residual nhỏ), follow-up test debt (FakeDb, EXCHANGED fixture, RESEND_FROM_EMAIL, scope drift task-06), và residual ở mục 6.

## 6. Residual risk / chưa xác minh

- Không chạy lại test trong report này; dựa vào số verify tổng của dispatcher. `pnpm e2e` chỉ được báo 10 passed; reviewer task-05 không chạy được vì allowlist. Cần xác nhận bằng log `scratchpad/verify-layer8.log` nếu log còn.
- `.github/workflows/e2e.yml` chưa chạy thật; e2e chưa nằm trong `pnpm typecheck`.
- Mobile-360 là viewport Chromium mô phỏng, không phải thiết bị thật.
- `pnpm db:test` từng có nhiễu `rate_limit_buckets` từ int-test (032 #18); đã dọn bằng `purge_expired_ops_data()`, nợ dọn bucket chưa giải quyết.
- Lighthouse `/` và `/phim` chưa đo (B1).
- `/ve`, `/rap/[code]`, `/phim/[slug]`, `/dat-ve/[showtimeId]` chưa kiểm với DB rỗng (task-09).
- Migration FK `showtimes_cinema_id_fkey` HIGH_RISK chỉ áp local; chưa promote staging/prod (đúng luật: demo, không promote production).

## 7. Trạng thái

- Verdict: ⚠️ GAPS FOUND. Blocker B1, B2, B3 cần xử lý trước `layer-8-done` và trước deploy layer 9. Non-blocker ghi vào register.
- Không sửa source/docs/tasks. Chỉ ghi report này.
- Số gap mới đề xuất: 6 (GAP-031..036), kèm 2 sửa mapping (GAP-028, GAP-029).
