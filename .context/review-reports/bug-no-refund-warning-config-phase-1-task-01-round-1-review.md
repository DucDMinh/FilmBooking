Agent: reviewer

# Review — bug/no-refund-warning-config (CR-019) · phase-1-task-01 · round 1

## Review level
**NORMAL**

## Reason
DTO `BookingSummaryResponse` chỉ thêm 1 trường tuỳ chọn (`noRefundWarning?: string`), additive, một consumer (`xac-nhan/page.tsx`). Không đụng auth/RBAC, DB schema/migration, payment RPC. Màn thanh toán có đổi nhưng checkbox gating và dialog không đổi logic. Không có lý do nâng STRICT.

## Blast radius
- API `GET /bookings/:id` (`booking.service.ts:130-148`): thêm 1 truy vấn `app_settings`, chạy song song trong `Promise.all` nên không thêm độ trễ nối tiếp. Admin và nhân sự rạp đọc đơn cũng nhận trường mới (dữ liệu công khai, RLS `app_settings_select` cho `anon, authenticated` ở migration `20261111010000_core_identity_chain.sql:447-449`), không lộ PII.
- Shared type `packages/shared/src/schemas/booking.ts:147-148`.
- Web: `NoRefundWarning` (`no-refund-warning.tsx:22-84`), `xac-nhan/page.tsx:153`.

## Cross-boundary check (DB thật ↔ code ↔ mock)
- Key: `no_refund_warning` khớp seed (`20261111010000_core_identity_chain.sql:347`) và `APP_SETTING_KEYS` (`packages/shared/src/schemas/admin.ts:77`).
- Kiểu giá trị: seed `to_jsonb('...'::text)` là jsonb string. Admin lưu qua `settings.controller.ts:80-95`: `APP_SETTING_VALUE_SCHEMAS.no_refund_warning` (`admin.ts:87`, `z.string().trim().min(1).max(1000)`) parse `body.value`, sau đó `update({ value: parsed.data })`, tức là jsonb string. PostgREST trả về JS string. `readNoRefundWarning` (`booking.helper.ts:183-191`) kiểm tra `typeof value === "string"`, đúng với cả seed lẫn dữ liệu Admin ghi. Mock `{ value: text }` trong `booking-no-refund-warning.spec.ts` khớp shape thật. **Root cause đã được sửa thật.**
- Quyền: `grant select ... to anon, authenticated` + policy `using (true)`. `userDb` (JWT khách) đọc được, sẽ không có 42501 trên DB thật. Không có migration sau thu hồi quyền này (đã grep `supabase/migrations`).

## Verify commands + result (chạy độc lập)
| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS: shared 44/44, api 32 file / 714 test, web 56 file / 760 test, scripts 31/31. Flaky `account.test.tsx` không rớt |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| oxlint | skip, oxlint not configured (không có `.oxlintrc.json` ở root) |
| aislop | skip, không nằm trong allowlist verify của `.context/project-config.md` |
| ocr | skip, ocr not installed / không trong allowlist |
| AI-friendly web gate | N/A (màn nội bộ luồng đặt vé, không phải trang public SEO) |

## Findings

### Major (chặn PASS)
**M1. Câu mặc định fallback không trùng nội dung seed, trái acceptance "dùng nội dung mặc định (cùng nội dung seed)".**
- `apps/web/src/components/booking/no-refund-warning.tsx:54-56`: fallback là "Vé đã mua **không thể huỷ, đổi hoặc hoàn tiền**, trừ trường hợp rạp huỷ suất."
- Seed `supabase/migrations/20261111010000_core_identity_chain.sql:347`: "Vé đã thanh toán không thể huỷ, đổi hoặc hoàn tiền. Vui lòng kiểm tra kỹ suất chiếu, ghế và rạp trước khi thanh toán."
- `apps/web/src/components/booking/__tests__/confirm.test.tsx:162-165` assert đúng câu khác seed, nên test đang khoá chặt sai lệch này.
- Hệ quả: khi thiếu hoặc lỗi đọc cấu hình, khách thấy câu khác hẳn câu mặc định chính thức. Hai câu không nhất quán (một câu có ngoại lệ "rạp huỷ suất", câu kia có lời nhắc kiểm tra).
- Cách sửa: fallback dùng nguyên văn câu seed (giữ `<strong>` cho cụm "không thể huỷ, đổi hoặc hoàn tiền" nếu muốn) và sửa assert trong test cho khớp. Không cần hằng số dùng chung giữa các package. Nếu muốn giữ câu hiện tại thì phải sửa acceptance qua change doc, không được tự hạ AC. Ghi chú: ngoại lệ "trừ rạp huỷ suất" của R-133 (3) thuộc về hộp thoại xác nhận, không bắt buộc ở khối inline này, nên dùng câu seed không vi phạm R-133.

### Minor (không chặn)
- **m1. Có thể tràn ngang ở 375px khi gặp token dài không có khoảng trắng.** `no-refund-warning.tsx:47`: `div.space-y-1` là flex child của `div.flex` (`:45`) nhưng không có `min-w-0` / `break-words` (`[overflow-wrap:anywhere]`). Nội dung 1000 ký tự bình thường (có khoảng trắng) vẫn xuống dòng đúng. Nếu Admin dán URL dài hoặc chuỗi liền thì khối bị tràn ngang. Nên thêm `min-w-0 break-words` khi sửa M1.
- **m2. `readNoRefundWarning` bỏ qua `error` mà không log** (`booking.helper.ts:185-189`). Cấu hình hỏng sẽ âm thầm về fallback. Đáp ứng AC "không chặn thanh toán"; chỉ khó chẩn đoán. Có thể thêm `Logger.warn`, tuỳ chọn.

### Gap (ghi nhận, không tính vào verdict)
- **G1. `PolicyConfirmDialog` vẫn dùng câu cố định** (`no-refund-warning.tsx:112`: "Vé đã mua không huỷ, không đổi, không hoàn tiền."). Khi Admin đổi nội dung, khối inline và hộp thoại có thể nói khác nhau. Acceptance của CR-019 yêu cầu giữ nguyên hành vi hộp thoại, nên đây không phải lỗi của task này. Đề xuất ghi follow-up: R-71 gọi đây là "hộp thoại cảnh báo", nên về lâu dài nội dung Admin nên xuất hiện cả trong dialog. Có thêm một khoảng lệch có từ trước: dialog thiếu cụm "trừ rạp huỷ suất" mà R-133 (3) yêu cầu. Ngoài scope.
- Trang chi tiết vé và email vé (R-133 (5)) chưa dùng nội dung cấu hình. Ngoài scope CR-019.

### Kiểm tra đạt
- Không render HTML: chỉ dùng `{policyText.trim()}` qua React, không có `dangerouslySetInnerHTML`. Test `confirm.test.tsx` ("nội dung Admin chứa HTML") assert `textContent` nguyên văn và `querySelector("img, b") === null`, đúng là assert hành vi chứ không tautology.
- Xuống dòng: `whitespace-pre-line` kèm test so khớp `textContent` có `\n`.
- R-71: câu tên rạp, địa chỉ, giờ, ngày tách thành `<p>` riêng và luôn hiển thị; test kiểm tra region chứa rạp, giờ, ngày. Checkbox `consent-no-refund`, nhãn và `ageCheck` không đổi. Test fallback xác nhận nút "Thanh toán" bật sau khi tick.
- Lỗi đọc cấu hình: `try/catch` cùng kiểm tra kiểu trả `undefined`; spread có điều kiện `...(noRefundWarning ? {...} : {})` (`booking.helper.ts:170`) nên summary không hỏng. Test service có trường hợp có và không có cấu hình.
- Truy vấn thêm: 1 query PK lookup chạy song song, chấp nhận được.
- AI-readable: hàm mới ngắn (≤ 10 dòng), comment giải thích lý do, không có magic number, tiếng Việt có dấu. 0 indicator.
- Surgical diff: mọi dòng đều phục vụ CR-019. `docs/API_SPEC.md:144` đã cập nhật contract.

## Verdict
**FAIL** (1 Major: M1, fallback lệch acceptance "cùng nội dung seed"). Builder cần sửa M1 (nên sửa luôn m1), cập nhật assert `confirm.test.tsx:162-165`, rồi gửi review round 2.
