# Feature cyberplex-reskin · phase-1-task-02 — Shell và component dùng chung

- Classification / Risk: MODIFY (UI). Reviewer **STRICT** (shared: header/footer/badge dùng ở mọi trang). **Sau task-01.**
- Hợp đồng: `spec/changes/2026-11-19-cyberplex-reskin.md`. Spec: NFR-19, NFR-12. Thiết kế: `.context/design-spec.md` §16.2, §16.3.

## Thiết kế
1. `components/shell/site-header.tsx`: 78px, nền `chrome/88%` + blur, logo `CINEMO` Orbitron 900 (ASCII), nav Chakra Petch 12px UPPERCASE gạch chân vàng `scaleX` hover/active, nút Đăng nhập `ghost`; mobile 56px giữ cấu trúc.
2. `components/shell/site-footer.tsx`: 4 cột (thương hiệu, Rạp, Hỗ trợ, Pháp lý) theo §16.3, **chưa gắn scrub** (task-03/04 gắn, footer cần `--scrub-inset: 0px`); không dòng phiên bản.
3. `components/shell/unverified-email-banner.tsx`, `components/common/*`: badge nhãn tuổi (`AgeRatingBadge` tone neutral/semantic theo tokens §1.6), badge trạng thái (§1.4), `EmptyState`, `ErrorState`, `Skeleton` (shimmer opacity, tắt khi reduced-motion), `CountdownTimer` (chip chamfer, số mono, màu theo ngưỡng; giữ `role="timer"`, `aria-live`).
4. `components/ticket/*` (thẻ vé QR): `QrTicket` chamfer-lg, viền nét đứt, mã đặt vé mono vàng. **Giữ nguyên nội dung bắt buộc** (tên rạp + địa chỉ, cảnh báo không huỷ/hoàn, QR nền trắng, `alt` QR).
5. `not-found.tsx`, `error.tsx`, `global-error.tsx`, `khong-co-quyen`: nền lưới `--grid-bg` ở 404, nút primary.
6. Thay mọi `rounded-pill|full|hero|lg|md|sm` còn lại trong phạm vi file task này bằng chamfer/vuông theo §16.2.

## KHÔNG làm
Không đổi logic điều hướng, auth, tìm kiếm, chọn tỉnh, đồng hồ giữ ghế (giá trị/ngưỡng giữ nguyên). Không động `components/catalog|booking|account|auth|admin|staff` (phase 2), không `apps/api`.

## Files to Modify
`apps/web/src/components/shell/*`, `components/common/*`, `components/ticket/*`, `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/khong-co-quyen/*`, test tương ứng.

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: header/footer/badge/vé kiểu CINEMO coral.
- Expected: kiểu CYBERPLEX, hành vi giữ nguyên, a11y (`aria-*`, focus) giữ nguyên.
- Actual after: _(builder điền)_
- Evidence: _(builder điền)_
- Status: pending
