Agent: reviewer

# Review — bug/no-refund-warning-config (CR-019) · phase-1-task-01 · round 2

## Review level
**NORMAL** (giữ như round 1)

## Reason
Round 2 chỉ sửa M1/m1/m2 trên 2 file đã review: `no-refund-warning.tsx` và `booking.helper.ts`, cùng test. DTO chỉ thêm 1 trường tuỳ chọn, không đụng auth, schema hay migration.

## Blast radius
Giống round 1: `GET /bookings/:id` (thêm trường tuỳ chọn `noRefundWarning`), khối `NoRefundWarning` ở `/dat-ve/don/[id]/xac-nhan`. Không thêm consumer mới. Có export mới `DEFAULT_NO_REFUND_POLICY`, hiện chỉ test dùng.

## Trạng thái finding round 1
| ID | Mức | Trạng thái | Bằng chứng |
|---|---|---|---|
| M1 | Major | **fixed** | `no-refund-warning.tsx:21-22` khai báo hằng `DEFAULT_NO_REFUND_POLICY`, `:54` dùng `{policyText?.trim() \|\| DEFAULT_NO_REFUND_POLICY}`. Grep regex nguyên câu khớp đúng 1 lần ở `supabase/migrations/20261111010000_core_identity_chain.sql` (dòng 347) và 1 lần ở `no-refund-warning.tsx`, nên hai chuỗi trùng từng ký tự (cùng codepoint tiếng Việt). Test `confirm.test.tsx` (case "không có cấu hình") assert `textContent` bằng literal seed. |
| m1 | Minor | **fixed** | `no-refund-warning.tsx:51` dùng `min-w-0 space-y-1`, `:53` dùng `whitespace-pre-line break-words`. Test assert có class `break-words`. |
| m2 | Minor | **fixed** | `booking.helper.ts:186-195`: có `error` thì `logger.warn` chỉ ghi `error.message` và trả `undefined`; `catch` ghi `err.message`. Không log nội dung cấu hình. `logger` đã khai báo sẵn ở `booking.helper.ts:8`. |
| G1 | Gap | **deferred** | `PolicyConfirmDialog` (`no-refund-warning.tsx:~110`) vẫn dùng câu cố định. Coordinator sẽ ghi vào gap register ở close-out. Acceptance CR-019 giữ nguyên hộp thoại. |

## Kiểm tra không có lỗi mới
- **HTML trong nội dung Admin**: hiển thị như chữ. `:54` render `{...}` qua React (tự escape), không có `dangerouslySetInnerHTML`. Test XSS assert `textContent` nguyên văn và `querySelector("img, b") === null`.
- **Xuống dòng**: giữ được nhờ `whitespace-pre-line`. Test so khớp `textContent` có `\n`.
- **Fallback khi rỗng hoặc lỗi**:
  - Web: `"   ".trim()` rỗng nên rơi về `DEFAULT_NO_REFUND_POLICY`.
  - API: lỗi, thiếu, rỗng hoặc không phải chuỗi đều trả `undefined`, nên trường bị bỏ.
  - Test service và helper vẫn pass.
- **R-71, tên rạp và giờ chiếu**: nhánh `<strong>` cũ chỉ áp lên câu chính sách. Câu địa điểm vẫn còn nguyên ở `no-refund-warning.tsx:56-63`: "Vé chỉ dùng tại **{cinema.name} - {cinema.address}**, suất **{giờ}** ngày **{ngày}**." Câu này luôn render, kể cả khi dùng nội dung Admin. Test case 1 assert region chứa "CINEMO Long Biên - 12 Nguyễn Văn Cừ, Long Biên", "19:30", "11/11/2026".
- **Checkbox gating và hộp thoại**: không đổi (`:66-79`). Test fallback xác nhận nút Thanh toán bật sau khi tick.
- **Nhấn mạnh**: câu chính sách mất in đậm cụm "không thể huỷ, đổi hoặc hoàn tiền". Chấp nhận được vì nội dung Admin là văn bản thuần và khối đã có viền/nền danger cùng icon cảnh báo.

## Findings round 2
- Blocker: không có.
- Major: không có.
- Minor (không chặn):
  - **n1.** `confirm.test.tsx` (case fallback) có thêm `expect(DEFAULT_NO_REFUND_POLICY).toBe(<literal seed>)`. Dòng này thừa vì assert `textContent` ngay phía trên đã so với literal, nhưng vô hại và có tác dụng như chốt đồng bộ với seed.
  - **n2.** Hằng `DEFAULT_NO_REFUND_POLICY` (web) và seed SQL là hai bản sao. Nếu sau này đổi seed bằng migration mới thì phải nhớ sửa cả hằng. Comment ở `:20` đã nêu nguồn. Chấp nhận được với dự án demo.

## Verify commands + result (chạy độc lập)
| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS: shared 44/44, api 32 file / 714 test, web 56 file / 760 test, scripts 31/31. Flaky `account.test.tsx` không rớt |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| oxlint | skip, oxlint not configured |
| aislop | skip, không nằm trong allowlist `.context/project-config.md` |
| ocr | skip, ocr not installed |
| AI-friendly web gate | N/A |

AI-readable gate: hàm ngắn, comment nêu lý do (`:52`, `booking.helper.ts:187`), hằng có tên thay cho chuỗi magic. 0 indicator.

## Verdict
**NORMAL PASS**
