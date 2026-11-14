Agent: reviewer

# Review — build-filmbooking layer-7 task-05 — Round 2

- Task: Web admin Việc cần làm, đơn hàng, chi tiết đơn, đơn cần xử lý thủ công (R-103, R-104, R-134, AC-11).
- Worktree: `E:/FilmBooking/.worktrees/layer-7__task-05`, chưa commit.
- Review level: **STRICT**.
- Lý do: task đụng RBAC theo rạp, ghi xử lý thủ công/hoàn tiền (R-104) và hook dùng chung `useApiResource`. Round này kiểm lại F1–F4 của round 1.
- Blast radius:
  - Trang và route mới: `/admin`, `/admin/don-hang`, `/admin/don-hang/[code]`, `/admin/don-can-xu-ly`.
  - File dùng chung mới: `order-utils.ts`, `use-api-resource.ts`.
  - Không đổi API, shared hay migration.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 25 file, 364 test (tăng 3 test so với round 1) |
| `cd apps/web && pnpm exec vitest run` (lần 2) | PASS: 25 file, 364 test. Không treo, không timeout. `pricing-voucher` cũng không timeout |
| `pnpm build` | PASS: các route mới đều là dynamic (ƒ) |
| oxlint / ocr | skip: oxlint chưa có cấu hình, ocr chưa cài |
| AI-friendly web | N/A (trang admin nội bộ) |

## Kiểm lại từng finding của round 1

### F1: đã đúng root cause, CLOSED
- `order-utils.ts:52-63` thêm `isManualReviewResolved` và `orderStatusView`. Đơn có `status=needs_manual_review` và `manualReviewResolvedAt` khác null giờ hiển thị "Đã xử lý thủ công" với tone info.
- Hàm này được dùng ở:
  - badge chi tiết đơn: `order-detail.tsx:170,176`
  - bảng đơn: `orders-list.tsx:50-53,91`
- Thêm dòng "Đã giải quyết thủ công lúc …" ở `order-detail.tsx:193-197`.
- Mock trong test giờ đúng với RPC thật: `orders-admin.test.tsx:278-281` giữ nguyên `status`, chỉ set `manualReviewResolvedAt`. Đối chiếu với migration `20261113170000_resolve_manual_review_rpc.sql:82-85` thì khớp.
- Test assert badge mới, dòng "Đã giải quyết…" và việc form biến mất.

### F2: CLOSED theo hướng workaround phía client, chấp nhận được, kèm gap
- `orders-list.tsx:139-155`: mặc định lọc bỏ đơn đã giải quyết theo từng trang, có checkbox "Hiện cả đơn đã giải quyết" (`:259-279`). Đơn đã giải quyết khi hiện ra có nhãn riêng.
- Empty state chỉ hiện khi đang ở trang 1, không còn item nào và không còn trang sau. Nếu một trang bị lọc hết, UI ghi "Trang này không còn đơn chưa giải quyết." và vẫn giữ pager.
- Đánh giá UX: pager và tổng số đơn vẫn tính cả đơn đã giải quyết, vì API `listNeedsManualReview` (`apps/api/src/modules/orders/orders.service.ts:224`) không lọc `manual_review_resolved_at`.
  - API sắp xếp theo `created_at desc`, nên đơn mới chưa xử lý thường nằm ở trang đầu. Phần lệch chủ yếu rơi vào các trang cuối.
  - Không mất dữ liệu, không rò quyền, và không bao giờ báo sai là "hết việc" khi còn trang chưa xem.
  - Với một dự án demo, tôi chấp nhận workaround này. Cách sửa gốc là bên API thêm `.is("manual_review_resolved_at", null)`, có thể kèm query `resolved`.
- **Bắt buộc (dispatcher):** ghi GAP mới vào gap register: "API `GET /admin/orders/needs-manual-review` không lọc đơn đã giải quyết; web lọc tạm ở client theo từng trang, nên tổng số và pager lệch." Owner là module orders (layer-5 task-07).

### F3: đã đúng root cause, CLOSED
- Thông báo lỗi 409 được đưa lên state `conflict` của `OrderDetail` (`order-detail.tsx:266-272,292-295`), nằm ngoài cây con bị unmount khi tải lại.
- `ResolveForm` gọi `onConflict` thay cho `setErrors` khi gặp CONFLICT (`:92-96`). Khi xử lý thành công thì xoá banner (`:288-291`). Không có toast thành công.
- Test (`orders-admin.test.tsx:296-309`) chờ request GET chi tiết lần thứ 2 và chờ form mount lại, rồi mới assert thông báo vẫn còn. Đây không còn là assert trên frame tạm thời như round 1.

### F4: đã đúng root cause, CLOSED
- `order-utils.ts:105-112`: với Admin, `?cinema=` được nhận khi là UUID hợp lệ. Trường hợp `all` hoặc giá trị rác thì coi là toàn chuỗi. Manager và Staff vẫn đi qua `resolveScope` với danh sách rạp được gán.
- An toàn: API vẫn kiểm quyền (`orders.service.ts:51,212-216`). Admin là `isAdmin` nên `canResolveOrder` trả true và queue gửi `cinemaId`.
- Có test cho cả queue (`:183-191`) và trang tra cứu (`:210-218`) với `?cinema=HN02`.

### F7: các mục minor đã xử lý
- `don-hang/[code]/page.tsx:11-16`: dùng `try/catch` quanh `decodeURIComponent`, lỗi thì gọi `notFound()`.
- Thêm hint khi số tiền hoàn lớn hơn tổng đơn. Chỉ cảnh báo, không chặn, phù hợp với việc server cũng không chặn.
- Staff thuần không còn thấy link sang `/admin/lich-chieu/:id`.
- Dịch enum sang nhãn tiếng Việt. Khoá của `paymentStatusLabel` và `affectedActionLabel` khớp enum DB (`20261111030100_booking_tables.sql:26,30`). Giá trị lạ sẽ hiện nguyên chuỗi gốc.

## Findings round 2 (đều là MINOR, không chặn)

1. `todo-widgets.tsx:108-128`: JSX phần nội dung suất chiếu bị lặp ở hai nhánh Link và div, thụt lề cũng lệch. Nên tách thành một component con. Không ảnh hưởng hành vi.
2. Mốc "đã giải quyết" trên timeline vẫn mang nhãn "Cần xử lý thủ công". Nhãn này do server trả `status: needs_manual_review` (`orders-history.helper.ts:69-74`), chỉ có note phân biệt. Header và dòng "Đã giải quyết…" đã đủ rõ.
3. Banner 409 dùng message chung "Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại." trong khi trang đã tự tải lại. Câu chữ hơi thừa nhưng chấp nhận được.
4. Gap `/admin/todo` không nhận `cinemaId` (F6 round 1) và 5 file ngoài danh sách Files (F5 round 1) vẫn còn. Dispatcher cần ghi nhận, task-05 không cần sửa. Đã đối chiếu với task-06: không trùng file.
5. AI-readable: `ResolveForm`, `OrderBody`, `OrderSearch` và `TodoDashboard` vẫn dài hơn 50 dòng. Đây chỉ là 1 indicator, chưa tới ngưỡng ≥3.

## Điểm đạt (regression)
- AC-11: Admin và Manager đúng rạp thấy đơn ở Việc cần làm và ở `/admin/don-can-xu-ly`. Staff bị chặn và không gọi API.
- Staff và Manager rạp khác chỉ xem được, không có form xử lý. `canResolveOrder` khớp server/RPC.
- Tra mã đặt vé khớp chính xác (không phân biệt hoa/thường) thì mở thẳng chi tiết. Khớp một phần thì hiện danh sách.
- Hoàn tiền bắt buộc nhập mã giao dịch và số tiền. Chống double-submit vẫn còn: `busy` cộng với lớp `FOR UPDATE` và `ALREADY_RESOLVED` ở server.
- `useApiResource` không đổi: deps là `[path, attempt]`, router giữ trong ref, có cờ `active`, 403 thì chuyển sang `/khong-co-quyen`. Chạy full suite 2 lần không treo.

## Verdict

**STRICT PASS**

Điều kiện close-out cho dispatcher:
- Ghi GAP API cho `needs-manual-review` không lọc đơn đã giải quyết, và GAP `/admin/todo` không nhận `cinemaId`, vào gap register.
- Ghi nhận 5 file ngoài danh sách Files trong commit hoặc task file.
