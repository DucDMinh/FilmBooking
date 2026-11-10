# Spec Update — 2026-11-10 initial-spec-from-brd

**spec_version:** — → 1.0.0 (initial)
**Nguồn:** `docs/BRD.md` v0.3 (2026-11-10, trạng thái Chờ duyệt) — dự án **greenfield**, repo chưa có app code. Nhãn: `[derived from BRD]` (không phải reverse-engineered from code).
**Traceability:** mã BRD (`BR-<MODULE>-NN`, `AC-NN`, `NFR-NN`, `§mục`) thay cho `file:line`.

**Phạm vi:**
- BRD §4.1 (in-scope, 14 mục) + §6 (14 module, 140 mã BR) + §7 (chính sách không huỷ – không hoàn) + §8.5 (vòng đời đơn) + §9 (NFR-01…NFR-18) + §13 (AC-01…AC-26) + §10 (tech stack) + §5.3 (ma trận phân quyền).
- Ngoài phạm vi (không thành R-xx): BRD §4.2 và Giai đoạn 3 (§15).

**Requirements:**
- THÊM: R-01…R-134 (134 requirement), nhóm 15 module: AUTH (R-01…R-17), SOCIAL (R-18…R-25), PROFILE (R-26…R-31), CHAIN (R-32…R-39), MOVIE (R-40…R-46), CINEMA (R-47…R-58), BOOKING (R-59…R-72), PAYMENT (R-73…R-84), TICKET (R-85…R-89), PROMO (R-90…R-96), CHECKIN (R-97…R-102), ADMIN (R-103…R-111), REPORT (R-112…R-119), POS (R-120…R-130), POLICY §7 (R-131…R-134).
- Phase: **121 MVP** (10 gắn `[cần xác nhận]`: R-28, R-82, R-90, R-92, R-93, R-94, R-95, R-112, R-113, R-116) · **13 GĐ2** (R-36, R-58, R-69, R-88, R-89, R-91, R-96, R-100, R-114, R-115, R-117, R-118, R-119 — R-119 gắn `[cần xác nhận]`).
- Độ phủ: **140/140** mã BR, **18/18** NFR, **26/26** AC (đã kiểm bằng script grep so BRD ↔ SPECIFICATIONS.md).
- SỬA / XOÁ: không (bản đầu).

**Điểm cần xác nhận** (chi tiết: `SPECIFICATIONS.md` § Điểm cần xác nhận):
1. Phase voucher lõi (R-90, R-92…R-95) + R-82 (đơn 0đ) + R-28 (avatar, mức C) — §15 không nêu tường minh.
2. Báo cáo nào thuộc MVP (R-112, R-113, R-116 tạm MVP `[cần xác nhận]`; còn lại GĐ2; "đối soát" ở §15 MVP có thể chỉ là job BR-PAY-09).
3. AC-25 (MVP) tham chiếu "báo cáo suất bị huỷ" thuộc BR-RPT-09 (GĐ2).
4. Xuất CSV: BR-ADM-14 (MVP) vs "xuất CSV" ở GĐ2.
5. AC-18 kiểm tra voucher theo rạp (GĐ2).
6. §5.3 Staff tra cứu đơn "chỉ đọc" vs BR-ADM-14 Staff ghi nhận kết quả đơn bị ảnh hưởng.
7. POS giả lập (BR-POS-10) xác thực bằng khoá API hay phiên Staff; §5.3 Staff ❌ giữ ghế.
8. Vòng đời đơn kênh POS không có trong §8.5 (affected / email hàng loạt / báo cáo hoàn).
9. Tạo đơn mới khi đơn cũ đang `pending_payment` (BR-BKG-06 vs §8.5).
10. Tiền về sau khi đơn `cancelled` — chưa có luồng.
11. "Giờ kết thúc phim" khi check-in (BR-CHK-03) có gồm thời gian dọn phòng (BR-CIN-03) không.
12. Thời gian giữ ghế 10 phút cố định (BR-BKG-03) vs cấu hình được (BR-ADM-10).
13. Định nghĩa tab "Sắp chiếu" (BR-MOV-01).
14. BR-AUTH-10 (tự xoá sau 7 ngày) có áp cho tài khoản Facebook chưa xác nhận email bổ sung (BR-SOC-04).
15. Thứ tự mã rủi ro §12 (R13, R14 đứng trước R11, R12); spec gọi rủi ro BRD là `BRD-R1…R14`.
16. `[chốt ở brainstorm]`: hosting, bản đồ, công cụ giám sát.

**Ảnh hưởng:** chưa có code — toàn bộ 15 module là phạm vi build mới; test luồng: toàn bộ (ưu tiên NFR-17: giữ ghế đồng thời web ↔ POS, webhook PayOS, auth/liên kết, phân quyền theo rạp, huỷ suất + email hàng loạt).
**Scope sinh:** `spec/test-scope/current.json` (specVersion 1.0.0, scopeVersion 1, trigger `initial-build`, risk `high`).
