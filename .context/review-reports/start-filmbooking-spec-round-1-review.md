Agent: spec-validator

# Spec Validation — FilmBooking (pre-plan) — Round 1

- **Chế độ:** Spec validation (trước khi chia layer/task) — greenfield, chỉ cross-check **spec vs BRD** (không có code).
- **Nguồn đối chiếu:** `docs/BRD.md` v0.3 (intent) ↔ `SPECIFICATIONS.md` v1.0.0 (R-01..R-134) ↔ `spec/test-scope/current.json` ↔ `spec/updates/2026-11-10-initial-spec-from-brd.md`.
- **Phương pháp:** đã đọc toàn bộ BRD (693 dòng) và toàn bộ SPECIFICATIONS.md. Không lặp lại phép diff mã (script đã xác nhận 184/184 mã BR/AC/NFR, 134 specRefs, 26 acceptance). Tập trung ngữ nghĩa: con số/ngưỡng/trạng thái, phân quyền, phase tag, mâu thuẫn nội bộ, edge case.
- **Ghi chú phạm vi:** `docs/DESIGN.md`, `API_SPEC.md`, `ERD.md`, `PERMISSION.md`, `.context/project-config.md` là template chưa điền — không tính là gap.

## 1. Verdict

# ❌ FAIL — 0 ❌ blocker fidelity, 0 HIGH conflict, **3 ⚠️** (đạt ngưỡng FAIL ≥3)

Spec có độ trung thực cao với BRD (không R-xx nào sai số/ngưỡng/trạng thái, không R-xx nào làm yếu quy tắc BRD, không hành vi bịa). FAIL ở đây là do **đếm ⚠️ = 3** theo tiêu chí dưới đây, và cách sửa **rẻ**: thêm 3 mục vào § Điểm cần xác nhận (+ vài ghi chú tham chiếu chéo) rồi chạy round 2.

**Tiêu chí phân loại (áp dụng nhất quán cho mọi finding):**
- **⚠️** = điểm mơ hồ/thiếu **nằm trong vùng rủi ro cao mà caller đã nêu** (giữ ghế / PayOS / POS / phân quyền-RLS / huỷ suất / auth / bảng giá / check-in), **ảnh hưởng tiền – bảo mật – state machine – giá**, **chưa nằm trong § Điểm cần xác nhận** và **không R-xx nào khác đã giải quyết**. Mỗi ⚠️ đếm riêng, không gộp.
- **ℹ️** = (a) đã được R-xx khác giải quyết (ghi tham chiếu chéo), hoặc (b) vấn đề thiết kế/khả thi không phải lỗi spec, hoặc (c) chi tiết ít ảnh hưởng.
- Điểm mơ hồ **nằm sẵn trong BRD và spec đã ghi đúng** vào § Điểm cần xác nhận → "open question cho user", không tính lỗi spec.

**Cách sửa tối thiểu để PASS ở round 2:** thêm 3 mục (W-1, W-2, W-3 bên dưới) vào § Điểm cần xác nhận của `SPECIFICATIONS.md` (qua change-request + spec-publisher; validator không sửa), hoặc user chốt chúng ở brainstorm rồi spec ghi quyết định.

**Về việc có chặn không:** theo `/start`, bước 2 **brainstorm** đứng **trước** bước 4 **graph**. Toàn bộ câu hỏi ở §6 được giải quyết ở brainstorm (đã nằm trước graph) nên **không chặn chia layer** về mặt thứ tự; verdict FAIL chỉ yêu cầu spec ghi nhận đầy đủ các điểm mở (và user chốt các điểm #3/#6/#7/#9/#10 + W-1..W-3) trước khi graph khoá schema/RLS/POS.

## 2. Ma trận coverage theo module

Chú giải: ✅ khớp BRD · ✅* khớp, kèm ℹ️ · ⚠️ có finding W-x.

| Module | R range | Nguồn BRD (dòng) | Status | Ghi chú |
|---|---|---|---|---|
| AUTH | R-01..R-17 | BR-AUTH-01..18 (L171-188), §8.1 (L421-435) | ✅* | Mọi ngưỡng khớp: 8/72 ký tự (L172), link 24h (L174), 60s & 5/giờ (L176), 3 lần→CAPTCHA (L177), 5 acct/IP/giờ & 10 lần/IP/phút (L178), 5 lần sai→khoá 15' (L181), reset 1h (L183), 30 ngày (L186), tự xoá 7 ngày (L180). R-15 gộp AUTH-15+16 (cùng S) hợp lý. R-17 ↔ R-105: ℹ️ N-4. |
| SOCIAL | R-18..R-25 | BR-SOC-01..12 (L194-205), §8.2 (L439-451) | ⚠️ W-2 | Không tự gộp (R-20 ↔ L198), không huỷ liên kết cuối (R-21 ↔ L200), 1 MXH ↔ 1 user (R-23 ↔ L202) giữ đúng. Nhánh Facebook không email: W-2. |
| PROFILE | R-26..R-31 | BR-PRO-01..06 (L211-216) | ✅ | R-29 giữ đúng: cảnh báo → xác nhận lại → ẩn danh hoá, giữ đơn ẩn danh (L214). R-28 (C) tag MVP `[cần xác nhận]` (#1). |
| CHAIN | R-32..R-39 | BR-CHN-01..08 (L222-229), AC-26 | ✅ | R-33 giữ "bắt buộc huỷ hàng loạt trước khi đổi trạng thái" (L223). R-36 GĐ2 khớp §15 (L667). R-39 giữ nguyên tắc RLS + server (L159). |
| MOVIE | R-40..R-46 | BR-MOV-01..07 (L235-241) | ✅* | "Đang chiếu" (L235) đúng; "Sắp chiếu" không định nghĩa (#13). R-44 nhắc "gần nhất" phụ thuộc R-36 GĐ2 (ℹ️ N-14). |
| CINEMA | R-47..R-58 | BR-CIN-01..10 (L247-256), BR-ADM-03/04/05/06 | ⚠️ W-3 | R-52 giữ chuỗi ưu tiên suất › rạp › chuỗi và 4 chiều giá (L251), AC-15 khớp; R-49 15' (L249); R-54 (L253); R-58 GĐ2 khớp. Quy tắc giá chi tiết chưa chốt: W-3. |
| BOOKING | R-59..R-72 | BR-BKG-01..14 (L264-277), §7.2 | ✅* | 10' (L266), atomic + unique DB (L267), 1 đơn giữ/khách toàn chuỗi (L269), ≤8 ghế & ghế đôi=2 (L270), cutoff 15' (L272), chốt giá (L277), checkbox + bằng chứng (L276) khớp. R-69 GĐ2 (combo). ℹ️ N-11. |
| PAYMENT | R-73..R-84 | BR-PAY-01..13 (L283-295), §7.3, §8.5 | ⚠️ W-1 | Webhook chỉ tin chữ ký/truy vấn server, sai chữ ký bỏ qua+log (L285); idempotent+khớp số tiền (L286); email vé ≤1' (L287); tiền muộn 2 nhánh (L289); đối soát ~5' (L291) khớp. Edge huỷ suất ↔ thanh toán: W-1. |
| TICKET | R-85..R-89 | BR-TKT-01..05 (L301-305) | ✅ | R-88/R-89 (C) GĐ2 khớp §15. R-86 đủ 4 lưu ý (L302). |
| PROMO | R-90..R-96 | BR-PRM-01..06 (L311-316), §5.3, Q8 | ✅* | Tách BR-PRM-01 thành lõi MVP + phạm vi rạp GĐ2 là phán đoán đã ghi #1/#5. Chỉ Admin tạo voucher (L154, L655). 10 lần/phút (L315). |
| CHECKIN | R-97..R-102 | BR-CHK-01..06 (L322-327), AC-12/13 | ✅* | Cửa sổ −30' → hết phim (L324), "Sai rạp" chỉ lộ tên+địa chỉ rạp (L327) giữ đúng. R-100 GĐ2 theo combo. #11 đã ghi. ℹ️ N-13. |
| ADMIN | R-103..R-111 | BR-ADM-07..15 (L339-347), §7.3 | ✅* | R-108 đủ 5 hệ quả huỷ suất (L344); R-110 giữ trường bắt buộc khi hoàn tiền (L346, AC-25); R-111 "xem lần đầu" (L347). #6 đã ghi. |
| REPORT | R-112..R-119 | BR-RPT-01..09 (L353-361) | ✅* | Tách MVP (RPT-01/02/06) vs GĐ2 là phán đoán đã ghi #2/#3. Phần "tách combo" ở R-112 vacuous ở MVP (ℹ️ N-14). |
| POS | R-120..R-130 | BR-POS-01..11 (L369-379), AC-20..23 | ✅* | 5' hold + gia hạn (L373), cùng cơ chế atomic (L372), requestId (L375), không offline (L377), 403 khác rạp (AC-23) giữ đúng. ℹ️ N-2, N-9, N-10. |
| POLICY | R-131..R-134 | §7.1-7.3 (L385-413) | ✅ | Giữ "không có luồng hoàn tiền tự động / không gọi API hoàn PayOS" (L389, L413). Ghi chú gán `M` minh bạch. |
| NFR | NFR-01..18 | §9 (L522-541) | ✅* | Mọi ngưỡng khớp (LCP ≤2,5s, p95 500ms/1s, ≥100 CCU, ≥20 hold/s, ≤2s realtime, ≥95% mail, ≥360px, WCAG AA, ~5 rạp × 3–5 phòng). ℹ️ N-6, N-8. |
| AC | AC-01..AC-26 | §13 (L611-640) | ✅* | 26/26 giữ nội dung. AC-18 (GĐ2) & AC-25 (phụ thuộc BR-RPT-09 GĐ2) đã ghi #3/#5. |
| Out-of-scope | — | §4.2 (L99-110), §15 GĐ3 (L668) | ✅ | 11 mục §4.2 + GĐ3 (tích điểm, đa ngôn ngữ, đánh giá phim, PWA) nằm đúng § Ngoài phạm vi, **không** lọt vào R-xx (không R-xx nào về hoá đơn VAT, phân loại giá đối tượng, multi-tenant, mobile native, tích điểm, đa ngôn ngữ, review phim, ví khác ngoài PayOS). |

## 3. Findings

### ❌ (blocker fidelity)
Không có.

### ⚠️ (3 mục — mỗi mục đếm riêng, theo tiêu chí §1; đều MED)

**W-1 [MED] — PAYMENT/ADM-12: vòng đời đơn thiếu trường hợp "đơn đang giữ/chờ thanh toán của suất bị huỷ" và "tiền về cho suất đã huỷ / đã qua mốc đóng bán / đã kết thúc"** *(= N-1)*
- Nguồn: R-78, R-108, R-77 ↔ BR-PAY-07 (L289), BR-ADM-12 (L344), §8.5 (L494-516).
- BRD chỉ nói khi huỷ suất: "ghế đang giữ bị nhả, mọi đơn `paid` → `affected`". Không nêu số phận đơn `holding`/`pending_payment`; payment link còn hiệu lực có thể nhận tiền sau khi suất huỷ. R-78 ("ghế vẫn trống → tự động chốt bán `expired → paid`") áp dụng máy móc sẽ chốt bán cho suất đã huỷ. Không R-xx nào khác giải quyết (R-108/R-127 chỉ nói "ngừng bán"). Bảng vòng đời của spec ("dạng kiểm thử được") không có chuyển trạng thái này; #9/#10 đã ghi các case tương tự nhưng bỏ sót case này.
- Tác động: schema/state machine `orders`/`payments`, test NFR-17 (tiền về muộn, huỷ suất) — liên quan **tiền**.
- Xử lý: thêm vào § Điểm cần xác nhận (gộp theo chủ đề với #9, #10); user quyết hành vi (vd chuyển `needs_manual_review`/`affected`).

**W-2 [MED] — SOCIAL/AUTH: nhánh Facebook không email, khi email khách nhập trùng tài khoản có sẵn** *(= N-3)*
- Nguồn: BR-SOC-04 (L197) + §8.2 (L439-451, mũi tên F→H L450 bỏ qua nhánh kiểm trùng G L446-448) ↔ BR-AUTH-01 (email duy nhất, L171), BR-AUTH-12 (không lộ tồn tại email, L182), BR-SOC-05 (L198). Spec R-19/R-20 sao chép nguyên văn, không xử lý.
- Câu hỏi: email gõ tay trùng tài khoản cũ → tạo trùng (vi phạm duy nhất), yêu cầu liên kết (BR-SOC-05), hay báo lỗi chung? Thông báo "Email này đã có tài khoản…" của R-20 hợp lý khi email do nhà cung cấp xác minh, nhưng với email Facebook do khách gõ (chưa xác minh) có nguy cơ dò email. Không R-xx nào giải quyết. Liên quan **bảo mật/enumeration**.
- Xử lý: ghi vào § Điểm cần xác nhận; user/brainstorm chốt.

**W-3 [MED] — CINEMA: quy tắc bảng giá chi tiết chưa chốt (BR-CIN-05 nằm trong vùng rủi ro cao của caller)** *(= N-5)*
- Nguồn: BR-CIN-05 (L251), BR-CIN-02 (L248), BR-BKG-07 (L270), R-52/R-53/R-72.
- (a) Giá **ghế Đôi** tính theo ghế hay theo cặp (BR-BKG-07 chỉ nói "tính là 2 ghế" cho hạn mức 8). (b) Biên "trước 17h / sau 17h" tại đúng 17:00 và mốc tính (giờ bắt đầu suất?). (c) Định nghĩa "cuối tuần" (T7–CN? tối T6?). (d) Ưu tiên khi ngày lễ trùng cuối tuần ("loại ngày" là enum đơn: thường/cuối tuần/lễ). Không có R-xx nào hay mục #1–#16 ghi nhận; ảnh hưởng **giá chốt và tiền** (R-72, AC-15).
- Xử lý: ghi vào § Điểm cần xác nhận; chốt ở brainstorm trước khi thiết kế bảng giá.

### ℹ️ (không tính ngưỡng; lý do ghi kèm)

| # | Mức | Nội dung | Lý do không phải ⚠️ |
|---|---|---|---|
| N-2 | MED | POS `xác nhận bán` (R-125) sau khi hold 5' đã hết hạn / ghế bị bên khác lấy. | **R-128** ("POS không được bán ghế chưa giữ thành công") + **R-122/R-123** (web là nguồn sự thật, atomic) buộc API từ chối/yêu cầu giữ lại. Phần còn lại (tiền mặt đã thu ngoài hệ thống) thuộc quy trình quầy, và #8 đã mở rộng vòng đời đơn POS. Đề xuất ghi chú tham chiếu chéo R-125↔R-128. |
| N-4 | MED | R-17 ("Admin/Manager tạo hoặc nâng quyền", BR-AUTH-18 L188) đọc literal cho phép Manager nâng quyền lên Manager/Admin. | **R-105** (BR-ADM-09 L341, §5.3 L156) đã giải quyết: Manager chỉ thêm/bớt **Staff** cho rạp mình; builder phải coi R-105 là ràng buộc chặt hơn. Còn mơ hồ nhỏ: Manager *tạo mới* tài khoản Staff hay chỉ *gán* user có sẵn. Đề xuất thêm tham chiếu chéo R-17→R-105. |
| N-6 | MED | AC-07/AC-22 yêu cầu ghế về Trống ≤ 2 giây sau hết hạn trong khi §10 dùng `pg_cron` (độ chi tiết ~1 phút) để nhả ghế. Cần thiết kế "hết hạn tính lúc đọc" (`expires_at`) + realtime, không chỉ cron. | Vấn đề **thiết kế/khả thi**, không phải lỗi spec; BRD tự nêu cả hai. Đưa vào design/brainstorm. |
| N-5' | — | (đã nâng thành W-3) | — |
| N-7 | LOW | Sửa sơ đồ ghế / đặt phòng "bảo trì" khi phòng còn suất tương lai đã bán vé — BRD im lặng. | Chi tiết ít ảnh hưởng tiền/bảo mật. |
| N-8 | LOW | R-109 email hàng loạt khi huỷ suất/đóng rạp vs hạn mức gói free (NFR-18 L541, NFR-10 L533). | Vấn đề chọn dịch vụ, thuộc brainstorm. |
| N-9 | LOW | R-124 hold POS "cấu hình được" — không nói ai/cấp nào cấu hình (R-106 chỉ liệt kê thời gian giữ ghế web). | Chi tiết cấu hình. |
| N-10 | LOW | R-127 sao chép "ngừng bán" (BR-POS-08 L376); phân biệt với "Ngừng bán **online**" (R-67, BR-BKG-09 L272 — POS vẫn bán sau mốc 15'). | **R-67** đã ghi rõ "không giữ ghế được trên web" nên không mơ hồ về hành vi. Đề xuất ghi chú tham chiếu chéo R-127↔R-67↔R-54. |
| N-11 | LOW | Cutoff cấu hình theo rạp có thể < 10' hold ⇒ hold kéo qua giờ chiếu; hold bắt đầu sát cutoff thì thanh toán sau mốc xử lý thế nào. | Góc cạnh phát sinh từ cấu hình, không phải mơ hồ trực tiếp của BRD. |
| N-12 | LOW | Quyền **đọc** audit log (R-107) không được BRD nêu. | BRD im lặng, rủi ro thấp. |
| N-13 | LOW | Check-in theo đơn (1 QR/đơn, ≤8 ghế), không check-in từng phần. | Hệ quả hợp lý của BR-TKT-01/BR-CHK-03. |
| N-14 | LOW | R-70, R-86, R-98, R-112 (MVP) nhắc "combo" trong khi combo là GĐ2 (R-58/R-69/R-100); R-44 "gần nhất" phụ thuộc R-36 GĐ2. Ở MVP các phần này coi là N/A — ghi chú khi graph để builder không build thừa. | Nhất quán phase, không ảnh hưởng hành vi. |
| N-15 | LOW | `Scalability Profile` ghi "modular monolith + stateless + PostgreSQL" (SPECIFICATIONS.md L481) — mặc định của template, không có trong BRD. | Gợi ý kiến trúc, không phải hành vi; quyết ở design. |
| N-16 | LOW | `spec/test-scope/current.json` (draft `initial-build`) liệt kê cả 13 R GĐ2 và AC-18. Theo `.agent/spec-publish.md` L9, bản này được spec-publisher cập nhật theo phạm vi thật sau layer cuối → cần trim GĐ2 lúc đó. Footer SPECIFICATIONS.md "Validated by … (chờ chạy)" cập nhật sau round này. | Draft theo thiết kế quy trình. |
| N-17 | LOW | **Script seed 5 rạp** có trong §15 MVP (L666), NFR-09 (L532), §11.2 (L585) nhưng chỉ xuất hiện ở NFR-09/Deployment của spec, **không có R-xx** → graph cần chủ động xếp thành task (dữ liệu: 5 rạp, phòng, sơ đồ ghế, phim, bảng giá, suất). | Đã có nguồn NFR-09; chỉ cần lưu ý lập kế hoạch. |

## 4. Fidelity — kết quả lấy mẫu rủi ro cao

| Vùng | R | So BRD | Kết quả |
|---|---|---|---|
| Giữ ghế / atomic / hết hạn | R-59..R-67, R-72 | 5 trạng thái (L264), 10' (L266), atomic + unique DB (L267), 1 đơn giữ/khách toàn chuỗi (L269), ≤8 ghế (L270), cutoff 15' (L272), chốt giá (L277) | ✅ khớp, không làm yếu |
| PayOS webhook / idempotent / tiền muộn | R-73..R-80, R-134 | chữ ký (L285), idempotent+số tiền (L286), polling (L290), đối soát (L291), tiền muộn (L289) | ✅ khớp. R-75 thêm "lệch số tiền → không xác nhận + vào đối soát" có nguồn §7.3 (L410) — hợp lệ. ⚠️ W-1 |
| POS sync | R-120..R-130 | khoá API/rạp, 403, atomic chung, 5', requestId, không offline, log + rate limit | ✅ khớp (AC-20..23) |
| Phân quyền theo rạp / RLS | R-39, R-102, R-103, R-105; § Authentication; NFR-05 | §5.3 ma trận (L142-157) + nguyên tắc RLS (L159) | ✅ ma trận sao chép đúng từng ô; RLS+server giữ nguyên |
| Huỷ suất / đóng rạp | R-33, R-108..R-110 | L223, L344-346, AC-24..26 | ✅ khớp; ⚠️ W-1 |
| Auth / anti-spam | R-04..R-13 | L174-183 | ✅ mọi số khớp |
| Bảng giá 2 cấp | R-52, R-53 | L251-252, AC-14/15 | ✅ khớp chuỗi ưu tiên; ⚠️ W-3 (chi tiết) |
| Check-in | R-97..R-102 | L322-327 | ✅ khớp |
| Hành vi thêm ngoài BRD | toàn bộ | — | Không đáng kể: các chỗ spec "suy ra" (R-55 khoá ghế áp cả POS; R-05 chặn ở server) có căn cứ NFR-06/§7/§8 hoặc là hệ quả trực tiếp. |

## 5. Phase tag vs BRD §15 và 16 "Điểm cần xác nhận"

**Phase tag:** 121 MVP / 13 GĐ2 — khớp danh sách GĐ2 của §15 (L667): combo (R-58, R-69, R-100), voucher theo rạp (R-91, R-96), báo cáo đầy đủ + so sánh + CSV (R-114, R-115, R-117, R-119), dashboard (R-118), gợi ý gần nhất (R-36), email nhắc (R-88), `.ics` (R-89). Không hạng mục MVP của §15 bị đẩy sang GĐ2 hay ngược lại. 10 tag `[cần xác nhận]` là phán đoán minh bạch. Đã đối chiếu thủ công 121+13=134 và 10 tag với `spec/updates/2026-11-10-initial-spec-from-brd.md` → khớp.

**Phân loại 16 điểm của spec:**

| # | Phân loại | Nhận xét |
|---|---|---|
| 1 | Phán đoán hợp lý — user confirm | Voucher lõi MVP, phạm vi rạp GĐ2; R-82/R-28 theo. |
| 2 | Phán đoán hợp lý — user confirm | Diễn giải "đối soát" §15 = job BR-PAY-09 hợp lý; RPT-01/02/06 MVP an toàn hơn. |
| 3 | **Mâu thuẫn thật trong BRD — cần user quyết** | AC-25 (MVP) ↔ BR-RPT-09 (S, GĐ2): kéo "báo cáo suất bị huỷ" vào MVP hay test phần đó ở GĐ2. |
| 4 | Spec xử lý hợp lý | CSV đơn bị ảnh hưởng MVP, CSV báo cáo GĐ2. Confirm nhẹ. |
| 5 | Spec xử lý hợp lý | AC-18 là GĐ2; chỉ ghi nhận. |
| 6 | **Mâu thuẫn thật — cần user quyết (RLS)** | Staff "chỉ đọc" (§5.3 L150) vs ghi nhận đơn bị ảnh hưởng (BR-ADM-14 L346). |
| 7 | **Gap thật — cần user quyết (auth POS giả lập)** | Khoá API rạp hay phiên Staff; xung đột §5.3 Staff ❌ giữ ghế (L147). |
| 8 | Gap thật — cần user quyết | Vòng đời đơn kênh POS + `affected`/email/báo cáo hoàn. |
| 9 | **Gap thật — cần user quyết (state machine thanh toán)** | Đơn cũ `pending_payment` bị thay bởi đơn mới. |
| 10 | **Gap thật — cần user quyết** | Tiền về sau `cancelled`; gộp chủ đề với W-1. |
| 11 | Gap nhỏ — chốt mặc định | Mốc check-in theo "giờ kết thúc phim" (không gồm dọn phòng) theo chữ BRD L324 là mặc định hợp lý. |
| 12 | Spec xử lý hợp lý | 10' mặc định, Admin cấu hình (R-106). |
| 13 | Gap nhỏ — cần chốt | Định nghĩa "Sắp chiếu". |
| 14 | Gap nhỏ — cần chốt | Xoá 7 ngày với FB chưa có email: đề xuất áp dụng (chưa có email xác nhận = chưa xác nhận). |
| 15 | Không phải vấn đề | Thứ tự mã rủi ro BRD. |
| 16 | Kỳ vọng — thuộc brainstorm | Hosting, bản đồ, giám sát. |

## 6. Gap list trả cho spec owner (change-request / spec-publisher) + open questions cho brainstorm

**Gap cần sửa trong spec để đạt PASS ở round 2** *(không sửa tay SPECIFICATIONS.md; qua change-request + spec-publisher)*
1. [MISSING] Thêm W-1 vào § Điểm cần xác nhận (liên quan R-78, R-108, #9, #10).
2. [MISSING] Thêm W-2 vào § Điểm cần xác nhận (liên quan R-19, R-20, R-01, R-12).
3. [MISSING] Thêm W-3 vào § Điểm cần xác nhận (liên quan R-52, R-53, R-65, R-72).
4. [PARTIAL — khuyến nghị, không bắt buộc cho PASS] Tham chiếu chéo: R-17→R-105; R-125→R-128; R-127→R-67/R-54; ghi chú combo/“gần nhất” là N/A ở MVP (N-14); ghi chú script seed (N-17).

**Open questions khuyến nghị đưa vào brainstorm (ưu tiên giảm dần)** — brainstorm (bước 2) đứng trước graph (bước 4) nên giải quyết hết trước khi chia layer:
1. **#6 + #7** — Quyền ghi của Staff với đơn bị ảnh hưởng; xác thực POS giả lập (khoá API rạp vs phiên Staff). *(RLS & API POS)*
2. **#9 + #10 + W-1** — Máy trạng thái thanh toán: đơn `pending_payment` bị thay; tiền về sau `cancelled`; tiền về cho suất đã huỷ/đã qua mốc đóng bán/đã kết thúc; số phận đơn `holding`/`pending_payment` khi huỷ suất. *(schema `orders`/`payments`, test NFR-17)*
3. **#8 (+N-2)** — Vòng đời đơn POS (có `affected`/email không, báo cáo hoàn tiền), POS xác nhận bán sau hết hạn giữ.
4. **W-2 (+N-4)** — Facebook không email trùng email có sẵn; phạm vi Manager tạo/nâng quyền. *(bảo mật)*
5. **W-3** — Quy tắc bảng giá: ghế Đôi theo ghế/cặp, biên 17:00, định nghĩa cuối tuần, ưu tiên lễ/cuối tuần.
6. **#3 + #1 + #2 + #4** — Phạm vi MVP của báo cáo ("báo cáo suất bị huỷ"), voucher lõi, avatar, đơn 0đ.
7. **N-6** — Chiến lược hết hạn giữ ghế ≤ 2s với pg_cron (design).
8. **#11, #13, #14** — Mặc định nhỏ.
9. **#16 + N-8** — Hosting, bản đồ, giám sát, nhà cung cấp email (hạn mức free vs email hàng loạt).
10. **N-7, N-9..N-13, N-15** — Edge/LOW, quyết ở design hoặc ghi residual risk.

## 7. Residual risk / không xác minh được
- Không có code → không đối chiếu implementation; round này chỉ đảm bảo spec ≈ BRD.
- Phép đếm mã đã được script xác nhận theo yêu cầu, không chạy lại.
- Ranh giới ⚠️/ℹ️ là phán đoán theo tiêu chí §1; nếu user/orchestrator muốn coi W-3 (chi tiết giá) hoặc W-1/W-2 là "open question hợp lệ chưa ghi" thay vì ⚠️, verdict sẽ chuyển PASS — nhưng tiêu chí đã áp dụng nhất quán cho mọi finding, nên giữ FAIL cho tới khi spec ghi nhận 3 mục này.
