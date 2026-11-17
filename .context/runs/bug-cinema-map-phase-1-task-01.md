# Run Journal — bug/cinema-map · phase-1-task-01

```yaml
workItem: bug/cinema-map
phaseTask: phase-1-task-01
step: done
agent: null
status: done
attempt: 1
interrupted: false
updatedAt: 2026-11-17T12:10:00+07:00
filesTouched:
  - apps/web/src/app/(public)/rap/[code]/page.tsx
  - apps/web/src/app/(public)/rap/page.tsx
  - apps/web/src/components/catalog/cinema-map.tsx
  - apps/web/src/components/catalog/cinema-map-popup.ts
  - apps/web/src/components/catalog/__tests__/cinemas.test.tsx
  - apps/web/src/components/catalog/__tests__/cinema-map-popup.test.ts
  # ` M apps/api/package.json` = thay đổi của USER (start --env-file), KHÔNG thuộc task, KHÔNG commit
filesNew:
  - apps/web/src/lib/map-links.ts
  - apps/web/src/lib/__tests__/map-links.test.ts
  - apps/web/src/components/catalog/__tests__/cinema-map-tiles.test.tsx
  - tasks/bug-cinema-map/scan.md
  - tasks/bug-cinema-map/phase-1-task-01.md
  - .context/review-reports/bug-cinema-map-phase-1-task-01-round-1-review.md
  - .context/review-reports/bug-cinema-map-phase-1-task-01-round-2-review.md
  - spec/test-scope/current.json
  - spec/CHANGELOG.md
  - spec/updates/2026-11-17-cinema-map.md
  # primary close-out cũng sửa: .context/error-memory.md, .context/decisions.md, .context/progress.json (thuộc task, được commit)
evidence:
  reportPath: .context/review-reports/bug-cinema-map-phase-1-task-01-round-2-review.md   # round 1 (FAIL, thiếu repro-after-fix): ...-round-1-review.md
  round: 2
  verdict: PASS
next: "done — đã commit staging (không push). User cần build lại/restart web :3000 để thấy fix. Còn mở ngoài task: scan #1 (/rap chỉ 1 rạp), #2 (z-index đè header), #3 (CSS Leaflet nạp động), #4 (test nhánh có toạ độ)."
loopSignal: none
approvals: []
batchQueue: []
```

## Notes / WIP reasoning

- Builder xong (agent: builder): typecheck/lint PASS; test web 570, api 483, shared 31 PASS; test đỏ trước fix (4 file). `pnpm build` web CHƯA chạy vì web:3000 của user đang dùng `.next` (bản build production, không hot reload) → kiểm tay trên app cần user restart.
- Primary đã đối chiếu `git status`/`git diff`: khớp báo cáo builder. Không có file lạ ngoài manifest (trừ `apps/api/package.json` của user).
- Evidence độc lập (primary, Chrome tab localhost:3000): tile CARTO `{a,b,c,d}.basemaps.cartocdn.com/.../15/26014/14424.png` và biến thể `@2x` (dpr 1.25) đều `Image.onload` OK 256px.
- Còn lại cho close-out: `.context/decisions.md` +1 dòng; kiểm `docs/DESIGN.md` có nhắc OSM không (doc impact); spec-publish `trigger: bug-fix`.

- 2026-11-17 (primary, dev server riêng :3100, Chrome): CARTO tile tải được 12/12 nhưng bị watermark "API KEY REQUIRED" (mọi biến thể voyager/light_all/dark_all) → fix attempt 0 KHÔNG giải quyết repro → attempt=1. Đã ghi `.context/error-memory.md`. Nguồn thử thấy tile thật: Esri, osm.de, osm.fr. Chọn OSM France `https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png` (subdomains abc, maxZoom 20, không retina `{r}`). Builder sửa hằng URL/attribution + 2 assertion test; dev server :3100 đang chạy để kiểm lại bằng screenshot.
- Reviewer round 1 = FAIL (thiếu repro-after-fix; code sạch). Round 2 sau khi có evidence thật.

- 2026-11-17 11:05 ✅ DONE [agent: builder] fix attempt 1 (OSM France). Primary đã xác nhận trên :3100: /rap 12/12 tile, /rap/HN01 18/18 tile, popup + 3 link Google Maps OK, screenshot thấy bản đồ thật. Đã tắt dev server :3100 (do primary khởi động); :3000 của user không đụng. Repro Verification trong task file đã điền (Status PASS chờ reviewer).
- Reviewer round 1 report: `.context/review-reports/bug-cinema-map-phase-1-task-01-round-1-review.md` (verdict FAIL do thiếu evidence, code sạch). Round 2 ghi đè thêm file `...-round-2-review.md`.

## History

- 2026-11-17T09:55:00+07:00 journal created; ▶ START builder
- 2026-11-17T10:10:00+07:00 ✅ DONE [agent: builder] — code+test xong; ▶ START [agent: reviewer] round 1 (cancel sẽ redo bước này)
