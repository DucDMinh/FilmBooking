---
name: archify
description: "Vẽ architecture/workflow/sequence/dataflow/lifecycle diagram xuất self-contained HTML (dark/light, motion tùy chọn, export PNG/SVG) bằng archify (tt-a1i/archify). Dùng trong Phase 0 brainstorm khi architecture doc thiếu, Phase 2.5 design cho design-spec, Phase 3 scope breakdown cho layer plan, Phase 5 reviewer để verify diagram khớp code. Input: mô tả plain-language hoặc Mermaid."
---

# Archify — Agent Diagram Skill (Curated)

> Curated từ [tt-a1i/archify](https://github.com/tt-a1i/archify) (MIT, ~48k⭐/tháng) — giữ phần lõi: authoring path, validate/deliver receipt, 5 loại diagram. Không copy nguyên xi; lược bỏ phần Viewer Runtime nâng cao (chỉ đọc khi user yêu cầu motion/share card/reach trace).

## Cài đặt (một lần, khi cần dùng)

```bash
# Cách 1 — cài global cho agent (khuyến nghị)
npx skills add tt-a1i/archify -g
# Cách 2 — dùng tạm không cài
npx skills use tt-a1i/archify@archify --agent opencode
```

Verify: `node bin/archify.mjs doctor` → chạy `node bin/archify.mjs demo <dir>` để xem output mẫu. Nếu không chạy được → nói rõ blocker, không giả vờ vẽ.

## Fast authoring path (dùng cho mọi diagram thường)

1. Chọn loại: `architecture` | `workflow` | `sequence` | `dataflow` | `lifecycle`.
2. Đọc 1 schema tương ứng trong gói archify (`schemas/`) + 1 example (`examples/`) — chỉ để lấy shape field, KHÔNG copy nội dung. Khi mơ hồ: `node bin/archify.mjs guide "<scenario>" --json`.
3. **Artifact first**: viết candidate JSON ngay (không bàn tọa độ trong prose). Bắt đầu 1 main path rõ, side branch ngắn, ≤12 primary nodes, label thưa. Bỏ `meta.visual_preset` (mặc định `classic`).
4. **Validate sau mỗi lần sửa + ngay trước bàn giao**:
   ```bash
   node bin/archify.mjs validate <type> <candidate.json> --quality showcase --json
   ```
   Showcase pass = đủ 9 artifact checks, 0 composition errors, 0 warnings. Thiếu field `meta.quality_profile` → sửa trước khi đụng geometry.
5. **Deliver** (lệnh chốt cuối):
   ```bash
   node bin/archify.mjs deliver <type> <candidate.json> <output.html> --quality showcase --json
   ```
   Non-zero exit = KHÔNG được gọi là thành công. Sau deliver, chạy `node bin/archify.mjs visual-check <output.html> --json` nếu muốn evidence trình duyệt. Không tự nhận đã xem mắt nếu chưa xem.

## Type router

| Loại | Dùng cho |
|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure, deployment topology |
| `workflow` | Process, approval gates, tool calls, runbooks, CI/CD |
| `sequence` | API call chains, request lifecycles, async traces, returns |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers |
| `lifecycle` | State/status transitions, retries, waiting/terminal states |

## Mermaid input

Đọc Mermaid để lấy topology + semantics, rồi viết Archify JSON mới — KHÔNG render lại style Mermaid:
- `flowchart`/`graph` → `workflow` (hoặc `architecture` cho component map)
- `sequenceDiagram` → `sequence`
- `stateDiagram` → `lifecycle`

## Authoring invariants (luật bất biến)

- **1 main path rõ**; side branches rời khỏi node gần nhất trên main path. Bỏ edge ít giá trị trước khi thêm routing control.
- **Exact names**: giữ nguyên tên sản phẩm, code identifier, command, protocol, API path, env name.
- **Brand identity**: chỉ đặt `brand` khi dùng built-in ID khớp sản phẩm thật (`node bin/archify.mjs brands "<name>" --json`). Không bịa brand từ vague role như "database".
- **Semantic labels**: label là dữ liệu ngữ nghĩa — chỉ bỏ wording đã hoàn toàn implied bởi cả 2 endpoint. Không xoá label để "chữa geometry".
- **Component types**: `frontend`, `backend`, `database`, `cloud`, `security`, `messagebus`, `external`. Variants: `default`, `emphasis`, `security`, `dashed`.
- **Không đọc** `renderers/`, validator source, tests, benchmarks trước candidate đầu tiên. Chỉ inspect khi diagnostic internal không rõ hoặc sau 2 lần repair thất bại.
- Sửa lỗi: chỉ đổi đúng `subject` được chẩn đoán, verify `evidence`, chọn `supportedFixes`, rerun. 2 vòng liên tiếp không cải thiện best count → dừng, báo diagnostic thật.

## Hook vào template (WHEN/WHERE)

- **Phase 0 brainstorm** (`.agent/brainstorm.md`): khi coverage thấy `architecture: ❌ not provided` → đề xuất user cho phép dựng architecture diagram từ docs đã scan bằng archify, lưu vào `.context/arch/` + đưa vào doc-index.
- **Phase 2.5 design** (`.agent/design.md`): sau khi viết design-spec, nếu project có kiến trúc/flow đáng vẽ → tạo `architecture` + `workflow` diagram, lưu `docs/diagrams/`, tham chiếu trong design-spec `Architecture & Infrastructure` / screen specs.
- **Phase 3 scope breakdown** (`.agent/graph.md`): khi human approve layer plan → tạo 1 `workflow` diagram thể hiện layer dependency (Layer 0 → 1 → 2…, HUMAN CHECKPOINT giữa các layer), lưu `docs/diagrams/layer-plan.html`, mở cho user xác nhận.
- **Phase 5 review** (`.agent/reviewer.md`): task nào sửa/cập nhật diagram → chạy lại `archify validate <type> <candidate.json>` + mở HTML verify khớp code thật trước khi PASS. Diagram sai topology ≠ pass.

## Output

Trả về: path HTML đã check, diagram type, validation summary, spec/artifact receipt (SHA-256), browser-evidence status, và trạng thái visual review **thật** (đã mở xem mắt hay chưa). Không claim success khi command non-zero; không claim đã xem mắt nếu chưa xem.