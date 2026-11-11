Agent: reviewer

# Review — build-filmbooking layer-0 task-02 (round 2)

Worktree: `E:\FilmBooking\.worktrees\layer-0__task-02` (branch `wt/layer-0__task-02`, chưa commit)
Round 1: `.context/review-reports/build-filmbooking-layer-0-task-02-round-1-review.md` (FAIL: F1–F3 MAJOR, F4–F7 MINOR)

## Review level
STRICT

## Reason
Task đụng cấu hình Supabase Auth (session, password, captcha, signup), migration và CI. Đây là các vùng risk đỏ nên giữ mức STRICT như round 1.

## Blast radius
Không đổi so với round 1:
- `supabase/config.toml` [auth.*]: ảnh hưởng các luồng auth local, và là mẫu để cấu hình Dashboard staging/prod.
- `.github/workflows/ci.yml`: gate cho push/PR vào `staging`.
- `docs/dev-setup.md`: tài liệu hướng dẫn dev.
- Ngoài worktree: `tasks/build-filmbooking/layer-2-task-02.md` được dispatcher thêm AC mới.

## Verify commands + result
- Bash của reviewer bị hook `agent-guard` chặn (đã ghi ở round 1), nên round này **verify hoàn toàn bằng đọc file**. Không chạy `supabase start` / `test db` / `pnpm -w *`.
- Migration và pgTAP smoke không đổi so với round 1. Kết quả runtime 7/7 PASS chỉ dựa vào báo cáo Builder.

## Đối chiếu fix theo từng finding round 1
| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| F1 CI pnpm version conflict | Đã sửa | `ci.yml:24`, `:50`: `pnpm/action-setup@v4` không còn `with: version`; phiên bản lấy từ `packageManager` (`pnpm@10.28.0`, task-01). Trigger `staging`, `--frozen-lockfile`, cache pnpm, `permissions: contents: read`, không có deploy: giữ nguyên. |
| F2 R-04 otp_expiry | Đã sửa | `config.toml:251` `otp_expiry = 86400`. Comment `:249-250` nêu tradeoff với R-13 (link reset 1h phải do Nest/luồng riêng tự kiểm). |
| F3 signup bypass | Đã xử lý đúng mức cho layer 0 | Cảnh báo ở `config.toml:178-180` (tại `enable_signup`) và `:219-220` (tại `[auth.captcha]`), ghi rõ "chưa coi là xong R-07". `E:\FilmBooking\tasks\build-filmbooking\layer-2-task-02.md:24` có AC hook `before_user_created` (chặn user email/password không có cờ tạo qua Nest; vẫn cho OAuth; kèm pgTAP test). `supabase/config.toml` đã được thêm vào Files của task đó (`:37`). Lỗ hổng signup đã có task cụ thể nhận việc và có test. Việc chưa bật hook ở layer 0 là hợp lý vì function chưa tồn tại (bật hook trỏ tới function chưa có sẽ làm hỏng signup). |
| F4 redirect allow-list | Đã sửa | `config.toml:165` dùng `http://localhost:3000/**` và `http://127.0.0.1:3000/**`. |
| F5 R-06 max_frequency | Đã sửa | `config.toml:245` `max_frequency = "60s"`. |
| F6 doc `--local` | Đã sửa | `dev-setup.md:15`. Thêm mục Dashboard staging/prod ở `:43-52`; nội dung khớp config local. |
| F7 `supabase/.gitignore` ngoài scope | Chấp nhận | File do `supabase init` sinh; dispatcher cần biết khi merge. |

## Responsive Checklist Gate
N/A. Diff không đụng UI.

## Skill gates
- aislop: N/A. Không có TS/JS.
- oxlint: N/A. Không có TS/JS.
- ocr: skip. Bash bị chặn.
- AI-readable: OK. Comment nêu lý do (WHY) và tham chiếu R-xx; 0 indicator.
- ai-friendly-web: N/A. Task nội bộ.
- blitzstrike: N/A.

## Findings
### [MINOR] N1 — `/auth/v1/recover` vẫn không có captcha
Hook `before_user_created` chỉ chặn việc *tạo user*, không chặn luồng quên mật khẩu gọi thẳng GoTrue. Endpoint này vẫn bỏ qua Turnstile (R-07, phần "quên mật khẩu"). Tác động còn lại là spam email reset tới user đã tồn tại. Mức thiệt hại được giới hạn bởi `max_frequency = "60s"` và rate limit email.
**Đề xuất:** layer-2-task-02 (hoặc task auth reset) ghi rõ residual này. Nếu cần chặn hẳn thì web chỉ gọi reset qua Nest; endpoint GoTrue bị gọi trực tiếp vẫn là rủi ro đã biết. Không chặn layer 0.

### [MINOR] N2 — Ghi chú gói trả phí cho session timebox
`dev-setup.md:52` ghi timebox 30 ngày chỉ có ở gói trả phí, gói free dựa vào cookie phía web. Ghi chú đúng thực tế. R-15 (trần 30 ngày) ở staging/prod gói free vì vậy phụ thuộc vào phía web/Nest, cần được kiểm ở task auth session. Chỉ là ghi nhận, không cần sửa ở đây.

## Residual risk
- Chưa có kiểm chứng runtime độc lập (`supabase start`, `test db`, CI thật trên GitHub) vì Bash của reviewer bị chặn và task-01 chưa merge.
- R-20 (Supabase tự liên kết identity cùng email) và R-13 (link reset 1h), cùng N1: thuộc layer auth.

## Verdict
✅ PASS — không còn CRITICAL/MAJOR. F1, F2, F4, F5, F6 đã sửa. F3 đã xử lý đúng mức cho layer 0: có cảnh báo trong config, có task owner cụ thể (layer-2-task-02) kèm AC và pgTAP test. Còn 2 MINOR (N1, N2) chuyển cho layer auth.
