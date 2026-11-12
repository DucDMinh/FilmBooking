# Spec Update — 2026-11-12 remove-showtime-exchange
**spec_version:** 2.0.0 → 3.0.0 (MAJOR — đổi ngữ nghĩa requirement)
**Trigger:** feature-update (Change Request class MODIFY/REMOVE) · change doc `spec/changes/2026-11-12-remove-showtime-exchange.md`

## Requirements

### SỬA (MODIFIED — đổi ngữ nghĩa)
- **R-109** Email thông báo hàng loạt — hướng xử lý khi huỷ suất: ~~mang mã đặt vé tới quầy để đổi suất, hoặc liên hệ rạp để hoàn tiền~~ → **liên hệ CSKH** của rạp để được hoàn tiền thủ công. Kênh liên hệ: hotline / CSKH của rạp; rạp chưa cấu hình hotline → **tổng đài CSKH mặc định của chuỗi `1900 0000`** (số giả lập cho demo).
- **R-110** Màn Đơn bị ảnh hưởng — bỏ phương án "Đã đổi suất" (→ `exchanged`); chỉ còn **Đã hoàn tiền thủ công** (đủ trường bắt buộc) → `refunded_manual`.
- **R-119** Báo cáo suất bị huỷ — bỏ chỉ số "số đã đổi suất"; còn số đơn ảnh hưởng, số đã hoàn tiền, tổng tiền hoàn thủ công.
- **R-134** Ngoại lệ & hoàn tiền thủ công — rạp huỷ suất: khách liên hệ CSKH để được hoàn tiền thủ công, **không đổi suất**.
- **AC-24** — email gửi kèm "hướng dẫn liên hệ CSKH để hoàn tiền" (thay "hướng dẫn đổi suất / hoàn tiền").

### XOÁ (không phải R)
- Bảng chuyển trạng thái đơn: bỏ dòng `affected → exchanged`.
- Trạng thái cuối: bỏ `exchanged` (còn `checked_in`, `refunded_manual`, `needs_manual_review`, `paid` sau suất kết thúc, `cancelled`).

### SỬA các mục không phải R
- Dữ liệu "Đơn bị ảnh hưởng": kết quả xử lý chỉ còn hoàn tiền thủ công.
- Điểm cần xác nhận #6: bỏ "Đã đổi suất" khỏi danh sách kết quả Staff ghi nhận.
- Điểm cần xác nhận **#20** (đổi suất khi rạp huỷ suất): **ĐÃ CHỐT — bỏ đổi suất**.
- Điểm cần xác nhận **#21** (bán vé tại quầy): **ĐÃ CHỐT — không phải vấn đề**; giữ nguyên thông điệp R-67, hệ thống không quản lý bán tại quầy.

### KHÔNG đổi
- **R-131** (khách không thể tự huỷ, đổi suất, đổi ghế, đổi rạp, yêu cầu hoàn tiền) — giữ nguyên.
- R-108 (huỷ suất), các trường bắt buộc của hoàn tiền thủ công, AC-25, AC-26.

## Lý do
Quyết định PO 2026-11-12, trả lời điểm mở #20 của spec 2.0.0: "đổi suất thì bỏ luôn, báo liên hệ cskh, thế thôi" + "cho 1 số đt tổng đài bừa vào đấy". Sau khi bỏ POS (spec 2.0.0), hệ thống không có cơ chế phát hành vé cho suất mới nên đổi suất không soát vé được; PO chọn bỏ hẳn thay vì thêm chức năng.

## Ảnh hưởng
- **Kế hoạch build (chưa làm, đã cập nhật):** `tasks/build-filmbooking/layer-5-task-03.md` (template email huỷ suất), `layer-5-task-08.md` (API đơn bị ảnh hưởng), `layer-7-task-06.md` (web admin đơn bị ảnh hưởng).
- **As-built DB (layer 3–4) — nợ kỹ thuật:** enum trạng thái đơn còn giá trị `exchanged` và chuyển trạng thái `affected → exchanged`. **Không** tạo lại enum (destructive). API/Web (layer 5/7) không cung cấp thao tác này. Muốn chặn cứng ở DB → mở task riêng. `docs/ERD.md` (as-built) vì vậy vẫn còn `exchanged`.
- **Intent docs:** `docs/BRD.md` v0.6, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` đã cập nhật trong cùng change.
- **Test:** test case cho phương án đổi suất chuyển `n/a` / xoá; AC-24 kiểm tra nội dung email mới (liên hệ CSKH, hotline mặc định `1900 0000`); API ghi kết quả xử lý chỉ nhận hoàn tiền thủ công.

## Archive
- Spec trước thay đổi: `spec/archive/SPECIFICATIONS-2.0.0.md`
- Test-scope trước thay đổi: `spec/test-scope/archive/test-scope-2.0.0-3.json`

**Scope sinh:** `spec/test-scope/current.json` (specVersion 3.0.0, scopeVersion 4; specRefs 122 và acceptance 22 không đổi số lượng, AC-24 đổi nội dung)
