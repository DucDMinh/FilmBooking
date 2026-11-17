# Error Memory

## Purpose
Log errors encountered during development to prevent repeating the same mistakes.

## Format

```markdown
### Error {N}
- **Date:** YYYY-MM-DD
- **Task:** layer-{N}/task-{NN}
- **Error:** {Error message or description}
- **Root Cause:** {Why it happened}
- **Fix:** {How it was resolved}
- **Pattern:** {General lesson — applies to future tasks}
- **Prevention:** {How to avoid this in the future}
```

## Standing Rules (Pre-loaded)

These rules were learned from real bugs. Apply them to every task, not just when an error occurs.

### Rule 001 — Assert on shared contract, not implementation format
- **Pattern:** Tests that assert on backend response format (e.g. `expect(res.body.token)`) will pass even when the frontend can't parse the response — because they're locked to the current implementation, not the actual contract the client consumes.
- **Prevention:** Tests MUST assert on the shared contract: the same shape that the client-side `parse()` / type definition expects. If the client reads `body.data.token`, the test must assert `body.data.token`, not `body.token`.
- **Example fix:**
  ```js
  // ❌ Wrong — asserts implementation detail
  expect(res.body.token).toBeDefined();

  // ✅ Correct — asserts client contract
  expect(res.body.data.token).toBeDefined();
  expect(res.body.success).toBe(true);
  ```

### Rule 002 — All responses MUST go through shared helper (ok()/fail())
- **Pattern:** If one endpoint writes `res.json({token, user})` manually while all others use `ok({token, user})`, the format diverges silently. Tests pass, frontend breaks.
- **Prevention:** Never use `res.json()` directly for API responses. Always use the shared response helper (`ok()` / `fail()`). If the helper doesn't support a case, extend the helper — don't bypass it.
- **Enforcement:** Add a lint rule or grep check in CI: `res.json(` in route files should be flagged for review.

### Rule 003 — Write contract tests that simulate client parsing
- **Pattern:** Unit/integration tests only cover the server side. The client-side `parse()` function is never tested against real API responses, so format mismatches only surface in the browser.
- **Prevention:** For every auth/critical endpoint, write a contract test that:
  1. Calls the real endpoint
  2. Passes the raw response body through the client `parse()` function
  3. Asserts the parsed result matches expected shape
  ```js
  // Contract test example
  const res = await request(app).post('/auth/login').send(credentials);
  const parsed = parseLoginResponse(res.body); // actual client parser
  expect(parsed.token).toBeDefined();
  expect(parsed.user.id).toBeDefined();
  ```

## Entries

_Errors encountered during this project will be logged below._

### 2026-11-11 — agent-guard + Git Bash path
- Reviewer bị chặn khi `cd "/e/FilmBooking/.worktrees/..."`: hook dùng path.resolve trên win32 → `E:\FilmBooking` ngoài .worktrees. Cách dùng đúng: `cd "E:/FilmBooking/.worktrees/<wt>" && <lệnh>`.

### 2026-11-17 — bug-cinema-map attempt 1: chọn nhà cung cấp tile chỉ kiểm `Image.onload` → bỏ lọt tile bị watermark
- **Triệu chứng:** thay tile OSM (host bị DNS VNPT chặn) bằng CARTO `rastertiles/voyager`; test đơn vị + `Image.onload` OK, nhưng chạy dev server thật thì 12/12 tile đều đóng dấu "API KEY REQUIRED" (carto.com/basemaps/apikey). Mọi biến thể (`voyager`, `light_all`, `dark_all`) đều bị.
- **Root cause của lần sai:** coi "ảnh tải được" = "tile dùng được". CARTO đã yêu cầu API key cho raster tile công khai; ảnh vẫn trả 200 + 256px nên `onload` không phân biệt được.
- **Cách kiểm đúng:** với bug hiển thị bản đồ/ảnh phải **nhìn ảnh thật** (screenshot trên app chạy code mới), không chỉ `onload`/status/naturalWidth. Chọn provider tile: thử nhiều nguồn, chụp từng tile, loại nguồn có watermark/đòi key.
- **Nguồn đã thử trên mạng VNPT (2026-11-17):** hiện tile thật = Esri World_Street_Map, tile.openstreetmap.de, {a,b,c}.tile.openstreetmap.fr/osmfr. Chết/đòi key = tile.openstreetmap.org (NXDOMAIN), CARTO (watermark).
