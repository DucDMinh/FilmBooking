# Review — build-filmbooking layer-8 task-01 — round 1

Agent: reviewer
Task: Test đồng thời giữ ghế web↔web + hết hạn hold + tải ≥20 hold/giây (AC-06, AC-07, NFR-01/02)
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-01` (branch `wt/layer-8__task-01`, chưa commit)

## Review level
**STRICT**

## Reason
Đây là test chống bán trùng ghế, lỗi kỹ thuật quan trọng nhất của dự án. Test đi qua RPC dùng chung `hold_seats` và job `expire_overdue_holds` (chạy trên toàn DB). Ngưỡng NFR là gate hiệu năng, và task file ghi rõ "Reviewer STRICT".

## Blast radius
- Chỉ thêm test, không sửa source hay migration. `git status`: `M tasks/build-filmbooking/layer-8-task-01.md`, cùng 4 file mới dưới `apps/api/test/integration/`:
  - `concurrency.int-spec.ts`
  - `hold-expiry.int-spec.ts`
  - `helpers/api-app.ts`
  - `helpers/booking-fixtures.ts`
- Các test này chạy trên DB Supabase local dùng chung:
  - Tạo khoảng 100 user GoTrue, các suất, giá cấp SHOWTIME và đơn, rồi dọn theo RunScope.
  - Gọi `expire_overdue_holds()` một lần. RPC này chạy trên toàn DB, nhưng pg_cron vẫn gọi nó mỗi phút nên không thêm rủi ro.
- CI: `.github/workflows/ci.yml:59` chạy `pnpm test:int`, nên suite này sẽ chạy trên CI với ngưỡng mặc định.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `cd apps/api && pnpm test:int concurrency hold-expiry` (lần 1) | PASS 7/7 (2 file), 52.2s. Không in p95 vì chạy reporter mặc định |
| `cd apps/api && pnpm test:int concurrency hold-expiry --reporter=verbose --silent=false` (lần 2) | PASS 7/7, 51.9s. AC-06 50 vòng: 1867ms. Burst 100: 21 thắng / 79 409, **p95=1412ms** (không gate). 100 client @20/s: 28/72, **p95=28ms**. Tải 600 hold/30.0s (~20.0/s): 201=71, 409=529, **p95(all)=26ms, p95(201)=28ms**, p50=21ms, max=77ms |
| `cd apps/api && pnpm test:int concurrency --reporter=verbose --silent=false` (lần 3, mẫu đo thứ 2) | PASS 4/4. AC-06: 2149ms. Burst p95=1462ms. 100 client @20/s: **p95=55ms**. Tải 600/30.0s: **p95(all)=46ms, p95(201)=44ms**, max=69ms |
| `pnpm lint` | PASS (shared, web, api `eslint src test`) |
| `pnpm typecheck` | PASS (api tsconfig có include `test`) |
| aislop / oxlint / ocr | skip: nằm ngoài allowlist agent-guard của reviewer, repo chưa cấu hình oxlint, chưa cài `ocr` |
| AI-friendly web | N/A (test nội bộ) |

Cả 3 lần chạy, `afterAll` → `cleanupScope` đều không throw. Hàm này throw nếu có bất kỳ lệnh xoá nào lỗi, nên đây là bằng chứng gián tiếp rằng không còn dữ liệu sót.

## Đối chiếu cross-boundary (code ↔ DB thật)
- **API không kiểm trước khi gọi RPC.** `booking.service.ts:44-52` gọi thẳng RPC `hold_seats` qua `forUser(jwt)`. Vì vậy bên phân xử tranh chấp là DB:
  - `20261112140000_hold_seats_hardening.sql:201-204`: khoá `seats ... FOR UPDATE` theo thứ tự `s.id`.
  - `:312-323`: kiểm HELD còn hạn hoặc SOLD, trả SEAT_TAKEN (mã 23514).
  - `:488-521`: nếu vi phạm `showtime_seat_states_showtime_seat_key` thì cũng trả SEAT_TAKEN.
- **Mã lỗi khớp HTTP.** `booking.helper.ts:14-17` chuyển SEAT_TAKEN thành `AppException(SEAT_TAKEN)`, ra 409. Test pin đúng `409` + `error.code === "SEAT_TAKEN"`.
- **Test không dùng mock.** Nest app thật listen cổng ngẫu nhiên, gọi qua `fetch` HTTP thật tới PostgREST/Postgres local. Không có rủi ro "mock bịa hành vi".
- **Ma trận ghế tránh ORPHAN_SEAT.** Lưới `rows × 2` cho mỗi đoạn tối đa 2 ghế, nên điều kiện `seg_available_before > 2` (`hold_seats_hardening.sql:405`) không bao giờ đúng. Mọi request bị từ chối chỉ có thể do SEAT_TAKEN, đúng như mô tả trong `booking-fixtures.ts:7-11`.
- **Bảng giá.** `price_rules.showtime_id ... on delete cascade` (`20261111030000_pricing.sql:34`), nên cleanup xoá suất là xoá luôn giá.
- **Biến môi trường không rò sang file khác.** `TRUST_PROXY_HOPS` được truyền qua `parseEnv({...})` + `overrideProvider(ENV)` (`api-app.ts:16-25`). Code này không ghi vào `process.env` (`env.ts` chỉ đọc `process.env` ở provider mặc định, dòng 116), nên giá trị không lọt sang file test khác. Throttler lưu in-memory theo từng app instance.

## Phán xử các điểm trọng tâm

### 1. Ca tranh ghế có thật sự đồng thời không: CÓ
- AC-06 bắn 2 request bằng `Promise.all([postHold, postHold])` (`concurrency.int-spec.ts:59-62`). undici mở 2 socket riêng (mặc định không giới hạn kết nối mỗi origin).
- `mapLimit` chỉ dùng để tạo user (`:42`), không chen vào đường tranh ghế.
- Burst dùng `Promise.all` với 100 request và `gapMs=0`.
- Ca tải là open-loop: lịch phát request cố định, không chờ phản hồi (`:136-146`).
- Assertion kiểm ở DB, không chỉ đếm status code:
  - AC-06: đúng 1 dòng `showtime_seat_states` cho ghế, và `order_id` trùng với đơn thắng (`:71-73`).
  - Ca mixed: tập ghế trong DB đúng bằng tập ghế của các đơn thắng, mỗi đơn thắng có đúng số dòng của nó (`:104-111`).
- Không có bằng chứng trực tiếp rằng 2 transaction chồng lấn trong DB ở mọi vòng (xem N5). Dù vậy cả hai nhánh phân xử (lock seats rồi kiểm §3.15, hoặc unique violation) đều cho cùng một kết quả đúng.

### 2. AC-06 và AC-07: ĐẠT
- **AC-06:** 50 vòng × 2 client, mỗi vòng đúng 1 bên 201 và 1 bên 409 SEAT_TAKEN, DB có đúng 1 dòng. Mỗi vòng dùng một ghế mới. Lý do: đơn mới của khách huỷ đơn cũ (R-64, `hold_seats_hardening.sql:252-280`), nên dùng lại cùng ghế sẽ trộn thêm hành vi huỷ. Cách này hợp lệ.
- **AC-07:** builder backdate `showtime_seat_states.expires_at` và `orders.hold_expires_at` thay vì đổi TTL. Cách này chứng minh đúng AC, vì mọi logic hết hạn đều so sánh timestamp đã lưu với `now()`:
  - `hold_seats` §3.14/§3.15 (`:286-318`).
  - `expire_overdue_holds` (`20261112100000_order_lifecycle_pending_payment.sql:605-635`).
  - Seatmap.
  - Còn TTL cấu hình chỉ ảnh hưởng lúc tính hạn ban đầu, và phần đó đã được test riêng (`hold-expiry.int-spec.ts:57-69`, đọc `app_settings.seat_hold_minutes_web`).
- Không đổi `app_settings` dùng chung là quyết định đúng, vì DB đang dùng chung với các agent khác.
- Sau khi backdate: seatmap đọc FREE trước khi cron chạy. Sau cron: đơn `expired`, dòng ghế bị xoá. Khách khác giữ được ghế ngay mà không cần chờ cron, và đơn cũ thành `expired`.

### 3. Cách đọc "100 client" và p95: KHỚP SPEC, ghi là capacity note
- `SPECIFICATIONS.md:342` (NFR-02): "≥ 100 người dùng đồng thời và ≥ 20 thao tác giữ ghế/giây … không bán trùng". Câu này mô tả 100 người dùng đang hoạt động với tổng tốc độ 20 hold/s, không phải 100 request trong cùng một thời điểm.
- `:341` (NFR-01): "giữ ghế p95 ≤ 1s".
- Builder gate p95 ở ca theo nhịp NFR-02 và ca tải 600/30s. Ca burst (gấp khoảng 100 lần tốc độ NFR-02) chỉ kiểm tính đúng. Cách đọc này khớp spec.
- Burst p95 tôi đo được là 1.41s và 1.46s (builder đo 1.6–2.9s khi máy có tải). Ghi nhận là capacity note (MINOR N3), không FAIL.

### 4. Ngưỡng override qua env: mặc định đúng AC/NFR
- Mặc định: `IT_RACE_ROUNDS=50`, `IT_MIXED_CLIENTS=100`, `IT_LOAD_RATE=20`, `IT_LOAD_SECONDS=30`, `IT_P95_LIMIT_MS=1000` (`concurrency.int-spec.ts:11-15`).
- `ci.yml` không đặt biến `IT_*` nào, nên CI chạy đúng ngưỡng spec.
- Không có chặn sàn hay validate giá trị (MINOR N4).

### 5. Cô lập dữ liệu: ĐẠT, còn 1 rủi ro flake hiếm (N2)
- Mỗi file có RunScope riêng.
- `afterAll` đóng app trước (`api?.app.close()`), rồi mới `cleanupScope`.
- Cổng ngẫu nhiên bind `127.0.0.1`.
- `vitest.integration.config.ts` đặt `fileParallelism: false`.

### 6. Phạm vi: chỉ thêm test, không sửa source/migration
- Hai helper mới nằm ngoài "Files to Create/Modify" (MINOR N6).

## Findings

### MAJOR
Không có.

### MINOR

**N1. Assertion "0 ghế trùng" ở ca tải là tautology (false-confidence).** `concurrency.int-spec.ts:155-156`
- Có `constraint showtime_seat_states_showtime_seat_key unique (showtime_id, seat_id)` (`20261111030100_booking_tables.sql:131`). Query lọc trên 1 suất, nên `new Set(seat_id).size === states.length` **không thể fail**.
- Ở ca này user được dùng lại theo `i % users.length`. Mỗi hold mới huỷ đơn cũ của chính user đó (§3.13), nên 61–71 lượt 201 trên 52 ghế là chuyện hợp lệ. Vì vậy số 201 cũng không đối chiếu được với DB.
- Không chặn PASS, vì cùng thuộc tính "0 trùng" đã được chứng minh không-tautology ở ca mixed với cùng tốc độ 20/s (`:104-111`).
- Đề xuất: cuối ca tải, kiểm `order_seats` của các đơn còn `holding` trên suất là duy nhất theo `seat_id` (bảng này không có unique chéo đơn), hoặc đổi comment cho rõ dòng này chỉ là sanity check.
- Không ai được trích `:156` làm bằng chứng cho NFR-02.

**N2. Flake hiếm do pg_cron thật.** `hold-expiry.int-spec.ts:83` và `:87`
- Job `expire-overdue-holds` đang được lịch chạy mỗi phút: pg_cron được tạo ở `20261111000000_extensions.sql:15`, lịch chạy được đăng ký ở `20261111040000_rpc_hold.sql:764-773`.
- Nếu tick cron rơi đúng vào khoảng giữa `backdateHold` (`:79`) và assertion:
  - `toBe("holding")` ở `:83` fail, hoặc
  - RPC gọi tay trả 0 và `toBeGreaterThanOrEqual(1)` ở `:87` fail.
- Khoảng hở chỉ vài chục ms, nên xác suất khoảng 0.1–0.5% mỗi lần chạy.
- Đề xuất:
  - `:83`: chấp nhận `holding` hoặc `expired`, hoặc bỏ assertion này (phần cốt lõi của AC-07 là ghế đọc FREE ở `:82`, và phần này không bị ảnh hưởng).
  - `:87`: chỉ kiểm `cron.error === null`, rồi kiểm trạng thái cuối `expired`.

**N3. Capacity note (NFR-01 so với burst).**
- 100 request cùng lúc cho p95 1.41–1.46s (tôi đo) và 1.6–2.9s (builder đo khi máy có tải). Nghẽn nhiều khả năng nằm ở pool kết nối PostgREST/DB local.
- Ngoài phạm vi NFR-02 nên không gate.
- Rủi ro còn lại cho CI: builder từng đo p95 ca tải tới 590ms (max 1042ms) khi 4 builder chạy song song. Runner CI 2 vCPU chạy chung Supabase Docker có headroom mỏng với ngưỡng 1000ms, và có thể flake trên CI.

**N4. Env override không có chặn sàn hay validate.** `concurrency.int-spec.ts:11-15`
- `IT_RACE_ROUNDS=0` làm vòng AC-06 chạy 0 lần và pass rỗng.
- Giá trị không phải số cho `NaN`: AC-06 vỡ ngay ở `createPricedShowtime` (chứ không pass rỗng), còn ngưỡng p95 = `NaN` thì assertion fail.
- `IT_P95_LIMIT_MS` có thể nới lên mà không có cảnh báo nào.
- Đề xuất: validate số nguyên dương, đặt sàn `RACE_ROUNDS >= 50` (hoặc `expect(RACE_ROUNDS).toBeGreaterThanOrEqual(1)`), và log ngưỡng hiệu lực khi khác mặc định.

**N5. Gate p95 chủ yếu đo nhánh 409.** `concurrency.int-spec.ts:167`
- Khoảng 88–90% request ở ca tải là 409. NFR-01 nói "giữ ghế p95". Test đã log `p95Ok` nhưng chỉ assert `p95(all)`.
- Số đo hiện tại: `p95(201)` là 28 và 44ms, rất xa ngưỡng.
- Đề xuất: assert thêm `p95Ok <= P95_LIMIT_MS`.
- Thêm vào đó, không có bằng chứng trực tiếp rằng 2 transaction AC-06 chồng lấn trong DB ở mọi vòng. Hành vi lock/unique dưới tranh chấp thật đã được pgTAP `051_order_lifecycle_concurrency.test.sql` phủ, nên chấp nhận.

**N6. Phạm vi file và nợ trùng lặp.**
- `helpers/api-app.ts` và `helpers/booking-fixtures.ts` nằm ngoài "Files to Create/Modify". Đây là file mới, tên riêng, chỉ được 2 spec của task này dùng, nên không đụng merge song song. Chấp nhận theo tiền lệ review layer-6-task-07.
- Trùng chức năng boot app với `helpers/app-harness.ts` của task-04 (journal đã ghi nhận). Đây là nợ gộp sau merge, dispatcher cần biết.

**N7. `percentile` dùng nearest-rank.** `api-app.ts:56-59`
- Đúng chuẩn, không phải lỗi. Ghi nhận để số đo giữa các lần chạy so sánh được.

## Kiểm tra đường bán trùng ghế thật trong source
Không tìm thấy:
- `hold_seats` khoá `seats FOR UPDATE` theo thứ tự cố định, kiểm lại HELD còn hạn hoặc SOLD sau khi đã giữ khoá.
- Unique `(showtime_id, seat_id)` là chốt cuối cùng.
- API không có đường ghi `showtime_seat_states` nào ngoài RPC.

## Verdict
**STRICT PASS**: không có MAJOR. Có 7 MINOR, nên xử lý N1, N2, N4 khi tiện, không chặn commit.
