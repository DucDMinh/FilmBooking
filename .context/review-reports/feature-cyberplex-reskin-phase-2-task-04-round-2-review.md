Agent: reviewer

# Review: feature-cyberplex-reskin, phase-2-task-04, round 2

- Task: `tasks/feature-cyberplex-reskin/phase-2-task-04.md`. Worktree `E:\FilmBooking\.worktrees\cyberplex-t04`.
- **Review level: NORMAL**
- **Reason:** Đây là vòng sửa 2 lỗi MAJOR của round 1 (`feature-cyberplex-reskin-phase-2-task-04-round-1-review.md`). Phạm vi chỉ là UI catalog, không đụng API, schema hay auth.
- **Blast radius:**
  - `MovieCard`: dùng ở `/phim` và trang chủ của task-03.
  - `ScheduleDateStrip`: dùng chung cho `/phim/[slug]` (qua `ShowtimeSchedule`) và `/lich-chieu` (qua `ScheduleDateNav`).

## Verify: chạy trong worktree, mỗi lệnh 1 lần

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter ./apps/web typecheck` | **Blocked**: agent-guard từ chối vì không nằm trong allowlist. Brief nói `--filter` chạy được, nhưng hook chặn. Tôi không thử biến thể nào khác. |
| `pnpm --filter ./apps/web lint` / `test` | Không thử, vì cùng lý do bị chặn như dòng trên. |
| `pnpm lint` (allowlist) | **PASS**: shared, api, web đều Done. |
| `pnpm typecheck` (allowlist) | apps/api FAIL do môi trường: worktree không có `apps/api/node_modules`, toàn lỗi TS2307, giống round 1. Output bị cắt nên **không thấy dòng kết quả của apps/web**. Trong phần hiển thị không có lỗi nào của apps/web. Round 1 apps/web PASS, và vòng 2 chỉ thêm một prop tuỳ chọn `className?: string`. |
| `pnpm test` | Không chạy lại. Round 1 đã thấy lệnh này dừng ở lỗi môi trường của apps/api trước khi tới web. **Test apps/web vẫn chưa được reviewer kiểm độc lập.** Builder báo PASS. |
| oxlint / aislop / ocr | skip (oxlint chưa cấu hình; aislop và ocr không có trong allowlist) |

## Kiểm tra đóng MAJOR

### M1: focus trong thẻ phim bị clip → **ĐÓNG**

- `.card` đúng là class của `<article data-scrub="beam">`: `movie-card.tsx` gọi `className={cn(styles.card, className)}`.
- `movie-card.module.css:92-99` thêm 2 rule:
  - `.card:focus-within [data-scrub-media] { animation: none; clip-path: none; }`
  - `.card:focus-within [data-scrub-beam] { animation: none; opacity: 0; }`
- **Selector hợp lệ trong CSS Modules pure mode:**
  - Selector có lớp local `.card`.
  - Attribute selector là global, giữ nguyên tên, nên khớp với thuộc tính `data-scrub-media` / `data-scrub-beam` trong JSX.
- **Rule mới thắng rule cũ:**
  - Specificity (0,3,0) lớn hơn rule globals `[data-scrub="beam"] [data-scrub-media]` (0,2,0).
  - Cả hai rule đều unlayered: rule globals nằm trong `@media` / `@supports` ở top-level, không nằm trong `@layer`. Vì vậy specificity quyết định, không bị cascade layer lật.
  - Rule module nằm ngoài `@supports` nhưng vẫn áp dụng.
- **Kết quả khi Tab vào thẻ:**
  - Article đã có `animation: none; opacity: 1` từ `globals.css:381`.
  - Media lồng bên trong giờ cũng bỏ clip, nên poster, tiêu đề, CTA (`.cta` có `transform: none` khi `focus-within`) và vòng focus đều hiện.
- `[data-scrub-beam]` chỉ là vạch sáng trang trí (`aria-hidden`, utility mặc định `opacity: 0`). Ép `opacity: 0` không làm mất thông tin.
- Trang chủ (task-03) dùng chung `MovieCard` nên cũng được sửa theo.

### M2: dải ngày `/lich-chieu` ở opacity 0 lúc vào trang → **ĐÓNG**

- `ScheduleDateStrip` nhận `className?` và truyền vào `ScrubGroup` qua `cn(...)` (`showtime-schedule.tsx` ~dòng 105-122). `ScrubGroup` gắn `className` lên chính phần tử có `data-scrub-group` (`motion/scrub.tsx:68-74`).
- `ScheduleDateNav` (`schedule-filters.tsx:111-116`) truyền `className="scrub-inset-0"`.
- `globals.css:298` định nghĩa `@utility scrub-inset-0 { --scrub-inset: 0px; }`. Class được đặt **ngay trên group**, cũng là nơi `[data-scrub-group]` tính `view-timeline-inset: 0px var(--scrub-inset)` (`globals.css:366`). Vì vậy inset dùng giá trị 0px.
- Các chip con dùng timeline có tên `--grp` (thông qua `--tl`) nên cũng ăn inset 0.
- Literal `scrub-inset-0` nằm trong file nguồn nên Tailwind v4 sinh utility này. `tailwind-merge` không coi nó xung đột với các class khác trong chuỗi.
- **Tính lại ở 390×844:** dải ngày ở khoảng y≈630-700. Với inset 0, entry 100% đạt khi đáy dải qua mép dưới 844, mà đáy dải ≈700 < 844. Tiến độ đã qua hết range, nên cả 7 chip hiện đủ lúc vào trang. Desktop cũng vậy.
- `/phim/[slug]` gọi `ScheduleDateStrip` không truyền `className` nên giữ hiệu ứng hiện muộn. `/rap/[code]` dùng `ScrubGroup` riêng trong page, không bị ảnh hưởng.

## Hồi quy từ thay đổi vòng 2

Không thấy hồi quy:
- Thay đổi chỉ gồm 2 rule CSS module và 1 prop tuỳ chọn.
- Props `MovieCard` không đổi.
- API của `ScheduleDateStrip` tương thích ngược, vì prop mới là tuỳ chọn.

## Findings

- BLOCKER: không có.
- MAJOR: không có.
- MINOR / Residual: giữ nguyên R1-R6 của round 1, đặc biệt:
  - **R1:** lưới 5 cột ở trang chủ lệch pha. Nên dùng `MovieGrid` ở task-03 hoặc integration.
  - **R2:** nên cứng hoá rule focus-within dùng chung trong `globals.css` (task-01) để phủ cả các phần tử animation lồng như `[data-scrub-wipe]` / `[data-scrub-rule]`.
  - **R3:** footer `scrub-inset-0` thuộc shell. Bắt buộc chạy Playwright AC-32 ở 4 cỡ màn, cuộn tới cuối trang.
  - **R6:** test apps/web chưa được reviewer kiểm độc lập vì allowlist chặn `--filter` và apps/api thiếu deps trong worktree. Dispatcher cần chạy `pnpm test` / typecheck đầy đủ ở integration.

## Verdict: **NORMAL PASS**

Cả 2 MAJOR của round 1 đã đóng: tôi kiểm bằng cấu trúc CSS (class, specificity, cascade layer, nơi đặt biến). Lint PASS. Typecheck và test của apps/web chưa kiểm độc lập được vì bị chặn hoặc lỗi môi trường. Đây là residual có điều kiện, dispatcher phải xác nhận ở integration trước khi commit layer.
