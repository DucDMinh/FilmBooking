# Báo Cáo Review Nghiệm Thu (Round 3) — phase-1-task-04

**Mã task:** `tasks/bug-layer5-review/phase-1-task-04.md`  
**Tiêu đề:** Transactional Mail Templates & Payload Completion (B/M5, B/M6)  
**Người thực hiện (Builder):** builder  
**Người đánh giá (Reviewer):** reviewer độc lập (Adversarial Review)  
**Review Level:** `STRICT`  
**Verdict:** **`STRICT PASS`**

---

## 1. Kết quả kiểm tra Round 3

Trong Round 3, Reviewer đã kiểm tra toàn diện mã nguồn vá lỗi, đối chiếu chéo (Cross-Boundary Check) với database schema, và thực thi các lệnh kiểm tra tự động:

### 1.1. Khắc phục triệt để lỗi Lint (`@typescript-eslint/no-explicit-any`)
- Tại [outbox-job.e2e-spec.ts:451-460](file:///E:/FilmBooking/apps/api/test/outbox-job.e2e-spec.ts#L451-L460), Builder đã loại bỏ hoàn toàn việc ép kiểu `as any`, thay thế bằng các type helper chặt chẽ:
  ```ts
  type TicketQueryResult = { data: { qr_token: string } | null; error: { code: string; message: string } | null };
  type TicketQuery = {
    select: () => {
      eq: (_col: string, _val: unknown) => {
        limit: (_n: number) => { maybeSingle: () => Promise<TicketQueryResult> };
        maybeSingle: () => Promise<TicketQueryResult>;
      };
    };
  };
  const ticketDb = fakeDb.admin() as unknown as { from: (_t: string) => TicketQuery };
  ```
- Chạy lệnh kiểm tra ESLint trên toàn bộ các file sửa đổi của task:
  ```bash
  pnpm --filter api exec eslint src/modules/jobs/jobs.controller.ts src/modules/mail/templates.ts test/outbox-job.e2e-spec.ts
  ```
  **Kết quả:** Exit code 0 (0 errors, 0 warnings).

### 1.2. Khắc phục lỗi PostgREST `PGRST116` & Bổ sung dữ liệu vé (B/M5)
- Trong [jobs.controller.ts:60-75](file:///E:/FilmBooking/apps/api/src/modules/jobs/jobs.controller.ts#L60-L75):
  Phương thức `enrichTicketPayload` đã thêm `.limit(1)` vào query `tickets`:
  ```ts
  const { data, error } = await admin
    .from("tickets")
    .select("qr_token")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  ```
  Tránh triệt để lỗi HTTP 406 / `PGRST116` của PostgREST khi đơn hàng có từ 2 vé trở lên.
- Đã truy vấn bổ sung song song:
  + `qr_token` từ bảng `tickets`.
  + `cinema_address` từ bảng `cinemas`.
  + `seats` từ bảng `order_seats`.
- Bộ mock trong [outbox-job.e2e-spec.ts:68, 106-123](file:///E:/FilmBooking/apps/api/test/outbox-job.e2e-spec.ts#L68-L123) mô phỏng chính xác hành vi Postgres/PostgREST:
  + Test case đối chiếu tại dòng 443-470 chứng minh: không có `.limit(1)` thì trả về lỗi `PGRST116`, có `.limit(1)` thì lấy đúng token của vé đầu tiên.
  + Test case e2e tại dòng 464-525 chứng minh: đơn hàng 2 vé/ghế (`E10`, `E11`) gửi email thành công qua Resend, HTML/Text render đầy đủ QR token `qr-enriched-from-db-12345`, địa chỉ rạp `54A Nguyễn Chí Thanh` và danh sách ghế `E10, E11`.

### 1.3. Template Identity & Từ chối an toàn kind lạ (B/M6)
- Đã bổ sung 3 template HTML hoàn chỉnh:
  + `renderPasswordSetEmail` ([templates.ts:352-405](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L352-L405)): Nút bấm/link tạo mật khẩu, không rò rỉ `user_id`.
  + `renderOAuthMissingEmailCollisionEmail` ([templates.ts:408-457](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L408-L457)): Hướng dẫn đăng nhập phương thức cũ, link dẫn về `/me/profile`, không dump raw JSON.
  + `renderOAuthMissingEmailVerifyEmail` ([templates.ts:460-511](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L460-L511)): Link xác thực email kèm token, cảnh báo hết hạn 15 phút.
- Loại bỏ hoàn toàn fallback dump `JSON.stringify(payload)`. Kind không hỗ trợ ném `UNKNOWN_KIND`, worker chuyển trạng thái outbox sang `FAILED` ngay lập tức, `attempts = MAX_EMAIL_ATTEMPTS`, không gửi email rác và không lặp retry.

---

## 2. Kết quả Verify Commands

| Kiểm tra | Lệnh | Kết quả | Ghi chú |
|---|---|---|---|
| **Vitest e2e** | `pnpm --filter api test test/outbox-job.e2e-spec.ts` | **PASS (19/19)** | Bao gồm cả test phân biệt `PGRST116` và test e2e đa vé |
| **ESLint** | `pnpm --filter api exec eslint src/modules/jobs/jobs.controller.ts src/modules/mail/templates.ts test/outbox-job.e2e-spec.ts` | **PASS** | 0 errors, 0 warnings (đã xóa sạch `as any`) |
| **Typecheck** | `pnpm --filter api typecheck` | **PASS** | 0 lỗi TypeScript trên toàn bộ ứng dụng API |

---

## 3. Kết luận

- **Review level:** STRICT
- **Verdict:** **`STRICT PASS`**
- **Đánh giá chung:** Task đã giải quyết triệt để 2 vấn đề B/M5 và B/M6, xử lý dứt điểm các lỗi cross-boundary schema và false-confidence mock được chỉ ra ở Round 1 và Round 2. Code đáp ứng đầy đủ các tiêu chuẩn chất lượng, an toàn dữ liệu và tuân thủ chặt chẽ kiến trúc hệ thống. Task đủ điều kiện hoàn tất.
