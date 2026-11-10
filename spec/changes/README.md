# spec/changes/ — Change requests (sau initial build)

> **Sau khi spec đã có (từ `/spec-init`), MỌI thay đổi đi qua đây.**
> Feature mới (thêm/sửa/xoá) **và** fix bug đều là **change request** — một agent duy nhất xử lý: `change-request`.

## Cách dùng
1. **User chat yêu cầu/bug trong maintenance mode** → agent **tự động** ghi vào `BACKLOG.md` (trạng thái `pending`) + tạo file `spec/changes/YYYY-MM-DD-<slug>.md` (copy `_TEMPLATE.md`). User không cần tạo tay.
2. Chạy `/change` — command đọc **hết** file pending trong thư mục này rồi gọi agent `change-request`

```
/change              → xử lý TẤT CẢ file pending trong spec/changes/
/change <slug>       → chỉ 1 change
/change --list       → xem đang chờ gì (đọc từ BACKLOG.md — cái nào xong/chưa)
```

## Vòng đời 1 change file
```
pending ──/change──► agent change-request (classify → spec delta → task → build/review)
   │
   └──► status: done  →  chuyển sang spec/changes/archive/  →  cập nhật BACKLOG.md (done + ngày xong)
```

## Backlog tracking
- `BACKLOG.md` là **bảng theo dõi xong/chưa**: mỗi change request 1 dòng (ID · tiêu đề · loại · trạng thái · file · ngày tạo · ngày xong).
- Trạng thái: `pending` → `in_progress` → `done` | `blocked` (kẹt cần user). Không xoá dòng đã `done` (giữ lịch sử).
- Agent phải giữ **BACKLOG.md luôn khớp** file change: tạo mới → thêm dòng `pending`; xử lý → `in_progress`; xong + archive → `done` + ngày.

## Rule
- 1 file = 1 change request (gộp nếu cùng mục tiêu/scope, ghi rõ).
- **Không** tự bịa requirement: thiếu acceptance → agent hỏi, không đoán.
- Thay đổi spec (requirement) → agent tự bump `spec_version` + ghi `spec/updates/` + `spec/CHANGELOG.md` + sinh `spec/test-scope/current.json` (handoff cho template test).
- File đã xử lý **archive** (`spec/changes/archive/`) — không sửa lại file cũ, tạo change mới.
