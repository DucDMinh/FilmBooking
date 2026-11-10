# Tích hợp Vibe Code Studio vào project khác

Studio là trang **chỉ đọc**: nó đọc 2 file JSON mà project của anh (chạy opencode-project-template) ghi ra, rồi vẽ lên văn phòng pixel + dashboard. Studio **không ghi gì** vào project, không gọi API, không cần server riêng của template.

```
project của anh (opencode-project-template)          vibe-code-studio (repo này)
  .context/agents-live.json  ──── đọc mỗi 1 s ────▶  /state.json    → nhân vật làm việc / nghỉ
  .context/progress.json     ──── đọc mỗi 1 s ────▶  /progress.json → task board, layer, số liệu
```

---

## 1. Cài studio (một lần)

```bash
git clone https://github.com/ocanhdt12-gif/agent2d.git vibe-code-studio
cd vibe-code-studio
npm install
```

Cần Node 20+.

## 2. Trỏ tới project của anh

Sửa `studio.config.json` trong repo studio:

```json
{
  "stateFile": "/duong/dan/toi/project-cua-anh/.context/agents-live.json",
  "progressFile": "/duong/dan/toi/project-cua-anh/.context/progress.json",
  "pollMs": 1000
}
```

- Đường dẫn **tuyệt đối**, hoặc tương đối so với thư mục studio.
- `pollMs`: chu kỳ đọc file (ms). 1000 là đủ, file đọc ở máy local nên rất nhẹ.
- Không muốn sửa file config thì dùng biến môi trường, nó **ưu tiên hơn** config:

```bash
STATE_FILE=/duong/dan/.context/agents-live.json PROGRESS_FILE=/duong/dan/.context/progress.json npm run dev
```

## 3. Chạy

```bash
npm run dev
```

Mở **http://localhost:5173/studio.html** (nếu cổng 5173 bận, Vite tự nhảy sang 5174… — xem dòng `Local:` trong terminal).

- Đèn **LIVE** xanh = đọc được file. Hiện **NO FILE** = sai đường dẫn hoặc project chưa chạy lần nào (file chưa được tạo). Không sao, cứ để trang mở, khi file xuất hiện là tự lên.
- Trang chỉ có scene, không dashboard: **http://localhost:5173/coding-test.html?live**
- Server nghe `0.0.0.0`, nên máy khác cùng mạng LAN mở được bằng `http://<ip-máy>:5173/studio.html`.

## 4. Project của anh cần ghi gì

### 4.1 `agents-live.json` (bắt buộc) — ai đang làm

Template đã có sẵn: loop gọi `node tools/agent-live.mjs enter|leave|clear`. **Không cần sửa gì** nếu đang dùng template.

Định dạng:

```json
{
  "updatedAt": "2026-10-23T04:34:34.206Z",
  "agents": [
    { "agent": "builder-1",  "role": "builder",  "phase": "building", "task": "layer-1/task-02", "title": "Auth middleware", "since": "2026-10-23T04:30:00Z" },
    { "agent": "reviewer-1", "role": "reviewer", "phase": "review",   "task": "layer-1/task-01", "title": "REST API /users",  "since": "…" },
    { "agent": "merger",     "role": "merger",   "phase": "merging",  "since": "…" }
  ]
}
```

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `agent` | ✔ | id agent (`builder-1`, `reviewer-2`, `merger`…) |
| `role` | ✔ | quyết định nhân vật nào (bảng mục 5) |
| `phase` | | `"idle"` = coi như **nghỉ**; mọi giá trị khác = **đang làm** |
| `task`, `title` | | hiện trên thẻ nhân vật, danh sách AGENTS, cột REVIEW / "đang build" |
| `since` | | ISO time, để tính thời gian đang làm |

**Chỉ có 2 trạng thái:** agent có trong file với `phase ≠ "idle"` → nhân vật **làm việc** (ngồi vào chỗ). Không có trong file (đã `leave`/`clear`) hoặc `phase: "idle"` → nhân vật **nghỉ** (đi cafe / sofa / thư viện).

Ghi file nên **atomic** (ghi file tạm rồi `rename`) — `agent-live.mjs` đã làm vậy. Studio đọc lỗi (file đang ghi dở) thì bỏ qua lượt đó, lượt sau đọc lại.

### 4.2 `progress.json` (tuỳ chọn) — task board + header

Template ghi file này rồi (`progress-write.mjs`). Studio dùng các trường:

```json
{
  "projectName": "acme-crm",
  "currentLayer": 2,
  "totalLayers": 4,
  "tasks": [ { "task": "layer-0/task-01", "title": "Project setup + tooling" } ],
  "completedTasks": [ { "task": "layer-0/task-01", "review": "STRICT PASS", "round": 1, "completedAt": "…" } ],
  "blockedTasks":   [ { "task": "layer-1/task-03", "reason": "Chờ API key", "since": "…" } ]
}
```

- `tasks` là **trường mở rộng** (template gốc chưa có): danh sách **toàn bộ** task đã lên kế hoạch, để cột TODO hiện đủ. Thiếu nó board vẫn chạy, nhưng TODO chỉ có task đã xuất hiện trong agents-live. Cách thêm: ở bước `/graph`, sau khi sinh `tasks/<slug>/layer-N-task-NN.md`, ghi danh sách `{task, title}` vào `progress.json`.
- Không có `progress.json` thì header hiện "(chưa có progress.json)", board trống, phần scene + agents vẫn chạy bình thường.

Cách studio xếp task:

| Cột | Lấy từ |
|---|---|
| TODO | `tasks` chưa xong. Task có builder đang làm → tag **● đang build**; task trong `blockedTasks` → đỏ + lý do |
| REVIEW | task mà một agent `role: "reviewer"` đang giữ |
| DONE | `completedTasks` (mới nhất ở trên) |

Header: **Layer** = `currentLayer`/`totalLayers`, **Phase** suy từ role đang chạy (merger → Merging, builder → Building, reviewer → Review, spec-* → Spec, dispatcher/graph/brainstorm → Planning, design → Design, error-analyzer/bug-check → Debugging, devops/rollback → Deploy, không ai → Idle).

## 5. Role → nhân vật

| role trong file | Nhân vật | Chỗ làm |
|---|---|---|
| `builder`, `builder-strong` | ngẫu nhiên 1 người **đang rảnh** trong Nova, Orion, Lyra, Vega, Atlas, Comet | Khu Coding (tối đa 6) |
| `reviewer` | ngẫu nhiên 1 người đang rảnh trong Sage, Iris, Juno, Echo | Khu Review |
| `merger` | Eve | Trạm Merge |
| `dispatcher`, `loop`, `brainstorm`, `graph`, `change-request`, `devops`, `rollback`, `context-manager` | Theo | Bàn Plan |
| `spec-init`, `spec-validator`, `spec-publisher` | Oracle | Bàn Plan |
| `design` | Pixel | Khu Relax |
| `error-analyzer`, `bug-check` | Sherlock | Góc Review |
| role lạ khác | Theo | |

- Builder/reviewer **không cố định số**: `builder-3` lần này có thể là Lyra, lần sau là Atlas. Agent giữ nhân vật suốt lúc còn trong file; quay lại trong vòng 2 phút (vd. builder-2 sửa sau review FAIL) thì được trả lại đúng nhân vật cũ nếu người đó đang rảnh.
- Quá 6 builder / 4 reviewer → agent dư dùng chung một nhân vật đang bận (thẻ thông tin liệt kê đủ các agent).
- **Lưu ý:** `agent-live.mjs` của template hiện chỉ ghi 4 role `builder|reviewer|merger|dispatcher`. Muốn Oracle, Pixel, Sherlock đi làm thì loop phải `enter` thêm các role như `spec-validator`, `design`, `error-analyzer` ở đúng bước (xem `scripts/dummy-scenario.mjs` để biết chỗ nào gọi role gì). Chưa thêm thì 3 người này luôn ở trạng thái nghỉ.
- Đổi bảng map: `src/live-state.ts` → `ROLE_CHARACTER`, `BUILDERS`, `REVIEWERS`.

## 6. Thử trước khi ghép (không cần project thật)

```bash
node scripts/dummy-scenario.mjs --speed 2
```

Kịch bản giả lập đủ luồng template (spec → brainstorm → design → graph → 4 layer, review FAIL, task BLOCKED, merge conflict, deploy rollback, /bug-check, /bug, /feature), ghi đúng 2 file theo `studio.config.json`. `--speed` tăng tốc, `--stretch 2.5` (mặc định) kéo dài mỗi task, `--once` chạy 1 vòng, `--file` / `--progress` đổi đường dẫn file ghi.

> ⚠ Script này **ghi đè** 2 file. Đừng trỏ nó vào `.context/` của project thật đang chạy — để `studio.config.json` trỏ về `.context/` trong repo studio khi chạy giả lập, rồi đổi sang project thật sau.

## 7. Dùng trên trang

- Click nhân vật (trong scene, danh sách AGENTS/IDLE hoặc ô CHARACTERS) → thẻ thông tin: tên, role, đang làm gì, agent/task từ file.
- Nút **FULLSCREEN** góc vùng làm việc hoặc phím **F**; thoát bằng **Esc**/**F**.

## 8. Lỗi hay gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| Đèn **NO FILE** | Sai đường dẫn trong `studio.config.json`, hoặc project chưa ghi file lần nào. Mở `http://localhost:5173/state.json` để xem studio đang tìm file ở đâu (`"file": …`). |
| Nhân vật không đổi trạng thái | Agent trong file vẫn còn (chưa `leave`), hoặc `phase` khác `"idle"`. Nhân vật đổi chỗ có độ trễ 2–4 s (đi bộ + chống nhấp nháy) là bình thường. |
| Task board trống | Chưa có `progress.json`, hoặc thiếu trường `tasks` (xem 4.2). |
| `npm run dev` báo cổng bận | Đã có một studio khác chạy; dùng cổng Vite in ra, hoặc tắt cái cũ. |
| Oracle / Pixel / Sherlock không bao giờ làm việc | Loop chưa ghi các role đó (xem lưu ý mục 5). |

## File liên quan

- `studio.config.json` — đường dẫn 2 file + `pollMs`
- `vite.config.ts` — plugin `liveState()` phục vụ `/state.json`, `/progress.json` (đọc mới mỗi request, không cache)
- `src/live-state.ts` — map agent → nhân vật
- `src/dashboard.ts`, `studio.html` — dashboard
- `src/coding-test.ts` — scene, poll + điều phối làm/nghỉ
- `scripts/dummy-scenario.mjs` — kịch bản giả lập
