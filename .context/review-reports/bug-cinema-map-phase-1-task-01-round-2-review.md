# Review — bug cinema-map · phase-1-task-01 · round 2

Agent: reviewer

## Review level
NORMAL

## Reason
Diff chỉ đụng frontend (`CinemaMap`, popup, 2 trang `/rap`, helper mới `lib/map-links.ts`). Không đụng API/DB/schema/auth/payment. Phụ thuộc bên thứ ba (tile server) đã có evidence chạy thật. Không có risk đỏ → không cần STRICT.

## Blast radius
- `apps/web/src/components/catalog/cinema-map.tsx` (tile layer + link chỉ đường), `cinema-map-popup.ts` (chỉ nhãn), `app/(public)/rap/page.tsx` (nhãn phụ), `app/(public)/rap/[code]/page.tsx` (dùng `buildDirectionsUrl`).
- Mới: `apps/web/src/lib/map-links.ts` (+ test), `components/catalog/__tests__/cinema-map-tiles.test.tsx`.
- Ngoài task, bỏ qua: `apps/api/package.json` (user), `.context/error-memory.md` (ghi chép primary).

## Verify commands + result (chạy từ root, 2026-11-17)
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS — shared 31/31 (2 file), api 483/483 (25 file), web 570/570 (46 file), scripts node:test 31/31. Không có test chậm/flaky lần này. |
| `pnpm build` | KHÔNG chạy — chủ ý của dispatcher (web :3000 của user đang dùng `.next`); thay bằng typecheck + `next dev` :3100 chạy thật. Chấp nhận. |
| aislop / oxlint / ocr | skip (không cấu hình/không cài; diff nhỏ, lint ESLint PASS) |

## Findings

Không có CRITICAL / MAJOR / MINOR.

Đã kiểm:
1. **Fix attempt 1 (OSM France)** — `cinema-map.tsx:71-76`: URL `https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png`, `subdomains: "abc"`, `maxZoom: 20` — hợp lệ với Leaflet 1.9 (`subdomains` nhận string, `{s}` thay bằng a/b/c; osmfr phục vụ tới z20). Attribution có cả "OpenStreetMap contributors" (link `/copyright`, bắt buộc ODbL) và "OpenStreetMap France"; cả 2 thẻ `<a>` có `target="_blank" rel="noopener noreferrer"`. Chuỗi attribution là hằng số, không chứa dữ liệu người dùng → không có XSS.
2. **Test khoá hồi quy** — `cinema-map-tiles.test.tsx:54-61`: `toContain("tile.openstreetmap.fr/osmfr/...")` + `not.toContain("tile.openstreetmap.org")` + `not.toContain("cartocdn")` → đổi về OSM gốc hoặc CARTO đều làm test đỏ. `subdomains` toBe "abc" và `maxZoom` toBe 20 → MINOR round 1 ("chưa khoá maxZoom/subdomains") đã xử lý. Mock leaflet chỉ mô phỏng factory (`map/tileLayer/divIcon/marker`), không bịa hành vi mạng → không false-confidence với phạm vi điều nó khẳng định.
3. **Không hồi quy**:
   - Fallback không toạ độ vẫn còn (test `cinemas.test.tsx` vẫn assert "Vị trí rạp" + địa chỉ + link; chỉ đổi expected URL/nhãn sang Google Maps — đổi tương ứng, không làm yếu).
   - Cleanup `map.remove()` còn ở `cinema-map.tsx:58` và `:128`.
   - Popup vẫn dùng `textContent` + `isSafeLink` (`cinema-map-popup.ts:3,34`); test XSS cũ giữ nguyên, chỉ đổi `SAFE_URL` và **thêm** assertion nhãn (`cinema-map-popup.test.ts:38`).
   - Không có `navigator.geolocation` (chỉ có trong comment cấm, `cinema-map.tsx:24`).
   - JSON-LD (`buildCinemaJsonLd`) không bị đụng trong diff.
   - `git diff` các test cũ: không assertion nào bị xoá; 2 chỗ đổi giá trị kỳ vọng đúng theo hành vi mới, 1 chỗ thêm assertion.
4. **`hasValidCoordinates`** (`map-links.ts:9-19`) dùng `Number.isFinite` — chặt hơn bản cũ (`!isNaN`), loại cả Infinity. Hành vi hiển thị bản đồ chỉ thay đổi với Infinity (trước sẽ ném lỗi Leaflet → fallback error, nay → fallback không toạ độ) — cải thiện, không hồi quy.
5. **Grep `openstreetmap|cartocdn` trong `apps/web/src`**: chỉ còn tile host `.fr`, link attribution, comment, và assertion test → đạt Acceptance "không còn request tới `*.openstreetmap.org` từ code bản đồ" (link attribution chỉ là `<a>` người dùng bấm, không phải request tự động).

INFO (không chặn):
- I-1 `tasks/bug-cinema-map/phase-1-task-01.md:15` mục "Test bắt buộc (b)" vẫn ghi attribution chứa `CARTO`; dòng 9 đã ghi "mọi chỗ CARTO thay bằng OSM France" nên không gây hiểu nhầm, có thể sửa câu chữ khi close-out.
- I-2 Chưa có test Infinity cho `hasValidCoordinates` (đã được dispatcher ghi là không bắt buộc).
- I-3 Chưa có test unmount gọi `map.remove()` — có sẵn từ trước, không thuộc task.

## Repro evidence assessment
- Đủ các mục: Original repro, Expected, Actual before (Chrome + curl + nslookup VNPT vs 8.8.8.8), Actual after, Evidence, Residual, Status — `tasks/bug-cinema-map/phase-1-task-01.md:22-38`.
- **Evidence mạnh, đúng yêu cầu "nhìn ảnh thật"**: tôi đã xem trực tiếp 2 ảnh:
  - `screenshot-1794885728782-0.jpg` (/rap): bản đồ đường phố thật khu Kim Mã/Ba Đình/Cầu Giấy, có nhãn đường, không watermark "API KEY REQUIRED", không nền xám; marker brand; attribution "Leaflet | © OpenStreetMap contributors, tiles by OpenStreetMap France"; nút "Mở chỉ đường (Google Maps)"; phụ đề "Bản đồ trực quan".
  - `screenshot-1794885747410-1.jpg` (/rap/HN01): bản đồ đường phố Cầu Giấy/Xuân Thủy, popup "FilmBooking Cầu Giấy" + địa chỉ + "Chỉ đường trên Google Maps →".
  - Kèm đo tile 12/12 và 18/18 `complete && naturalWidth>0`, host duy nhất `*.tile.openstreetmap.fr`.
- Bài học CARTO (tile load OK nhưng watermark) được ghi lại, và lần này evidence có ảnh → không lặp lại điểm mù `onload`.
- Residual ghi đủ: phụ thuộc OSM France fair-use/không SLA, nguy cơ `.fr` bị chặn sau này (có phương án Esri/osm.de), Google Maps chưa có bằng chứng bị chặn, :3000 của user cần build lại, scan #1-#4 chưa xử lý.
- Kết luận: theo bằng chứng, lỗi không còn tái hiện. Repro Verification = PASS.

## Scope & doc impact
- Scan #1/#2/#3/#4 không bị đụng và không ảnh hưởng fix này (#2 z-index không cản trở hiển thị tile; ảnh cho thấy header không che bản đồ ở vị trí cuộn đã chụp). #5 xử lý hợp lệ vì cùng root cause.
- Doc impact: đồng ý **no doc impact** — `docs/BRD.md` và design spec nói "OpenStreetMap (Leaflet)"; dữ liệu bản đồ vẫn là OSM, thư viện vẫn Leaflet, chỉ đổi tile mirror và link chỉ đường. Không đổi API/schema. Ghi 1 dòng `.context/decisions.md` (đổi tile server sang OSM France + chỉ đường Google Maps) khi close-out là đúng và đủ.

## Verdict
**NORMAL PASS**
