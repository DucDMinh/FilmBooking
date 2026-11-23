# Spec Validation Report — CR-016 nav-skeleton-and-first-row-visible (round 4, hẹp, spec 3.6.1)

Agent: spec-validator
Round: 4 (hẹp)
Mode: xác nhận sửa round 3 (H-1, M-1, M-3, M-4). Không sửa spec, spec/test-scope hay mã. Chỉ Grep/Read.
Tiền đề: round 1 FAIL, round 2 PASS, round 3 FAIL (`...-phase-1-round-3-spec.md`).

## Verdict: PASS

Không còn HIGH, không còn ❌, không còn ⚠️. Còn 1 MINOR (không thuộc ngưỡng FAIL).

## Kết quả đối chiếu round 3

| Mục round 3 | Trạng thái | Bằng chứng |
|---|---|---|
| H-1: test-scope L935 "mã rạp không tồn tại -> trang không tìm thấy, HTTP 200 + noindex" | OK | current.json L935 |
| H-1: test-scope L1189 "slug không tồn tại → trang không tìm thấy, HTTP 200 + noindex" | OK | current.json L1189 |
| H-1: test-scope L1264 acceptance A3 "Given mã rạp không tồn tại Then trang không tìm thấy (HTTP 200 + noindex)" | OK | current.json L1264 |
| M-4: residual L1191 `?province=` sai → "trang không tìm thấy (HTTP 200 + noindex)" | OK | current.json L1191 (đã đọc) |
| M-1 (phương án a): R-137 có thêm "trang gắn `noindex`" cho rạp không hoạt động | OK | SPECIFICATIONS.md L127: "trang gắn `noindex` (không lập chỉ mục)". Khớp AC-28 L397 (CLOSED: 200 + noindex ở test A4 L1358 và scope L1014) và spec/updates/2026-11-18 L36 (noindex rạp không OPEN, không mâu thuẫn). Không thêm requirement mới: R-* và số đếm không đổi |
| M-3: ma trận L532 thêm "làm rõ R-137, AC-28 (3.6.1 ...)" | OK | SPECIFICATIONS.md L532 |

## Kiểm tra theo yêu cầu coordinator

1. Không còn câu khẳng định mã rạp/slug sai nhận 404 cho trình duyệt hoặc bot:
   - spec/test-scope/current.json: các mục 404 còn lại là: L435 (`notFound()` khi API 404, kết quả 200 + noindex), L933 (API JSON `GET /cinemas/:code` 404, đúng), L944 (ngữ cảnh migration), L1014/L1026/L1357/L1358/L1378 (đều là "KHÔNG 404"), L1089 (`?date=` rác → 200, không 404), L1253 (không 404 cho CLOSED), L1264 (không còn "vẫn 404"). Không còn khẳng định 404 cho mã sai ở web.
   - SPECIFICATIONS.md: L127 (R-137), L364 (NFR-20), L397 (AC-28) đều nói 200, không phải 404.
   - spec/updates/2026-11-23-nav-skeleton-and-first-row-visible.md: đều 200 + noindex; L15 và L38 nhắc "bot nhận 404" như giả định 3.6.0 đã bị thay thế, hoặc như residual. Không phải khẳng định hiện hành sai.
   - spec/updates/2026-11-23-booking-error-messages.md: không có 404 liên quan trang rạp/phim.
   - spec/CHANGELOG.md: chỉ 3.6.1 (L28) có "200 + noindex"; các dòng 404 còn lại là lịch sử (dòng 3.4.0 "thay vì 404", và spec/updates/2026-11-18 "mã sai 404"). Đây là lịch sử đã bị 3.6.1 thay thế, không phải khẳng định hiện hành. Không sửa.
2. Không mâu thuẫn mới giữa R-137, AC-28, NFR-20 sau khi thêm noindex: R-137 (noindex cho rạp không hoạt động + 200 cho mã sai), AC-28 (CLOSED: 200 + thông báo, mã sai: 200 + noindex, OPEN có lịch đóng: banner), NFR-20 (mã sai: 200 + noindex cho mọi client) nhất quán.
3. spec_version 3.6.1 còn ở front-matter L2; NFR-20 (L364) và AC-35 (L404) vẫn có đúng một dòng mỗi mã.
4. JSON current.json: Grep multiline không tìm thấy dấu phẩy thừa trước `]`/`}`.

## Gap còn lại (MINOR, không tính ngưỡng FAIL)

- [MINOR] Thay đổi R-137 (thêm "trang gắn noindex" cho rạp không hoạt động) là một làm rõ mới trong SPECIFICATIONS.md nhưng chưa được ghi trong `spec/updates/2026-11-23-nav-skeleton-and-first-row-visible.md` (mục 3.6.1 L13-L16) và dòng `spec/CHANGELOG.md` L28 (3.6.1 nói chung về mã sai). Nên bổ sung 1 câu vào mục 3.6.1 của spec update và/hoặc CHANGELOG để truy vết đúng. Không ảnh hưởng verdict.

## Residual risk / Blocked
- Không chạy git diff và không Bash. Kiểm bằng Grep/Read.
- JSON kiểm tĩnh, không parse bằng máy (coordinator đã JSON.parse).
- Không đối chiếu lại số đo Playwright.
