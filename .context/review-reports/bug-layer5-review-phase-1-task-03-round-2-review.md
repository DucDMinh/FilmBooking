# Review Report · bug-layer5-review · phase-1-task-03 (Round 2)

**Agent: reviewer**

- **Review level**: `STRICT`
- **Verdict**: `STRICT PASS`
- **Task**: [tasks/bug-layer5-review/phase-1-task-03.md](file:///E:/FilmBooking/tasks/bug-layer5-review/phase-1-task-03.md)
- **Nguồn bug**: `.context/review-reports/independent-review-layer-5-A-booking.md` (A/MAJOR-2, A/MAJOR-3, A/MAJOR-4, A/MAJOR-5) & Báo cáo Review Round 1 FAIL (`.context/review-reports/bug-layer5-review-phase-1-task-03-round-1-review.md`)
- **Files touched**:
  - `packages/shared/src/errors.ts`
  - `packages/shared/src/schemas/booking.ts`
  - `apps/api/src/modules/booking/booking.controller.ts`
  - `apps/api/src/modules/booking/booking.service.ts`
  - `apps/api/src/modules/booking/booking.helper.ts`
  - `apps/api/src/modules/booking/seatmap.service.ts`
  - `apps/api/test/booking.e2e-spec.ts`
  - `apps/api/test/auth-ext.e2e-spec.ts`
- **Đối chiếu schema & SQL migrations**:
  - `supabase/migrations/20261111010000_core_identity_chain.sql` (`consents`)
  - `supabase/migrations/20261111020000_catalog.sql` (`showtimes`, `rooms`, `movies`, `cinemas`)
  - `supabase/migrations/20261111030020_catalog_fixes.sql` (`showtimes_select_public`)
  - `supabase/migrations/20261111030100_booking_tables.sql` (`orders`, `order_seats`, RLS `orders_select`)
  - `supabase/migrations/20261111040200_rpc_voucher.sql` / `20261112070000_voucher_rate_limit_fix.sql` (`apply_voucher`, `remove_voucher`)
  - `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql` (`release_seats`)
  - `packages/shared/src/database.types.ts` (Relationships của `showtimes` & `rooms`)

---

## 1. Tóm tắt kết quả kiểm tra theo các tiêu chí khắt khe

| Hạng mục | Đánh giá | Chi tiết |
|---|---|---|
| **A/MAJOR-4: Khắc phục lỗi schema cache PostgREST trên DB thật & False-confidence Mock** | **PASS** | Đã loại bỏ hoàn toàn `cinemas(status)` khỏi query `showtimes` trong `seatmap.service.ts`. Thay vào đó, query độc lập `cinemas` theo `showtime.cinema_id` qua `Promise.all` cùng `rooms`. Trong `FakeDb`, đã xoá gán quan hệ join giả và cài đặt bộ chặn mô phỏng lỗi `PGRST200` nếu query sai quan hệ cache. |
| **A/MAJOR-2: Consent Atomicity & Server Enforcement** | **PASS (Không regression)** | `saveConsent` insert vào `consents` trước để DB tự sinh `accepted_at` qua `default now()`, kiểm tra lỗi insert rồi mới update `orders.consent_at = accepted_at`. Version được cưỡng chế cứng `SERVER_CONSENT_VERSION = "1.0.0"`. IP vắng mặt được lưu `null` thay vì fake `"127.0.0.1"`. |
| **A/MAJOR-3: Ownership Scoping cho Release/Voucher** | **PASS (Không regression)** | `releaseHold`, `applyVoucher`, `removeVoucher`, `ageConfirm`, `saveConsent` đều gọi `verifyOrderActionEligibility` trong `booking.helper.ts`. Chặn triệt để non-owner và Staff/Manager với HTTP 403 `FORBIDDEN`. Kiểm tra trạng thái đơn (`holding` / `pending_payment`) và thời hạn giữ ghế. |
| **A/MAJOR-5: Mã lỗi HTTP CONSENT_REQUIRED** | **PASS (Không regression)** | `ERROR_HTTP_STATUS.CONSENT_REQUIRED` cập nhật `409` trong `packages/shared/src/errors.ts`, khớp với AC-08 và `API_SPEC`. Test e2e xác nhận đầy đủ. |
| **Code Quality & Giới hạn dòng (MINOR-1)** | **PASS** | `booking.service.ts` đã được tách helper sang `booking.helper.ts`, rút gọn xuống đúng 299 dòng (< 300 dòng theo `project-config.md`). Mọi hàm đều ≤ 50 dòng. `booking.helper.ts` (238 dòng) và `seatmap.service.ts` (169 dòng) đều tuân thủ nghiêm ngặt. |
| **Verify Commands & Tooling** | **PASS** | `pnpm test` (577/577 tests PASS), `pnpm typecheck` (100% PASS), `pnpm lint` (100% PASS), `pnpm build` (100% PASS). |

---

## 2. Chi tiết kết quả kiểm tra Adversarial & Cross-Boundary Check

### 🎯 Giải quyết Defect A/MAJOR-4 (Khớp DB Schema thật & Triệt tiêu False-Confidence)
- **Code implementation**: Trong [apps/api/src/modules/booking/seatmap.service.ts:63-96](file:///E:/FilmBooking/apps/api/src/modules/booking/seatmap.service.ts#L63-L96):
  ```ts
  const { data: showtime, error: stErr } = await db
    .from("showtimes")
    .select("id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status, movies(status)")
    .eq("id", showtimeId)
    .maybeSingle();

  if (stErr) throw new AppException(ERROR_CODES.INTERNAL_ERROR, stErr.message);
  if (!showtime) throw new AppException(ERROR_CODES.NOT_FOUND, "Suất chiếu không tồn tại");
  if (showtime.status === "CANCELLED") {
    throw new AppException(ERROR_CODES.SHOWTIME_CANCELLED, "Suất chiếu đã bị huỷ");
  }

  const [cinemaRes, roomRes] = await Promise.all([
    db.from("cinemas").select("status").eq("id", showtime.cinema_id).maybeSingle(),
    db.from("rooms").select("id, name, grid_rows, grid_cols").eq("id", showtime.room_id).single(),
  ]);
  ```
  - `showtimes` chỉ embed quan hệ `movies(status)` (hợp lệ vì có FK `movie_id references movies(id)`).
  - Trạng thái rạp được lấy trực tiếp từ bảng `cinemas` qua `showtime.cinema_id` (khoá chính của `cinemas`), giải quyết hoàn toàn lỗi `PGRST200` trên Supabase thật.
  - Điều kiện kiểm tra: `if (cinemaStatus !== "OPEN" || movieStatus !== "PUBLISHED")` ném `404 NOT_FOUND` ("Suất chiếu không khả dụng"), bảo vệ sơ đồ ghế của rạp đóng cửa hoặc phim chưa phát hành.

- **Mock fidelity trong test**: Trong [apps/api/test/booking.e2e-spec.ts:616-651](file:///E:/FilmBooking/apps/api/test/booking.e2e-spec.ts#L616-L651):
  - Đoạn code gán `row.cinemas` thủ công đã bị gỡ bỏ khỏi `FakeDb.matching()`.
  - Bổ sung cơ chế mô phỏng PostgREST schema cache:
    ```ts
    if (this.table === "showtimes" && this.selectedCols?.includes("cinemas(")) {
      return {
        data: null,
        error: {
          code: "PGRST200",
          message: "Could not find a relationship between 'showtimes' and 'cinemas' in the schema cache",
        },
      };
    }
    ```
  - Có test case riêng [apps/api/test/booking.e2e-spec.ts:875-881](file:///E:/FilmBooking/apps/api/test/booking.e2e-spec.ts#L875-L881) để chứng minh `FakeDb` sẽ ném đúng `PGRST200` nếu gọi query sai.

### 🛡️ Giữ vững các tiêu chí bảo mật & nghiệp vụ (A/MAJOR-2, A/MAJOR-3, A/MAJOR-5)
- **Consent atomicity**: `saveConsent` chạy insert vào `consents` trước bằng service role admin, đọc `accepted_at` do DB cấp, sau đó mới cập nhật `orders.consent_at`. Phiên bản điều khoản được cố định `SERVER_CONSENT_VERSION = "1.0.0"`. IP vắng mặt lưu `null` thay vì fake `"127.0.0.1"`.
- **Ownership Scoping**: Các thao tác huỷ đơn (`releaseHold`), áp voucher (`applyVoucher`), gỡ voucher (`removeVoucher`) và xác nhận tuổi (`ageConfirm`) đều được bảo vệ bởi `verifyOrderActionEligibility`. Non-owner hoặc Staff/Manager can thiệp vào đơn của khách đều nhận HTTP 403 `FORBIDDEN`.
- **HTTP status code**: `CONSENT_REQUIRED: 409` đúng quy chuẩn AC-08 và `API_SPEC`.

### 📏 Giới hạn file và kiến trúc mã (MINOR-1 & AI-readable)
- `apps/api/src/modules/booking/booking.service.ts`: 299 dòng (đạt yêu cầu ≤ 300 dòng).
- `apps/api/src/modules/booking/booking.helper.ts`: 238 dòng (≤ 300 dòng).
- Toàn bộ các phương thức/hàm đều ≤ 50 dòng, tuân thủ `project-config.md`.
- AI-chaos indicators: 0/3. Không drive-by refactor, diff tối giản, tập trung đúng phạm vi task.

---

## 3. Bằng chứng kiểm tra tự động (Automated Verification Evidence)

Tất cả các verify command theo `.context/project-config.md` đã được thực thi và xác nhận:
1. **`pnpm test`**:
   - `packages/shared`: 1 test file (14 tests) PASS
   - `apps/api`: 22 test files (391 tests) PASS
   - `apps/web`: 12 test files (156 tests) PASS
   - `scripts`: 1 test file (16 tests) PASS
   - **Tổng cộng: 577/577 tests PASS (100%)**.
2. **`pnpm typecheck`**: PASS 100% (`packages/shared`, `apps/api`, `apps/web`).
3. **`pnpm lint`**: PASS 100% (0 error, 0 warning).
4. **`pnpm build`**: PASS 100% (`apps/api` dist 96 files, `apps/web` Next.js 16.4.6 static & dynamic prerender OK).
5. **Gates bổ sung**:
   - `oxlint`: skip, oxlint not configured.
   - `aislop`: skip, aislop not installed.
   - `ocr`: skipped do Gemini API Free Tier chạm rate limit quota (5 req/min). Kiểm tra thủ công và static analysis đạt chuẩn an toàn.

---

## 4. Kết luận

- Toàn bộ các defect từ round 1 (đặc biệt là rủi ro `PGRST200` và mock false-confidence của A/MAJOR-4, cùng với giới hạn dòng của `booking.service.ts`) đã được giải quyết triệt để và thẩm định chéo với schema Database PostgreSQL thật.
- Không phát hiện bất kỳ defect hoặc regression nào.
- **Verdict**: **STRICT PASS**.
- Đủ điều kiện để tiến hành merge và đóng task.
