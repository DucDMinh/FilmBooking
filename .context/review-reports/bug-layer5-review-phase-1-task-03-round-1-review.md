# Review Report · bug-layer5-review · phase-1-task-03 (Round 1)

**Agent: reviewer**

- **Review level**: `STRICT`
- **Verdict**: `FAIL`
- **Task**: [tasks/bug-layer5-review/phase-1-task-03.md](file:///E:/FilmBooking/tasks/bug-layer5-review/phase-1-task-03.md)
- **Nguồn bug**: `.context/review-reports/independent-review-layer-5-A-booking.md` (MAJOR-2, MAJOR-3, MAJOR-4, MAJOR-5)
- **Files touched**:
  - `packages/shared/src/errors.ts`
  - `packages/shared/src/schemas/booking.ts`
  - `apps/api/src/modules/booking/booking.controller.ts`
  - `apps/api/src/modules/booking/booking.service.ts`
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
  - `packages/shared/src/database.types.ts` (Relationships của `showtimes`)

---

## 1. Tóm tắt kết quả kiểm tra theo các tiêu chí khắt khe

| Hạng mục | Đánh giá | Chi tiết |
|---|---|---|
| **A/MAJOR-2: Consent Atomicity & Server Enforcement** | **PASS** | `saveConsent` insert vào `consents` trước để DB tự sinh `accepted_at` qua `default now()`, kiểm tra lỗi insert rồi mới update `orders.consent_at = accepted_at`. Version được cưỡng chế cứng `SERVER_CONSENT_VERSION = "1.0.0"` (từ chối version sai với 400 `VALIDATION_ERROR`). IP thiếu lưu `null` thay vì fake `"127.0.0.1"`. |
| **A/MAJOR-3: Ownership Scoping cho Release/Voucher** | **PASS** | `releaseHold`, `applyVoucher`, `removeVoucher` đều gọi `verifyOrderActionEligibility(user, orderId, ...)` trước khi gọi RPC DB. Chặn triệt để Staff/Manager/Admin hoặc non-owner với HTTP 403 `FORBIDDEN`. Kiểm tra trạng thái đơn hợp lệ (`holding` / `pending_payment`) và chưa hết hạn. |
| **A/MAJOR-4: Seatmap Visibility & Catalog Integrity** | **FAIL (Schema & Mock)** | Về mặt logic nghiệp vụ, code đã kiểm tra `cinemaStatus === 'OPEN'` và `movieStatus === 'PUBLISHED'`, ném 404 `NOT_FOUND`. **TUY NHIÊN**: Ở tầng gọi PostgREST, query `.from("showtimes").select("..., cinemas(status), movies(status)")` bị lỗi schema cache trên DB thật do `showtimes` **không có Foreign Key trực tiếp tới `cinemas`**. Bộ mock trong test đã tự viết logic gán quan hệ để pass test. |
| **A/MAJOR-5: Mã lỗi HTTP CONSENT_REQUIRED** | **PASS** | `ERROR_HTTP_STATUS.CONSENT_REQUIRED` đã đổi thành `409` trong `packages/shared/src/errors.ts`, khớp với AC-08 và `API_SPEC`. Cập nhật đồng bộ các e2e test liên quan (`auth-ext.e2e-spec.ts` và `booking.e2e-spec.ts`). |
| **Verify Commands & Tooling** | **PASS** | `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` đều xanh 100%. |

---

## 2. Findings chi tiết (Adversarial Audit)

### 🚨 MAJOR-1 (False-Confidence Mock & Cross-Boundary Schema Mismatch): Query `cinemas(status)` từ bảng `showtimes` sẽ nổ lỗi `PGRST200` trên Supabase/PostgREST thật

- **Vị trí code**: [apps/api/src/modules/booking/seatmap.service.ts:63-67](file:///E:/FilmBooking/apps/api/src/modules/booking/seatmap.service.ts#L63-L67)
  ```ts
  const { data: showtime, error: stErr } = await db
    .from("showtimes")
    .select("id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status, cinemas(status), movies(status)")
    .eq("id", showtimeId)
    .maybeSingle();
  ```
- **Vị trí mock tạo false confidence**: [apps/api/test/booking.e2e-spec.ts:615-622](file:///E:/FilmBooking/apps/api/test/booking.e2e-spec.ts#L615-L622)
  ```ts
  if (this.table === "showtimes") {
    for (const row of rows) {
      const cinema = (this.db.tables.cinemas ?? []).find((c) => c.id === row.cinema_id);
      const movie = (this.db.tables.movies ?? []).find((m) => m.id === row.movie_id);
      row.cinemas = cinema ? { id: cinema.id, status: cinema.status } : null;
      row.movies = movie ? { id: movie.id, status: movie.status, ... } : null;
    }
  }
  ```
- **Đối chiếu Database Schema thật**:
  - Kiểm tra [supabase/migrations/20261111020000_catalog.sql:110-129](file:///E:/FilmBooking/supabase/migrations/20261111020000_catalog.sql#L110-L129):
    ```sql
    create table public.showtimes (
      id            uuid primary key default gen_random_uuid(),
      cinema_id     uuid not null,
      room_id       uuid not null,
      movie_id      uuid not null references public.movies (id),
      ...
      foreign key (room_id, cinema_id) references public.rooms (id, cinema_id),
      unique (id, room_id),
      ...
    );
    ```
    Cột `cinema_id` trên `showtimes` **KHÔNG** có foreign key đơn lẻ `references public.cinemas(id)`. Bảng `showtimes` chỉ có composite FK `(room_id, cinema_id) references public.rooms (id, cinema_id)`.
  - Kiểm tra metadata sinh bởi Supabase CLI trong [packages/shared/src/database.types.ts:725-739](file:///E:/FilmBooking/packages/shared/src/database.types.ts#L725-L739):
    ```ts
    Relationships: [
      {
        foreignKeyName: "showtimes_movie_id_fkey"
        columns: ["movie_id"]
        referencedRelation: "movies"
        referencedColumns: ["id"]
      },
      {
        foreignKeyName: "showtimes_room_id_cinema_id_fkey"
        columns: ["room_id","cinema_id"]
        referencedRelation: "rooms"
        referencedColumns: ["id","cinema_id"]
      }
    ]
    ```
    Hoàn toàn **không tồn tại** quan hệ trực tiếp (direct relationship) giữa `showtimes` và `cinemas` trong schema cache của PostgREST.
- **Hậu quả trên DB thật**:
  - Khi chạy trên môi trường Supabase thật, PostgREST sẽ từ chối embedded resource `cinemas(status)` với mã lỗi:
    `PGRST200: Could not find a relationship between 'showtimes' and 'cinemas' in the schema cache`.
  - Khi đó `stErr` trả về lỗi và [apps/api/src/modules/booking/seatmap.service.ts:69](file:///E:/FilmBooking/apps/api/src/modules/booking/seatmap.service.ts#L69) sẽ ném:
    `throw new AppException(ERROR_CODES.INTERNAL_ERROR, stErr.message);`
    dẫn tới **100% request `GET /showtimes/:id/seatmap` sẽ sập với HTTP 500 INTERNAL_ERROR**!
  - Trong test `booking.e2e-spec.ts`, Builder đã tự viết code trong `FakeDb.matching()` để nối `cinemas` vào `row`, tạo ra **False-confidence** che giấu hoàn toàn lỗi cấu trúc này.
- **Khuyến nghị khắc phục**:
  - Thay vì cố join embedded resource không tồn tại qua PostgREST, hãy query trạng thái rạp bằng `showtime.cinema_id` đã có sẵn:
    Tương tự như cách [apps/api/src/modules/booking/booking.service.ts:118](file:///E:/FilmBooking/apps/api/src/modules/booking/booking.service.ts#L118) đã làm rất chuẩn:
    ```ts
    const { data: showtime, error: stErr } = await db
      .from("showtimes")
      .select("id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status, movies(status)")
      .eq("id", showtimeId)
      .maybeSingle();
    ```
    Sau đó kiểm tra trạng thái rạp bằng truy vấn riêng hoặc song song:
    ```ts
    const { data: cinema } = await db
      .from("cinemas")
      .select("status")
      .eq("id", showtime.cinema_id)
      .maybeSingle();
    ```
    (Hoặc join qua `rooms` vì `rooms` có FK trực tiếp `references public.cinemas(id)`, nhưng query riêng qua `cinema_id` là đơn giản và an toàn nhất, không phụ thuộc vào quan hệ lồng phức tạp).
  - Cập nhật lại `FakeDb` trong `booking.e2e-spec.ts` để phản ánh đúng cấu trúc DB thật, loại bỏ việc bịa join relationship giả.

---

### ⚠️ MINOR-1: Độ dài file `booking.service.ts` vượt ngưỡng cấu hình dự án

- **Vị trí**: [apps/api/src/modules/booking/booking.service.ts](file:///E:/FilmBooking/apps/api/src/modules/booking/booking.service.ts)
- **Chi tiết**: File hiện có 366 dòng, vượt trần `max_file_lines: 300` quy định trong `.context/project-config.md`.
- **Khuyến nghị**: Có thể cân nhắc chuyển các hàm trợ giúp hoặc logic con sang `booking.helper.ts` khi thuận tiện để giữ file gọn gàng.

---

## 3. Bằng chứng chạy Verify Commands

Tất cả các lệnh từ `.context/project-config.md` đã được thực thi và xác nhận:
1. `pnpm test`:
   - `packages/shared`: 1 test file (14 tests) PASS
   - `apps/api`: 22 test files (390 tests) PASS
   - `apps/web`: 12 test files (156 tests) PASS
   - `scripts`: 1 test file (16 tests) PASS
   - Tổng cộng: **576/576 tests PASS (100%)**.
2. `pnpm typecheck`: PASS 100% cả 3 packages/apps (`packages/shared`, `apps/api`, `apps/web`).
3. `pnpm lint`: PASS 100% không có cảnh báo hay lỗi eslint.
4. `pnpm build`: PASS 100% (`apps/api` dist 96 files, `apps/web` Next.js 16.4.6 static/dynamic routes OK).

---

## 4. Kết luận

- Các mục **A/MAJOR-2**, **A/MAJOR-3**, **A/MAJOR-5** đã được Builder cài đặt rất tốt và giải quyết triệt để các rủi ro bảo mật & tính nguyên tử.
- Tuy nhiên, theo **Nguyên tắc Adversarial Review số 1 và số 2** (chống False-Confidence test & bắt buộc đối chiếu Database schema thật), mục **A/MAJOR-4** phát hiện lỗi nghiêm trọng: query PostgREST `cinemas(status)` trên `showtimes` không tồn tại quan hệ FK trong DB thật, sẽ gây lỗi HTTP 500 khi chạy thực tế trên Supabase.
- **Verdict**: **FAIL**.
- Yêu cầu Builder sửa [apps/api/src/modules/booking/seatmap.service.ts](file:///E:/FilmBooking/apps/api/src/modules/booking/seatmap.service.ts#L65) và cập nhật mock tương ứng trong `booking.e2e-spec.ts`.
