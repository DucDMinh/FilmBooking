# Review Report: build-filmbooking layer-8 task-06 (Round 1)

> **Reviewer**: Adversarial Reviewer (Độc lập)  
> **Target Branch / Worktree**: `wt/layer-8__task-06` (`.worktrees/layer-8__task-06`)  
> **Task File**: `tasks/build-filmbooking/layer-8-task-06.md`  
> **Review Level**: **STRICT** (Bảo mật PII & hạ tầng Sentry / Giám sát / a11y)  
> **Date**: 2026-11-15  
> **Verdict**: **STRICT PASS**

---

## 1. Executive Summary

Task 06 của Layer 8 hoàn thành toàn bộ 3 nhóm yêu cầu cốt lõi theo tiêu chuẩn nghiêm ngặt:
1. **Giám sát Sentry & Cảnh báo (NFR-14)**: Tích hợp Sentry cho cả Web (`@sentry/nextjs`) và API (`@sentry/nestjs`). Tự động tắt an toàn và không gây overhead khi thiếu `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`. Tự động gắn tag `cinema_id` (qua `AllExceptionsFilter` ở API và `CinemaTag` ở Web). Cấu hình 3 cảnh báo chuyên biệt (`webhook_invalid_signature`, `hold_error`, `email_failed`). Toàn bộ PII (email, SĐT Việt Nam, token, cookie, password, authorization header, request data) được scrub triệt để qua `beforeSend`.
2. **a11y (NFR-12)**: Kiểm thử axe tự động (`vitest-axe`) đạt 0 vi phạm serious/critical cho cả 3 thành phần: `SeatMap` (với đủ 4 trạng thái ghế), `LoginForm`, và `OrderConfirmPage`.
3. **Hiệu năng & LCP (NFR-01)**: Cấu hình `lighthouserc.json` ngân sách LCP ≤ 2.5s; tối ưu hóa ảnh bằng `RemoteImage` (`next/image`, AVIF/WebP, fallback an toàn); áp dụng `PUBLIC_CACHE` (revalidate 60s) cho các fetch công khai; bổ sung `preconnect` trong layout gốc.

Tất cả các lệnh kiểm tra (`lint`, `typecheck`, `test`, `build`) đều vượt qua 100% với 0 lỗi.

---

## 2. Requirements Coverage & Adversarial Audit

| Yêu cầu / AC | File triển khai | Đánh giá độc lập | Kết quả |
|---|---|---|---|
| **Sentry DSN an toàn (tắt khi thiếu)** | `apps/api/src/common/monitoring/sentry.ts`<br>`apps/web/src/lib/monitoring/sentry-config.ts` | Khi không có DSN, `initSentry` trả về `false`, không khởi tạo hook/transport, các hàm `reportAlert` và `captureServerError` là no-op; trên client `onRouterTransitionStart` là `undefined`. | **PASS** |
| **Scrub PII (email, phone, token, cookie)** | `sentry.ts`, `sentry-config.ts` | `scrubEvent` xóa hoàn toàn `event.user`, `request.cookies`, `request.data`, `request.headers`. Đệ quy lọc các khóa nhạy cảm (`email`, `phone`, `token`, `secret`, `authorization`...) thành `[Filtered]` và regex lọc email + SĐT VN (0x, +84x kèm định dạng phân cách) thành `[email]` / `[phone]`. Test mock transport xác nhận không lọt PII vào envelope. | **PASS** |
| **Gắn tag `cinema_id`** | `all-exceptions.filter.ts`<br>`cinema-tag.tsx` | API tự động trích xuất `cinemaId` từ params/query/body gắn vào tag Sentry khi phát sinh lỗi 5xx. Web sử dụng component `CinemaTag` gắn tag theo vòng đời component tại `/rap/[code]` và `/dat-ve/[showtimeId]`. | **PASS** |
| **Cảnh báo (NFR-14)** | `webhook.controller.ts`<br>`booking.service.ts`<br>`jobs.controller.ts` | 1. `webhook_invalid_signature`: cảnh báo khi sai chữ ký PayOS.<br>2. `hold_error`: cảnh báo khi RPC giữ ghế phát sinh lỗi 5xx không mong đợi (loại trừ lỗi 409 SEAT_TAKEN thông thường).<br>3. `email_failed`: cảnh báo khi email outbox chuyển sang trạng thái FAILED sau khi hết lượt retry, không đưa email người nhận vào payload. | **PASS** |
| **a11y 0 vi phạm serious/critical (NFR-12)** | `seat-map.a11y.test.tsx` | Đã kiểm thử `axe` trực tiếp trên SeatMap (ghế FREE, SOLD, HELD, VIP), LoginForm và OrderConfirmPage. 0 vi phạm impact `serious` hoặc `critical`. | **PASS** |
| **Lighthouse CI budget LCP ≤ 2.5s (NFR-01)** | `lighthouserc.json`<br>`apps/web/src/lib/api/cache.ts`<br>`apps/web/src/components/common/remote-image.tsx` | Cấu hình 3 lần chạy cho `/`, `/phim`, `/rap`, chặn lỗi median LCP > 2500ms. Dùng `PUBLIC_CACHE` ISR 60s, `RemoteImage` với `priority` cho hero banner và `preconnect` tới API/Supabase/Unsplash. Số đo thực tế local: `/rap` LCP 922ms, `/dang-nhap` LCP 919ms. | **PASS** |

---

## 3. Verify Commands Evidence

Các lệnh đã chạy trong worktree `.worktrees/layer-8__task-06`:

- **Lint**: `pnpm -w lint`
  - `packages/shared`: Done (0 errors)
  - `apps/api`: Done (0 errors)
  - `apps/web`: Done (0 errors)
  - *Result*: **PASS (0 error, 0 warning)**

- **Typecheck**: `pnpm -w typecheck`
  - `packages/shared`: `tsc -p tsconfig.json` Done
  - `apps/web`: `tsc --noEmit` Done
  - `apps/api`: `tsc -p tsconfig.json` Done
  - *Result*: **PASS (0 error)**

- **Test**: `pnpm -w test`
  - `packages/shared`: 1 test file (14 tests) passed
  - `apps/api`: 25 test files (483 tests) passed (bao gồm `sentry.spec.ts`)
  - `apps/web`: 31 test files (444 tests) passed (bao gồm `seat-map.a11y.test.tsx` và `sentry-config.test.ts`)
  - `scripts/*.test.mjs`: 16 tests passed
  - *Result*: **PASS (957 tests passed, 0 failed)**

- **Build**: `pnpm -w build`
  - `apps/api`: Built 104 files -> `apps/api/dist`
  - `apps/web`: Next.js 16.4.6 compiled và generate 40/40 routes thành công
  - *Result*: **PASS**

---

## 4. Specialized Gates Audit

- **Open Code Review (`ocr`) Gate**:
  - Đã chạy `ocr review --format json`.
  - Kết quả: **0 Critical, 0 Major**, 1 Medium (cho phép tối ưu hóa relative path trên `RemoteImage`), 2 Low (bổ sung layout/priority hints trên thẻ img fallback).
  - *Gate Status*: **PASS**.
- **Anti-slop / oxlint Gate**:
  - `skip, oxlint not configured` (repo không có cấu hình oxlint riêng).
- **AI-slop Gate**:
  - `skip, aislop not installed`.
- **AI-readable Gate**:
  - File lines: Tất cả các file mới đều dưới 100 dòng (tiêu chuẩn ≤ 300 dòng).
  - Function lines: Không hàm nào vượt quá 35 dòng (tiêu chuẩn ≤ 50 dòng).
  - Naming & Design: Tên hàm tự miêu tả (`scrubEvent`, `reportAlert`, `captureServerError`, `CinemaTag`, `RemoteImage`).
  - *Gate Status*: **PASS (0 indicators)**.
- **Surgical Diff & Non-negotiables**:
  - Không có drive-by refactor.
  - Không sửa đổi intent documents.
  - Mọi thay đổi đều truy vết trực tiếp về yêu cầu của Task 06 (giám sát, cảnh báo, hiệu năng, a11y).

---

## 5. Verdict

**Verdict**: **STRICT PASS**

Mọi tiêu chuẩn khắt khe về bảo mật PII, giám sát cảnh báo lỗi, khả năng tiếp cận (a11y), và hiệu năng hiển thị đã được thẩm định và xác nhận đạt yêu cầu.
