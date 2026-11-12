# Bug layer34-review · phase-1-task-07 — K6 XSS popup bản đồ

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-web.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: escape HTML hoặc dựng DOM node cho cinemaName/address trong cinema-map.tsx:115-132; thêm unit test payload <img onerror>.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: implemented, awaiting review (builder PASS)
- Root cause (confirmed): `apps/web/src/components/catalog/cinema-map.tsx` ghép `cinemaName`/`address` (Manager nhập) thẳng vào chuỗi HTML của `marker.bindPopup` -> Leaflet gán innerHTML -> XSS lưu trữ.
- Fix: tách `cinema-map-popup.ts` (`buildCinemaPopup`) dựng DOM node bằng `createElement` + `textContent`; link chỉ đường chỉ render nếu protocol http/https (chặn `javascript:`), `rel=noopener noreferrer`. `cinema-map.tsx` truyền HTMLElement cho `bindPopup`.
- Repro Verification: test `__tests__/cinema-map-popup.test.ts` (payload `<img src=x onerror=alert(1)>`, address `"><script>`, `javascript:` href). ĐỎ 4/4 trên logic ghép chuỗi cũ; XANH 4/4 sau fix. Full web: 93/93 pass; eslint, tsc --noEmit, next build OK.
- Other sinks grep apps/web: chỉ còn 2 `dangerouslySetInnerHTML` JSON-LD, đã escape `<` -> `<` (an toàn); divIcon html là hằng tĩnh; không có bindTooltip. Không sửa thêm.
- Doc impact: no doc impact.
- Residual risk: thấp. Chưa kiểm popup trên trình duyệt thật (Leaflet nhận HTMLElement là API chuẩn). `aria-label`/`title` dùng cinemaName là thuộc tính, React/Leaflet gán qua setAttribute nên không parse HTML.
