Agent: spec-validator

# Spec Validation Report — feature remove-pos (phase-1), round 2

- Change: `spec/changes/2026-11-12-remove-pos.md` (REMOVE, spec 1.1.0 → 2.0.0, scopeVersion 3)
- Ngày: 2026-11-12
- Round: 2 (phạm vi hẹp: kiểm các mục M1–M8 và H1/H2 của round 1)
- Round 1 report: `.context/review-reports/feature-remove-pos-phase-1-spec-validation.md`
- Giới hạn: Bash bị chặn cho vai spec-validator; không diff được với HEAD và không recount toàn bộ số liệu (109/13/128/18/22) bằng script. Số liệu footer được đối chiếu với round 1 và với mã đã gạch, chưa recount độc lập.

## Verdict: ✅ PASS

Lý do: tất cả M1–M4, M7, M8 đã đóng. M5/M6 hoãn sang task code (residual được chấp nhận). H1/H2 đã ghi thành điểm mở #20 và #21 kèm hành vi mặc định rõ ràng, không còn mâu thuẫn ngầm trong requirement còn hiệu lực. Không có ❌ mới, không có HIGH mới, không có ⚠️ còn mở ngoài residual đã chấp nhận. Có 1 finding LOW mới (N1) về quy ước đánh dấu tag, không chặn build.

## Trạng thái finding round 1

| Mã | Nội dung round 1 | Trạng thái round 2 | Bằng chứng |
|---|---|---|---|
| H1 | Đổi suất "mã vé mới cấp tại quầy" không có cơ chế hệ thống | ✅ Ghi nhận thành điểm mở | `SPECIFICATIONS.md:542` (#20): nêu rõ hệ thống không phát hành vé, vé ngoài hệ thống không soát được (R-98/R-99); PO chọn (a)/(b)/(c); default "build chỉ ghi nhận `exchanged` như R-110, không phát hành vé". Đủ rõ, không chặn MVP web |
| H2 | Quầy bán ngoài hệ thống mâu thuẫn "nguồn sự thật duy nhất về ghế" | ✅ Ghi nhận thành điểm mở | `SPECIFICATIONS.md:543` (#21) + Overview `:27` đã nêu quầy vật lý nằm ngoài hệ thống, không đồng bộ ghế. Default: giữ thông điệp R-67, hệ thống không quản lý bán tại quầy. NFR-04 chỉ đúng trong phạm vi web (đúng với phạm vi MVP web) |
| M1 | Footer `SPECIFICATIONS.md:517` stale | ✅ Đóng | `:517` hiện "134 mã, 12 REMOVED → 122 còn hiệu lực — 109 MVP (10 `[cần xác nhận]`), 13 GĐ2; 128/128 BR; 18/18 NFR; 22/22 AC", khớp đề bài. Chưa recount độc lập |
| M2 | Tiêu đề R-119 còn "kênh bán" | ✅ Đóng | `SPECIFICATIONS.md:261` = "Báo cáo suất bị huỷ" |
| M3 | Design doc header, số 121, hold_seats | ✅ Đóng (ghi chú) | `docs/specs/2026-11-10-filmbooking-mvp-design.md:4` có dòng cập nhật "SPEC 2.0.0 (bỏ POS)" (phần "BRD v0.3 · 1.1.0" còn lại là nguồn lịch sử, chấp nhận); `:9` "~~121~~ **109**"; `:87` hold_seats ghi chú "chữ ký as-built gỡ ở task code" (residual đã nêu) |
| M4 | manifest source "BRD v0.4" | ✅ Đóng | `docs/design/cinemo/manifest.json:3` = "BRD v0.5" |
| M5 | ERD as-built còn bảng/cột POS | ⏸ Residual chấp nhận | Hoãn sang task code theo yêu cầu caller; phải reconcile ERD khi task code xong (Doc Impact) |
| M6 | Header task layer-2/4 còn ID REMOVED chưa gạch | ⏸ Residual chấp nhận | Task đã/đang build, chỉ ghi chú (theo caller: hoãn cùng M5) |
| M7 | CR-002 không có change doc | ✅ Đóng | `spec/changes/BACKLOG.md:12` trỏ `2026-11-12-tickets-seat-fk.md`; file tồn tại (grep thấy `id: tickets-seat-fk`) |
| M8 | design-spec `:466` cột "kênh" | ✅ Đóng | Grep "kênh" trong `.context/design-spec.md` chỉ còn dòng :6 (ghi chú scope change) và :716 (ghi chú REMOVED); không còn cột kênh ở chi tiết đơn |
| M9 | Không diff được với HEAD | ⏸ Residual | Không thay đổi; ghi nhận |

## Finding mới round 2

### N1 — LOW — Thiếu tag `[cần xác nhận]` tại requirement liên quan điểm mở #20/#21
- Quy ước ở `SPECIFICATIONS.md:16`: chỗ mơ hồ/mâu thuẫn ghi ở § Điểm cần xác nhận **và đánh dấu `[cần xác nhận]` tại requirement liên quan**.
- Thực tế: R-67 (`:175`), R-109 (`:244`), R-110 (`:245`), R-134 (`:290`) vẫn cột phase = `MVP`, không có tag. R-98/R-99 cũng không tag.
- Ảnh hưởng: không tạo mâu thuẫn requirement (nội dung đã có điểm mở rõ), nhưng người đọc requirement có thể bỏ qua #20/#21.
- Đề nghị: thêm tag `[cần xác nhận #20]` / `[cần xác nhận #21]` ở cột phase hoặc tên requirement (làm trong change nhỏ hoặc cùng đợt spec-publisher sau). Không chặn phase-1 PASS.

## Ghi chú về các điểm đã kiểm (không phải finding)
- R-119 (`:261`) chỉ còn "Báo cáo suất bị huỷ" — đúng với BRD `docs/BRD.md:363` theo round 1.
- Điểm #7 và #8 đã gạch, #20/#21 là điểm mở mới; không trùng số với các điểm khác (#1–#19 giữ nguyên).
- Không phát hiện REMOVED mới ngoài tập 12 R + 4 AC đã kiểm ở round 1.

## Kết luận
- Phase-1 spec của `remove-pos` đủ điều kiện PASS round 2.
- Trước khi spec-publisher chạy lại hoặc khi PO chốt #20/#21: sửa tag N1 và cập nhật R-67/R-110 theo quyết định PO (MODIFY, cần duyệt).
- Residual: M5, M6, M9 (đã chấp nhận); số liệu footer chưa recount độc lập.
