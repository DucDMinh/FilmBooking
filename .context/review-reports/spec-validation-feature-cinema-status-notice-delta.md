# Spec Validation Report — CR cinema-status-notice (spec delta, chưa có code)

Agent: spec-validator
Round: 1
Change: `spec/changes/2026-11-18-cinema-status-notice.md` (status pending, CR-009 trong `spec/changes/BACKLOG.md`)
Spec: `SPECIFICATIONS.md` (header spec_version 3.3.0, chưa bump)
Entry mode: full_docs
Sources validated against: `SPECIFICATIONS.md`, `spec/changes/2026-11-18-cinema-status-notice.md`, `docs/BRD.md`, `docs/API_SPEC.md`, `docs/DESIGN.md`, `docs/ERD.md`, `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`, `spec/test-scope/current.json`

Giới hạn khi chạy: Bash bị `agent-guard` chặn (`cd` vào đường dẫn ngoài `.worktrees/`), nên không chạy được `git diff SPECIFICATIONS.md` và `graphify query`. Đã đối chiếu trực tiếp nội dung cuối của spec bằng Read/Grep (không dựa vào diff). Chưa có code nào để kiểm vì đây là pre-build.

## Verdict: FAIL

Finding count: CRITICAL 0 · HIGH 2 · MEDIUM 4 · LOW 7
Cộng thêm: ❌ Missing 2 (coverage #9, #14) · ⚠️ Partial/Ambiguous 3 (MEDIUM-2, MEDIUM-4, MEDIUM-5) trở lên. Theo `.agent/spec-validator.md`, FAIL vì có HIGH conflict và có Missing.

Residual risk (không tính là finding, xem RR-1): khách mua trong 7 ngày chờ.

---

## Feature Coverage Matrix (yêu cầu user / change doc → spec)

| # | Requirement | Source | Status | Note |
|---|---|---|---|---|
| 1 | Khách mở rạp đóng cửa → thông báo, không 404 | CR "Yêu cầu" + "Hợp đồng" (web) | Covered | `SPECIFICATIONS.md:127` R-137; `:394` AC-28 (G/W/T, trace R-137). Mã sai vẫn 404 đã ghi. |
| 2 | Mọi đổi trạng thái rạp (đóng/tạm đóng/mở/sắp khai trương) hiệu lực sau 7 ngày | CR "Yêu cầu" bullet 2 | Covered | `:126` R-136; `:393` AC-27. Đối với `COMING_SOON` xem MEDIUM-5. |
| 3 | Email toàn bộ khách (tài khoản email đã xác nhận) khi hẹn | CR "Yêu cầu" | Covered | R-136 "mọi tài khoản có email đã xác nhận"; AC-27 "mỗi email một dòng" |
| 4 | Hạn hoàn tiền = đúng 7 ngày báo trước; mail ghi hạn chót = ngày hiệu lực | CR checkpoint bullet 1 | Covered | R-136 "đúng 7 ngày sau lúc Admin xác nhận", R-134 "trong 7 ngày báo trước". Mốc giờ/timezone chưa rõ → LOW-2 |
| 5 | Đến ngày hiệu lực tự huỷ suất tương lai, đơn `paid` → `affected`, không email từng đơn | CR checkpoint bullet 3 | Partial | `:125` R-33; `:312` lifecycle; `:247` R-109 (exception); `:392` AC-26. Bị R-108 mâu thuẫn → HIGH-2 |
| 6 | Không chặn bán trong 7 ngày chờ | CR checkpoint bullet 4 | Covered (residual) | Quyết định PO. Spec không nêu rõ → RR-1 |
| 7 | Sửa thông tin rạp không bị ảnh hưởng | CR "Yêu cầu" bullet 2 | Covered | `:126` R-136 câu cuối |
| 8 | Bỏ điều kiện "phải huỷ hàng loạt trước khi đóng" | CR checkpoint bullet 3 | Partial | Đã bỏ ở R-33 (`:125`) và AC-26 (`:392`); còn ở R-108 (`:246`) và BRD → HIGH-1, HIGH-2 |
| 9 | Admin dialog giải thích 7 ngày; danh sách rạp hiện nhãn lịch | CR "Web" | Missing | Không có R/AC cho UI admin. Chỉ ở change doc → MEDIUM-3 |
| 10 | Hẹn lại = thay lịch cũ, tính lại 7 ngày, gửi lại email; hẹn trùng trạng thái bị từ chối | CR "Hợp đồng" | Covered | R-136; AC-27 (gộp nhiều case, xem LOW-7) |
| 11 | `PATCH /cinemas/:id` không đổi được `status`; PostgREST không update cột | CR "Hợp đồng" + acceptance | Partial | R-136 "không có đường nào đổi tức thì"; AC-27 chỉ nêu PATCH → LOW-3 |
| 12 | Banner trên rạp OPEN có lịch | CR "Web" + acceptance | Covered | `:127` R-137; `:394` AC-28 |
| 13 | Quyền: Manager không đổi trạng thái rạp | Spec §5.3 | Covered | `:465` ma trận: Manager chỉ "sửa thông tin rạp mình"; R-32 `:124`. R-136 không ghi role → LOW-4 |
| 14 | Job đến hạn, rạp mở lại: không huỷ suất | CR acceptance #4 | Missing | Không có R/AC nêu rõ "mở lại không huỷ suất" → MEDIUM-4 |
| 15 | Test huỷ suất + email hàng loạt, và lịch đổi trạng thái | Spec §NFR-17 | Partial | `:360` NFR-17 chưa liệt kê test cho lịch đổi/job/bỏ email → MEDIUM-4 |
| 16 | Đổi trạng thái sang `COMING_SOON` (sắp khai trương) | CR "Yêu cầu" bullet 2 + "Hợp đồng" (`:24`) | Ambiguous | Hợp đồng: mọi `status` khác `OPEN` huỷ suất; R-33/R-136 chỉ nói đóng/tạm đóng → MEDIUM-5 |

Trace `R-136`/`R-137` về BR: R-136 và R-137 cite "Yêu cầu PO 2026-11-18" (không có mã BR). Chấp nhận được vì là CR mới, nhưng BRD chưa có BR tương ứng → HIGH-1.

---

## Findings

### HIGH-1 — BRD (intent) còn quy tắc cũ, mâu thuẫn spec delta
- Vị trí: `docs/BRD.md:226` (BR-CHN-02: "bắt buộc chạy quy trình huỷ hàng loạt … trước khi đổi trạng thái rạp"); `docs/BRD.md:644` (AC-26 BRD: "yêu cầu chạy huỷ hàng loạt … trước khi cho đổi trạng thái"); `docs/BRD.md:413` (§7.3 "Rạp đóng cửa → Huỷ hàng loạt → email hàng loạt"); `docs/BRD.md:348` (BR-ADM-13 đóng cửa: "rạp sẽ liên hệ hoàn tiền thủ công", email từng đơn); `docs/BRD.md:654` (Q3).
- Mâu thuẫn với: `SPECIFICATIONS.md:125` R-33, `:247` R-109, `:392` AC-26, `:126` R-136.
- Vì sao HIGH: AGENTS.md cấm đổi intent doc ngoài CR + user duyệt. Spec đã đổi business rule mà BRD vẫn ghi quy tắc cũ, nên BR-CHN-02 → R-33 mới không truy vết được về BRD.
- Đề xuất: mở CR cập nhật `docs/BRD.md` (BR-CHN-02, BR-ADM-13 nhánh đóng cửa, §7.3, AC-26, Q3) theo yêu cầu PO 2026-11-18. Hoặc ghi rõ trong spec rằng BRD bị supersede ở các mục này và lý do. KHÔNG sửa BRD trong pha validate.

### HIGH-2 — R-108 vẫn cho huỷ hàng loạt "khi đóng cửa" không qua 7 ngày, kết hợp với ngoại lệ R-109 → bỏ qua thông báo
- Vị trí: `SPECIFICATIONS.md:246` R-108 "Chọn một / nhiều suất (hoặc **tất cả suất tương lai của một rạp** khi đóng cửa)"; `:247` R-109 "đóng cửa rạp: không gửi email từng đơn — khách đã nhận thông báo 7 ngày trước theo R-136".
- Mâu thuẫn với: R-136 `:126` (mọi đổi trạng thái có hiệu lực sau 7 ngày + email) và CR "Suất đã bán vé" (đóng cửa chỉ tự huỷ khi đến ngày hiệu lực).
- Kịch bản: Admin dùng R-108 "tất cả suất tương lai khi đóng cửa" ngay hôm nay → suất `cancelled`, đơn `paid` → `affected`, R-109 bỏ email từng đơn vì "khách đã nhận thông báo 7 ngày trước" → không ai được báo. Quy tắc 7 ngày bị vòng qua.
- Đề xuất: (a) bỏ nhánh "tất cả suất tương lai của một rạp khi đóng cửa" khỏi R-108, đóng cửa chỉ đi qua R-136 → job; hoặc (b) giới hạn nhánh đó: chỉ dùng từ job đến hạn, và R-109 chỉ bỏ email từng đơn khi suất bị huỷ có nguồn là lịch R-136. Cập nhật AC-24/AC-26 tương ứng.

### MEDIUM-2 — Không có cách rút/huỷ lịch đang chờ
- Vị trí: R-136 `:126` chỉ có "hẹn lại (thay lịch)" và "hẹn đúng trạng thái hiện tại bị từ chối"; AC-27 `:393` tương tự.
- Vấn đề: rạp OPEN đang có lịch CLOSED → không có thao tác để rút lịch (hẹn OPEN bị từ chối vì trùng trạng thái hiện tại). Email đã gửi tới toàn bộ khách không có đính chính.
- Đề xuất: thêm requirement "Huỷ lịch đang chờ" (kèm email đính chính), hoặc ghi rõ không cho phép và lý do; thêm AC tương ứng.

### MEDIUM-3 — Không có R/AC cho UI admin (dialog 7 ngày, nhãn lịch chờ)
- Vị trí: CR "Web" (`spec/changes/2026-11-18-cinema-status-notice.md:27`) có dialog và nhãn; spec không có R/AC nào.
- Đề xuất: thêm vào R-136 mệnh đề UI hoặc AC: dialog hiển thị ngày hiệu lực trước khi xác nhận; danh sách rạp có nhãn lịch chờ.

### MEDIUM-4 — NFR-17 và AC thiếu test cho luồng lịch đổi trạng thái
- Vị trí: `SPECIFICATIONS.md:360` NFR-17 (chỉ có "huỷ suất + email hàng loạt"); AC-26/27/28 chưa phủ: rạp mở lại đến hạn không huỷ suất (CR acceptance #4); job đến hạn đổi `status` và xoá lịch (chỉ AC-26 đóng cửa).
- Đề xuất: bổ sung NFR-17: "test lịch đổi trạng thái rạp: áp dụng đúng hạn 7 ngày, job xoá lịch, mở lại không huỷ suất, không gửi email từng đơn khi đóng cửa". Thêm AC cho mở lại không huỷ suất.

### MEDIUM-5 — Chuyển sang `COMING_SOON` lệch giữa hợp đồng CR và spec
- Vị trí: CR `spec/changes/2026-11-18-cinema-status-notice.md:24` (job: mọi trạng thái mới khác `OPEN`, kể cả `COMING_SOON`, huỷ suất tương lai); `SPECIFICATIONS.md:125` R-33 (chỉ Tạm đóng / Ngừng hoạt động); `:126` R-136 (chỉ đóng/tạm đóng → R-33); template email có "sắp khai trương" nhưng không có quy định huỷ suất.
- Vấn đề: chưa rõ (a) OPEN → COMING_SOON có được phép không; (b) có huỷ suất đã bán không; (c) email nội dung nào áp dụng.
- Đề xuất: PO chốt một trong hai: giới hạn chỉ đóng/tạm đóng/mở lại (bỏ `COMING_SOON` khỏi lịch đổi); hoặc ghi rõ hành vi huỷ suất và nội dung email cho `COMING_SOON`.

### LOW-1 — Bookkeeping spec chưa cập nhật
- `SPECIFICATIONS.md:2` spec_version 3.3.0, `:4` nguồn chưa có CR cinema-status-notice; `:522` đếm "135 mã R (R-01…R-135)" và "22/22 AC" đã lỗi thời (R-136, R-137, AC-27, AC-28 mới). Bảng traceability `:520` chưa có dòng cho CR này.
- Đề xuất: spec-publisher bump khi publish; cập nhật đếm và bảng nguồn.

### LOW-2 — Mốc thời gian của "7 ngày" chưa rõ
- Vị trí: R-136 `:126` "đúng 7 ngày"; CR `:14`, `:31`. Change doc dùng `scheduled_effective_at = lúc hẹn + 7×24h`. Email chỉ ghi "ngày hiệu lực".
- Đề xuất: ghi rõ mốc 7×24h và timezone hiển thị (Asia/Ho_Chi_Minh) trong R-136; mail hiển thị ngày và giờ.

### LOW-3 — Ràng buộc PostgREST/RLS chưa là AC
- Vị trí: CR acceptance #3 có "Manager/Admin qua PostgREST không update được cột status"; spec AC-27 `:393` không nêu.
- Đề xuất: thêm vào AC-27 hoặc NFR-17.

### LOW-4 — Vai trò hẹn lịch chưa ghi tường minh trong R-136
- Vị trí: R-136 `:126` không nêu "Admin"; ma trận `:465` đã giới hạn (Manager không đổi status). Hợp đồng CR: `schedule_cinema_status` Admin/service_role.
- Đề xuất: thêm "(chỉ Admin)" vào R-136.

### LOW-5 — Vòng đời đơn chưa phản ánh lịch
- Vị trí: `SPECIFICATIONS.md:312` (`paid → affected`, "Rạp huỷ suất / đóng cửa", R-108, R-33); bảng vòng đời không có dòng `holding`/`pending_payment → cancelled` khi suất bị huỷ bởi đóng cửa (chỉ có ở Điểm cần xác nhận #9/#10/#17 và quyết định brainstorm `:560`).
- Đề xuất: thêm R-136 vào cột R của `:312`; ghi "đến ngày hiệu lực (R-136)" ở trigger.

### LOW-6 — "Sắp khai trương" và danh sách rạp
- R-33 `:125` nói rạp Tạm đóng/Ngừng không hiện trong danh sách; "Sắp khai trương" không nêu. R-137 chỉ nói trang chi tiết. Ambiguous.
- Đề xuất: nêu rõ danh sách rạp (`GET /cinemas`) chỉ hiện OPEN (đúng như CR) và "Sắp khai trương" không hiện trong danh sách.

### LOW-7 — AC-27 gộp nhiều trường hợp trong một G/W/T
- Vị trí: `SPECIFICATIONS.md:393` AC-27 gộp: email xếp hàng, PATCH bị từ chối, hẹn trùng trạng thái bị từ chối, hẹn lại thay lịch cũ.
- Đề xuất: tách thành AC riêng, mỗi case có Given riêng (ví dụ "Given rạp đang có lịch").

---

## Residual risk (RR)

RR-1 — Khách mua vé trong 7 ngày chờ: suất sau ngày hiệu lực vẫn bán được (quyết định PO "không chặn", CR `:39`). Người mua sau email toàn bộ khách sẽ thành `affected` mà không nhận email nào (R-109 loại trừ email từng đơn khi đóng cửa). Đây là rủi ro đã được PO chấp nhận, không tính là finding. Nếu muốn giảm rủi ro, PO có thể chọn: (b) cảnh báo ở bước thanh toán (R-133/R-137) rằng rạp đóng cửa từ ngày X; hoặc (c) ghi rõ trong spec rằng nhóm này chỉ được ghi nhận `affected`, không hoàn tiền tự động.

---

## Tài liệu as-built / test / gap register cần reconcile khi build (chỉ liệt kê, không sửa)

- `docs/API_SPEC.md:192` — `PATCH /admin/cinemas/:cinemaId/status` mô tả "Đóng/mở rạp (RPC set_cinema_status)". Đổi khi build (hẹn lịch).
- `docs/DESIGN.md:50` — "Đóng/mở rạp: chỉ Admin (`set_cinema_status`)".
- `docs/ERD.md:73` (liệt kê `set_cinema_status`), `:81` (policy showtimes_select theo rạp OPEN, vẫn đúng), `:92` (set_cinema_status chỉ Admin) — cần thêm cột scheduled_*, RPC mới, bỏ RPC cũ.
- `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md:27` — GAP-021 gắn R-33, AC-26; cập nhật khi AC-26 đổi.
- `spec/test-scope/current.json:448` (scope v22 "huỷ suất / chuyển rạp Tạm đóng → email…") và `:502` (AC-26 cũ "yêu cầu huỷ hàng loạt trước khi cho đổi") — stale; spec-publisher sinh lại khi publish.
- `docs/BRD.md` — xem HIGH-1.

---

## Gap chưa phủ (tóm tắt)

1. Đóng cửa vòng qua R-108 không qua 7 ngày (HIGH-2).
2. BRD intent chưa cập nhật (HIGH-1).
3. Huỷ/rút lịch đang chờ (MEDIUM-2).
4. UI dialog và nhãn lịch chờ không có R/AC (MEDIUM-3, coverage #9 Missing).
5. Test NFR-17 cho lịch đổi trạng thái; AC mở lại không huỷ suất (MEDIUM-4, coverage #14 Missing).
6. Hành vi `COMING_SOON` (MEDIUM-5).

## Verdict Reasoning

FAIL theo `.agent/spec-validator.md` Decision Flow:
- Có 2 HIGH conflict (HIGH-1, HIGH-2).
- Có 2 ❌ Missing (coverage #9, #14).
- Có 3 mục Partial/Ambiguous trở lên (MEDIUM-2, MEDIUM-4, MEDIUM-5).

Các yêu cầu lõi của PO (404 → thông báo, mọi đổi trạng thái hiệu lực sau 7 ngày + email toàn bộ khách, hạn hoàn tiền = 7 ngày, tự huỷ suất khi đến hạn không email từng đơn) đã được phủ trong spec. Lỗi nằm ở mâu thuẫn nội bộ (R-108), intent doc chưa đồng bộ (BRD), và các trường hợp biên chưa chốt.

Next: sửa spec delta (HIGH-2, MEDIUM-2/5 cần PO quyết), mở CR cập nhật BRD (HIGH-1), rồi chạy validate round tiếp theo (round 2). Không gộp vòng vào file này.
