Agent: spec-validator

# Spec Validation — FilmBooking (pre-plan) — Round 2 (vòng hẹp)

- **Chế độ:** Spec validation, vòng hẹp — chỉ kiểm phần bổ sung sau round 1 (mục #17, #18, #19 + khối "Ghi chú tham chiếu chéo" trong § Điểm cần xác nhận, `SPECIFICATIONS.md` L538-542).
- **Nguồn:** `docs/BRD.md` v0.3 (intent), `SPECIFICATIONS.md`, report round 1 (`start-filmbooking-spec-round-1-review.md`).
- **Tiêu chí:** giữ nguyên round 1 (⚠️ = mơ hồ vùng rủi ro cao, ảnh hưởng tiền/bảo mật/state machine/giá, chưa được ghi nhận và chưa R-xx nào giải quyết; ℹ️ = đã có R-xx giải quyết / thiết kế / chi tiết nhỏ). FAIL: ≥1 ❌, HIGH conflict, ≥3 ⚠️.
- **Phạm vi:** không làm lại toàn bộ; không đưa finding mới trừ lỗi do phần bổ sung gây ra.

## 1. Verdict

# ✅ PASS — 0 ❌, 0 HIGH, **1 ⚠️** (< 3) — W-1, W-2, W-3 đã được ghi nhận đầy đủ và chính xác

Ba gap của round 1 đã đóng. Phần bổ sung không làm thay đổi hành vi của bất kỳ R-xx nào (các R-17, R-19, R-20, R-52, R-72, R-78, R-108, R-125, R-127 giữ nguyên văn). Có **1 lỗi diễn đạt do chính phần bổ sung gây ra** (F-1, ghi chú tham chiếu chéo về R-127) — dưới ngưỡng FAIL nhưng nên sửa câu chữ trước khi publish/graph (xem §4).

## 2. Xác nhận W-1 / W-2 / W-3 so với BRD

| Gap R1 | Mục spec | Nguồn BRD đối chiếu | Đánh giá |
|---|---|---|---|
| W-1 — đơn `holding`/`pending_payment` khi huỷ suất; tiền về cho suất không còn bán | **#17** (SPECIFICATIONS.md L538) | BR-ADM-12 (BRD L344): chỉ nêu "ghế đang giữ bị nhả" + đơn `paid` → `affected`, không nói số phận đơn `holding`/`pending_payment`; BR-PAY-07 (L289): "ghế vẫn còn trống → tự động chốt bán"; §8.5 (L505-506): `expired → paid` / `needs_manual_review` chỉ xét ghế còn trống/đã bán, không xét trạng thái suất | ✅ Đủ: nêu đúng 2 nửa của W-1 (số phận đơn đang giữ/chờ thanh toán; payment link còn hiệu lực; R-78 áp nguyên văn sẽ bán vé cho suất đã huỷ/đã đóng bán/đã kết thúc), gộp với #9/#10, cite đúng BR-PAY-07, BR-ADM-12, §8.5. Đề xuất hướng giải quyết trình bày dạng câu hỏi ("→ `needs_manual_review`?") nên không áp đặt hành vi. |
| W-2 — Facebook không email + email nhập trùng | **#18** (L539) | BR-SOC-04 (L197), §8.2 (L446-450: mũi tên `F --> H` bỏ qua nhánh kiểm trùng `G`), BR-AUTH-01 (L171, email duy nhất), BR-AUTH-12 (L182, không lộ tồn tại email), BR-SOC-05 (L198) | ✅ Đủ và chính xác: nêu đúng mâu thuẫn §8.2 F→H với BR-AUTH-01/BR-AUTH-12, 2 phương án (chặn + liên kết như R-20 / thông báo chung), cite R-19, R-20. Không đổi R-19/R-20. |
| W-3 — quy tắc giá chi tiết BR-CIN-05 | **#19** (L540) | BR-CIN-05 (L251), BR-CIN-02 (L248, "Đôi (Sweetbox — chiếm 2 ô, bán theo cặp)"; thuật ngữ L691), BR-CIN-06 (L252), BR-BKG-07 (L270) | ✅ Đủ 4 điểm của W-3: (a) ghế Sweetbox theo ghế/cặp, (b) mốc 17h + biên 17:00, (c) định nghĩa "cuối tuần", (d) ngày lễ trùng cuối tuần. "Sweetbox" là thuật ngữ BRD (L248, L691) = ghế Đôi của round 1, không phải khái niệm mới. Cite R-72, AC-15 đúng. |

## 3. Kiểm tra phần bổ sung: không thêm hành vi vào R-xx, không mâu thuẫn

| Hạng mục bổ sung | Đối chiếu | Kết quả |
|---|---|---|
| #17-#19 là câu hỏi mở trong § "Điểm cần xác nhận" (blockquote L520: "Chỉ ghi nhận — spec-init không tự quyết") | R-19, R-20, R-52, R-72, R-78, R-108 (L99-100, L152, L179, L190, L242) giữ nguyên văn | ✅ Không đổi hành vi R-xx. Chưa có `[cần xác nhận]` mới gắn vào R-xx; không bắt buộc (W-1..W-3 không đổi phase tag) → không ảnh hưởng tổng 121 MVP / 13 GĐ2 / 10+1 tag. |
| Ghi chú: "R-17 bị giới hạn bởi R-105 (Manager chỉ thêm/bớt Staff rạp mình, không nâng quyền khác)" | R-105 (L239) "Cinema Manager chỉ thêm/bớt Staff cho rạp mình, không gán vai trò khác"; BRD BR-ADM-09 (L341) | ✅ Khớp nguyên văn R-105/BR-ADM-09. |
| Ghi chú: "R-125 chịu ràng buộc R-128/R-122/R-123 (chỉ xác nhận bán ghế đang được POS giữ hợp lệ)" | R-122, R-123, R-128 (L270-271, L276); BRD BR-POS-03/04/09 | ✅ Là hệ quả trực tiếp của 3 R đã có, không thêm hành vi. |
| Ghi chú: "Combo và 'rạp gần nhất' là GĐ2 → N/A ở MVP" | §15 (BRD L667); R-58/R-69/R-100/R-36 tag GĐ2 | ✅ Khớp phase tag. |
| Ghi chú: "Script seed 5 rạp (NFR-09) không có R riêng → graph phải lập task riêng" | NFR-09 (BRD L532), §15 (L666), §11.2 (L585) | ✅ Khớp, chỉ là lưu ý lập kế hoạch. |
| Ghi chú: "`current.json` liệt kê cả R GĐ2 → spec-publisher cắt cuối layer cuối" | `.agent/spec-publish.md` (theo round 1 N-16) | ✅ Khớp quy trình. |
| Ghi chú: "'ngừng bán' ở R-127 bao gồm mốc đóng bán online R-67 và đóng bán suất R-54" | R-67 (L174), R-54 (L154), R-127 (L275), BRD L272/L376 | ⚠️ **F-1** — xem dưới. |

## 4. Finding do phần bổ sung gây ra

### ⚠️ F-1 [MED] — Ghi chú tham chiếu chéo R-127 trộn "Ngừng bán online" (R-67) với "ngừng bán" của POS (R-127)
- Vị trí: `SPECIFICATIONS.md` L542, mệnh đề *""ngừng bán" ở R-127 bao gồm mốc đóng bán online R-67 và đóng bán suất R-54"*.
- Mâu thuẫn: R-67 / BR-BKG-09 (BRD L272) nói rõ sau mốc 15' suất hiển thị **"Ngừng bán online — vui lòng mua tại quầy"**, tức kênh quầy/POS vẫn bán. R-127 / BR-POS-08 (BRD L376) chỉ từ chối "suất bị huỷ / ngừng bán". Round 1 (N-10) chỉ đề xuất tham chiếu chéo R-127↔R-67↔R-54 kèm **lưu ý phải phân biệt** hai khái niệm; câu ghi chú hiện tại bỏ lưu ý đó và, đọc literal, buộc POS từ chối bán sau mốc 15' trước giờ chiếu — ngược với R-67 và với luồng "mua tại quầy".
- Phân loại: lỗi diễn đạt do phần bổ sung gây ra (đúng điều kiện "không đưa finding mới trừ lỗi do phần bổ sung"). Đếm **1 ⚠️** (< 3) → không FAIL. Mức rủi ro: builder/graph đọc ghi chú có thể chặn POS sau cutoff online → ảnh hưởng doanh thu quầy, nhưng R-67 ("mua tại quầy") và R-54 (đóng bán suất chủ động) vẫn đúng và nằm cùng spec nên không phải HIGH conflict.
- Đề nghị sửa (qua change-request/spec-publisher, validator không sửa): đổi mệnh đề thành đại ý *"'ngừng bán' ở R-127 chỉ gồm suất `cancelled` (R-108) và suất bị Manager đóng bán (R-54); mốc 'Ngừng bán online' của R-67 chỉ chặn web, **không** chặn POS (quầy vẫn bán)."* Nếu thực tế muốn POS cũng bị chặn sau cutoff thì đây là điểm cần user chốt và phải thêm vào § Điểm cần xác nhận, không để trong ghi chú.

### ℹ️ (không tính ngưỡng)
- I-1 (LOW): #17 dùng từ "còn `scheduled`" — trạng thái suất này không được định nghĩa trong BRD/spec (chỉ có `cancelled`, R-108). Nằm trong câu hỏi mở đề xuất hướng, không phải R-xx; chốt tên trạng thái ở thiết kế/brainstorm.
- I-2 (LOW): Footer `Validated by: .agent/spec-validator.md (chờ chạy)` (L546) cần cập nhật thành PASS round 2 bởi primary/spec-publisher sau khi sửa F-1.

## 5. Ma trận coverage cho phạm vi vòng 2

| Requirement / gap | Source | Status | Note |
|---|---|---|---|
| W-1 (huỷ suất ↔ đơn holding/pending; tiền về cho suất không bán) | BRD L289, L344, §8.5 L505-506 → SPEC #17 | ✅ CLOSED | Câu hỏi mở, gộp #9/#10 |
| W-2 (Facebook không email + email trùng) | BRD L171, L182, L197-198, §8.2 L446-450 → SPEC #18 | ✅ CLOSED | Câu hỏi mở, liên quan R-19/R-20 |
| W-3 (quy tắc giá BR-CIN-05) | BRD L248, L251-252, L270 → SPEC #19 | ✅ CLOSED | 4 điểm đủ |
| Ref chéo R-17→R-105 | BRD L341 → SPEC L542 | ✅ | Khớp R-105 |
| Ref chéo R-125→R-128/R-122/R-123 | BRD POS-03/04/09 → SPEC L542 | ✅ | |
| Ref chéo R-127→R-67/R-54 | BRD L272, L376 → SPEC L542 | ⚠️ PARTIAL (F-1) | Cần phân biệt web vs POS |
| Combo/"gần nhất" N/A MVP; seed 5 rạp; test-scope trim | BRD L666-667, NFR-09 → SPEC L542 | ✅ | |
| R-xx không bị đổi hành vi | R-19/20/52/72/78/108/125/127 | ✅ | Giữ nguyên văn |

## 6. Gap list trả cho spec owner

1. [PARTIAL — nên sửa trước khi publish/graph, không chặn verdict] F-1: sửa mệnh đề R-127 trong "Ghi chú tham chiếu chéo" (SPECIFICATIONS.md L542) để không nhập "Ngừng bán online" (web-only, R-67) vào "ngừng bán" của POS (R-127).
2. [Housekeeping] Cập nhật footer `Validated by` (I-2).

Open questions cần user chốt ở brainstorm vẫn như round 1 §6 (ưu tiên: #6+#7, #9+#10+#17, #8, #18, #19, #3...) — brainstorm đứng trước graph nên không chặn chia layer về mặt thứ tự.

## 7. Residual risk
- Không có code → chỉ cross-check spec ≈ BRD. Ranh giới ⚠️/ℹ️ của F-1 là phán đoán theo tiêu chí round 1: nếu coi F-1 là ℹ️ (vì R-67 đã giải quyết), tổng ⚠️ = 0; nếu coi ⚠️, tổng = 1. Cả hai đều < 3 nên verdict PASS không đổi.
