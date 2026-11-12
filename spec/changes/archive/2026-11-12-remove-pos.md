---
id: remove-pos
type: feature                       # class REMOVE
status: done
created: 2026-11-12
---

# Bỏ toàn bộ POS khỏi dự án — chỉ làm thuần web

## Yêu cầu
Nguyên văn user (2026-11-12, chat, đã duyệt — không hỏi lại):
> "dừng toàn bộ lại, BỎ TOÀN BỘ POS RA KHỎI DỰ ÁN, nó đang làm deplay dự án quá nhiều, chỉ làm thuần web. Sửa intent, sửa cả spec đi. Đây là yêu cầu từ tôi, thực hiện ngay lập tức không hỏi lại"

Classification: **REMOVE** · spec bump **MAJOR** (xoá requirement) 1.1.0 → 2.0.0.
User duyệt rõ việc sửa **intent docs** (BRD, design doc) — đây là Change Request hợp lệ theo AGENTS.md § Doc Impact.

Bỏ khỏi phạm vi: API POS (`/pos/v1/*`), khoá API POS theo rạp + nhật ký/rate limit API POS, POS giả lập cho Staff, đơn kênh `POS`, đồng bộ giữ/bán ghế web↔POS, báo cáo tách kênh POS.
Giữ: vai trò **Staff** (soát vé, tra cứu đơn, đơn bị ảnh hưởng); quầy vé vật lý chỉ còn là nơi đổi suất / hỗ trợ ngoài hệ thống (R-67 "mua tại quầy", R-110 "đổi suất tại quầy" giữ nguyên nghĩa vật lý, không có tích hợp).

## Acceptance (bắt buộc)
- [x] `SPECIFICATIONS.md`: R-111, R-120→R-130, AC-20→AC-23 đánh dấu **REMOVED** (không xoá dòng, không đánh số lại); mọi tham chiếu "web và POS / web ↔ POS / kênh POS" trong R/NFR/AC/quyết định khác đã sửa thành chỉ web; spec_version 2.0.0.
- [x] Intent docs (`docs/BRD.md`, `docs/specs/2026-11-10-filmbooking-mvp-design.md`) + `.context/design-spec.md` + design screens POS (29, 39) đánh dấu bỏ.
- [x] `spec/updates/2026-11-12-remove-pos.md`, `spec/CHANGELOG.md`, `spec/test-scope/current.json` cập nhật (spec-publisher).
- [x] Kế hoạch: `tasks/build-filmbooking/PLAN.md` + task file layer 5–8 bỏ/cắt phần POS; `bug-layer34-review` phase-2 task-03/04/06 thu hẹp bỏ POS.
- [x] Code/DB (task riêng, builder → reviewer STRICT): chặn/bỏ entry point POS (RPC `confirm_pos_sale` + RPC POS, bảng khoá/nhật ký API POS), cập nhật test + shared + web; migration additive mới gắn HIGH_RISK_MIGRATION.

## Ghi chú
- Task-03 (`bug-layer34-review/phase-2-task-03`) bị dừng (round 3 FAIL, chưa commit) → thu hẹp: giữ `confirm_zero_amount`, bỏ phần POS; **bỏ FK `tickets.seat_id`** (nguyên nhân deadlock F11 trên `confirm_paid`) → backlog, muốn thêm lại phải khoá seats trong `sell_order_seats` trước.
- Không tạo lại enum kênh đơn để bỏ giá trị `POS` (destructive) → nợ kỹ thuật, ghi rõ trong task code.
- Không viết lại các nhánh POS nội bộ trong `hold_seats` / `cancel_showtimes` / expire (thứ tự khoá vừa chốt qua 4 vòng review) — chỉ chặn đường vào, ghi residual.
