# Spec Update — 2026-11-12 remove-pos
**spec_version:** 1.1.0 → 2.0.0 (MAJOR — xoá requirement)
**Trigger:** feature-update (Change Request class REMOVE) · change doc `spec/changes/2026-11-12-remove-pos.md`

## Requirements

### XOÁ (REMOVED — giữ dòng, không đánh số lại, cột phase = `REMOVED`; không implement, không test)
- **R-111** Khoá API POS (BR-ADM-15)
- **R-120** API cho POS theo rạp (BR-POS-01)
- **R-121** POS giữ ghế → web thấy ngay (BR-POS-02)
- **R-122** Web giữ/bán → POS không khả dụng (BR-POS-03)
- **R-123** Cơ chế nguyên tử chung web/POS (BR-POS-04)
- **R-124** Thời hạn giữ ghế POS (BR-POS-05)
- **R-125** Xác nhận bán từ POS / đơn kênh `POS` (BR-POS-06)
- **R-126** API POS idempotent (BR-POS-07)
- **R-127** POS từ chối suất huỷ / ngừng bán (BR-POS-08)
- **R-128** Không bán offline (BR-POS-09)
- **R-129** POS giả lập (BR-POS-10)
- **R-130** Log & rate limit API POS (BR-POS-11)
- **AC-20, AC-21, AC-22, AC-23** (acceptance POS)

Tổng: **12 requirement + 4 acceptance** bị loại. Mục 14 "POS — Đồng bộ khoá ghế với quầy vé" đánh dấu REMOVED.

### SỬA wording (bỏ vế POS, ngữ nghĩa phần web giữ nguyên)
- **R-55** Khoá ghế theo suất — "không bán được trên web và POS" → "không bán được trên web".
- **R-59** Trạng thái ghế — "Đang được giữ" chỉ do khách web khác; "Đã bán" bỏ "(web hoặc POS)".
- **R-107** Audit log — actor còn Admin / Manager / Staff (bỏ POS).
- **R-108** Huỷ suất — "ngừng bán trên web và POS" → "ngừng bán trên web".
- **R-119** Báo cáo — bỏ phần tách kênh Web / POS, chỉ còn báo cáo suất bị huỷ.
- **NFR-02** Tải — giữ ghế "(web)"; bỏ tham chiếu R-123.
- **NFR-03** Realtime — bỏ tham chiếu R-121.
- **NFR-04** Toàn vẹn — bỏ tham chiếu R-123.
- **NFR-17** Kiểm thử — giữ ghế đồng thời **web ↔ web**; phân quyền theo rạp chỉ Staff/Manager (bỏ khoá API POS); bỏ tham chiếu R-123, R-120.
- **AC-24** — "ngừng bán trên web" (bỏ POS); bỏ tham chiếu R-127.

### SỬA các mục không phải R
- Overview: thay đoạn POS bằng "Chỉ kênh web", web là nguồn sự thật duy nhất về ghế; quầy vé vật lý ngoài hệ thống.
- Bảng actor: bỏ dòng "POS (hệ thống ngoài)".
- Tech stack Backend: bỏ "API POS", service role chỉ cho webhook/job.
- Bảng tính năng: bỏ dòng "API cho POS".
- Dữ liệu: đơn hàng chỉ kênh Web; giữ ghế bỏ "nguồn giữ (web / POS)"; bỏ khoá API POS + nhật ký gọi API POS.
- Phạm vi theo rạp: bỏ "khoá API POS cấp theo từng rạp".
- Kiến trúc/auth: bỏ bullet "POS xác thực bằng khoá API theo rạp".
- Trạng thái ghế liên quan: bỏ "(web/POS)" và ghi chú đơn kênh POS.
- Ngoài phạm vi: mọi phần mềm / tích hợp POS (POS thật, POS giả lập, API POS, khoá API POS, đơn kênh POS, đồng bộ ghế với quầy).
- Traceability: dòng ADMIN đánh dấu R-111 REMOVED; dòng POS → REMOVED.
- Điểm cần xác nhận #7, #8: gạch, "không còn áp dụng".
- Quyết định brainstorm #3: phần tách kênh Web/POS của BR-RPT-09 bỏ; #7, #8: đánh dấu REMOVED.
- Ghi chú tham chiếu chéo: bỏ ràng buộc R-125/R-128/R-122/R-123 và R-127; R-67 chỉ áp cho web.

## Lý do
Quyết định PO 2026-11-12 (nguyên văn trong change doc): POS đang làm delay dự án quá nhiều → bỏ toàn bộ POS, **chỉ làm thuần web**. User duyệt rõ việc sửa intent + spec, không hỏi lại.

Giữ nguyên: vai trò **Staff** (soát vé, tra cứu đơn, đơn bị ảnh hưởng); "mua tại quầy" (R-67) và "đổi suất tại quầy" (R-110) chỉ còn nghĩa vật lý, không có tích hợp.

## Ảnh hưởng
- **Kế hoạch build:** task layer 5–8 có phần POS (`tasks/build-filmbooking/`) phải bỏ/cắt phần POS.
- **bug-layer34-review:** phase-2 task-03 / task-04 / task-06 thu hẹp, bỏ phần POS (task-03 giữ `confirm_zero_amount`).
- **Code/DB đã có (xử lý ở task code riêng, builder → reviewer STRICT, migration additive gắn `HIGH_RISK_MIGRATION`):** RPC `confirm_pos_sale` và các RPC POS, bảng khoá API POS + nhật ký gọi API POS, nhánh POS trong `hold_seats` / `cancel_showtimes` / expire. Hướng xử lý: chặn đường vào, không viết lại nhánh nội bộ; giá trị enum kênh đơn `POS` giữ lại (không tạo lại enum — destructive) → nợ kỹ thuật.
- **Test:** mọi test POS chuyển `n/a` / xoá; concurrency test chuyển thành web ↔ web; retest nhánh web của `hold_seats`, `cancel_showtimes`, `confirm_paid` sau khi task code chặn entry POS.
- **Intent docs** (`docs/BRD.md`, design doc, `.context/design-spec.md`): cập nhật bởi agent khác trong cùng change.

## Archive
- Spec trước thay đổi: `spec/archive/SPECIFICATIONS-1.1.0.md`
- Test-scope trước thay đổi: `spec/test-scope/archive/test-scope-1.1.0-2.json`

**Scope sinh:** `spec/test-scope/current.json` (specVersion 2.0.0, scopeVersion 3; specRefs 134 → 122, acceptance 26 → 22, module `pos` bỏ)
