# Review — bug/cinema-map · phase-1-task-01 · round 1

Agent: reviewer
Ngày: 2026-11-17

## Review level
**NORMAL**

Lý do: chỉ đổi phía web/UI. Task đổi nhà cung cấp tile và link chỉ đường. Không đụng auth, DB/schema, API contract hay payment. Có thêm 1 helper dùng chung (`lib/map-links.ts`), nhưng chỉ 2 trang và 1 component gọi tới nên không cần STRICT.

## Blast radius
- `apps/web/src/components/catalog/cinema-map.tsx`: tile layer, attribution, link và nhãn.
- `apps/web/src/components/catalog/cinema-map-popup.ts`: chỉ đổi nhãn link.
- `apps/web/src/app/(public)/rap/[code]/page.tsx`: `directionsUrl` chuyển sang dùng helper. JSON-LD không đổi (`buildCinemaJsonLd` không dùng `directionsUrl`).
- `apps/web/src/app/(public)/rap/page.tsx`: chỉ đổi nhãn.
- File mới: `apps/web/src/lib/map-links.ts`.
- Không có CSP hay `img-src` trong `apps/web/next.config.ts`/src, nên host tile mới không bị policy chặn.
- `apps/api/package.json` là thay đổi của user, nằm ngoài phạm vi review.

## Verify commands + result (chạy từ root, 2026-11-17)
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS: shared 31/31, api 483/483 (25 file), web 570/570 (46 file), scripts node --test 31/31 |
| `pnpm build` | KHÔNG chạy, theo chỉ thị (web:3000 của user đang dùng `.next`) |
| aislop / oxlint / ocr | skip: chưa cấu hình (không có oxlint config, chưa cài `ocr`) |

## Kiểm tra code (đều đạt)
1. **Root cause có bằng chứng và fix đúng chỗ.** DNS VNPT trả NXDOMAIN cho `tile.openstreetmap.org` và `www.openstreetmap.org`. Fix đổi tile sang CARTO Voyager và link sang Google Maps. Hai thay đổi cùng một root cause, gộp vào `buildDirectionsUrl` (`lib/map-links.ts:25-30`).
2. **URL đúng.**
   - Tile `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png` + `subdomains:"abcd"` + `maxZoom:20` hợp lệ với Leaflet 1.9: `{r}` thành `@2x` khi `Browser.retina`, Voyager hỗ trợ tới z20.
   - `dir/?api=1&destination=lat,lng` và `search/?api=1&query=<encodeURIComponent>` đúng cú pháp Google Maps URLs. Dấu phẩy không encode vẫn được Google chấp nhận.
   - `hasValidCoordinates` dùng `Number.isFinite`: toạ độ 0 và toạ độ âm đi nhánh có toạ độ; null, undefined, NaN và Infinity đi nhánh tìm kiếm. Hành vi này chặt hơn bản cũ (`!isNaN`) và hợp lý.
3. **Bảo mật.**
   - Attribution có cả "OpenStreetMap contributors" và "CARTO" (`cinema-map.tsx:73`).
   - Mọi link ngoài đều có `rel="noopener noreferrer"`.
   - Popup vẫn dựng bằng DOM node và `textContent`.
   - `isSafeLink` giữ nguyên.
   - Không có lời gọi `navigator.geolocation`; chỉ còn comment NFR-08.
4. **Không hồi quy.**
   - Fallback (không toạ độ hoặc `hasError`) vẫn giữ.
   - Cleanup `map.remove()` vẫn giữ.
   - Deps của `useEffect` không đổi.
   - Grep `openstreetmap` trong `apps/web/src` chỉ còn link copyright trong attribution, comment và assertion phủ định trong test.
5. **Test.**
   - `cinema-map-tiles.test.tsx:54` assert `toContain("basemaps.cartocdn.com")`, nên nếu revert URL về `tile.openstreetmap.org` thì test đỏ (dòng 55 cũng đỏ).
   - Test link (`:72-76`) đỏ với nhãn và URL cũ.
   - `map-links.test.ts` đỏ trước fix vì module chưa tồn tại.
   - Mock Leaflet khớp với cách gọi `import("leaflet")` có named exports.
   - So `git diff` các test cũ: không assertion nào bị xoá hay làm yếu. Hai test chỉ đổi giá trị kỳ vọng sang Google Maps, và popup test có thêm 1 assertion nhãn.
6. **Scope.** Không đụng scan #1–#4. Builder không sửa file nào ngoài manifest.

## Findings

### [BLOCKER] Bug repro chưa đóng: chưa có evidence sau fix trên app (unverifiable closure)
- `tasks/bug-cinema-map/phase-1-task-01.md:25-27`: "Actual after fix" và "Evidence" vẫn để trống, và `Status: BLOCKED→ chờ fix` chưa phải `PASS`.
- `tasks/bug-cinema-map/phase-1-task-01.md:18`: Acceptance yêu cầu "build web PASS", nhưng `pnpm build` chưa chạy.
- Theo luật bug-closure, status repro khác PASS hoặc evidence không chứng minh bug đã hết thì verdict phải là FAIL, kể cả khi code đúng.

**Cần có để chuyển PASS ở round 2.** Không cần sửa code; round 2 chỉ kiểm evidence, trừ khi diff thay đổi.
1. Restart web:3000 với code mới (`pnpm build` web PASS rồi start, hoặc chạy dev).
2. Trên `/rap` và `/rap/HN01`: số `.leaflet-tile` > 0, có tile `img.complete && naturalWidth > 0`, và `src` trỏ `*.basemaps.cartocdn.com`.
3. Popup marker mở được, link trỏ `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`. Nút "Mở chỉ đường (Google Maps)" và nút "Chỉ đường" ở header `/rap/[code]` trỏ cùng URL.
4. Điền "Actual after fix" và "Evidence" (ảnh chụp hoặc số tile tải được), rồi đặt `Status: PASS`.

### [MINOR] Test tile chưa khoá `{r}` và `maxZoom: 20`
`cinema-map-tiles.test.tsx:50-59` chỉ assert host, `subdomains` và attribution. Nếu ai đó bỏ `{r}` hoặc đổi `maxZoom`, test không đỏ. Không chặn verdict.

### [INFO] Infinity không có test riêng
`Number.isFinite` đã xử lý đúng Infinity. `map-links.test.ts` mới phủ null và NaN. Không chặn verdict.

### [INFO] Doc và decision
- `docs/BRD.md:24,560` và `docs/specs/2026-11-10-filmbooking-mvp-design.md:48` ghi "OpenStreetMap (Leaflet)". Dữ liệu vẫn lấy từ OSM, CARTO chỉ là CDN render tile, nên intent không bị vi phạm và không cần sửa intent doc.
- Việc đổi nhà cung cấp tile và link nên ghi 1 dòng vào `.context/decisions.md` như close-out đã lên kế hoạch.
- `docs/DESIGN.md` không nhắc OSM, nên không có doc impact.

## Repro evidence assessment
- **Bằng chứng trước fix: mạnh.** 0/12 tile tải được; `nslookup` qua VNPT trả NXDOMAIN, qua 8.8.8.8 có IP; `curl` thoát mã 6. Tất cả chứng minh root cause nằm ở tầng DNS, không phải logic.
- **Bằng chứng sau fix: gián tiếp, độ tin cậy cao nhưng chưa đóng.**
  - Đã có: CARTO tile tải OK trong Chrome tại origin localhost:3000 (cả `@2x` và đủ 4 subdomain); unit test xác nhận component gọi đúng URL; không có CSP chặn.
  - Chưa có: quan sát trên app chạy code mới, vì web:3000 vẫn chạy bản build cũ.
- **Residual risk:**
  - Môi trường build/CSP khác có thể chặn host mới, nhưng hiện chưa thấy.
  - CARTO có giới hạn fair-use cho traffic lớn; chấp nhận được với dự án demo.
  - Google Maps có thể bị chặn ở một số mạng khác; hiện tại chưa có bằng chứng.

## Verdict
**FAIL** (unverifiable repro closure). Code sạch, không có defect cần sửa trong source. Thiếu evidence sau fix trên app chạy code mới, và build web chưa chạy. Bổ sung đúng 4 mục trong BLOCKER để chuyển PASS.
