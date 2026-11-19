Agent: reviewer

# Review: feature cyberplex-reskin · phase-1-task-02 · round 2

- **Review level:** STRICT.
- **Reason:** shared shell/common/ticket component, nội dung pháp lý R-132/R-133, a11y NFR-12, overlay QR R-87.
- **Phạm vi round 2:** đóng các finding của round 1 (`...-round-1-review.md`): M1, m1, m2, m3, m4. Soát thêm hồi quy mới.
- **Blast radius:**
  - Như round 1: mọi route `(public)` cùng EmptyState/ErrorState/AgeBadge ở public và admin.
  - Thêm overlay QR toàn màn hình ở `/ve/[bookingCode]` và `/dat-ve/don/[id]/ket-qua`.

## Verify commands (chạy độc lập, mỗi lệnh 1 lần)

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | **exit 1**. Shared 31/31 và api 658/658 PASS. Web 628/629: 1 test fail vì **timeout 5000ms** (5032ms) ở `src/components/account/__tests__/account.test.tsx:179` (`ChangePasswordForm > báo lỗi khi mật khẩu mới vi phạm chính sách...`). Toàn bộ test vé, kể cả test portal mới, PASS. |
| Chạy lại riêng file account (`cd apps/web && pnpm exec vitest run ...`) | **Blocked** bởi agent-guard. Tôi không đổi biến thể lệnh. |
| `pnpm build` | exit 0 |
| CSS build `.next/static/chunks/0bcw2h3z4l2f1.css` | Có: `.z-60{z-index:60}`, `.scanline{z-index:12;pointer-events:none;...position:fixed;inset:0}`, `.grid-bg{z-index:-1...}`, `@media print .scanline{display:none}`, `whitespace-nowrap`, `group-focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)]`. |
| aislop / oxlint / ocr | skip (aislop chưa cài; oxlint chưa cấu hình; ocr chưa cài) |

**Đánh giá test đỏ:** tôi coi đây là flake do tải, không phải hồi quy của task. Bằng chứng:

1. `components/account/change-password-form.tsx` chỉ import `@filmbooking/shared/password-policy`, `sonner`, `@/app/auth/actions`, `ui/button`, `ui/card`, `ui/input`, `ui/label`. Không có file nào trong số này nằm trong diff (`git diff --stat -- apps/web packages` chỉ có shell/common/ticket/app pages/globals.css).
2. Lỗi là timeout (5032ms so với ngưỡng 5000ms), không phải assertion sai, và xảy ra khi api test chạy song song.
3. Cùng file đó PASS ở lần chạy round 1 của tôi (web 628/628) và ở lần chạy của builder. Round 2 không đổi gì liên quan đến account.

## Đóng finding round 1

| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| **M1** QR toàn màn hình bị clip-path cắt | **Đã đóng** | Chi tiết bên dưới bảng. |
| m1 focus TicketCard yếu | Đã đóng | Chi tiết bên dưới bảng. |
| m2 nav xuống dòng | Đã đóng | `site-header.tsx:43` đã có `whitespace-nowrap`. |
| m3 viền đứt chạm đường cắt | Đã đóng | `ticket-card.tsx:91`: `p-5` (20px). Góc viền đứt ở (20,20), tổng 40 lớn hơn `--cut-lg` 24px nên không chạm đường chéo. |
| m4 thụt lề | Đã đóng | `not-found.tsx` và `ticket-card.tsx` đã thụt đúng. |

**Chi tiết M1:**
- `ticket-qr.tsx:93` gọi `createPortal(<FullscreenTicket .../>, document.body)`, nên tổ tiên duy nhất là `<body className="min-h-dvh">` rồi `<html>`. Cả hai không có clip-path, transform, filter hay contain (`app/layout.tsx:79-80`).
- Overlay dùng `fixed inset-0 z-60` (`ticket-qr.tsx:59`), cao hơn header z-40 và scanline z-12, ngang tầng dialog theo tokens. Class `z-60` có thật trong CSS build.
- SSR: `fullscreen` mặc định `false`, chỉ thành `true` sau onClick nên `document.body` chỉ được truy cập phía client. Không có lệch hydration.
- Wake Lock: `useScreenWakeLock(true)` không đổi, cleanup release sentinel vẫn còn.
- ESC: listener gắn trên `document` và được gỡ trong cleanup của effect (`ticket-qr.tsx:50-51`), không rò listener khi unmount.
- Focus: nút Đóng nhận focus khi mở; `close()` trả focus về nút mở. Vẫn có `role="dialog"`, `aria-modal`, `aria-label`. Event React vẫn bubble qua cây React nên onClick hoạt động bình thường.
- Test mới (`ticket.test.tsx:221-231`) kiểm: `parentElement === document.body`, không có tổ tiên `[class*='chamfer-']`, có class `z-60`, bấm ESC thì đóng. Đây là kiểm tra cấu trúc DOM thật, không phải mock, nên giữ được hồi quy về sau.

**Chi tiết m1:**
- `ticket-card.tsx:56` thêm `group-focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)]` trên `frame-in`. Vòng này nằm trên lớp phủ, không bị che như trước, và dày 2px.
- Hover vẫn chỉ đổi khung 1px và nền, nên focus giờ nhìn khác hover.
- Riêng hai đường chéo của chamfer không có vòng: chấp nhận được theo T7.

## Hồi quy mới từ round 2

Không phát hiện:
- Portal không đổi API của `TicketQr`; chỉ có 1 chỗ gọi (`ticket-card.tsx:92`).
- Thêm `whitespace-nowrap` không ảnh hưởng menu Sheet mobile (dùng `sheetLinkClass` riêng).
- Đổi `p-5` chỉ tăng khoảng trống.

## Residual (MINOR, không chặn)

- **r1. Test đỏ do timeout ở `account.test.tsx:179`.** Tôi không chạy lại riêng được vì bị chặn. **Đề xuất:** coordinator chạy lại `pnpm test` trước khi commit (cổng commit). Nếu timeout lặp lại thì tách thành bug flake riêng (tăng timeout hoặc giảm tải), không thuộc task này.
- **r2. Overlay toàn màn hình không có focus trap.** Tab vẫn đi ra nội dung phía sau `aria-modal`. Lỗi này có từ trước task, chỉ ghi nhận.
- **r3. Dấu `–` còn ở ngoài phạm vi:** `(auth)/layout.tsx:11` và `dieu-khoan/page.tsx:14,74`. Để phase 2 xử lý.
- **r4. Chưa có `lib/z-index.ts`** (tokens §3.3; tồn từ task-01).

## Verdict: **STRICT PASS**

- Toàn bộ finding round 1 (1 MAJOR, 4 MINOR) đã đóng, có bằng chứng code và test cấu trúc. Round 2 không có hồi quy mới.
- Typecheck, lint và build xanh. CSS build có đủ utility.
- `pnpm test` đỏ đúng 1 test do timeout ở module không liên quan đến diff. Tôi không tính là defect của task, nhưng điều kiện commit là phải chạy lại `pnpm test` cho xanh (r1).
