Agent: reviewer

# Review — build-filmbooking layer-2 task-05 (web shell công khai + component chung + trang pháp lý) — round 1

- Worktree: `E:\FilmBooking\.worktrees\layer-2__task-05` (chưa commit)
- Task: `tasks/build-filmbooking/layer-2-task-05.md`
- **Review level: STRICT**
- **Reason:** shell/navigation + component dùng chung (EmptyState/ErrorState/LoadingState/Money/DateTime/AgeBadge) cho mọi màn khách sau này; nội dung pháp lý (R-133 lớp 1, NĐ 13/2023, R-25 Facebook App Review) là văn bản ràng buộc với khách.
- **Blast radius:** mọi route trong `(public)` và `(auth)` (header/footer/main landmark), mọi màn dùng giá tiền/giờ/nhãn tuổi, 3 URL công khai `/dieu-khoan`, `/chinh-sach-bao-mat`, `/huong-dan-xoa-du-lieu` (URL thứ 3 sẽ khai báo cho Facebook App Review). Không đụng API/DB/auth.

## Scope check
- `git status`: 11 file mới đúng danh sách "Files to Create/Modify"; `apps/web/next-env.d.ts` ` M` (auto-gen, dispatcher xử lý — không tính lỗi).
- Không import file của task song song layer-2/task-04: chỉ dùng `@/components/ui/*` (layer-1), `@/lib/utils`, `@filmbooking/shared` (`formatVnd`, `formatVnDateTime`, `AGE_RATINGS`, `AgeRating`). OK.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm lint` | PASS (shared/api/web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — shared 14, api 20, web 23 (2 file) |
| `pnpm build` | PASS — `/dieu-khoan`, `/chinh-sach-bao-mat`, `/huong-dan-xoa-du-lieu` prerender `○ (Static)` |

## Acceptance Criteria
| AC | Kết quả | Bằng chứng |
|---|---|---|
| Header responsive ≥360px, bàn phím, focus visible | OK (đọc code) | `site-header.tsx`: nav `hidden md:flex`, hamburger `md:hidden` size icon, Sheet (Radix Dialog → focus trap + Esc), `aria-expanded`, `aria-current`; `globals.css:149` `:focus-visible` outline brand. Không có test header (xem MINOR-4). |
| 3 trang SSR + title/meta, footer link đủ 3 | OK | build static; mỗi page export `metadata` title+description; test footer kiểm 3 href. |
| AgeBadge 5 nhãn + mô tả cho screen reader | **FAIL thực tế** | test PASS trong jsdom nhưng `aria-label` đặt trên `<span>` không role (MAJOR-3). |
| Test role cho states + Money `120.000 ₫` | OK | `common.test.tsx` 12 test. |

## Findings

### [MAJOR-1] Điều khoản: ngoại lệ không-hoàn lệch BRD (R-134 / R-109) — tự thêm ngoại lệ, thiếu "rạp đóng cửa"
- `apps/web/src/app/(public)/dieu-khoan/page.tsx:83` — "Ngoại lệ duy nhất: trường hợp suất chiếu bị huỷ bởi rạp **hoặc sự cố thuộc trách nhiệm của CINEMO**". SPEC R-134 / §1 dòng 26: ngoại lệ duy nhất là **rạp huỷ suất / rạp đóng cửa**. "Sự cố thuộc trách nhiệm của CINEMO" không có trong nguồn (mở thêm nghĩa vụ hoàn tiền); "rạp đóng cửa" bị bỏ sót.
- `dieu-khoan/page.tsx:97-101` (mục 6) — "chúng tôi sẽ ... xử lý hoàn tiền theo quy trình do quản trị viên thực hiện". R-109/R-134: huỷ suất → khách **mang mã đặt vé tới quầy để đổi suất, hoặc liên hệ rạp để hoàn tiền thủ công nếu đồng ý**; đóng cửa rạp → **rạp liên hệ hoàn tiền thủ công**; hoàn tiền ngoài hệ thống.
- Nguồn đã soát: grep `sự cố|đóng cửa` trong `.context/design-spec.md` và `sự cố thuộc` trong `docs/` — không có câu này; design-spec B20 (dòng 557) cũng ghi đúng 2 loại huỷ suất / đóng cửa → nội dung tự thêm, không phải xung đột nguồn.
- Fix: bỏ cụm "sự cố thuộc trách nhiệm của CINEMO"; ngoại lệ = "rạp huỷ suất hoặc rạp đóng cửa"; mục 6 viết theo R-109 (đổi suất tại quầy hoặc hoàn tiền thủ công nếu khách đồng ý; đóng cửa → rạp liên hệ hoàn tiền thủ công; thông báo qua email kèm hotline rạp).

### [MAJOR-2] Hướng dẫn xoá dữ liệu: số liệu tự đặt "72 giờ làm việc"
- `apps/web/src/app/(public)/huong-dan-xoa-du-lieu/page.tsx:41-42` — "dự kiến tối đa 72 giờ làm việc kể từ khi xác minh danh tính". Không có SLA này trong nguồn (grep `72 giờ` trong `SPECIFICATIONS.md`, `.context/design-spec.md`, `docs/` = 0 kết quả). Trang này là URL khai báo cho Facebook App Review → cam kết công khai.
- Fix: bỏ con số, ghi "trong thời hạn theo quy định pháp luật" hoặc placeholder rõ ràng `[cần chốt thời hạn với pháp lý]` giống cách để trống email/hotline.

### [MAJOR-3] AgeBadge: `aria-label` trên `<span>` generic — screen reader thường bỏ qua → AC3 không đạt thực tế
- `apps/web/src/components/common/age-badge.tsx:28-29`. ARIA 1.2 cấm đặt tên cho role `generic` (axe `aria-prohibited-attr`, mức serious); NVDA/VoiceOver đọc nội dung "T16" chứ không đọc label. Test `getByLabelText` trong jsdom PASS → false confidence.
- Ghi chú nguồn: `skills/react-nodejs/design-tokens.md:123` quy định đúng mẫu `aria-label` trần này → builder làm theo doc, **không phải vi phạm spec**; nhưng mẫu đó không đạt AC3 trên screen reader thật. Follow-up: sửa design-tokens §1.7 cho khớp.
- Fix khuyến nghị (b) vì giữ cách tiếp cận của doc: thêm `role="img"` cùng `aria-label`, test bằng `getByRole("img", { name: "Phân loại T16: …" })`. Phương án (a): chữ nhãn `aria-hidden="true"` + `<span className="sr-only">Phân loại T16: …</span>`.

### [MINOR-1] Hướng dẫn xoá dữ liệu thiếu cảnh báo R-29
- `huong-dan-xoa-du-lieu/page.tsx:19-29` — R-29 yêu cầu cảnh báo **vé chưa sử dụng sẽ mất hiệu lực** + xác nhận lại bằng mật khẩu/OAuth. Nên thêm 1 dòng (đúng spec, không thêm gì khác).

### [MINOR-2] Chính sách bảo mật thiếu điểm NFR-08 "định vị chỉ dùng tại trình duyệt, không lưu toạ độ"
- `chinh-sach-bao-mat/page.tsx:24-30` — nên nêu rõ vị trí không được lưu (đúng spec, tăng minh bạch NĐ 13).

### [MINOR-3] Giá trị arbitrary ngoài token trong diff
- `site-header.tsx:50`, `(auth)/layout.tsx:12` `text-[22px]`; 3 trang pháp lý `text-[16px] leading-[1.7]` (`dieu-khoan/page.tsx:21`, `chinh-sach-bao-mat/page.tsx:11`, `huong-dan-xoa-du-lieu/page.tsx:11`); `max-w-[1300px]`, `max-w-[760px]`, `max-w-[440px]`. Không có hex thô (OK). Fix trong scope: `text-[16px]` → `text-base`; `text-[22px]` → `text-[1.375rem]` hoặc token; max-width lặp 1300 nên gom 1 hằng/class.

### [MINOR-4] Không có test cho SiteHeader và trang pháp lý
- AC1 (nav, ẩn "Khuyến mãi", `aria-expanded`, mở Sheet) và AC2 (metadata, khối "không huỷ – không hoàn") chưa có test. Đề xuất: header render 3 nav item, không có "Khuyến mãi", click hamburger → dialog mở + `aria-expanded=true`; `/dieu-khoan` có `metadata.title` + text cảnh báo.

### [MINOR-5] Không có skip link
- `(public)/layout.tsx` có `<main id="main">` nhưng không có link "Bỏ qua tới nội dung" trỏ `#main`. Landmark đáp ứng tối thiểu WCAG 2.4.1; nên thêm link `sr-only focus:not-sr-only` đầu trang.

### [MINOR-6] Link tài khoản trong Sheet dùng sai active-state
- `site-header.tsx:112-116` — luôn `linkClass("/dang-nhap")` kể cả khi href `/tai-khoan`; không có `aria-current`. Fix: `linkClass(user ? "/tai-khoan" : "/dang-nhap")`.

### [MINOR-7] `DateTime` crash với chuỗi không hợp lệ
- `money.tsx:15-17` — `new Date("bad").toISOString()` ném `RangeError` làm vỡ cây render. Fix: guard `Number.isNaN(instant.getTime())` → render "—".

### [MINOR-8] Phiên bản điều khoản hardcode "0.1" lặp ở 3 trang
- R-03/R-133(6) cần lưu **phiên bản** điều khoản đã đồng ý; nên đưa version/ngày cập nhật vào 1 hằng số dùng chung để layer auth/booking tham chiếu. Có thể để follow-up.

### [MINOR-9] AgeBadge dùng `text-caption` (10px desktop) trong khi tokens §1.7 ghi pill 11px/600
- `age-badge.tsx:31`. Kiểm lại cỡ chữ theo handoff.

## Đã xác minh thêm
- "Đã bao gồm thuế, phí" (`dieu-khoan/page.tsx:67`) có nguồn: design-spec dòng 208 + handoff `docs/design/cinemo/screens/06-seat-selection.svg:168` → OK.
- Thanh toán VietQR, "không huỷ/không đổi/không hoàn", "vé chỉ có giá trị tại rạp ghi trên vé" khớp R-131/R-132/R-133.

## Responsive Checklist Gate (360 / 768 / 1280 — xác minh bằng đọc CSS, không có browser)
| Mục | Kết quả | Bằng chứng |
|---|---|---|
| Không cuộn ngang | OK | Header 360px: logo (~100px) + `ml-auto` hamburger 44px, px-4; nav desktop `hidden md:flex`; footer `flex-wrap`; prose `w-full max-w-[760px]`; Sheet `w-72` (288px < 360). Không có width cố định > viewport. |
| Mobile-first (`min-width`) | OK | Chỉ dùng prefix `md:` (min-width). |
| Grid auto-fit/minmax | N/A | Không có grid. |
| Container không fixed px | OK | `w-full` + `max-w-*` (max-width, không fixed width). |
| Font-size rem | OK (ngoài scope) | Scale token toàn dự án là px (quy ước layer-1 `globals.css`) → ngoài scope, đề xuất task riêng. Giá trị arbitrary mới trong diff → MINOR-3, không chặn. |
| Heading fluid | OK | Token `--text-h1/h2/h3` đổi theo media query mobile (`globals.css:166-169`), quy ước layer-1. |
| Media srcset/aspect-ratio | N/A | Không có ảnh/video. |
| Touch target ≥44px | OK | Link nav/footer/mục lục/logo `min-h-11`; hamburger `size="icon"`; nút Thử lại Button default. Nút đóng Sheet là component layer-1 — ngoài scope. |
| Nav mobile hamburger | OK | Sheet `side="left"` + `SheetTitle`/`SheetDescription`, đóng khi chọn link. |
| Table scroll | N/A | Không có bảng. |
| `100vh` | OK | Dùng `min-h-dvh`. |
| `prefers-reduced-motion` | OK | `globals.css:154` (layer-1). |
| Không che lỗi bằng `overflow:hidden` | OK | Không có. |
| Focus visible / aria | OK (trừ AgeBadge → MAJOR-3) | `:focus-visible` toàn cục; `aria-label` nav, `aria-current`, `aria-expanded`, `role=alert`/`role=status`. |
| Tương phản | OK | Theo bảng design-tokens: warning/warning-soft 7.28, brand-hover/brand-soft 6.37, danger-strong/danger-banner 8.54, success 8.01, info 7.07, trắng/age-pill 16.79; fg-muted `#7E8999` trên chrome `#111620` ≈ 5.0:1 (tính tay) cho footer 12px — đạt AA. |

## Skill gates
| Gate | Kết quả |
|---|---|
| aislop | skip — `aislop: command not found` |
| oxlint (anti-slop) | skip, oxlint not configured (không có `.oxlintrc*` trong repo; eslint PASS) |
| ocr (open-code-review) | skip, ocr not installed |
| AI-readable | OK — < 3 indicator (file ≤125 dòng, hàm ngắn, tên rõ, comment WHY) |
| ai-friendly-web | N/A cho task này (robots/sitemap/llms.txt thuộc task devops/SEO riêng) |
| blitzstrike | N/A — không có input/API/auth |
| Security | OK — trang tĩnh, không `dangerouslySetInnerHTML`, không input, không secret |

## Residual risk
- Chưa xem trình duyệt thật ở 360/768/1280; responsive xác minh bằng đọc class.
- Nội dung pháp lý vẫn là bản nháp, cần rà soát pháp lý trước go-live (đã có banner).
- Email/hotline trống — phải điền trước khi nộp Facebook App Review (R-25).
- Không tìm thấy mục "C-24" trong `.context/design-spec.md` bằng grep; đối chiếu nội dung pháp lý dựa trên SPECIFICATIONS + design-spec B20/§208 + handoff.

## Verdict: FAIL
3 MAJOR: MAJOR-1 (điều khoản lệch R-134/R-109), MAJOR-2 (thời hạn 72 giờ không có nguồn), MAJOR-3 (AgeBadge không có tên accessible thực tế). Responsive gate không có mục FAIL. Trả builder sửa; MINOR-1, 3, 4, 6 nên sửa cùng vòng.
