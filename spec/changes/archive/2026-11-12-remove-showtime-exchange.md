---
id: remove-showtime-exchange
type: feature                       # class MODIFY/REMOVE
status: done
created: 2026-11-12
---

# Bỏ lựa chọn đổi suất khi rạp huỷ suất — khách liên hệ CSKH

## Yêu cầu
Nguyên văn user (PO, 2026-11-12, trả lời điểm mở #20 của spec 2.0.0):
> "đổi suất thì bỏ luôn, báo liên hệ cskh, thế thôi"

Cùng lúc PO chốt điểm mở #21 (bán vé tại quầy): không phải vấn đề, giữ nguyên thông điệp R-67.

Khi rạp huỷ suất / đóng cửa: **không còn lựa chọn đổi suất**. Email và màn hình hướng dẫn khách **liên hệ CSKH** (hotline/email rạp); kết quả xử lý duy nhất hệ thống ghi nhận là **hoàn tiền thủ công** (`refunded_manual`). Trạng thái đơn `exchanged` bị bỏ khỏi spec.

## Acceptance (bắt buộc)
- [x] `SPECIFICATIONS.md`: R-109 (nội dung email), R-110 (bỏ "Đã đổi suất" → `exchanged`), R-119, R-134, bảng chuyển trạng thái (`affected → exchanged` bỏ), danh sách trạng thái cuối, AC-24, mục dữ liệu, điểm cần xác nhận #6/#20/#21 đã sửa; bump version theo `docs/SPEC_VERSIONING.md`.
- [x] Intent docs: `docs/BRD.md` (§7.3, BR-ADM-13/14, BR-RPT-09, sơ đồ trạng thái, AC-24, Q3, bảng xử lý ngoại lệ), `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md`.
- [x] Kế hoạch: `tasks/build-filmbooking/layer-5-task-03.md`, `layer-5-task-08.md`, `layer-7-task-06.md` (+ PLAN nếu nhắc) bỏ phần đổi suất.
- [x] `spec/updates/`, `spec/CHANGELOG.md`, `spec/test-scope/current.json` (spec-publisher).

## Ghi chú
- As-built DB (layer 3–4) đã có giá trị enum `exchanged` và chuyển trạng thái `affected → exchanged`: **không** tạo lại enum (destructive). API/Web (layer 5/7, chưa build) đơn giản không cung cấp thao tác này → nợ kỹ thuật, ghi ở task layer-5-task-08. Nếu muốn chặn cứng ở DB thì mở task riêng.
- Không đụng R-131 (khách không tự đổi suất — vẫn đúng).
