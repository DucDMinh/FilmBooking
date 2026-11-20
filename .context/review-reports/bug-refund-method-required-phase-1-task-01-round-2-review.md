# Review: bug-refund-method-required · phase-1-task-01 · round 2

Agent: reviewer

- Review level: **STRICT** (giữ nguyên round 1: DB/migration, dữ liệu hoàn tiền, DTO dùng nhiều client, CSV)
- Reason: round 2 là xác nhận hẹp. Round 1 FAIL chỉ vì task bug thiếu `## Repro Verification` (MAJOR-1).
- Blast radius: như round 1 (`affected_order_actions`, route refund ×3 alias, DTO đơn bị ảnh hưởng/chi tiết đơn, CSV, web form/chi tiết/danh sách).

## Verify commands + result
- Code không đổi so với round 1. `git diff --stat` giống hệt: 22 file, +356/−33. Chỉ có task file thay đổi.
- Kết quả round 1 vẫn còn hiệu lực:

| Lệnh | Kết quả round 1 |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS (shared 39, api 679, web 669, scripts 31) |
| `pnpm db:test` | 070 14/14 ok; các file cũ đỏ do DB bẩn có sẵn |

- Không chạy lại test, theo phạm vi xác nhận hẹp và vì code không đổi.

## Kiểm mục Repro Verification (`tasks/bug-refund-method-required/phase-1-task-01.md:17-32`)
Đối chiếu `.agent/workflows/state-commit.md:82` và luật bug repro closure:

| Hạng mục | Có? | Ghi chú |
|---|---|---|
| Original repro | Có | `:18` — POST refund thiếu phương thức/ngày; form lưu được |
| Expected | Có | `:19` — R-110, 422 `VALIDATION_ERROR` |
| Actual before fix | Có | `:20` — zod cũ trả 201, DB không có cột, `refundedAt` = created_at |
| Actual after fix | Có | `:21` |
| Evidence kiểm chứng được | Có | `:22-28` — test tự động cụ thể (shared, API e2e, int-spec, pgTAP 070, web) + lệnh + số liệu. Reviewer đã chạy lại độc lập ở round 1 |
| Status PASS | Có | `:32` |
| HIGH_RISK_MIGRATION | Có | `:29` — KHÔNG, khớp đánh giá round 1 |
| Residual risk | Có | `:30` — ghi đủ MINOR/NIT round 1 + 031/044 chưa chạy trên DB sạch + int-spec chỉ có số liệu builder |
| Mã lỗi 400 → 422 | Có | `:8` đã sửa (MINOR-4 round 1) |

Đủ điều kiện, MAJOR-1 đã đóng.

## Findings
- NIT-3 (mới, không chặn): `phase-1-task-01.md:10` (bước 5 "Hướng sửa") còn câu "API e2e (thiếu method/date → 400 …)". Test và code thực tế là 422. Chỉ là chữ trong kế hoạch, nên sửa cho nhất quán khi tiện.
- Các MINOR-1..3 và NIT-1..2 từ round 1 vẫn còn, đã được ghi vào Residual của task. Không chặn PASS.

## Verdict: **STRICT PASS**
