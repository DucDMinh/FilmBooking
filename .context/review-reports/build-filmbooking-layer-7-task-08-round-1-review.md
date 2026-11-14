Agent: reviewer

# Review: build-filmbooking layer-7 task-08, round 1
Web admin báo cáo MVP: doanh thu, theo phim/suất/rạp, đối soát PayOS, suất bị huỷ

- Worktree: `E:/FilmBooking/.worktrees/layer-7__task-08` (branch `wt/layer-7__task-08`, chưa commit)
- Diff (toàn bộ là file mới): `apps/web/src/app/admin/bao-cao/page.tsx`, `components/admin/{report-dashboard.tsx, report-utils.ts, revenue-report.tsx, payos-reconcile-table.tsx, cancelled-showtimes-report.tsx}`, `components/admin/__tests__/reports.test.tsx`

## Review level
**STRICT**

## Reason
Đây là báo cáo kèm RBAC (scope Manager theo rạp, Admin xem toàn chuỗi), có tiền (VND, đối soát PayOS), và AC-25 phụ thuộc vào báo cáo suất bị huỷ.

## Blast radius
- Thêm route mới `/admin/bao-cao` và 5 component mới. Không sửa API, shared schema hay migration.
- Có tái dùng `resolveScope`/`ALL_CINEMAS` (use-admin-scope.ts), `apiFetch`, `ErrorState/EmptyState/LoadingState`, nhưng không chỉnh sửa các phần này.
- Builder thêm 3 file ngoài danh sách Files to Create/Modify (`report-dashboard.tsx`, `report-utils.ts`, `__tests__/reports.test.tsx`). Cả 3 đều là file mới, không đè file của task song song khác. Đây là ghi chú quy trình, không chặn.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 25 file, 353/353 test, 55s. Lần chạy này không có timeout |
| `pnpm build` | PASS (`/admin/bao-cao` là route động) |
| oxlint | skip, oxlint not configured (repo không có `.oxlintrc*`) |
| aislop | skip, lệnh không nằm trong allowlist verify của reviewer |
| ocr | skip, ocr not installed hoặc không nằm trong allowlist |

Về flaky: builder báo lần chạy đầu có 2 test cũ (catalog-admin MovieForm, PriceMatrix) bị timeout 5000ms. Tôi không tái hiện được lỗi này: full suite pass ngay lần đầu, nên tôi không chạy lần 2 (Tool Loop Guard). Hai test đó nằm ngoài diff, timeout trùng lúc nhiều agent chạy song song, nên tôi xếp vào nhóm do tải máy và không chặn task này. Nếu sau này lặp lại khi máy rảnh thì nên tách thành bug riêng.

## Cross-boundary check (UI ↔ API ↔ SQL)
- Endpoint `/admin/reports/{revenue,showtimes,payos-reconciliation,cancelled-showtimes}` có thật trong `apps/api/src/modules/report/report.controller.ts:335-374`, đều `@Roles("MANAGER")`. Service `assertManagerAccess` (dòng 41-58) chỉ cho Admin hoặc vai trò `MANAGER`, STAFF bị 403. RPC kiểm `has_cinema_manager_scope` (`supabase/migrations/20261112160000_rbac_cinema_reports_hardening.sql:104-117`), và hàm này chỉ chấp nhận MANAGER. UI lọc `role === "MANAGER"` (`report-dashboard.tsx:51-53`), khớp với API. OK.
- Admin xem "Toàn chuỗi" thì không gửi `cinemaId` (`report-dashboard.tsx:46-48`). RPC cho Admin truyền `p_cinema_id null`. OK.
- Manager luôn gửi `cinemaId` của rạp mình là MANAGER. Test `reports.test.tsx:104-124` chặn trường hợp rạp chỉ là STAFF. OK.
- Ngày: revenue tính theo `(o.created_at at time zone 'Asia/Ho_Chi_Minh')::date` (hardening.sql:132). Showtimes và cancelled tính theo `(starts_at at time zone 'Asia/Ho_Chi_Minh')::date` (hardening.sql:447-448, 591-592). UI tính ngày bằng `toVnParts` (`report-utils.ts:52-61`). Múi giờ khớp.
- Nhãn discrepancy (`payos-reconcile-table.tsx:13-19`) có đủ 5 giá trị của SQL CASE (hardening.sql:241-248): AMOUNT_MISMATCH, NEEDS_MANUAL_REVIEW, STATUS_MISMATCH, PENDING_EXPIRED, OTHER_DISCREPANCY. OK.
- AC-25 ở tầng SQL: `refunded_manual_orders = count(distinct o.id) filter (where o.status = 'refunded_manual')` (hardening.sql:289). `total_refunded_amount` lấy `sum(aoa.refunded_amount)` với `action = 'REFUNDED_MANUAL'` (hardening.sql:295-298). Enum `affected_action ('EXCHANGED','REFUNDED_MANUAL')` và cột `refunded_amount` có thật (booking_tables.sql:30, 231). Đúng.
- Channel: UI không gửi `channel`, nên RPC nhận `p_channel null` và trả mọi kênh. `aggregateByDay` cộng tất cả kênh, cho ra tổng đúng. Bỏ `channel` không làm sai tổng.
- Abort: `useReport` và `useReportScope` dùng AbortController, kiểm `signal.aborted` trước khi setState. Test `reports.test.tsx:142-169` mô phỏng response cũ về muộn. OK.
- ErrorState: lỗi thì chuyển sang trạng thái error và không giữ data cũ (`report-utils.ts:42-44`). Có test. OK.
- VND: dùng `formatVnd` của shared, test khẳng định `1.734.000 ₫`. OK.

## Findings

### F1 — MAJOR (chặn PASS): khoảng ngày mặc định làm suất bị huỷ trong tương lai không hiện ra, nên AC-25 fail ở màn mặc định
- `report-utils.ts:59-61` đặt `defaultVnRange()` = `[hôm nay - 29, hôm nay]`. `report-dashboard.tsx:77-85` dùng chung khoảng này cho `CancelledShowtimesReport` (`cancelled-showtimes-report.tsx:50-54`).
- RPC `report_cancelled_showtimes` lọc theo **ngày chiếu** `starts_at` (hardening.sql:591-592), không lọc theo ngày huỷ.
- Huỷ suất thường làm với suất **chưa chiếu**. `set_cinema_status` bắt buộc huỷ trước các suất tương lai đã bán vé (hardening.sql:58-82), và đơn `affected`/`refunded_manual` sinh ra từ việc huỷ đó. Luồng AC-25 là: huỷ suất tuần sau, ghi nhận hoàn tiền thủ công, rồi mở Báo cáo. Ở màn mặc định, `toDate = hôm nay` loại suất đó ra, nên màn hiện "Không có suất bị huỷ". AC-25 ("đơn refunded_manual xuất hiện trong báo cáo suất bị huỷ") không đạt nếu người dùng không tự đổi "Đến ngày", và UI không có gợi ý nào rằng ngày ở đây là ngày chiếu.
- Bảng "Theo phim, suất, rạp" (`revenue-report.tsx:154`) cũng bị ảnh hưởng tương tự: doanh thu bán trước cho suất tương lai không hiện trong kỳ mặc định. Phần này nhẹ hơn nhưng cùng nguyên nhân.
- **False-confidence test:** `reports.test.tsx:94-102` (test AC-25) có mock `route()` trả `CANCELLED` bất kể query, và fixture có `startsAt` rơi đúng hôm nay. Vì vậy test không phát hiện được việc filter mặc định loại suất tương lai. Thêm nữa, fixture `showtimeStatus: "cancelled"` lệch với enum thật `CANCELLED` (hardening.sql:300). Hiện UI không hiển thị trường này nên chưa gây lỗi, nhưng mock đang không khớp contract.
- **Hướng sửa (chọn 1):** (a) cho section suất bị huỷ khoảng ngày riêng kéo vào tương lai, hoặc bỏ `toDate` mặc định để lấy mọi suất chiếu từ `fromDate` trở đi; hoặc (b) tách bộ chọn ngày cho section này và ghi rõ "theo ngày chiếu", với mặc định bao gồm các suất sắp chiếu. Sửa thêm fixture về `CANCELLED`. Bổ sung test khẳng định request `cancelled-showtimes` mặc định không cắt mất suất tương lai (ví dụ không có `toDate`, hoặc `toDate > hôm nay`), và mock nên lọc theo `fromDate`/`toDate` để test có ý nghĩa.

### F2 — MINOR: một bộ chọn ngày nhưng mỗi section hiểu "ngày" khác nhau
Doanh thu tính theo ngày tạo đơn, còn suất chiếu và suất huỷ tính theo ngày chiếu, nhưng dòng chú thích chỉ ghi "ngày theo giờ Việt Nam" (`report-dashboard.tsx:97-99`). Nên ghi rõ ngữ nghĩa ngày cho từng section. Có thể gộp vào lúc sửa F1.

### F3 — MINOR: user chỉ có vai trò STAFF vào thẳng URL thì thấy ErrorState kèm nút Thử lại
Trường hợp này rơi vào `{status:"error", retry}` (`report-dashboard.tsx:54-59`), nhưng bấm retry không bao giờ thành công. Nên hiện thông báo "Không có quyền xem báo cáo". Đây chỉ là UX, không rò dữ liệu vì API vẫn trả 403.

### F4 — MINOR: header chọn rạp STAFF thì báo cáo lặng lẽ chuyển sang rạp khác
Nếu Manager chọn trên header một rạp mà họ chỉ là STAFF, báo cáo tự lùi về rạp MANAGER đầu tiên mà không báo. Nhãn "Phạm vi:" vẫn hiện đúng tên rạp đang xem nên không gây hiểu sai nghiêm trọng.

### F5 — GAP (ghi nhận, không chặn)
- R-116 yêu cầu "danh sách giao dịch PayOS" và "tổng tiền theo rạp". API chỉ trả các giao dịch lệch, và task scope cũng chỉ ghi "lệch tiền, pending quá hạn". Thiếu phần tổng theo rạp.
- API PayOS reconciliation không lọc theo ngày, builder đã nêu gap này. Nên ghi cả hai vào gap register.

## Code quality / AI-readable
- Các file đều ngắn (≤166 dòng), hàm ≤50 dòng, tên rõ, comment giải thích lý do (WHY). Không có magic number đáng kể: `29 * 86_400_000` có JSDoc giải thích. Chưa thấy đủ 3 AI-chaos indicator.
- Security: không render HTML thô, query dùng URLSearchParams, quyền thật nằm ở API và RPC. Không phát hiện vấn đề.
- UI: dùng token có sẵn, có empty/error/loading state, bảng có `overflow-x-auto` cho biểu đồ. Chưa kiểm responsive bằng trình duyệt vì nằm ngoài quyền verify.
- AI-friendly web gate: N/A (trang admin nội bộ).

## Verdict
**FAIL**. Có 1 lỗi MAJOR (F1): luồng AC-25 không đạt ở màn mặc định, và test AC-25 là false-confidence. Typecheck, lint, test và build đều xanh, nhưng theo nguyên tắc adversarial review thì như vậy không đủ để PASS. Builder cần sửa F1 (kèm test và fixture). Nên sửa luôn F2 và F3 vì chi phí thấp. F4 và F5 chỉ cần ghi nhận.
