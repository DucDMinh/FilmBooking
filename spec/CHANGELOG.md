# Spec Changelog

> Mỗi lần đổi `SPECIFICATIONS.md` → thêm 1 dòng. Version scheme: `docs/SPEC_VERSIONING.md`.

| Version | Ngày | Loại | Thay đổi | Scope sinh |
|---|---|---|---|---|
| 1.0.0 | 2026-11-10 | initial | Spec khởi tạo từ docs/BRD.md v0.3 (greenfield, chưa có code) | scopeVersion 1 |
| 1.1.0 | 2026-11-10 | MINOR | Quyết định brainstorm cho điểm cần xác nhận #1–#19 + đổi kiến trúc Next.js + NestJS + Supabase (BRD §10 đã cập nhật v0.4) | scopeVersion 2 |
| 2.0.0 | 2026-11-12 | MAJOR | Bỏ toàn bộ POS (quyết định PO, chỉ làm thuần web): REMOVED R-111, R-120→R-130, AC-20→AC-23; sửa wording chỉ-web ở R-55, R-59, R-107, R-108, R-119, NFR-02/03/04/17, AC-24 + overview/kiến trúc/dữ liệu/quyết định #3/#7/#8. Delta: `spec/updates/2026-11-12-remove-pos.md` | scopeVersion 3 |
| 3.0.0 | 2026-11-12 | MAJOR | Bỏ lựa chọn đổi suất khi rạp huỷ suất (quyết định PO): khách liên hệ CSKH (hotline rạp, mặc định tổng đài giả lập `1900 0000`), kết quả xử lý duy nhất là hoàn tiền thủ công (`refunded_manual`); MODIFIED R-109, R-110, R-119, R-134, AC-24; bỏ chuyển trạng thái `affected → exchanged` và trạng thái cuối `exchanged`; chốt điểm mở #20, #21. Delta: `spec/updates/2026-11-12-remove-showtime-exchange.md` | scopeVersion 4 |
| 3.1.0 | 2026-11-16 | MINOR | Thêm R-135: nhân sự điều hướng theo vai trò sau đăng nhập (Admin/Manager → `/admin`, Staff → `/staff/chon-rap`), bị chuyển khỏi trang khách (trừ `/tai-khoan/*`), có nút Đăng xuất ở `/admin` và `/staff`; kèm bug-fix nới validate ID `z.uuid()` → `z.guid()` (không đổi requirement). Delta: `spec/updates/2026-11-16-admin-ux.md` | scopeVersion 17 |
