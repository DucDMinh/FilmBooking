Agent: reviewer

> Ghi chú dispatcher: reviewer bị hook agent-guard chặn ghi report trong worktree; dispatcher lưu nguyên văn report vào checkout chính.

# Review — bug-layer34-review / phase-1 / task-07 (K6: XSS popup bản đồ) — round 1

- **Review level:** STRICT
- **Reason:** bảo mật — XSS lưu trữ từ dữ liệu Manager nhập, hiển thị trên trang public `/rap/[code]`.
- **Blast radius:** `apps/web/src/components/catalog/cinema-map.tsx` (CinemaMap) và module mới `cinema-map-popup.ts`. Không đụng API, DB hay shared package.

## Verify commands + result (chạy trong worktree)
| Lệnh | Kết quả |
|---|---|
| `pnpm test` | PASS — shared 14/14, api 211/211, web 93/93 (8 file, có `cinema-map-popup.test.ts`), scripts 16/16 |
| `pnpm lint` | PASS, 0 lỗi |
| `pnpm typecheck` | PASS (shared/api/web) |
| `pnpm --filter @filmbooking/web …` | bị agent-guard chặn vì ngoài allowlist, dùng lệnh ở root |
| oxlint / aislop / ocr | skip: chưa cấu hình / chưa cài |
| DB/Supabase | không chạy, theo brief |

## Kiểm tra theo yêu cầu
1. **Đường đưa dữ liệu Manager vào HTML**
   - Popup (`cinema-map.tsx:117`): nhận HTMLElement từ `buildCinemaPopup` → Leaflet `appendChild`, không innerHTML. Tên/địa chỉ qua `textContent` (`cinema-map-popup.ts:13`).
   - Marker `title: cinemaName` (`:114`): Leaflet gán property (`leaflet/src/layer/marker/Marker.js:225-226`), không parse HTML.
   - divIcon html (`:84-110`) và tileLayer attribution (`:79`): chuỗi cố định.
   - `aria-label` (`:177`), `{address}` (`:155`, `:185`): JSX, React tự escape.
   - Link fallback (`:47`): `encodeURIComponent`. Không có `bindTooltip`.
2. **Protocol link chỉ đường** (`cinema-map-popup.ts:1-9`): chỉ `http:`/`https:` theo `new URL(url).protocol`; WHATWG cắt khoảng trắng đầu và hạ chữ thường scheme → `" JAVASCRIPT:"`, `data:`, `vbscript:` bị chặn; chuỗi rỗng/URL tương đối parse lỗi → chặn. `directionsUrl` trong component luôn bắt đầu `https://www.openstreetmap.org/`.
3. **Test chạy đúng hàm production, không tautology:** import `../cinema-map-popup` (cùng module component dùng); `mount()` mô phỏng hai nhánh của Leaflet; assert không `img`/`script`, không thuộc tính `on*`, văn bản giữ nguyên. Builder ghi nhận đỏ 4/4 trên logic cũ.
4. **Dọn marker/popup:** cleanup gọi `map.remove()` (`:129-139`); rerender dọn instance cũ (`:63-66`); diff không đổi logic này.
5. **Sink cùng kiểu trong apps/web:** chỉ còn 2 `dangerouslySetInnerHTML` JSON-LD (`app/(public)/phim/[slug]/page.tsx:88`, `app/(public)/rap/[code]/page.tsx:170`), đều escape `<` → `<` (`lib/seo/movie-jsonld.ts:108-110`, `lib/seo/cinema-jsonld.ts:54-56`). Không bỏ sót.

## Findings
- CRITICAL/MAJOR: không có.
- **MINOR-1** (`apps/web/src/components/catalog/__tests__/cinema-map-popup.test.ts:40-43`): test `javascript:` dùng `?? ""` nên pass cả khi link bị bỏ; thiếu case `JavaScript:`, `"  javascript:"`, `data:`, `vbscript:`. Đề xuất `expect(link).toBeNull()` + `it.each`.
- **MINOR-2** (`tasks/bug-layer34-review/phase-1-task-07.md`, dòng "Other sinks"): ghi "`<` -> `<`", đúng là "`<` -> `<`".
- Phạm vi diff gọn; doc impact "no doc impact" hợp lý.

## Verdict
**STRICT PASS.** MINOR-1 nên bổ sung ở vòng sau, không chặn.
